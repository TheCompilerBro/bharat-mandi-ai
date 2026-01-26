import { DatabaseManager } from '../config/database';

export interface ErrorContext {
  service: string;
  operation: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface FallbackOptions {
  useCache?: boolean;
  maxCacheAge?: number; // in milliseconds
  defaultValue?: any;
  retryCount?: number;
  retryDelay?: number; // in milliseconds
}

export interface ServiceError extends Error {
  code: string;
  service: string;
  operation: string;
  context?: ErrorContext;
  originalError?: Error;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private dbManager: DatabaseManager;
  private errorLog: ServiceError[] = [];
  private maxLogSize = 1000;

  private constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Creates a standardized service error
   */
  public createError(
    message: string,
    code: string,
    context: ErrorContext,
    originalError?: Error,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): ServiceError {
    const error: ServiceError = {
      name: 'ServiceError',
      message,
      code,
      service: context.service,
      operation: context.operation,
      context,
      originalError,
      timestamp: new Date(),
      severity,
      stack: originalError?.stack || new Error().stack
    };

    // Log error
    this.logError(error);

    return error;
  }

  /**
   * Handles external API failures with fallback mechanisms
   */
  public async handleExternalAPIFailure<T>(
    operation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    context: ErrorContext,
    options: FallbackOptions = {}
  ): Promise<T> {
    const { retryCount = 3, retryDelay = 1000 } = options;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.warn(`${context.service}.${context.operation} attempt ${attempt} failed:`, error);

        if (attempt === retryCount) {
          // All retries exhausted, try fallback
          try {
            console.log(`Using fallback for ${context.service}.${context.operation}`);
            return await fallbackOperation();
          } catch (fallbackError) {
            const serviceError = this.createError(
              `External API failure and fallback failed for ${context.operation}`,
              'EXTERNAL_API_FAILURE',
              context,
              error as Error,
              'high'
            );
            throw serviceError;
          }
        }

        // Wait before retry
        await this.delay(retryDelay * attempt);
      }
    }

