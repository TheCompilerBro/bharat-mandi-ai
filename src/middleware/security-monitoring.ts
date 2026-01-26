import { Request, Response, NextFunction } from 'express';
import { SecurityMonitor } from '../utils/security-monitoring';

export interface SecurityRequest extends Request {
  vendorId?: string;
  securityContext?: {
    ipAddress: string;
    userAgent: string;
    startTime: number;
  };
}

export class SecurityMiddleware {
  private securityMonitor: SecurityMonitor;

  constructor() {
    this.securityMonitor = SecurityMonitor.getInstance();
  }

  /**
   * Middleware to monitor API requests for security threats
   */
  public monitorAPIActivity = async (req: SecurityRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    // Add security context to request
    req.securityContext = {
      ipAddress,
      userAgent,
      startTime
    };

    // Check if IP is blocked
    const isBlocked = await this.securityMonitor.isIPBlocked(ipAddress);
    if (isBlocked) {
      await this.securityMonitor.logSecurityEvent(
        'suspicious_login',
        'high',
        { reason: 'blocked_ip_access', endpoint: req.path },
        undefined,
        undefined,
        ipAddress,
        userAgent
      );

      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Your IP address has been blocked due to suspicious activity'
      });
    }

    // Monitor response to log API activity
    const originalSend = res.send;
    res.send = function(data) {
      const responseTime = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Log API activity for security monitoring
      if (req.vendorId) {
        setImmediate(async () => {
          try {
            await SecurityMonitor.getInstance().monitorAPIActivity(
              req.vendorId!,
              req.path,
              ipAddress,
              responseTime,
              statusCode
            );
          } catch (error) {
            console.error('Security monitoring error:', error);
          }
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };

  /**
   * Middleware to check if user account is locked
   */
  public checkAccountLock = async (req: SecurityRequest, res: Response, next: NextFunction) => {
    if (!req.vendorId) {
      return next(); // Skip if no vendor ID (not authenticated)
    }

    try {
      const lockStatus = await this.securityMonitor.isAccountLocked(req.vendorId);
      
      if (lockStatus.locked) {
        await this.securityMonitor.logSecurityEvent(
          'suspicious_login',
          'medium',
          { reason: 'locked_account_access', endpoint: req.path },
          req.vendorId,
          undefined,
          req.securityContext?.ipAddress,
          req.securityContext?.userAgent
        );

        return res.status(423).json({
          error: 'Account locked',
          message: lockStatus.reason,
          unlockAt: lockStatus.unlockAt
        });
      }

      next();
    } catch (error) {
      console.error('Account lock check error:', error);
      next(); // Continue on error to avoid blocking legitimate users
    }
  };

  /**
   * Middleware to monitor data access operations
   */
  public monitorDataAccess = (dataType: string, operation: 'read' | 'write' | 'export' | 'delete', sensitive: boolean = false) => {
    return async (req: SecurityRequest, res: Response, next: NextFunction) => {
      if (!req.vendorId) {
        return next(); // Skip if no vendor ID
      }

      try {
        // Determine record count from request/response
        let recordCount: number | undefined;
        
        if (req.body && Array.isArray(req.body)) {
          recordCount = req.body.length;
        } else if (req.query.limit) {
          recordCount = parseInt(req.query.limit as string);
        }

        await this.securityMonitor.monitorDataAccess(
          req.vendorId,
          dataType,
          operation,
          recordCount,
          sensitive
        );

        next();
      } catch (error) {
        console.error('Data access monitoring error:', error);
        next(); // Continue on error
      }
    };
  };

  /**
   * Rate limiting middleware with security monitoring
   */
  public rateLimitWithMonitoring = (maxRequests: number = 100, windowMs: number = 60000) => {
    const requestCounts = new Map<string, { count: number; resetTime: number }>();

    return async (req: SecurityRequest, res: Response, next: NextFunction) => {
      const ipAddress = req.securityContext?.ipAddress || 'unknown';
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean up old entries
      for (const [ip, data] of requestCounts.entries()) {
        if (data.resetTime < windowStart) {
          requestCounts.delete(ip);
        }
      }

      // Get or create request count for this IP
      let requestData = requestCounts.get(ipAddress);
      if (!requestData || requestData.resetTime < windowStart) {
        requestData = { count: 0, resetTime: now + windowMs };
        requestCounts.set(ipAddress, requestData);
      }

      requestData.count++;

      // Check rate limit
      if (requestData.count > maxRequests) {
        // Log rate limit exceeded
        await this.securityMonitor.logSecurityEvent(
          'rate_limit_exceeded',
          'high',
          { 
            requestCount: requestData.count,
            maxRequests,
            windowMs,
            endpoint: req.path
          },
          req.vendorId,
          undefined,
          ipAddress,
          req.securityContext?.userAgent
        );

        // Temporarily block IP if excessive requests
        if (requestData.count > maxRequests * 2) {
          await this.securityMonitor.blockIP(
            ipAddress,
            'Excessive API requests',
            30 * 60 * 1000 // 30 minutes
          );
        }

        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${maxRequests} per ${windowMs / 1000} seconds`,
          retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
        });
      }

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - requestData.count).toString(),
        'X-RateLimit-Reset': Math.ceil(requestData.resetTime / 1000).toString()
      });

      next();
    };
  };

  /**
   * Middleware to detect and prevent suspicious patterns
   */
  public detectSuspiciousPatterns = async (req: SecurityRequest, res: Response, next: NextFunction) => {
    if (!req.vendorId || !req.securityContext) {
      return next();
    }

    try {
      const { ipAddress, userAgent } = req.securityContext;

      // Check for suspicious patterns in request
      const suspiciousIndicators = [];

      // Check for SQL injection patterns
      const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|OR|AND)\b|[';])/i;
      const requestString = JSON.stringify(req.body) + req.url + JSON.stringify(req.query);
      if (sqlPatterns.test(requestString)) {
        suspiciousIndicators.push('sql_injection_pattern');
      }

      // Check for XSS patterns
      const xssPatterns = /<script|javascript:|on\w+\s*=/i;
      if (xssPatterns.test(requestString)) {
        suspiciousIndicators.push('xss_pattern');
      }

      // Check for unusual user agent
      if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.length < 10) {
        suspiciousIndicators.push('suspicious_user_agent');
      }

      // Check for rapid requests from same IP
      const recentRequests = await this.getRecentRequestCount(ipAddress);
      if (recentRequests > 50) { // More than 50 requests in last minute
        suspiciousIndicators.push('rapid_requests');
      }

      // Log suspicious activity if indicators found
      if (suspiciousIndicators.length > 0) {
        await this.securityMonitor.logSecurityEvent(
          'suspicious_login',
          suspiciousIndicators.length > 2 ? 'high' : 'medium',
          {
            indicators: suspiciousIndicators,
            endpoint: req.path,
            method: req.method,
            requestData: {
              bodySize: JSON.stringify(req.body).length,
              queryParams: Object.keys(req.query).length,
              headers: Object.keys(req.headers).length
            }
          },
          req.vendorId,
          undefined,
          ipAddress,
          userAgent
        );

        // Block IP if multiple high-risk indicators
        if (suspiciousIndicators.length > 2) {
          await this.securityMonitor.blockIP(
            ipAddress,
            `Suspicious activity detected: ${suspiciousIndicators.join(', ')}`,
            60 * 60 * 1000 // 1 hour
          );

          return res.status(403).json({
            error: 'Suspicious activity detected',
            message: 'Your request has been blocked due to suspicious patterns'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Suspicious pattern detection error:', error);
      next(); // Continue on error
    }
  };

  /**
   * Get recent request count for an IP address
   */
  private async getRecentRequestCount(ipAddress: string): Promise<number> {
    // In a real implementation, this would query a database or cache
    // For now, return a mock value
    return Math.floor(Math.random() * 100);
  }

  /**
   * Middleware to log security events for audit trail
   */
  public auditTrail = (eventType: string, description: string) => {
    return async (req: SecurityRequest, res: Response, next: NextFunction) => {
      try {
        await this.securityMonitor.logSecurityEvent(
          'unusual_activity',
          'low',
          {
            eventType,
            description,
            endpoint: req.path,
            method: req.method,
            timestamp: new Date()
          },
          req.vendorId,
          undefined,
          req.securityContext?.ipAddress,
          req.securityContext?.userAgent
        );

        next();
      } catch (error) {
        console.error('Audit trail error:', error);
        next(); // Continue on error
      }
    };
  };
}

// Export singleton instance
export const securityMiddleware = new SecurityMiddleware();