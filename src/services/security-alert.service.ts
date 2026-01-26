import { DatabaseManager } from '../config/database';
import { SecurityMonitor, SecurityEvent, SecurityAlert } from '../utils/security-monitoring';

export interface AlertNotification {
  id: string;
  recipientId: string;
  recipientType: 'vendor' | 'admin' | 'system';
  alertType: 'email' | 'sms' | 'push' | 'webhook';
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  sentAt?: Date;
  deliveredAt?: Date;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
}

export interface SecurityResponse {
  id: string;
  alertId: string;
  responseType: 'automatic' | 'manual';
  action: 'account_lock' | 'ip_block' | 'notification' | 'investigation' | 'escalation';
  executedBy: string; // system or admin ID
  executedAt: Date;
  details: Record<string, any>;
  success: boolean;
}

export class SecurityAlertService {
  private static instance: SecurityAlertService;
  private dbManager: DatabaseManager;
  private securityMonitor: SecurityMonitor;
  private alertQueue: AlertNotification[] = [];
  private processingInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.dbManager = DatabaseManager.getInstance();
    this.securityMonitor = SecurityMonitor.getInstance();
    this.startAlertProcessing();
  }

  public static getInstance(): SecurityAlertService {
    if (!SecurityAlertService.instance) {
      SecurityAlertService.instance = new SecurityAlertService();
    }
    return SecurityAlertService.instance;
  }

  /**
   * Process security events and generate appropriate alerts
   */
  public async processSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const alerts = await this.generateAlertsForEvent(event);
      
      for (const alert of alerts) {
        await this.queueAlert(alert);
        
        // Execute automatic responses if configured
        if (this.shouldTriggerAutomaticResponse(event)) {
          await this.executeAutomaticResponse(event, alert);
        }
      }
    } catch (error) {
      console.error('Error processing security event:', error);
    }
  }

  /**
   * Generate alerts based on security event type and severity
   */
  private async generateAlertsForEvent(event: SecurityEvent): Promise<AlertNotification[]> {
    const alerts: AlertNotification[] = [];

    switch (event.type) {
      case 'suspicious_login':
        if (event.severity === 'high' || event.severity === 'critical') {
          // Alert the affected user
          if (event.userId) {
            alerts.push(await this.createUserAlert(
              event.userId,
              'Suspicious Login Detected',
              `We detected a suspicious login attempt on your account from ${event.ipAddress}. If this wasn't you, please secure your account immediately.`,
              event.severity
            ));
          }

          // Alert administrators for critical events
          if (event.severity === 'critical') {
            alerts.push(await this.createAdminAlert(
              'Critical Security Event',
              `Critical suspicious login detected: ${event.details.reason} from ${event.ipAddress}`,
              'critical'
            ));
          }
        }
        break;

      case 'multiple_failures':
        alerts.push(await this.createAdminAlert(
          'Multiple Authentication Failures',
          `Multiple authentication failures detected for user ${event.userId} from ${event.ipAddress}`,
          event.severity
        ));
        break;

      case 'rate_limit_exceeded':
        if (event.severity === 'high') {
          alerts.push(await this.createAdminAlert(
            'Rate Limit Exceeded',
            `Excessive API requests from ${event.ipAddress}: ${event.details.requestCount} requests`,
            event.severity
          ));
        }
        break;

      case 'data_breach_attempt':
        alerts.push(await this.createAdminAlert(
          'Potential Data Breach Attempt',
          `Suspicious data access detected: ${event.details.dataType} ${event.details.operation} by user ${event.userId}`,
          'critical'
        ));

        // Also alert the user if it's their data
        if (event.userId) {
          alerts.push(await this.createUserAlert(
            event.userId,
            'Unusual Account Activity',
            `We detected unusual data access activity on your account. Please review your recent activity.`,
            'high'
          ));
        }
        break;

      case 'unusual_activity':
        if (event.severity === 'high' || event.severity === 'critical') {
          alerts.push(await this.createAdminAlert(
            'Unusual System Activity',
            `Unusual activity detected: ${event.details.eventType} - ${event.details.description}`,
            event.severity
          ));
        }
        break;
    }

    return alerts;
  }

  /**
   * Create alert notification for a user
   */
  private async createUserAlert(
    userId: string,
    subject: string,
    message: string,
    priority: AlertNotification['priority']
  ): Promise<AlertNotification> {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId: userId,
      recipientType: 'vendor',
      alertType: 'email', // Could be configurable per user
      subject,
      message,
      priority,
      status: 'pending'
    };
  }

  /**
   * Create alert notification for administrators
   */
  private async createAdminAlert(
    subject: string,
    message: string,
    priority: AlertNotification['priority']
  ): Promise<AlertNotification> {
    return {
      id: `admin_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId: 'system_admin',
      recipientType: 'admin',
      alertType: 'email',
      subject,
      message,
      priority,
      status: 'pending'
    };
  }

  /**
   * Queue alert for processing
   */
  private async queueAlert(alert: AlertNotification): Promise<void> {
    try {
      // Store in database
      const db = this.dbManager.getPostgresClient();
      await db.query(`
        INSERT INTO security_notifications (
          id, recipient_id, recipient_type, alert_type, subject, message, 
          priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        alert.id,
        alert.recipientId,
        alert.recipientType,
        alert.alertType,
        alert.subject,
        alert.message,
        alert.priority,
        alert.status
      ]);

      // Add to processing queue
      this.alertQueue.push(alert);

      console.log(`Security alert queued: ${alert.subject} (${alert.priority})`);
    } catch (error) {
      console.error('Error queueing alert:', error);
    }
  }

  /**
   * Determine if automatic response should be triggered
   */
  private shouldTriggerAutomaticResponse(event: SecurityEvent): boolean {
    const automaticResponseTriggers = [
      'multiple_failures',
      'rate_limit_exceeded',
      'data_breach_attempt'
    ];

    return automaticResponseTriggers.includes(event.type) && 
           (event.severity === 'high' || event.severity === 'critical');
  }

  /**
   * Execute automatic security response
   */
  private async executeAutomaticResponse(event: SecurityEvent, alert: AlertNotification): Promise<void> {
    try {
      let response: SecurityResponse;

      switch (event.type) {
        case 'multiple_failures':
          if (event.userId) {
            await this.securityMonitor.lockAccount(
              event.userId,
              'Multiple failed login attempts',
              60 * 60 * 1000 // 1 hour
            );

            response = {
              id: `response_${Date.now()}_${event.id}`,
              alertId: alert.id,
              responseType: 'automatic',
              action: 'account_lock',
              executedBy: 'system',
              executedAt: new Date(),
              details: { duration: '1 hour', reason: 'Multiple failed login attempts' },
              success: true
            };
          }
          break;

        case 'rate_limit_exceeded':
          if (event.ipAddress) {
            await this.securityMonitor.blockIP(
              event.ipAddress,
              'Rate limit exceeded',
              30 * 60 * 1000 // 30 minutes
            );

            response = {
              id: `response_${Date.now()}_${event.id}`,
              alertId: alert.id,
              responseType: 'automatic',
              action: 'ip_block',
              executedBy: 'system',
              executedAt: new Date(),
              details: { duration: '30 minutes', reason: 'Rate limit exceeded' },
              success: true
            };
          }
          break;

        case 'data_breach_attempt':
          // For data breach attempts, escalate to manual investigation
          response = {
            id: `response_${Date.now()}_${event.id}`,
            alertId: alert.id,
            responseType: 'automatic',
            action: 'escalation',
            executedBy: 'system',
            executedAt: new Date(),
            details: { escalatedTo: 'security_team', reason: 'Potential data breach' },
            success: true
          };

          // Create high-priority admin alert
          await this.queueAlert(await this.createAdminAlert(
            'URGENT: Data Breach Investigation Required',
            `Immediate investigation required for potential data breach by user ${event.userId}`,
            'critical'
          ));
          break;
      }

      if (response!) {
        await this.storeSecurityResponse(response);
        console.log(`Automatic security response executed: ${response.action} for event ${event.id}`);
      }

    } catch (error) {
      console.error('Error executing automatic response:', error);
    }
  }

  /**
   * Store security response in database
   */
  private async storeSecurityResponse(response: SecurityResponse): Promise<void> {
    try {
      const db = this.dbManager.getPostgresClient();
      await db.query(`
        INSERT INTO security_responses (
          id, alert_id, response_type, action, executed_by, executed_at, 
          details, success, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        response.id,
        response.alertId,
        response.responseType,
        response.action,
        response.executedBy,
        response.executedAt,
        JSON.stringify(response.details),
        response.success
      ]);
    } catch (error) {
      console.error('Error storing security response:', error);
    }
  }

  /**
   * Start background alert processing
   */
  private startAlertProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processAlertQueue();
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process queued alerts
   */
  private async processAlertQueue(): Promise<void> {
    if (this.alertQueue.length === 0) return;

    const alertsToProcess = this.alertQueue.splice(0, 10); // Process up to 10 at a time

    for (const alert of alertsToProcess) {
      try {
        await this.sendAlert(alert);
      } catch (error) {
        console.error(`Failed to send alert ${alert.id}:`, error);
        
        // Update status to failed
        await this.updateAlertStatus(alert.id, 'failed');
      }
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlert(alert: AlertNotification): Promise<void> {
    try {
      // Update status to sent
      await this.updateAlertStatus(alert.id, 'sent');
      alert.sentAt = new Date();

      // In a real implementation, this would integrate with email/SMS services
      switch (alert.alertType) {
        case 'email':
          await this.sendEmailAlert(alert);
          break;
        case 'sms':
          await this.sendSMSAlert(alert);
          break;
        case 'push':
          await this.sendPushAlert(alert);
          break;
        case 'webhook':
          await this.sendWebhookAlert(alert);
          break;
      }

      // Update status to delivered
      await this.updateAlertStatus(alert.id, 'delivered');
      alert.deliveredAt = new Date();

      console.log(`Alert sent successfully: ${alert.id} (${alert.alertType})`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Send email alert (mock implementation)
   */
  private async sendEmailAlert(alert: AlertNotification): Promise<void> {
    // Mock email sending
    console.log(`📧 EMAIL ALERT: ${alert.subject}`);
    console.log(`To: ${alert.recipientId}`);
    console.log(`Priority: ${alert.priority}`);
    console.log(`Message: ${alert.message}`);
    
    // Simulate email delivery delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Send SMS alert (mock implementation)
   */
  private async sendSMSAlert(alert: AlertNotification): Promise<void> {
    // Mock SMS sending
    console.log(`📱 SMS ALERT: ${alert.subject}`);
    console.log(`To: ${alert.recipientId}`);
    console.log(`Message: ${alert.message.substring(0, 160)}...`);
    
    // Simulate SMS delivery delay
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Send push notification (mock implementation)
   */
  private async sendPushAlert(alert: AlertNotification): Promise<void> {
    // Mock push notification
    console.log(`🔔 PUSH ALERT: ${alert.subject}`);
    console.log(`To: ${alert.recipientId}`);
    console.log(`Message: ${alert.message}`);
    
    // Simulate push delivery delay
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  /**
   * Send webhook alert (mock implementation)
   */
  private async sendWebhookAlert(alert: AlertNotification): Promise<void> {
    // Mock webhook call
    console.log(`🔗 WEBHOOK ALERT: ${alert.subject}`);
    console.log(`Payload: ${JSON.stringify(alert)}`);
    
    // Simulate webhook call delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Update alert status in database
   */
  private async updateAlertStatus(alertId: string, status: AlertNotification['status']): Promise<void> {
    try {
      const db = this.dbManager.getPostgresClient();
      const updateField = status === 'sent' ? 'sent_at' : status === 'delivered' ? 'delivered_at' : null;
      
      let query = 'UPDATE security_notifications SET status = $1';
      const params = [status];
      
      if (updateField) {
        query += `, ${updateField} = NOW()`;
      }
      
      query += ' WHERE id = $2';
      params.push(alertId);

      await db.query(query, params);
    } catch (error) {
      console.error('Error updating alert status:', error);
    }
  }

  /**
   * Get security alert statistics
   */
  public async getAlertStats(): Promise<{
    totalAlerts: number;
    alertsByType: Record<string, number>;
    alertsByPriority: Record<string, number>;
    recentAlerts: number;
    pendingAlerts: number;
  }> {
    try {
      const db = this.dbManager.getPostgresClient();
      
      // Get total alerts
      const totalResult = await db.query('SELECT COUNT(*) as total FROM security_notifications');
      const totalAlerts = parseInt(totalResult.rows[0].total);

      // Get alerts by type
      const typeResult = await db.query(`
        SELECT alert_type, COUNT(*) as count 
        FROM security_notifications 
        GROUP BY alert_type
      `);
      const alertsByType: Record<string, number> = {};
      typeResult.rows.forEach(row => {
        alertsByType[row.alert_type] = parseInt(row.count);
      });

      // Get alerts by priority
      const priorityResult = await db.query(`
        SELECT priority, COUNT(*) as count 
        FROM security_notifications 
        GROUP BY priority
      `);
      const alertsByPriority: Record<string, number> = {};
      priorityResult.rows.forEach(row => {
        alertsByPriority[row.priority] = parseInt(row.count);
      });

      // Get recent alerts (last 24 hours)
      const recentResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM security_notifications 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      const recentAlerts = parseInt(recentResult.rows[0].count);

      // Get pending alerts
      const pendingResult = await db.query(`
        SELECT COUNT(*) as count 
        FROM security_notifications 
        WHERE status = 'pending'
      `);
      const pendingAlerts = parseInt(pendingResult.rows[0].count);

      return {
        totalAlerts,
        alertsByType,
        alertsByPriority,
        recentAlerts,
        pendingAlerts
      };
    } catch (error) {
      console.error('Error getting alert stats:', error);
      return {
        totalAlerts: 0,
        alertsByType: {},
        alertsByPriority: {},
        recentAlerts: 0,
        pendingAlerts: 0
      };
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public cleanup(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}