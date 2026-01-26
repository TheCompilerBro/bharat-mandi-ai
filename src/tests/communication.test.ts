import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketCommunicationService } from '../services/communication.service';
import { DatabaseManager } from '../config/database';
import { SarvamTranslationService } from '../services/translation.service';

// Mock dependencies
vi.mock('../config/database');
vi.mock('../services/translation.service');

describe('WebSocketCommunicationService', () => {
  let httpServer: any;
  let communicationService: WebSocketCommunicationService;
  let clientSocket: ClientSocket;
  let serverAddress: string;
  let mockDbManager: any;
  let mockTranslationService: any;

  beforeEach(async () => {
    // Create HTTP server for testing
    httpServer = createServer();
    
    // Mock DatabaseManager
    mockDbManager = {
      getMongoDB: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
          updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
          find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([])
            })
          })
        })
      }),
      getMongoClient: vi.fn().mockReturnValue({
        db: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
            updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                toArray: vi.fn().mockResolvedValue([])
              })
            })
          })
        })
      }),
      getPostgreSQLPool: vi.fn().mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: 'vendor-1',
            name: 'Test Vendor',
            email: 'test@example.com',
            phone: '1234567890',
            location: { state: 'Test State', district: 'Test District', market: 'Test Market' },
            preferred_language: 'en',
            secondary_languages: ['hi'],
            business_type: 'trader',
            verification_status: 'verified',
            trust_score: 4.5,
            created_at: new Date(),
            last_active: new Date()
          }]
        })
      }),
      getPostgresClient: vi.fn().mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: 'vendor-1',
            name: 'Test Vendor',
            email: 'test@example.com',
            phone: '1234567890',
            location: { state: 'Test State', district: 'Test District', market: 'Test Market' },
            preferred_language: 'en',
            secondary_languages: ['hi'],
            business_type: 'trader',
            verification_status: 'verified',
            trust_score: 4.5,
            created_at: new Date(),
            last_active: new Date()
          }]
        })
      }),
      getRedisClient: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        setEx: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1)
      }),
      getInstance: vi.fn().mockReturnValue(mockDbManager)
    };

    // Mock TranslationService
    mockTranslationService = {
      translateMessage: vi.fn().mockResolvedValue({
        translatedText: 'Translated text',
        confidence: 0.9,
        preservedTerms: []
      }),
      detectLanguage: vi.fn().mockResolvedValue({
        detectedLanguage: 'en',
        confidence: 0.95
      }),
      validateTranslation: vi.fn().mockResolvedValue({
        isValid: true,
        confidence: 0.9
      })
    };

    (DatabaseManager.getInstance as Mock).mockReturnValue(mockDbManager);
    (SarvamTranslationService as any).mockImplementation(() => mockTranslationService);

    // Initialize communication service
    communicationService = new WebSocketCommunicationService(httpServer);

    // Start server and get address
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const port = (httpServer.address() as any).port;
        serverAddress = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Cleanup
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (communicationService) {
      await communicationService.cleanup();
    }
    if (httpServer) {
      httpServer.close();
    }
    vi.clearAllMocks();
  });

  describe('WebSocket Connection Handling', () => {
    it('should handle client connection and authentication', (done) => {
      clientSocket = Client(serverAddress);
      
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        
        // Test authentication
        clientSocket.emit('authenticate', {
          vendorId: 'vendor-1',
          token: 'test-token'
        });
      });

      clientSocket.on('authenticated', (data) => {
        expect(data.success).toBe(true);
        expect(data.connectionId).toBeDefined();
        done();
      });

      clientSocket.on('authentication_error', (error) => {
        done(new Error(`Authentication failed: ${error.message}`));
      });
    });

    it('should handle client disconnection gracefully', (done) => {
      clientSocket = Client(serverAddress);
      
      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', {
          vendorId: 'vendor-1',
          token: 'test-token'
        });
      });

      clientSocket.on('authenticated', () => {
        clientSocket.disconnect();
        
        // Wait a bit for cleanup to complete
        setTimeout(() => {
          expect(clientSocket.connected).toBe(false);
          done();
        }, 100);
      });
    });

    it('should handle heartbeat mechanism', (done) => {
      clientSocket = Client(serverAddress);
      
      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', {
          vendorId: 'vendor-1',
          token: 'test-token'
        });
      });

      clientSocket.on('authenticated', () => {
        clientSocket.emit('heartbeat');
      });

      clientSocket.on('heartbeat_ack', () => {
        expect(true).toBe(true); // Heartbeat acknowledged
        done();
      });
    });
  });

  describe('Session Management', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      
      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', {
          vendorId: 'vendor-1',
          token: 'test-token'
        });
      });

      clientSocket.on('authenticated', () => {
        done();
      });
    });

    it('should create trade session successfully', async () => {
      const session = await communicationService.createTradeSession(
        ['vendor-1', 'vendor-2'],
        'rice',
        { quality: 'Grade A' }
      );

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.participants).toEqual(['vendor-1', 'vendor-2']);
      expect(session.commodity).toBe('rice');
      expect(session.status).toBe('active');
      expect(session.metadata).toEqual({ quality: 'Grade A' });
    });

    it('should handle joining session', (done) => {
      communicationService.createTradeSession(['vendor-1'], 'rice').then((session) => {
        clientSocket.emit('join_session', {
          sessionId: session.id,
          role: 'buyer'
        });

        clientSocket.on('session_joined', (data) => {
          expect(data.sessionId).toBe(session.id);
          done();
        });
      });
    });

    it('should handle leaving session', (done) => {
      communicationService.createTradeSession(['vendor-1'], 'rice').then((session) => {
        clientSocket.emit('join_session', {
          sessionId: session.id,
          role: 'buyer'
        });

        clientSocket.on('session_joined', () => {
          clientSocket.emit('leave_session', {
            sessionId: session.id
          });
        });

        clientSocket.on('session_left', (data) => {
          expect(data.sessionId).toBe(session.id);
          done();
        });
      });
    });
  });

  describe('Message Routing and Translation', () => {
    let sessionId: string;

    beforeEach(async () => {
      clientSocket = Client(serverAddress);
      
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', () => {
          clientSocket.emit('authenticate', {
            vendorId: 'vendor-1',
            token: 'test-token'
          });
        });

        clientSocket.on('authenticated', () => {
          resolve();
        });
      });

      // Create a test session
      const session = await communicationService.createTradeSession(['vendor-1'], 'rice');
      sessionId = session.id;
      
      await communicationService.joinSession(sessionId, 'vendor-1', 'seller');
    });

    it('should send and receive messages with translation', (done) => {
      const testMessage = 'Hello, I have rice for sale';

      clientSocket.on('new_message', (message) => {
        expect(message.content).toBe(testMessage);
        expect(message.senderId).toBe('vendor-1');
        expect(message.sessionId).toBe(sessionId);
        expect(message.originalLanguage).toBe('en');
        done();
      });

      clientSocket.emit('send_message', {
        sessionId,
        content: testMessage,
        messageType: 'text'
      });
    });

    it('should handle translation integration correctly', async () => {
      // Create a session with multiple participants
      const session = await communicationService.createTradeSession(['vendor-1', 'vendor-2'], 'rice');
      
      // Join both participants with different languages
      await communicationService.joinSession(session.id, 'vendor-1', 'seller');
      
      // Mock getVendorById to return vendor with Hindi preference
      mockDbManager.getPostgresClient.mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: 'vendor-2',
            name: 'Test Vendor 2',
            email: 'test2@example.com',
            phone: '1234567891',
            location: { state: 'Test State', district: 'Test District', market: 'Test Market' },
            preferred_language: 'hi', // Different language
            secondary_languages: ['en'],
            business_type: 'trader',
            verification_status: 'verified',
            trust_score: 4.5,
            created_at: new Date(),
            last_active: new Date()
          }]
        })
      });
      
      await communicationService.joinSession(session.id, 'vendor-2', 'buyer');

      const message = {
        id: 'test-msg-1',
        senderId: 'vendor-1',
        content: 'Rice price is 2000 per quintal',
        originalLanguage: 'en',
        timestamp: new Date(),
        messageType: 'price_quote' as const,
        sessionId: session.id
      };

      await communicationService.sendMessage(session.id, message);

      // Verify translation service was called
      expect(mockTranslationService.detectLanguage).toHaveBeenCalledWith(message.content);
      expect(mockTranslationService.translateMessage).toHaveBeenCalled();
    });

    it('should handle translation failures gracefully', async () => {
      // Mock translation failure
      mockTranslationService.translateMessage.mockRejectedValueOnce(new Error('Translation API error'));

      const message = {
        id: 'test-msg-2',
        senderId: 'vendor-1',
        content: 'Test message',
        originalLanguage: 'en',
        timestamp: new Date(),
        messageType: 'text' as const,
        sessionId
      };

      // Should not throw error
      await expect(communicationService.sendMessage(sessionId, message)).resolves.not.toThrow();
    });

    it('should handle low confidence translations', async () => {
      // Mock low confidence translation
      mockTranslationService.translateMessage.mockResolvedValueOnce({
        translatedText: 'Low confidence translation',
        confidence: 0.7, // Below 0.85 threshold
        preservedTerms: []
      });

      const message = {
        id: 'test-msg-3',
        senderId: 'vendor-1',
        content: 'Complex technical message',
        originalLanguage: 'en',
        timestamp: new Date(),
        messageType: 'text' as const,
        sessionId
      };

      await communicationService.sendMessage(sessionId, message);

      // Should still process the message but flag for review
      expect(mockDbManager.getMongoClient().db().collection().insertOne).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      
      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', {
          vendorId: 'vendor-1',
          token: 'test-token'
        });
      });

      clientSocket.on('authenticated', () => {
        done();
      });
    });

    it('should handle unauthenticated message sending', (done) => {
      const unauthenticatedClient = Client(serverAddress);
      
      unauthenticatedClient.on('connect', () => {
        unauthenticatedClient.emit('send_message', {
          sessionId: 'test-session',
          content: 'Test message'
        });
      });

      unauthenticatedClient.on('error', (error) => {
        expect(error.message).toBe('Not authenticated');
        unauthenticatedClient.disconnect();
        done();
      });
    });

    it('should handle database connection errors', async () => {
      // Mock database error
      mockDbManager.getMongoClient.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const message = {
        id: 'test-msg-error',
        senderId: 'vendor-1',
        content: 'Test message',
        originalLanguage: 'en',
        timestamp: new Date(),
        messageType: 'text' as const,
        sessionId: 'test-session'
      };

      await expect(communicationService.sendMessage('test-session', message)).rejects.toThrow();
    });

    it('should handle invalid session operations', (done) => {
      clientSocket.emit('join_session', {
        sessionId: 'non-existent-session',
        role: 'buyer'
      });

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Failed to join session');
        done();
      });
    });
  });

  describe('Language Preference Updates', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      
      clientSocket.on('connect', () => {
        clientSocket.emit('authenticate', {
          vendorId: 'vendor-1',
          token: 'test-token'
        });
      });

      clientSocket.on('authenticated', () => {
        done();
      });
    });

    it('should handle language preference updates', (done) => {
      clientSocket.emit('update_language_preference', {
        preferredLanguage: 'hi'
      });

      clientSocket.on('language_preference_updated', (data) => {
        expect(data.preferredLanguage).toBe('hi');
        expect(data.affectedSessions).toBeDefined();
        done();
      });
    });
  });

  describe('Service Methods', () => {
    it('should retrieve session history', async () => {
      const history = await communicationService.getSessionHistory('test-session');
      expect(Array.isArray(history)).toBe(true);
      expect(mockDbManager.getMongoClient().db().collection().find).toHaveBeenCalled();
    });

    it('should get active connections', async () => {
      const connections = await communicationService.getActiveConnections();
      expect(Array.isArray(connections)).toBe(true);
    });

    it('should handle cleanup gracefully', async () => {
      await expect(communicationService.cleanup()).resolves.not.toThrow();
    });
  });
});