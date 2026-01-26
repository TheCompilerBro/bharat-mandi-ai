import { Logger } from './logger';
import { MetricsCollector } from './metrics-collector';

export interface PerformanceThresholds {
  responseTime: number; // milliseconds
  memoryUsage: number; // percentage
  cpuUsage: number; // percentage
  errorRate: number; // percentage
}

export interface PerformanceAlert {
  type: 'response_time' | 'memory' | 'cpu' | 'error_rate' | 'database' | 'cache';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private thresholds: PerformanceThresholds;
  private alertCallbacks: ((alert: PerformanceAlert) => void)[];
  private monitoringInterval: NodeJS.Timeout | null;
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds

  constructor(
    thresholds: PerformanceThresholds = {
      responseTime: 3000, // 3 seconds
      memoryUsage: 80, // 80%
      cpuUsage: 70, // 70%
      errorRate: 5 // 5%
    }
  ) {
    this.logger = new Logger('PerformanceMonitor');
    this.metricsCollector = new MetricsCollector();
    this.thresholds = thresholds;
    this.alertCallbacks = [];
    this.monitoringInterval = null;
  }

  public startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkPerformanceMetrics();
    }, this.MONITORING_INTERVAL);

    this.logger.info('Performance monitoring started', {
      interval: this.MONITORING_INTERVAL,
      thresholds: this.thresholds
    });
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.logger.info('Performance monitoring stopped');
  }

  public recordResponseTime(endpoint: string, duration: number, statusCode: number): void {
    this.metricsCollector.recordHistogram('response_time_ms', duration, {
      endpoint,
      status_code: statusCode.toString()
    });

    // Check for response time threshold violations
    if (duration > this.thresholds.responseTime) {
      this.triggerAlert({
        type: 'response_time',
        severity: duration > this.thresholds.responseTime * 2 ? 'critical' : 'warning',
        message: `Slow response time detected for ${endpoint}`,
        value: duration,
        threshold: this.thresholds.responseTime,
        timestamp: new Date(),
        metadata: { endpoint, statusCode }
      });
    }
  }

  public recordDatabaseQuery(query: string, duration: number, success: boolean): void {
    this.metricsCollector.recordHistogram('database_query_duration_ms', duration, {
      success: success.toString()
    });

    this.metricsCollector.incrementCounter('database_queries_total', {
      success: success.toString()
    });

    // Alert on slow database queries
    if (duration > 1000) { // 1 second threshold for database queries
      this.triggerAlert({
        type: 'database',
        severity: duration > 5000 ? 'critical' : 'warning',
        message: `Slow database query detected`,
        value: duration,
        threshold: 1000,
        timestamp: new Date(),
        metadata: { query: query.substring(0, 100), success }
      });
    }
  }

  public recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string, duration?: number): void {
    this.metricsCollector.incrementCounter('cache_operations_total', {
      operation,
      type: this.getCacheType(key)
    });

    if (duration !== undefined) {
      this.metricsCollector.recordHistogram('cache_operation_duration_ms', duration, {
        operation,
        type: this.getCacheType(key)
      });
    }

    // Calculate cache hit rate
    const hitCount = this.metricsCollector.getCounterValue('cache_operations_total', { operation: 'hit' });
    const missCount = this.metricsCollector.getCounterValue('cache_operations_total', { operation: 'miss' });
    const totalRequests = hitCount + missCount;
    
    if (totalRequests > 100) { // Only calculate after sufficient data
      const hitRate = (hitCount / totalRequests) * 100;
      this.metricsCollector.setGauge('cache_hit_rate_percent', hitRate);

      // Alert on low cache hit rate
      if (hitRate < 70) { // 70% threshold
        this.triggerAlert({
          type: 'cache',
          severity: hitRate < 50 ? 'critical' : 'warning',
          message: `Low cache hit rate detected`,
          value: hitRate,
          threshold: 70,
          timestamp: new Date(),
          metadata: { hitCount, missCount, totalRequests }
        });
      }
    }
  }

  private getCacheType(key: string): string {
    if (key.startsWith('price_cache:')) return 'price';
    if (key.startsWith('translation_cache:')) return 'translation';
    if (key.startsWith('session_state:')) return 'session';
    if (key.startsWith('vendor_online:')) return 'presence';
    return 'other';
  }

  private checkPerformanceMetrics(): void {
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    this.metricsCollector.setGauge('memory_usage_percent', memoryUsagePercent);
    this.metricsCollector.setGauge('memory_heap_used_bytes', memoryUsage.heapUsed);
    this.metricsCollector.setGauge('memory_heap_total_bytes', memoryUsage.heapTotal);

    if (memoryUsagePercent > this.thresholds.memoryUsage) {
      this.triggerAlert({
        type: 'memory',
        severity: memoryUsagePercent > 90 ? 'critical' : 'warning',
        message: `High memory usage detected`,
        value: memoryUsagePercent,
        threshold: this.thresholds.memoryUsage,
        timestamp: new Date(),
        metadata: memoryUsage
      });
    }

    // Check error rates
    const totalRequests = this.metricsCollector.getCounterValue('gateway_requests_total');
    const errorRequests = this.metricsCollector.getCounterValue('gateway_proxy_errors_total');
    
    if (totalRequests > 100) {
      const errorRate = (errorRequests / totalRequests) * 100;
      this.metricsCollector.setGauge('error_rate_percent', errorRate);

      if (errorRate > this.thresholds.errorRate) {
        this.triggerAlert({
          type: 'error_rate',
          severity: errorRate > 10 ? 'critical' : 'warning',
          message: `High error rate detected`,
          value: errorRate,
          threshold: this.thresholds.errorRate,
          timestamp: new Date(),
          metadata: { totalRequests, errorRequests }
        });
      }
    }

    // Log current performance metrics
    this.logger.debug('Performance metrics check', {
      memoryUsagePercent,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0,
      uptime: process.uptime()
    });
  }

  private triggerAlert(alert: PerformanceAlert): void {
    this.logger.warn('Performance alert triggered', alert);
    
    // Record alert in metrics
    this.metricsCollector.incrementCounter('performance_alerts_total', {
      type: alert.type,
      severity: alert.severity
    });

    // Call registered alert callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        this.logger.error('Error in alert callback', { error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  public onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  public updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    this.logger.info('Performance thresholds updated', this.thresholds);
  }

  public getPerformanceReport(): Record<string, any> {
    const metrics = this.metricsCollector.getMetrics();
    const memoryUsage = process.memoryUsage();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        usage: memoryUsage,
        usagePercent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      thresholds: this.thresholds,
      metrics: {
        responseTime: metrics.histograms['response_time_ms'] || null,
        databaseQueries: metrics.histograms['database_query_duration_ms'] || null,
        cacheOperations: metrics.counters,
        errorRate: metrics.gauges['error_rate_percent'] || null
      }
    };
  }
}