    throw new Error('Unexpected error in retry logic');
  }

  /**
   * Validates data and detects anomalies
   */
  public validateData<T>(
    data: T,
    validator: (data: T) => boolean,
    anomalyDetector: (data: T) => boolean,
    context: ErrorContext
  ): { isValid: boolean; hasAnomalies: boolean; data: T } {
    try {
      const isValid = validator(data);
      const hasAnomalies = anomalyDetector(data);

      if (!isValid) {
        this.logError(this.createError(
          `Data validation failed for ${context.operation}`,
          'DATA_VALIDATION_FAILURE',
          context,
          undefined,
          'medium'
        ));
      }

      if (hasAnomalies) {
        this.logError(this.createError(
          `Data anomaly detected in ${context.operation}`,
          'DATA_ANOMALY_DETECTED',
          context,
          undefined,
          'medium'
        ));
      }

      return { isValid, hasAnomalies, data };
    } catch (error) {
      throw this.createError(
        `Data validation error in ${context.operation}`,
        'VALIDATION_ERROR',
        context,
        error as Error,
        'high'
      );
    }
  }

  /**
   * Implements graceful degradation for service outages
   */
  public async gracefulDegrade<T>(
    primaryService: () => Promise<T>,
    degradedService: () => Promise<T>,
    context: ErrorContext,
    options: FallbackOptions = {}
  ): Promise<{ result: T; isDegraded: boolean }> {
    try {
      const result = await primaryService();
      return { result, isDegraded: false };
    } catch (error) {
      console.warn(`Primary service failed for ${context.operation}, using degraded service`);
      
      try {
        const result = await degradedService();
        
        // Log degradation event
        this.logError(this.createError(
          `Service degraded for ${context.operation}`,
          'SERVICE_DEGRADED',
          context,
          error as Error,
          'medium'
        ));

        return { result, isDegraded: true };
      } catch (degradedError) {
        throw this.createError(
          `Both primary and degraded services failed for ${context.operation}`,
          'COMPLETE_SERVICE_FAILURE',
          context,
          degradedError as Error,
          'critical'
        );
      }
    }
  }

  /**
   * Handles cache operations with fallback
   */
  public async withCacheFallback<T>(
    cacheKey: string,
    dataFetcher: () => Promise<T>,
    context: ErrorContext,
    options: FallbackOptions = {}
  ): Promise<T> {
    const { useCache = true, maxCacheAge = 4 * 60 * 60 * 1000 } = options; // 4 hours default

    if (useCache) {
      try {
        const redisClient = this.dbManager.getRedisClient();
        const cached = await redisClient.get(cacheKey);
        
        if (cached) {
          const cachedData = JSON.parse(cached);
          const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
          
          // Return cached data if within 4-hour limit
          if (cacheAge <= maxCacheAge) {
            return cachedData.data;
          }
        }
      } catch (cacheError) {
        console.warn(`Cache retrieval failed for ${cacheKey}:`, cacheError);
      }
    }

    try {
      const data = await dataFetcher();
      
      // Cache the result
      if (useCache) {
        try {
          const redisClient = this.dbManager.getRedisClient();
          await redisClient.setEx(cacheKey, 3600, JSON.stringify({
            data,
            timestamp: new Date()
          }));
        } catch (cacheError) {
          console.warn(`Cache storage failed for ${cacheKey}:`, cacheError);
        }
      }
      
      return data;
    } catch (error) {
      // Try to get stale cache data as last resort (Requirement 5.3)
      if (useCache) {
        try {
          const redisClient = this.dbManager.getRedisClient();
          const staleCache = await redisClient.get(cacheKey);
          
          if (staleCache) {
            const cachedData = JSON.parse(staleCache);
            const staleCacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
            
            // For stale cache handling: if cache is older than 4 hours but less than 48 hours,
            // use it as fallback but try to get fresh data from database first
            if (staleCacheAge > maxCacheAge) {
              // Cache is stale, try database fallback first
              try {
                const dbFallback = await this.getDatabaseFallback(context);
                if (dbFallback) {
                  return dbFallback;
                }
              } catch (dbError) {
                console.warn('Database fallback failed, using stale cache');
              }
              
              // If database fallback fails and cache is not too old (< 48 hours), use stale cache
              if (staleCacheAge <= 48 * 60 * 60 * 1000) {
                console.warn(`Using stale cache data for ${cacheKey}, age: ${staleCacheAge}ms`);
                
                this.logError(this.createError(
                  `Using stale cache data for ${context.operation}`,
                  'STALE_CACHE_USED',
                  context,
                  error as Error,
                  'medium'
                ));
                
                return cachedData.data;
              }
            }
          }
        } catch (staleCacheError) {
          console.error(`Stale cache retrieval failed for ${cacheKey}:`, staleCacheError);
        }
      }

      throw this.createError(
        `Data fetching failed and no cache available for ${context.operation}`,
        'DATA_FETCH_FAILURE',
        context,
        error as Error,
        'high'
      );
    }
  }

  /**
   * Gets fallback data from database when cache is stale
   */
  private async getDatabaseFallback(context: ErrorContext): Promise<any> {
    try {
      const db = this.dbManager.getPostgresClient();
      
      if (context.service === 'price_discovery') {
        // Get recent price data from database
        const result = await db.query(
          'SELECT * FROM market_data WHERE commodity = $1 ORDER BY date DESC LIMIT 1',
          [context.metadata?.commodity || 'Rice']
        );
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            commodity: row.commodity,
            currentPrice: parseFloat(row.modal_price),
            priceRange: {
              min: parseFloat(row.min_price),
              max: parseFloat(row.max_price),
              modal: parseFloat(row.modal_price)
            },
            lastUpdated: new Date(row.date),
            sources: JSON.parse(row.sources || '["database"]'),
            volatility: parseFloat(row.volatility || '0'),
            market: row.market,
            arrivals: parseInt(row.arrivals || '0')
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Database fallback error:', error);
      return null;
    }
  }

  /**
   * Monitors service health and triggers alerts
   */
  public async monitorServiceHealth(
    serviceName: string,
    healthCheck: () => Promise<boolean>,
    alertThreshold: number = 3
  ): Promise<void> {
    const healthKey = `service_health:${serviceName}`;
    
    try {
      const isHealthy = await healthCheck();
      const redisClient = this.dbManager.getRedisClient();
      
      if (isHealthy) {
        // Reset failure count
        await redisClient.del(`${healthKey}:failures`);
      } else {
        // Increment failure count
        const failures = await redisClient.incr(`${healthKey}:failures`);
        await redisClient.expire(`${healthKey}:failures`, 300); // 5 minutes TTL
        
        if (failures >= alertThreshold) {
          await this.triggerServiceAlert(serviceName, failures);
        }
      }
    } catch (error) {
      console.error(`Health check failed for ${serviceName}:`, error);
    }
  }

  /**
   * Logs errors to database and in-memory store
   */
  private async logError(error: ServiceError): Promise<void> {
    try {
      // Add to in-memory log
      this.errorLog.push(error);
      
      // Maintain log size
      if (this.errorLog.length > this.maxLogSize) {
        this.errorLog = this.errorLog.slice(-this.maxLogSize);
      }

      // Store in database
      const db = this.dbManager.getPostgresClient();
      await db.query(`
        INSERT INTO error_logs (
          id, service, operation, error_code, message, severity, 
          user_id, session_id, metadata, original_error, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        error.service,
        error.operation,
        error.code,
        error.message,
        error.severity,
        error.context?.userId,
        error.context?.sessionId,
        JSON.stringify(error.context?.metadata || {}),
        error.originalError?.message,
        error.timestamp
      ]);

      // Log to console based on severity
      if (error.severity === 'critical' || error.severity === 'high') {
        console.error('Service Error:', error);
      } else {
        console.warn('Service Warning:', error);
      }

    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  /**
   * Triggers service alerts for critical issues
   */
  private async triggerServiceAlert(serviceName: string, failureCount: number): Promise<void> {
    try {
      const alert = {
        id: `alert_${Date.now()}_${serviceName}`,
        service: serviceName,
        alertType: 'service_failure',
        severity: 'high',
        message: `Service ${serviceName} has failed ${failureCount} times`,
        timestamp: new Date(),
        acknowledged: false
      };

      // Store alert in database
      const db = this.dbManager.getPostgresClient();
      await db.query(`
        INSERT INTO service_alerts (
          id, service, alert_type, severity, message, timestamp, acknowledged
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        alert.id,
        alert.service,
        alert.alertType,
        alert.severity,
        alert.message,
        alert.timestamp,
        alert.acknowledged
      ]);

      console.error(`SERVICE ALERT: ${alert.message}`);

      // In a real implementation, this would send notifications via email, SMS, etc.
      
    } catch (error) {
      console.error('Failed to trigger service alert:', error);
    }
  }

  /**
   * Gets recent errors for monitoring
   */
  public getRecentErrors(limit: number = 50): ServiceError[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * Gets error statistics
   */
  public getErrorStats(): {
    total: number;
    bySeverity: Record<string, number>;
    byService: Record<string, number>;
    recentCount: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentErrors = this.errorLog.filter(e => e.timestamp.getTime() > oneHourAgo);
    
    const bySeverity: Record<string, number> = {};
    const byService: Record<string, number> = {};
    
    this.errorLog.forEach(error => {
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      byService[error.service] = (byService[error.service] || 0) + 1;
    });

    return {
      total: this.errorLog.length,
      bySeverity,
      byService,
      recentCount: recentErrors.length
    };
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Data validation utilities
export class DataValidator {
  /**
   * Validates price data for anomalies
   */
  static validatePriceData(priceData: any): boolean {
    if (!priceData || typeof priceData !== 'object') return false;
    
    const { currentPrice, priceRange } = priceData;
    
    // Check if currentPrice is a valid positive finite number
    if (typeof currentPrice !== 'number' || !isFinite(currentPrice) || currentPrice <= 0) return false;
    if (!priceRange || typeof priceRange !== 'object') return false;
    
    const { min, max, modal } = priceRange;
    
    // Check if all price range values are valid positive finite numbers
    if (typeof min !== 'number' || !isFinite(min) || min <= 0) return false;
    if (typeof max !== 'number' || !isFinite(max) || max <= 0) return false;
    if (typeof modal !== 'number' || !isFinite(modal) || modal <= 0) return false;
    
    // Check logical consistency
    if (min > max || modal < min || modal > max) return false;
    
    return true;
  }

  /**
   * Detects price anomalies (>25% deviation from expected range)
   */
  static detectPriceAnomalies(priceData: any, historicalData?: any[]): boolean {
    if (!DataValidator.validatePriceData(priceData)) return true;
    
    if (!historicalData || historicalData.length === 0) return false;
    
    const currentPrice = priceData.currentPrice;
    const historicalPrices = historicalData
      .map(d => d.currentPrice || d.price)
      .filter(p => typeof p === 'number' && isFinite(p) && p > 0);
    
    if (historicalPrices.length === 0) return false;
    
    // Calculate median of historical prices
    const sortedPrices = [...historicalPrices].sort((a, b) => a - b);
    const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
    
    // Ensure median is valid
    if (!isFinite(median) || median <= 0) return false;
    
    // Check if current price deviates more than 25% from median
    const deviation = Math.abs(currentPrice - median) / median;
    return deviation > 0.25;
  }

  /**
   * Validates translation data
   */
  static validateTranslationData(translationData: any): boolean {
    if (!translationData || typeof translationData !== 'object') return false;
    
    const { translatedText, confidence } = translationData;
    
    if (typeof translatedText !== 'string' || translatedText.trim().length === 0) return false;
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) return false;
    
    return true;
  }

  /**
   * Validates vendor profile data
   */
  static validateVendorProfile(profileData: any): boolean {
    if (!profileData || typeof profileData !== 'object') return false;
    
    const { name, email, phone, location, preferredLanguage } = profileData;
    
    if (typeof name !== 'string' || name.trim().length === 0) return false;
    if (typeof email !== 'string' || !email.includes('@')) return false;
    if (typeof phone !== 'string' || phone.trim().length === 0) return false;
    if (!location || typeof location !== 'object') return false;
    if (typeof preferredLanguage !== 'string' || preferredLanguage.trim().length === 0) return false;
    
    return true;
  }
}

// Circuit breaker pattern for external services
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 1 minute
    private monitoringPeriod: number = 120000 // 2 minutes
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }
}