import { DatabaseManager } from '../config/database';
import { ErrorHandler } from './error-handling';

export interface SecurityEvent {
  id: string;
  type: 'suspicious_login' | 'multiple_failures' | 'unusual_activity' | 'data_breach_attempt' | 'rate_limit_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
}

export interface SecurityAlert {
  id: string;
  eventId: string;
  alertType: 'account_lock' | 'notification' | 'investigation_required' | 'immediate_response';
  message: string;
  actionTaken: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface SuspiciousActivityPattern {
  pattern: string;
  threshold: number;
  timeWindow: number; // in milliseconds
  action: 'log' | 'alert' | 'lock_account' | 'block_ip';
}

export class SecurityMonitor {
  private static instance: SecurityMonitor;
  private dbManager: DatabaseManager;
  private errorHandler: ErrorHandler;
  private securityEvents: SecurityEvent[] = [];
  private maxEventLogSize = 10000;

  // Configurable security patterns
  private suspiciousPatterns: SuspiciousActivityPattern[] = [
    {
      pattern: 'failed_login_attempts',
      threshold: 5,
      timeWindow: 15 * 60 * 1000, // 15 minutes
      action: 'lock_account'
    },
    {
      pattern: 'rapid_api_calls',
      threshold: 100,
      timeWindow: 60 * 1000, // 1 minute
      action: 'block_ip'
    },
    {
      pattern: 'unusual_location_access',
      threshold: 1,
      timeWindow: 24 * 60 * 60 * 1000, // 24 hours
      action: 'alert'
    },
    {
      pattern: 'data_export_requests',
      threshold: 3,
      timeWindow: 60 * 60 * 1000, // 1 hour
      action: 'investigation_required'
    },
    {
      pattern: 'privilege_escalation_attempts',
      threshold: 1,
      timeWindow: 60 * 60 * 1000, // 1 hour
      action: 'immediate_response'
    }
  ];

  private constructor() {
    this.dbManager = DatabaseManager.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.startSecurityMonitoring();
  }

  public static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }

