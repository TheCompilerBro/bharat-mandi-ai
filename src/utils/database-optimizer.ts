import { Pool, PoolClient } from 'pg';
import { MongoClient, Db } from 'mongodb';
import { Logger } from './logger';
import { MetricsCollector } from './metrics-collector';

export interface QueryOptimizationConfig {
  enableQueryLogging: boolean;
  slowQueryThreshold: number; // milliseconds
  connectionPoolSize: number;
  queryTimeout: number; // milliseconds
  enablePreparedStatements: boolean;
}

export interface QueryStats {
  query: string;
  executionTime: number;
  executionCount: number;
  avgExecutionTime: number;
  lastExecuted: Date;
  isOptimized: boolean;
}

export class DatabaseOptimizer {
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private config: QueryOptimizationConfig;
  private queryStats: Map<string, QueryStats>;
  private preparedStatements: Map<string, string>;
  private connectionPools: Map<string, Pool>;

  constructor(config: Partial<QueryOptimizationConfig> = {}) {
    this.logger = new Logger('DatabaseOptimizer');
    this.metricsCollector = new MetricsCollector();
    this.config = {
      enableQueryLogging: true,
      slowQueryThreshold: 1000, // 1 second
      connectionPoolSize: 20,
      queryTimeout: 30000, // 30 seconds
      enablePreparedStatements: true,
      ...config
    };
    this.queryStats = new Map();
    this.preparedStatements = new Map();
    this.connectionPools = new Map();
  }

