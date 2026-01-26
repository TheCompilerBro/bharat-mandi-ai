import { Redis } from 'ioredis';
import { Logger } from './logger';
import { MetricsCollector } from './metrics-collector';

export interface CacheConfig {
  defaultTTL: number; // seconds
  maxMemory: string; // e.g., '100mb'
  evictionPolicy: 'allkeys-lru' | 'volatile-lru' | 'allkeys-lfu' | 'volatile-lfu';
  compressionThreshold: number; // bytes
}

export interface CacheEntry {
  key: string;
  value: any;
  ttl: number;
  accessCount: number;
  lastAccessed: Date;
  size: number;
  compressed: boolean;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  memoryUsage: number;
  keyCount: number;
  avgResponseTime: number;
}

export class IntelligentCache {
  private redis: Redis;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private config: CacheConfig;
  private accessPatterns: Map<string, { count: number; lastAccess: Date; avgTTL: number }>;
  private compressionEnabled: boolean;

  constructor(
    redis: Redis,
    config: Partial<CacheConfig> = {}
  ) {
    this.redis = redis;
    this.logger = new Logger('IntelligentCache');
    this.metricsCollector = new MetricsCollector();
    this.config = {
      defaultTTL: 3600, // 1 hour
      maxMemory: '100mb',
      evictionPolicy: 'allkeys-lru',
      compressionThreshold: 1024, // 1KB
      ...config
    };
    this.accessPatterns = new Map();
    this.compressionEnabled = true;

    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      // Configure Redis for optimal performance
      await this.redis.config('SET', 'maxmemory', this.config.maxMemory);
      await this.redis.config('SET', 'maxmemory-policy', this.config.evictionPolicy);
      
      this.logger.info('Intelligent cache initialized', {
        maxMemory: this.config.maxMemory,
        evictionPolicy: this.config.evictionPolicy,
        defaultTTL: this.config.defaultTTL
      });
    } catch (error) {
      this.logger.error('Failed to initialize cache configuration', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      const rawValue = await this.redis.get(key);
      const duration = Date.now() - startTime;
      
      if (rawValue === null) {
        this.recordCacheMiss(key, duration);
        return null;
      }

      const value = this.deserializeValue(rawValue);
      this.recordCacheHit(key, duration);
      this.updateAccessPattern(key);
      
      return value;
    } catch (error) {
      this.logger.error('Cache get error', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      this.metricsCollector.incrementCounter('cache_errors_total', { operation: 'get' });
      return null;
    }
  }

  public async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const serializedValue = this.serializeValue(value);
      const finalTTL = ttl || this.calculateOptimalTTL(key);
      
      await this.redis.setex(key, finalTTL, serializedValue);
      
      const duration = Date.now() - startTime;
      this.metricsCollector.recordHistogram('cache_set_duration_ms', duration);
      this.metricsCollector.incrementCounter('cache_operations_total', { operation: 'set' });
      
      this.logger.debug('Cache set successful', {
        key,
        ttl: finalTTL,
        size: serializedValue.length,
        compressed: serializedValue.startsWith('COMPRESSED:')
      });
      
      return true;
    } catch (error) {
      this.logger.error('Cache set error', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      this.metricsCollector.incrementCounter('cache_errors_total', { operation: 'set' });
      return false;
    }
  }

