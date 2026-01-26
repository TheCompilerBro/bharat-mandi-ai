import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../config/database';
import { SarvamTranslationService } from './translation.service';
import { ErrorHandler } from '../utils/error-handling';
import { SecurityMonitor } from '../utils/security-monitoring';
import { 
  Message, 
  TradeSession, 
  SessionParticipant, 
  WebSocketConnection,
  Vendor 
} from '../types';

export interface CommunicationService {
  sendMessage(sessionId: string, message: Message): Promise<void>;
  createTradeSession(participants: string[], commodity: string, metadata?: any): Promise<TradeSession>;
  joinSession(sessionId: string, vendorId: string, role: 'buyer' | 'seller' | 'observer'): Promise<void>;
  getSessionHistory(sessionId: string): Promise<Message[]>;
  leaveSession(sessionId: string, vendorId: string): Promise<void>;
  getActiveConnections(): Promise<WebSocketConnection[]>;
}

export class WebSocketCommunicationService implements CommunicationService {
  private io: SocketIOServer;
  private dbManager: DatabaseManager;
  private translationService: SarvamTranslationService;
  private errorHandler: ErrorHandler;
  private securityMonitor: SecurityMonitor;
  private activeConnections: Map<string, WebSocketConnection> = new Map();
  private activeSessions: Map<string, TradeSession> = new Map();
  private sessionParticipants: Map<string, SessionParticipant[]> = new Map();