  public async optimizePostgresQuery(
    pool: Pool,
    query: string,
    params: any[] = []
  ): Promise<any> {
    const startTime = Date.now();
    const queryHash = this.hashQuery(query);
    
    try {
      let client: PoolClient;
      let result: any;

      // Use prepared statement if enabled and beneficial
      if (this.config.enablePreparedStatements && this.shouldUsePreparedStatement(query)) {
        const preparedName = this.getPreparedStatementName(queryHash);
        client = await pool.connect();
        
        try {
          // Prepare statement if not already prepared
          if (!this.preparedStatements.has(queryHash)) {
            await client.query(`PREPARE ${preparedName} AS ${query}`);
            this.preparedStatements.set(queryHash, preparedName);
          }
          
          // Execute prepared statement
          result = await client.query(`EXECUTE ${preparedName}(${params.map((_, i) => `$${i + 1}`).join(',')})`, params);
        } finally {
          client.release();
        }
      } else {
        // Execute regular query
        result = await pool.query(query, params);
      }

      const executionTime = Date.now() - startTime;
      this.recordQueryExecution(queryHash, query, executionTime, true);
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.recordQueryExecution(queryHash, query, executionTime, false);
      
      this.logger.error('Database query failed', {
        query: query.substring(0, 200),
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  public async optimizeMongoQuery(
    db: Db,
    collection: string,
    operation: 'find' | 'findOne' | 'aggregate' | 'insertOne' | 'insertMany' | 'updateOne' | 'updateMany' | 'deleteOne' | 'deleteMany',
    query: any,
    options: any = {}
  ): Promise<any> {
    const startTime = Date.now();
    const queryHash = this.hashQuery(`${collection}.${operation}:${JSON.stringify(query)}`);
    
    try {
      const coll = db.collection(collection);
      let result: any;

      // Add performance optimizations based on operation
      const optimizedOptions = this.optimizeMongoOptions(operation, options);

      switch (operation) {
        case 'find':
          result = await coll.find(query, optimizedOptions).toArray();
          break;
        case 'findOne':
          result = await coll.findOne(query, optimizedOptions);
          break;
        case 'aggregate':
          result = await coll.aggregate(query, optimizedOptions).toArray();
          break;
        case 'insertOne':
          result = await coll.insertOne(query, optimizedOptions);
          break;
        case 'insertMany':
          result = await coll.insertMany(query, optimizedOptions);
          break;
        case 'updateOne':
          result = await coll.updateOne(query, options.update, optimizedOptions);
          break;
        case 'updateMany':
          result = await coll.updateMany(query, options.update, optimizedOptions);
          break;
        case 'deleteOne':
          result = await coll.deleteOne(query, optimizedOptions);
          break;
        case 'deleteMany':
          result = await coll.deleteMany(query, optimizedOptions);
          break;
        default:
          throw new Error(`Unsupported MongoDB operation: ${operation}`);
      }

      const executionTime = Date.now() - startTime;
      this.recordQueryExecution(queryHash, `${collection}.${operation}`, executionTime, true);
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.recordQueryExecution(queryHash, `${collection}.${operation}`, executionTime, false);
      
      this.logger.error('MongoDB query failed', {
        collection,
        operation,
        query: JSON.stringify(query).substring(0, 200),
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  private optimizeMongoOptions(operation: string, options: any): any {
    const optimized = { ...options };

    // Add read preference for read operations
    if (['find', 'findOne', 'aggregate'].includes(operation)) {
      if (!optimized.readPreference) {
        optimized.readPreference = 'secondaryPreferred';
      }
    }

    // Add write concern for write operations
    if (['insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'].includes(operation)) {
      if (!optimized.writeConcern) {
        optimized.writeConcern = { w: 1, j: true };
      }
    }

    // Add timeout
    if (!optimized.maxTimeMS) {
      optimized.maxTimeMS = this.config.queryTimeout;
    }

    return optimized;
  }

  private shouldUsePreparedStatement(query: string): boolean {
    // Use prepared statements for queries that are likely to be repeated
    const repeatablePatterns = [
      /SELECT.*FROM.*WHERE.*=.*\$/,
      /INSERT INTO.*VALUES/,
      /UPDATE.*SET.*WHERE.*=.*\$/,
      /DELETE FROM.*WHERE.*=.*\$/
    ];

    return repeatablePatterns.some(pattern => pattern.test(query));
  }

  private getPreparedStatementName(queryHash: string): string {
    return `prep_stmt_${queryHash.substring(0, 8)}`;
  }

  private hashQuery(query: string): string {
    // Simple hash function for query identification
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private recordQueryExecution(
    queryHash: string,
    query: string,
    executionTime: number,
    success: boolean
  ): void {
    // Update query statistics
    const existing = this.queryStats.get(queryHash);
    if (existing) {
      existing.executionCount++;
      existing.avgExecutionTime = (existing.avgExecutionTime * (existing.executionCount - 1) + executionTime) / existing.executionCount;
      existing.lastExecuted = new Date();
    } else {
      this.queryStats.set(queryHash, {
        query: query.substring(0, 200),
        executionTime,
        executionCount: 1,
        avgExecutionTime: executionTime,
        lastExecuted: new Date(),
        isOptimized: false
      });
    }

    // Record metrics
    this.metricsCollector.recordHistogram('database_query_duration_ms', executionTime, {
      success: success.toString(),
      type: this.getQueryType(query)
    });

    this.metricsCollector.incrementCounter('database_queries_total', {
      success: success.toString(),
      type: this.getQueryType(query)
    });

    // Log slow queries
    if (this.config.enableQueryLogging && executionTime > this.config.slowQueryThreshold) {
      this.logger.warn('Slow query detected', {
        queryHash,
        query: query.substring(0, 200),
        executionTime,
        threshold: this.config.slowQueryThreshold
      });
    }
  }

  private getQueryType(query: string): string {
    const upperQuery = query.toUpperCase().trim();
    
    if (upperQuery.startsWith('SELECT')) return 'select';
    if (upperQuery.startsWith('INSERT')) return 'insert';
    if (upperQuery.startsWith('UPDATE')) return 'update';
    if (upperQuery.startsWith('DELETE')) return 'delete';
    if (upperQuery.includes('.FIND')) return 'mongo_find';
    if (upperQuery.includes('.AGGREGATE')) return 'mongo_aggregate';
    if (upperQuery.includes('.INSERT')) return 'mongo_insert';
    if (upperQuery.includes('.UPDATE')) return 'mongo_update';
    if (upperQuery.includes('.DELETE')) return 'mongo_delete';
    
    return 'other';
  }

  public getSlowQueries(limit: number = 10): QueryStats[] {
    return Array.from(this.queryStats.values())
      .sort((a, b) => b.avgExecutionTime - a.avgExecutionTime)
      .slice(0, limit);
  }

  public getFrequentQueries(limit: number = 10): QueryStats[] {
    return Array.from(this.queryStats.values())
      .sort((a, b) => b.executionCount - a.executionCount)
      .slice(0, limit);
  }

  public async analyzeQueryPerformance(): Promise<{
    totalQueries: number;
    avgExecutionTime: number;
    slowQueries: QueryStats[];
    frequentQueries: QueryStats[];
    recommendations: string[];
  }> {
    const allStats = Array.from(this.queryStats.values());
    const totalQueries = allStats.reduce((sum, stat) => sum + stat.executionCount, 0);
    const avgExecutionTime = allStats.reduce((sum, stat) => sum + stat.avgExecutionTime, 0) / allStats.length;
    
    const slowQueries = this.getSlowQueries(5);
    const frequentQueries = this.getFrequentQueries(5);
    
    const recommendations = this.generateOptimizationRecommendations(slowQueries, frequentQueries);
    
    return {
      totalQueries,
      avgExecutionTime,
      slowQueries,
      frequentQueries,
      recommendations
    };
  }

  private generateOptimizationRecommendations(
    slowQueries: QueryStats[],
    frequentQueries: QueryStats[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Analyze slow queries
    slowQueries.forEach(query => {
      if (query.avgExecutionTime > 5000) {
        recommendations.push(`Critical: Query "${query.query}" averages ${query.avgExecutionTime}ms - consider adding indexes or rewriting`);
      } else if (query.avgExecutionTime > 2000) {
        recommendations.push(`Warning: Query "${query.query}" averages ${query.avgExecutionTime}ms - review for optimization`);
      }
    });
    
    // Analyze frequent queries
    frequentQueries.forEach(query => {
      if (query.executionCount > 1000 && query.avgExecutionTime > 100) {
        recommendations.push(`High-impact: Frequently executed query "${query.query}" (${query.executionCount} times) - optimize for better performance`);
      }
      
      if (!this.preparedStatements.has(this.hashQuery(query.query)) && this.shouldUsePreparedStatement(query.query)) {
        recommendations.push(`Consider using prepared statement for: "${query.query}"`);
      }
    });
    
    // General recommendations
    if (slowQueries.length > 10) {
      recommendations.push('Consider reviewing database schema and adding appropriate indexes');
    }
    
    if (frequentQueries.some(q => q.avgExecutionTime > 500)) {
      recommendations.push('Consider implementing query result caching for frequently accessed data');
    }
    
    return recommendations;
  }

  public async createOptimalIndexes(pool: Pool): Promise<void> {
    const indexRecommendations = [
      // Vendor-related indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_email ON vendors(email)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_location ON vendors(location)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_trust_score ON vendors(trust_score)',
      
      // Market data indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_data_commodity_date ON market_data(commodity, date DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_data_market_date ON market_data(market, date DESC)',
      
      // Language preferences indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_language_preferences_vendor ON language_preferences(vendor_id)',
      
      // Trade sessions indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_sessions_vendor ON trade_sessions(vendor_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_sessions_status ON trade_sessions(status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trade_sessions_created ON trade_sessions(created_at DESC)',
      
      // Ratings indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ratings_vendor ON ratings(vendor_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ratings_session ON ratings(session_id)',
      
      // Analytics indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_vendor_date ON analytics_events(vendor_id, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type)'
    ];

    for (const indexQuery of indexRecommendations) {
      try {
        await pool.query(indexQuery);
        this.logger.info('Index created successfully', { query: indexQuery });
      } catch (error) {
        // Index might already exist, log as warning
        this.logger.warn('Index creation skipped', {
          query: indexQuery,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  public getPerformanceReport(): any {
    const metrics = this.metricsCollector.getMetrics();
    const queryStats = Array.from(this.queryStats.values());
    
    return {
      timestamp: new Date().toISOString(),
      totalQueries: queryStats.reduce((sum, stat) => sum + stat.executionCount, 0),
      avgExecutionTime: queryStats.reduce((sum, stat) => sum + stat.avgExecutionTime, 0) / queryStats.length || 0,
      slowQueriesCount: queryStats.filter(stat => stat.avgExecutionTime > this.config.slowQueryThreshold).length,
      preparedStatementsCount: this.preparedStatements.size,
      metrics: {
        queryDuration: metrics.histograms['database_query_duration_ms'],
        queryCount: metrics.counters['database_queries_total']
      },
      config: this.config
    };
  }
}