  public async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cachedValue = await this.get<T>(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    // Fetch fresh data
    const startTime = Date.now();
    try {
      const freshValue = await fetchFunction();
      const fetchDuration = Date.now() - startTime;
      
      // Cache the fresh value
      await this.set(key, freshValue, ttl);
      
      this.metricsCollector.recordHistogram('cache_fetch_duration_ms', fetchDuration);
      this.logger.debug('Cache miss - fetched fresh data', {
        key,
        fetchDuration
      });
      
      return freshValue;
    } catch (error) {
      this.logger.error('Failed to fetch fresh data for cache', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const startTime = Date.now();
    
    try {
      const rawValues = await this.redis.mget(...keys);
      const duration = Date.now() - startTime;
      
      const results = rawValues.map((rawValue, index) => {
        const key = keys[index];
        
        if (rawValue === null) {
          this.recordCacheMiss(key, duration / keys.length);
          return null;
        }
        
        this.recordCacheHit(key, duration / keys.length);
        this.updateAccessPattern(key);
        return this.deserializeValue(rawValue);
      });
      
      return results;
    } catch (error) {
      this.logger.error('Cache mget error', {
        keys,
        error: error instanceof Error ? error.message : String(error)
      });
      return keys.map(() => null);
    }
  }

  public async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const pipeline = this.redis.pipeline();
      
      for (const entry of entries) {
        const serializedValue = this.serializeValue(entry.value);
        const finalTTL = entry.ttl || this.calculateOptimalTTL(entry.key);
        pipeline.setex(entry.key, finalTTL, serializedValue);
      }
      
      await pipeline.exec();
      
      const duration = Date.now() - startTime;
      this.metricsCollector.recordHistogram('cache_mset_duration_ms', duration);
      this.metricsCollector.incrementCounter('cache_operations_total', { 
        operation: 'mset',
        count: entries.length.toString()
      });
      
      return true;
    } catch (error) {
      this.logger.error('Cache mset error', {
        entryCount: entries.length,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  public async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      this.metricsCollector.incrementCounter('cache_operations_total', { operation: 'delete' });
      return result > 0;
    } catch (error) {
      this.logger.error('Cache delete error', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  public async clear(pattern?: string): Promise<number> {
    try {
      let keys: string[];
      
      if (pattern) {
        keys = await this.redis.keys(pattern);
      } else {
        keys = await this.redis.keys('*');
      }
      
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.redis.del(...keys);
      this.metricsCollector.incrementCounter('cache_operations_total', { 
        operation: 'clear',
        count: result.toString()
      });
      
      return result;
    } catch (error) {
      this.logger.error('Cache clear error', {
        pattern,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  public async getStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info('stats');
      const memory = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      // Parse Redis info
      const statsLines = info.split('\r\n');
      const memoryLines = memory.split('\r\n');
      const keyspaceLines = keyspace.split('\r\n');
      
      let totalHits = 0;
      let totalMisses = 0;
      let memoryUsage = 0;
      let keyCount = 0;
      
      // Extract stats from Redis info
      for (const line of statsLines) {
        if (line.startsWith('keyspace_hits:')) {
          totalHits = parseInt(line.split(':')[1]);
        } else if (line.startsWith('keyspace_misses:')) {
          totalMisses = parseInt(line.split(':')[1]);
        }
      }
      
      for (const line of memoryLines) {
        if (line.startsWith('used_memory:')) {
          memoryUsage = parseInt(line.split(':')[1]);
        }
      }
      
      for (const line of keyspaceLines) {
        if (line.startsWith('db0:')) {
          const match = line.match(/keys=(\d+)/);
          if (match) {
            keyCount = parseInt(match[1]);
          }
        }
      }
      
      const totalRequests = totalHits + totalMisses;
      const hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
      const missRate = totalRequests > 0 ? (totalMisses / totalRequests) * 100 : 0;
      
      // Get average response time from metrics
      const responseTimeStats = this.metricsCollector.getHistogramStats('cache_operation_duration_ms');
      const avgResponseTime = responseTimeStats?.mean || 0;
      
      return {
        hitRate,
        missRate,
        totalRequests,
        totalHits,
        totalMisses,
        memoryUsage,
        keyCount,
        avgResponseTime
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        hitRate: 0,
        missRate: 0,
        totalRequests: 0,
        totalHits: 0,
        totalMisses: 0,
        memoryUsage: 0,
        keyCount: 0,
        avgResponseTime: 0
      };
    }
  }

  private recordCacheHit(key: string, duration: number): void {
    this.metricsCollector.recordHistogram('cache_operation_duration_ms', duration, {
      operation: 'hit',
      type: this.getCacheType(key)
    });
    this.metricsCollector.incrementCounter('cache_operations_total', {
      operation: 'hit',
      type: this.getCacheType(key)
    });
  }

  private recordCacheMiss(key: string, duration: number): void {
    this.metricsCollector.recordHistogram('cache_operation_duration_ms', duration, {
      operation: 'miss',
      type: this.getCacheType(key)
    });
    this.metricsCollector.incrementCounter('cache_operations_total', {
      operation: 'miss',
      type: this.getCacheType(key)
    });
  }

  private getCacheType(key: string): string {
    if (key.startsWith('price_cache:')) return 'price';
    if (key.startsWith('translation_cache:')) return 'translation';
    if (key.startsWith('session_state:')) return 'session';
    if (key.startsWith('vendor_online:')) return 'presence';
    if (key.startsWith('market_data:')) return 'market';
    if (key.startsWith('negotiation:')) return 'negotiation';
    return 'other';
  }

  private updateAccessPattern(key: string): void {
    const pattern = this.accessPatterns.get(key) || {
      count: 0,
      lastAccess: new Date(),
      avgTTL: this.config.defaultTTL
    };
    
    pattern.count++;
    pattern.lastAccess = new Date();
    
    this.accessPatterns.set(key, pattern);
  }

  private calculateOptimalTTL(key: string): number {
    const pattern = this.accessPatterns.get(key);
    
    if (!pattern) {
      return this.config.defaultTTL;
    }
    
    // Adjust TTL based on access frequency
    const timeSinceLastAccess = Date.now() - pattern.lastAccess.getTime();
    const accessFrequency = pattern.count / Math.max(1, timeSinceLastAccess / 1000 / 60); // accesses per minute
    
    // More frequently accessed items get longer TTL
    if (accessFrequency > 10) {
      return this.config.defaultTTL * 2; // 2 hours for very frequent access
    } else if (accessFrequency > 1) {
      return this.config.defaultTTL * 1.5; // 1.5 hours for frequent access
    } else {
      return this.config.defaultTTL; // Default for infrequent access
    }
  }

  private serializeValue(value: any): string {
    const jsonString = JSON.stringify(value);
    
    // Compress large values
    if (this.compressionEnabled && jsonString.length > this.config.compressionThreshold) {
      try {
        const compressed = this.compress(jsonString);
        return `COMPRESSED:${compressed}`;
      } catch (error) {
        this.logger.warn('Compression failed, storing uncompressed', {
          size: jsonString.length,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return jsonString;
  }

  private deserializeValue(rawValue: string): any {
    try {
      if (rawValue.startsWith('COMPRESSED:')) {
        const compressed = rawValue.substring(11); // Remove 'COMPRESSED:' prefix
        const decompressed = this.decompress(compressed);
        return JSON.parse(decompressed);
      }
      
      return JSON.parse(rawValue);
    } catch (error) {
      this.logger.error('Failed to deserialize cache value', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private compress(data: string): string {
    // Simple base64 encoding as compression placeholder
    // In production, use actual compression like gzip or lz4
    return Buffer.from(data).toString('base64');
  }

  private decompress(data: string): string {
    // Simple base64 decoding as decompression placeholder
    return Buffer.from(data, 'base64').toString('utf8');
  }

  public async warmup(keys: string[], fetchFunctions: Map<string, () => Promise<any>>): Promise<void> {
    this.logger.info('Starting cache warmup', { keyCount: keys.length });
    
    const promises = keys.map(async (key) => {
      const fetchFunction = fetchFunctions.get(key);
      if (fetchFunction) {
        try {
          const value = await fetchFunction();
          await this.set(key, value);
        } catch (error) {
          this.logger.warn('Cache warmup failed for key', {
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });
    
    await Promise.allSettled(promises);
    this.logger.info('Cache warmup completed');
  }
}