  constructor(httpServer: HTTPServer) {
    this.dbManager = DatabaseManager.getInstance();
    this.translationService = new SarvamTranslationService();
    this.errorHandler = ErrorHandler.getInstance();
    this.securityMonitor = SecurityMonitor.getInstance();
    
    // Initialize Socket.IO server
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*", // Configure appropriately for production
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Handle vendor authentication
      socket.on('authenticate', async (data: { vendorId: string, token: string }) => {
        try {
          // Get client IP address for security monitoring
          const ipAddress = socket.handshake.address;
          const userAgent = socket.handshake.headers['user-agent'] || 'Unknown';

          // In a real implementation, validate the JWT token here
          const vendorId = data.vendorId;
          
          // Check if account is locked
          const lockStatus = await this.securityMonitor.isAccountLocked(vendorId);
          if (lockStatus.locked) {
            socket.emit('authentication_error', { 
              message: `Account locked: ${lockStatus.reason}`,
              unlockAt: lockStatus.unlockAt
            });
            
            // Log security event
            await this.securityMonitor.logSecurityEvent(
              'suspicious_login',
              'medium',
              { reason: 'account_locked', lockReason: lockStatus.reason },
              vendorId,
              undefined,
              ipAddress,
              userAgent
            );
            return;
          }

          // Check if IP is blocked
          const isBlocked = await this.securityMonitor.isIPBlocked(ipAddress);
          if (isBlocked) {
            socket.emit('authentication_error', { message: 'Access denied from this location' });
            
            // Log security event
            await this.securityMonitor.logSecurityEvent(
              'suspicious_login',
              'high',
              { reason: 'blocked_ip' },
              vendorId,
              undefined,
              ipAddress,
              userAgent
            );
            return;
          }

          // Simulate token validation (in real implementation, verify JWT)
          const isValidToken = data.token && data.token.length > 10; // Basic validation
          
          if (!isValidToken) {
            // Log failed authentication
            await this.securityMonitor.detectSuspiciousLogin(
              vendorId,
              ipAddress,
              userAgent,
              false,
              { reason: 'invalid_token' }
            );
            
            socket.emit('authentication_error', { message: 'Invalid authentication token' });
            return;
          }

          // Successful authentication
          await this.securityMonitor.detectSuspiciousLogin(
            vendorId,
            ipAddress,
            userAgent,
            true
          );
          
          // Create connection record
          const connection: WebSocketConnection = {
            id: uuidv4(),
            vendorId,
            socketId: socket.id,
            connectedAt: new Date(),
            lastActivity: new Date(),
            activeSessions: []
          };

          this.activeConnections.set(socket.id, connection);
          socket.join(`vendor:${vendorId}`);
          
          socket.emit('authenticated', { success: true, connectionId: connection.id });
          console.log(`Vendor ${vendorId} authenticated with socket ${socket.id}`);
          
        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('authentication_error', { message: 'Authentication failed' });
        }
      });

      // Handle joining trade sessions
      socket.on('join_session', async (data: { sessionId: string, role: 'buyer' | 'seller' | 'observer' }) => {
        try {
          const connection = this.activeConnections.get(socket.id);
          if (!connection) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          await this.joinSession(data.sessionId, connection.vendorId, data.role);
          socket.join(`session:${data.sessionId}`);
          
          // Update connection's active sessions
          connection.activeSessions.push(data.sessionId);
          connection.lastActivity = new Date();

          socket.emit('session_joined', { sessionId: data.sessionId });
          
          // Notify other participants
          socket.to(`session:${data.sessionId}`).emit('participant_joined', {
            vendorId: connection.vendorId,
            sessionId: data.sessionId,
            role: data.role
          });

        } catch (error) {
          console.error('Join session error:', error);
          socket.emit('error', { message: 'Failed to join session' });
        }
      });

      // Handle sending messages
      socket.on('send_message', async (data: { sessionId: string, content: string, messageType?: string }) => {
        try {
          const connection = this.activeConnections.get(socket.id);
          if (!connection) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          // Monitor API activity for security
          const ipAddress = socket.handshake.address;
          await this.securityMonitor.monitorAPIActivity(
            connection.vendorId,
            'send_message',
            ipAddress,
            Date.now() - connection.lastActivity.getTime(),
            200
          );

          // Get sender's language preference
          const sender = await this.getVendorById(connection.vendorId);
          const senderLanguage = sender?.preferredLanguage || 'en';

          const message: Message = {
            id: uuidv4(),
            senderId: connection.vendorId,
            content: data.content,
            originalLanguage: senderLanguage, // Will be detected by translation service
            timestamp: new Date(),
            messageType: (data.messageType as any) || 'text',
            sessionId: data.sessionId
          };

          await this.sendMessage(data.sessionId, message);
          connection.lastActivity = new Date();

          // Acknowledge message sent
          socket.emit('message_sent', { 
            messageId: message.id, 
            timestamp: message.timestamp,
            sessionId: data.sessionId
          });

        } catch (error) {
          console.error('Send message error:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle leaving sessions
      socket.on('leave_session', async (data: { sessionId: string }) => {
        try {
          const connection = this.activeConnections.get(socket.id);
          if (!connection) {
            return;
          }

          await this.leaveSession(data.sessionId, connection.vendorId);
          socket.leave(`session:${data.sessionId}`);
          
          // Update connection's active sessions
          connection.activeSessions = connection.activeSessions.filter(id => id !== data.sessionId);
          connection.lastActivity = new Date();

          socket.emit('session_left', { sessionId: data.sessionId });
          
          // Notify other participants
          socket.to(`session:${data.sessionId}`).emit('participant_left', {
            vendorId: connection.vendorId,
            sessionId: data.sessionId
          });

        } catch (error) {
          console.error('Leave session error:', error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        const connection = this.activeConnections.get(socket.id);
        if (connection) {
          // Leave all active sessions
          connection.activeSessions.forEach(sessionId => {
            socket.to(`session:${sessionId}`).emit('participant_disconnected', {
              vendorId: connection.vendorId,
              sessionId
            });
          });
          
          this.activeConnections.delete(socket.id);
        }
      });

      // Handle heartbeat for connection monitoring
      socket.on('heartbeat', () => {
        const connection = this.activeConnections.get(socket.id);
        if (connection) {
          connection.lastActivity = new Date();
        }
        socket.emit('heartbeat_ack');
      });

      // Handle language preference updates
      socket.on('update_language_preference', async (data: { preferredLanguage: string }) => {
        try {
          const connection = this.activeConnections.get(socket.id);
          if (!connection) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
          }

          // Update language preference for all active sessions
          for (const sessionId of connection.activeSessions) {
            const participants = this.sessionParticipants.get(sessionId) || [];
            const updatedParticipants = participants.map(p => 
              p.vendorId === connection.vendorId 
                ? { ...p, preferredLanguage: data.preferredLanguage }
                : p
            );
            this.sessionParticipants.set(sessionId, updatedParticipants);
            
            // Update in database
            await this.updateSessionParticipants(sessionId, updatedParticipants);
          }

          socket.emit('language_preference_updated', { 
            preferredLanguage: data.preferredLanguage,
            affectedSessions: connection.activeSessions
          });

        } catch (error) {
          console.error('Update language preference error:', error);
          socket.emit('error', { message: 'Failed to update language preference' });
        }
      });
    });
  }

  async sendMessage(sessionId: string, message: Message): Promise<void> {
    try {
      // Get session participants to determine target languages
      const participants = this.sessionParticipants.get(sessionId) || [];
      
      // Detect original language
      const languageDetection = await this.translationService.detectLanguage(message.content);
      message.originalLanguage = languageDetection.detectedLanguage;

      // Translate message for each participant's preferred language
      const translations: Record<string, string> = {};
      let lowestConfidence = 1.0;
      const translationResults: Array<{ language: string; confidence: number; hasIssues: boolean }> = [];
      
      for (const participant of participants) {
        if (participant.preferredLanguage !== message.originalLanguage) {
          try {
            const translationResult = await this.translationService.translateMessage(
              message.content,
              message.originalLanguage,
              participant.preferredLanguage
            );
            
            translations[participant.preferredLanguage] = translationResult.translatedText;
            
            // Track confidence for quality monitoring
            if (translationResult.confidence < lowestConfidence) {
              lowestConfidence = translationResult.confidence;
            }

            // Validate translation quality
            const validation = await this.translationService.validateTranslation(
              message.content,
              translationResult.translatedText
            );

            translationResults.push({
              language: participant.preferredLanguage,
              confidence: translationResult.confidence,
              hasIssues: !validation.isValid
            });

            // Handle low confidence translations (Requirement 1.5)
            if (translationResult.confidence < 0.85) {
              console.warn(`Low confidence translation (${translationResult.confidence}) for ${participant.preferredLanguage}`);
              
              // Flag for manual review
              await this.flagForManualReview(message, participant.preferredLanguage, translationResult);
              
              // Provide alternative translations if available
              if (translationResult.alternativeTranslations && translationResult.alternativeTranslations.length > 0) {
                translations[`${participant.preferredLanguage}_alternatives`] = JSON.stringify(translationResult.alternativeTranslations);
              }
            }

          } catch (error) {
            console.error(`Translation failed for ${participant.preferredLanguage}:`, error);
            
            // Fallback mechanism: try English as intermediate language
            if (message.originalLanguage !== 'en' && participant.preferredLanguage !== 'en') {
              try {
                // First translate to English
                const toEnglish = await this.translationService.translateMessage(
                  message.content,
                  message.originalLanguage,
                  'en'
                );
                
                // Then from English to target language
                const fromEnglish = await this.translationService.translateMessage(
                  toEnglish.translatedText,
                  'en',
                  participant.preferredLanguage
                );
                
                translations[participant.preferredLanguage] = fromEnglish.translatedText;
                
                // Mark as fallback translation with lower confidence
                translationResults.push({
                  language: participant.preferredLanguage,
                  confidence: Math.min(toEnglish.confidence, fromEnglish.confidence) * 0.8, // Reduce confidence for double translation
                  hasIssues: true
                });
                
                console.log(`Fallback translation successful for ${participant.preferredLanguage} via English`);
                
              } catch (fallbackError) {
                console.error(`Fallback translation also failed for ${participant.preferredLanguage}:`, fallbackError);
                
                // Final fallback: use original text with warning
                translations[participant.preferredLanguage] = `[Translation unavailable] ${message.content}`;
                translationResults.push({
                  language: participant.preferredLanguage,
                  confidence: 0.1,
                  hasIssues: true
                });
              }
            } else {
              // Direct fallback to original text
              translations[participant.preferredLanguage] = message.content;
              translationResults.push({
                language: participant.preferredLanguage,
                confidence: 0.1,
                hasIssues: true
              });
            }
          }
        } else {
          // Same language as original, no translation needed
          translationResults.push({
            language: participant.preferredLanguage,
            confidence: 1.0,
            hasIssues: false
          });
        }
      }

      message.translations = translations;
      message.confidence = lowestConfidence;

      // Add translation metadata for debugging and quality monitoring
      (message as any).translationMetadata = {
        results: translationResults,
        detectedLanguage: languageDetection.detectedLanguage,
        detectionConfidence: languageDetection.confidence,
        timestamp: new Date()
      };

      // Store message in MongoDB
      await this.storeMessage(message);

      // Broadcast message to session participants with appropriate translations
      for (const participant of participants) {
        const participantSocket = this.getSocketByVendorId(participant.vendorId);
        if (participantSocket) {
          const messageForParticipant = {
            ...message,
            displayText: translations[participant.preferredLanguage] || message.content,
            translationQuality: translationResults.find(r => r.language === participant.preferredLanguage)
          };
          
          participantSocket.emit('new_message', messageForParticipant);
        }
      }

      // Also broadcast to session room for any observers
      this.io.to(`session:${sessionId}`).emit('message_broadcast', {
        sessionId,
        messageId: message.id,
        senderId: message.senderId,
        timestamp: message.timestamp,
        hasTranslations: Object.keys(translations).length > 0,
        translationQuality: lowestConfidence
      });

      // Update session activity
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = 'active';
      }

    } catch (error) {
      console.error('Send message error:', error);
      throw error;
    }
  }

  async createTradeSession(participants: string[], commodity: string, metadata?: any): Promise<TradeSession> {
    try {
      const session: TradeSession = {
        id: uuidv4(),
        participants,
        commodity,
        status: 'active',
        startTime: new Date(),
        metadata
      };

      // Store session in MongoDB
      await this.storeSession(session);
      
      // Cache session in memory
      this.activeSessions.set(session.id, session);

      // Initialize participants list
      this.sessionParticipants.set(session.id, []);

      console.log(`Created trade session ${session.id} for commodity ${commodity}`);
      return session;

    } catch (error) {
      console.error('Create session error:', error);
      throw error;
    }
  }

  async joinSession(sessionId: string, vendorId: string, role: 'buyer' | 'seller' | 'observer'): Promise<void> {
    try {
      // Get vendor details for language preference
      const vendor = await this.getVendorById(vendorId);
      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const participant: SessionParticipant = {
        vendorId,
        joinedAt: new Date(),
        isActive: true,
        preferredLanguage: vendor.preferredLanguage,
        role
      };

      // Add to participants list
      const participants = this.sessionParticipants.get(sessionId) || [];
      
      // Remove existing participant record if any
      const filteredParticipants = participants.filter(p => p.vendorId !== vendorId);
      filteredParticipants.push(participant);
      
      this.sessionParticipants.set(sessionId, filteredParticipants);

      // Update session in database
      await this.updateSessionParticipants(sessionId, filteredParticipants);

      console.log(`Vendor ${vendorId} joined session ${sessionId} as ${role}`);

    } catch (error) {
      console.error('Join session error:', error);
      throw error;
    }
  }

  async leaveSession(sessionId: string, vendorId: string): Promise<void> {
    try {
      const participants = this.sessionParticipants.get(sessionId) || [];
      const updatedParticipants = participants.map(p => 
        p.vendorId === vendorId ? { ...p, isActive: false } : p
      );

      this.sessionParticipants.set(sessionId, updatedParticipants);
      
      // Update session in database
      await this.updateSessionParticipants(sessionId, updatedParticipants);

      console.log(`Vendor ${vendorId} left session ${sessionId}`);

    } catch (error) {
      console.error('Leave session error:', error);
      throw error;
    }
  }

  async getSessionHistory(sessionId: string): Promise<Message[]> {
    try {
      const mongoDB = this.dbManager.getMongoDB();
      const messagesCollection = mongoDB.collection('messages');

      const messages = await messagesCollection
        .find({ sessionId })
        .sort({ timestamp: 1 })
        .toArray();

      return messages.map((msg: any) => ({
        id: msg.messageId || msg._id.toString(), // Handle both messageId and _id
        senderId: msg.senderId,
        content: msg.content,
        originalLanguage: msg.originalLanguage,
        timestamp: msg.timestamp,
        messageType: msg.messageType,
        sessionId: msg.sessionId,
        translations: msg.translations,
        confidence: msg.confidence
      }));

    } catch (error) {
      console.error('Get session history error:', error);
      throw error;
    }
  }

  async getActiveConnections(): Promise<WebSocketConnection[]> {
    return Array.from(this.activeConnections.values());
  }

  private async storeMessage(message: Message): Promise<void> {
    try {
      const mongoDB = this.dbManager.getMongoDB();
      const messagesCollection = mongoDB.collection('messages');

      await messagesCollection.insertOne({
        messageId: message.id, // Use messageId instead of _id
        senderId: message.senderId,
        content: message.content,
        originalLanguage: message.originalLanguage,
        timestamp: message.timestamp,
        messageType: message.messageType,
        sessionId: message.sessionId,
        translations: message.translations,
        confidence: message.confidence
      });

    } catch (error) {
      console.error('Store message error:', error);
      throw error;
    }
  }

  private async storeSession(session: TradeSession): Promise<void> {
    try {
      const mongoDB = this.dbManager.getMongoDB();
      const sessionsCollection = mongoDB.collection('trade_sessions');

      await sessionsCollection.insertOne({
        sessionId: session.id, // Use sessionId instead of _id
        participants: session.participants,
        commodity: session.commodity,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        finalDeal: session.finalDeal,
        metadata: session.metadata
      });

    } catch (error) {
      console.error('Store session error:', error);
      throw error;
    }
  }

  private async updateSessionParticipants(sessionId: string, participants: SessionParticipant[]): Promise<void> {
    try {
      const mongoDB = this.dbManager.getMongoDB();
      const sessionsCollection = mongoDB.collection('trade_sessions');

      await sessionsCollection.updateOne(
        { sessionId: sessionId }, // Use sessionId field
        { 
          $set: { 
            participants: participants.map(p => p.vendorId),
            participantDetails: participants
          } 
        }
      );

    } catch (error) {
      console.error('Update session participants error:', error);
      throw error;
    }
  }

  private async getVendorById(vendorId: string): Promise<Vendor | null> {
    try {
      const pgPool = this.dbManager.getPostgreSQLPool();
      const result = await pgPool.query(
        'SELECT * FROM vendors WHERE id = $1',
        [vendorId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        location: row.location,
        preferredLanguage: row.preferred_language,
        secondaryLanguages: row.secondary_languages || [],
        businessType: row.business_type,
        verificationStatus: row.verification_status,
        trustScore: row.trust_score,
        createdAt: row.created_at,
        lastActive: row.last_active
      };

    } catch (error) {
      console.error('Get vendor error:', error);
      return null;
    }
  }

  private async flagForManualReview(message: Message, targetLanguage: string, translationResult: any): Promise<void> {
    try {
      const mongoDB = this.dbManager.getMongoDB();
      const reviewCollection = mongoDB.collection('translation_reviews');

      await reviewCollection.insertOne({
        messageId: message.id,
        sessionId: message.sessionId,
        originalText: message.content,
        originalLanguage: message.originalLanguage,
        targetLanguage,
        translatedText: translationResult.translatedText,
        confidence: translationResult.confidence,
        flaggedAt: new Date(),
        status: 'pending_review',
        alternatives: translationResult.alternativeTranslations || []
      });

      console.log(`Message ${message.id} flagged for manual review (${targetLanguage})`);
    } catch (error) {
      console.error('Failed to flag message for review:', error);
    }
  }

  private getSocketByVendorId(vendorId: string): Socket | null {
    for (const [socketId, connection] of this.activeConnections.entries()) {
      if (connection.vendorId === vendorId) {
        return this.io.sockets.sockets.get(socketId) || null;
      }
    }
    return null;
  }

  // Cleanup method for graceful shutdown
  public async cleanup(): Promise<void> {
    try {
      // Close all socket connections
      this.io.close();
      
      // Clear in-memory data
      this.activeConnections.clear();
      this.activeSessions.clear();
      this.sessionParticipants.clear();
      
      console.log('Communication service cleaned up successfully');
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}