  /**
   * Logs a security event and checks for suspicious patterns
   */
  public async logSecurityEvent(
    type: SecurityEvent['type'],
    severity: SecurityEvent['severity'],
    details: Record<string, any>,
    userId?: string,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      const event: SecurityEvent = {
        id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        severity,
        userId,
        sessionId,
        ipAddress,
        userAgent,
        details,
        timestamp: new Date(),
        resolved: false
      };

      // Add to in-memory log
      this.securityEvents.push(event);
      if (this.securityEvents.length > this.maxEventLogSize) {
        this.securityEvents = this.securityEvents.slice(-this.maxEventLogSize);
      }

      // Store in database
      await this.storeSecurityEvent(event);

      // Check for suspicious patterns
      await this.checkSuspiciousPatterns(event);

      console.log(`Security event logged: ${type} (${severity})`);

    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Detects suspicious login attempts
   */
  public async detectSuspiciousLogin(
    userId: string,
    ipAddress: string,
    userAgent: string,
    loginSuccess: boolean,
    additionalContext?: Record<string, any>
  ): Promise<void> {
    const details = {
      loginSuccess,
      ipAddress,
      userAgent,
      ...additionalContext
    };

    if (!loginSuccess) {
      // Log failed login attempt
      await this.logSecurityEvent(
        'suspicious_login',
        'medium',
        { ...details, reason: 'failed_login' },
        userId,
        undefined,
        ipAddress,
        userAgent
      );

      // Check for multiple failed attempts
      await this.checkFailedLoginPattern(userId, ipAddress);
    } else {
      // Check for unusual location or device
      await this.checkUnusualLoginPattern(userId, ipAddress, userAgent);
    }
  }

  /**
   * Monitors API rate limits and unusual activity
   */
  public async monitorAPIActivity(
    userId: string,
    endpoint: string,
    ipAddress: string,
    responseTime: number,
    statusCode: number
  ): Promise<void> {
    const details = {
      endpoint,
      responseTime,
      statusCode,
      ipAddress
    };

    // Check for rapid API calls
    await this.checkRapidAPICalls(userId, ipAddress);

    // Log unusual response times or error patterns
    if (responseTime > 5000 || statusCode >= 500) {
      await this.logSecurityEvent(
        'unusual_activity',
        'low',
        { ...details, reason: 'slow_response_or_error' },
        userId,
        undefined,
        ipAddress
      );
    }
  }

  /**
   * Monitors data access and export activities
   */
  public async monitorDataAccess(
    userId: string,
    dataType: string,
    operation: 'read' | 'write' | 'export' | 'delete',
    recordCount?: number,
    sensitive?: boolean
  ): Promise<void> {
    const details = {
      dataType,
      operation,
      recordCount,
      sensitive
    };

    const severity = sensitive ? 'high' : operation === 'export' ? 'medium' : 'low';

    await this.logSecurityEvent(
      'data_breach_attempt',
      severity,
      details,
      userId
    );

    // Special monitoring for export operations
    if (operation === 'export') {
      await this.checkDataExportPattern(userId);
    }
  }

  /**
   * Automatically locks suspicious accounts
   */
  public async lockAccount(
    userId: string,
    reason: string,
    duration?: number // in milliseconds, undefined for permanent
  ): Promise<void> {
    try {
      const db = this.dbManager.getPostgresClient();
      
      const unlockTime = duration ? new Date(Date.now() + duration) : null;
      
      await db.query(`
        UPDATE vendors 
        SET account_locked = true, 
            lock_reason = $2, 
            locked_at = NOW(), 
            unlock_at = $3
        WHERE id = $1
      `, [userId, reason, unlockTime]);

      // Log security alert
      const alert: SecurityAlert = {
        id: `alert_${Date.now()}_${userId}`,
        eventId: `lock_${userId}`,
        alertType: 'account_lock',
        message: `Account ${userId} locked: ${reason}`,
        actionTaken: `Account locked ${duration ? `for ${duration}ms` : 'permanently'}`,
        timestamp: new Date(),
        acknowledged: false
      };

      await this.storeSecurityAlert(alert);

      // Send notification (in real implementation, would send email/SMS)
      await this.sendSecurityNotification(userId, alert);

      console.warn(`Account locked: ${userId} - ${reason}`);

    } catch (error) {
      console.error('Failed to lock account:', error);
    }
  }

  /**
   * Blocks suspicious IP addresses
   */
  public async blockIP(
    ipAddress: string,
    reason: string,
    duration?: number // in milliseconds
  ): Promise<void> {
    try {
      const redisClient = this.dbManager.getRedisClient();
      const blockKey = `blocked_ip:${ipAddress}`;
      
      const blockData = {
        reason,
        blockedAt: new Date(),
        duration
      };

      if (duration) {
        await redisClient.setEx(blockKey, Math.floor(duration / 1000), JSON.stringify(blockData));
      } else {
        await redisClient.set(blockKey, JSON.stringify(blockData));
      }

      console.warn(`IP blocked: ${ipAddress} - ${reason}`);

    } catch (error) {
      console.error('Failed to block IP:', error);
    }
  }

  /**
   * Checks if an IP address is blocked
   */
  public async isIPBlocked(ipAddress: string): Promise<boolean> {
    try {
      const redisClient = this.dbManager.getRedisClient();
      const blockData = await redisClient.get(`blocked_ip:${ipAddress}`);
      return blockData !== null;
    } catch (error) {
      console.error('Failed to check IP block status:', error);
      return false;
    }
  }

  /**
   * Checks if an account is locked
   */
  public async isAccountLocked(userId: string): Promise<{ locked: boolean; reason?: string; unlockAt?: Date }> {
    try {
      const db = this.dbManager.getPostgresClient();
      const result = await db.query(`
        SELECT account_locked, lock_reason, unlock_at 
        FROM vendors 
        WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return { locked: false };
      }

      const row = result.rows[0];
      const locked = row.account_locked;
      const unlockAt = row.unlock_at ? new Date(row.unlock_at) : undefined;

      // Check if temporary lock has expired
      if (locked && unlockAt && unlockAt <= new Date()) {
        // Unlock the account
        await db.query(`
          UPDATE vendors 
          SET account_locked = false, lock_reason = NULL, locked_at = NULL, unlock_at = NULL
          WHERE id = $1
        `, [userId]);

        return { locked: false };
      }

      return {
        locked,
        reason: row.lock_reason,
        unlockAt
      };

    } catch (error) {
      console.error('Failed to check account lock status:', error);
      return { locked: false };
    }
  }

  /**
   * Gets security statistics and recent events
   */
  public getSecurityStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentEvents: SecurityEvent[];
    activeAlerts: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentEvents = this.securityEvents.filter(e => e.timestamp.getTime() > oneHourAgo);
    
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    
    this.securityEvents.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    });

    return {
      totalEvents: this.securityEvents.length,
      eventsByType,
      eventsBySeverity,
      recentEvents: recentEvents.slice(-20), // Last 20 recent events
      activeAlerts: this.securityEvents.filter(e => !e.resolved && e.severity === 'high').length
    };
  }

  // Private helper methods

  private async storeSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const db = this.dbManager.getPostgresClient();
      await db.query(`
        INSERT INTO security_events (
          id, type, severity, user_id, session_id, ip_address, 
          user_agent, details, timestamp, resolved
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        event.id,
        event.type,
        event.severity,
        event.userId,
        event.sessionId,
        event.ipAddress,
        event.userAgent,
        JSON.stringify(event.details),
        event.timestamp,
        event.resolved
      ]);
    } catch (error) {
      console.error('Failed to store security event:', error);
    }
  }

  private async storeSecurityAlert(alert: SecurityAlert): Promise<void> {
    try {
      const db = this.dbManager.getPostgresClient();
      await db.query(`
        INSERT INTO security_alerts (
          id, event_id, alert_type, message, action_taken, timestamp, acknowledged
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        alert.id,
        alert.eventId,
        alert.alertType,
        alert.message,
        alert.actionTaken,
        alert.timestamp,
        alert.acknowledged
      ]);
    } catch (error) {
      console.error('Failed to store security alert:', error);
    }
  }

  private async checkSuspiciousPatterns(event: SecurityEvent): Promise<void> {
    for (const pattern of this.suspiciousPatterns) {
      const matchingEvents = await this.getMatchingEvents(pattern, event);
      
      if (matchingEvents.length >= pattern.threshold) {
        await this.triggerSecurityAction(pattern, event, matchingEvents);
      }
    }
  }

  private async getMatchingEvents(pattern: SuspiciousActivityPattern, currentEvent: SecurityEvent): Promise<SecurityEvent[]> {
    const cutoffTime = Date.now() - pattern.timeWindow;
    
    return this.securityEvents.filter(event => {
      if (event.timestamp.getTime() < cutoffTime) return false;
      
      switch (pattern.pattern) {
        case 'failed_login_attempts':
          return event.type === 'suspicious_login' && 
                 event.details.reason === 'failed_login' &&
                 event.userId === currentEvent.userId;
        
        case 'rapid_api_calls':
          return event.type === 'unusual_activity' &&
                 event.ipAddress === currentEvent.ipAddress;
        
        case 'data_export_requests':
          return event.type === 'data_breach_attempt' &&
                 event.details.operation === 'export' &&
                 event.userId === currentEvent.userId;
        
        default:
          return false;
      }
    });
  }

  private async triggerSecurityAction(
    pattern: SuspiciousActivityPattern,
    event: SecurityEvent,
    matchingEvents: SecurityEvent[]
  ): Promise<void> {
    const actionDetails = {
      pattern: pattern.pattern,
      threshold: pattern.threshold,
      eventCount: matchingEvents.length,
      timeWindow: pattern.timeWindow
    };

    switch (pattern.action) {
      case 'lock_account':
        if (event.userId) {
          await this.lockAccount(
            event.userId,
            `Suspicious pattern detected: ${pattern.pattern}`,
            60 * 60 * 1000 // 1 hour lock
          );
        }
        break;

      case 'block_ip':
        if (event.ipAddress) {
          await this.blockIP(
            event.ipAddress,
            `Suspicious pattern detected: ${pattern.pattern}`,
            30 * 60 * 1000 // 30 minutes block
          );
        }
        break;

      case 'alert':
        await this.createSecurityAlert(
          event,
          'notification',
          `Suspicious pattern detected: ${pattern.pattern}`,
          `Monitoring increased for pattern: ${pattern.pattern}`
        );
        break;

      case 'investigation_required':
        await this.createSecurityAlert(
          event,
          'investigation_required',
          `Investigation required for pattern: ${pattern.pattern}`,
          `Manual investigation triggered`
        );
        break;
    }
  }

  private async createSecurityAlert(
    event: SecurityEvent,
    alertType: SecurityAlert['alertType'],
    message: string,
    actionTaken: string
  ): Promise<void> {
    const alert: SecurityAlert = {
      id: `alert_${Date.now()}_${event.id}`,
      eventId: event.id,
      alertType,
      message,
      actionTaken,
      timestamp: new Date(),
      acknowledged: false
    };

    await this.storeSecurityAlert(alert);
  }

  private async checkFailedLoginPattern(userId: string, ipAddress: string): Promise<void> {
    const cutoffTime = Date.now() - (15 * 60 * 1000); // 15 minutes
    
    const failedAttempts = this.securityEvents.filter(event =>
      event.type === 'suspicious_login' &&
      event.details.reason === 'failed_login' &&
      event.userId === userId &&
      event.timestamp.getTime() > cutoffTime
    );

    if (failedAttempts.length >= 5) {
      await this.lockAccount(
        userId,
        'Multiple failed login attempts',
        60 * 60 * 1000 // 1 hour lock
      );
    }
  }

  private async checkUnusualLoginPattern(userId: string, ipAddress: string, userAgent: string): Promise<void> {
    // In a real implementation, this would check against historical login patterns
    // For now, we'll implement a basic check
    
    const recentLogins = this.securityEvents.filter(event =>
      event.type === 'suspicious_login' &&
      event.userId === userId &&
      event.timestamp.getTime() > (Date.now() - 24 * 60 * 60 * 1000) // 24 hours
    );

    const uniqueIPs = new Set(recentLogins.map(e => e.ipAddress));
    
    if (uniqueIPs.size > 3) { // More than 3 different IPs in 24 hours
      await this.logSecurityEvent(
        'unusual_activity',
        'medium',
        { reason: 'multiple_ip_addresses', ipCount: uniqueIPs.size },
        userId,
        undefined,
        ipAddress,
        userAgent
      );
    }
  }

  private async checkRapidAPICalls(userId: string, ipAddress: string): Promise<void> {
    const cutoffTime = Date.now() - (60 * 1000); // 1 minute
    
    const recentCalls = this.securityEvents.filter(event =>
      event.ipAddress === ipAddress &&
      event.timestamp.getTime() > cutoffTime
    );

    if (recentCalls.length >= 100) {
      await this.logSecurityEvent(
        'rate_limit_exceeded',
        'high',
        { callCount: recentCalls.length, timeWindow: '1 minute' },
        userId,
        undefined,
        ipAddress
      );

      await this.blockIP(
        ipAddress,
        'Rate limit exceeded',
        30 * 60 * 1000 // 30 minutes
      );
    }
  }

  private async checkDataExportPattern(userId: string): Promise<void> {
    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 hour
    
    const exportEvents = this.securityEvents.filter(event =>
      event.type === 'data_breach_attempt' &&
      event.details.operation === 'export' &&
      event.userId === userId &&
      event.timestamp.getTime() > cutoffTime
    );

    if (exportEvents.length >= 3) {
      await this.createSecurityAlert(
        exportEvents[exportEvents.length - 1],
        'investigation_required',
        'Multiple data export requests detected',
        'Manual investigation required for data export pattern'
      );
    }
  }

  private async sendSecurityNotification(userId: string, alert: SecurityAlert): Promise<void> {
    // In a real implementation, this would send email/SMS notifications
    console.log(`Security notification for user ${userId}: ${alert.message}`);
  }

  private startSecurityMonitoring(): void {
    // Periodic cleanup of old events
    setInterval(() => {
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
      this.securityEvents = this.securityEvents.filter(
        event => event.timestamp.getTime() > cutoffTime
      );
    }, 60 * 60 * 1000); // Run every hour
  }
}