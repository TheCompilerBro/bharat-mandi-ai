import express from 'express';
import { createServer } from 'http';
import morgan from 'morgan';
import { config, validateEnvironment } from './config/environment';
import { DatabaseManager } from './config/database';
import { securityMiddleware, errorHandler } from './middleware/security';
import { WebSocketCommunicationService } from './services/communication.service';
import { APIGateway } from './gateway/api-gateway';
import { ServiceRegistry } from './gateway/service-registry';
import { LoadBalancer } from './gateway/load-balancer';
import { Logger } from './utils/logger';
import { MetricsCollector } from './utils/metrics-collector';
import { PerformanceMonitor } from './utils/performance-monitor';
import { IntelligentCache } from './utils/intelligent-cache';
import { DatabaseOptimizer } from './utils/database-optimizer';
// Import routes dynamically after database initialization

class App {
  public app: express.Application;
  public server: any;
  private dbManager: DatabaseManager;
  private communicationService!: WebSocketCommunicationService;
  private apiGateway: APIGateway;
  private serviceRegistry: ServiceRegistry;
  private loadBalancer: LoadBalancer;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private performanceMonitor: PerformanceMonitor;
  private intelligentCache: IntelligentCache;
  private databaseOptimizer: DatabaseOptimizer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.dbManager = DatabaseManager.getInstance();
    this.logger = new Logger('App');
    this.metricsCollector = new MetricsCollector();
    this.serviceRegistry = new ServiceRegistry();
    this.loadBalancer = new LoadBalancer(this.serviceRegistry);
    this.apiGateway = new APIGateway();
    
    // Initialize performance optimization components
    this.performanceMonitor = new PerformanceMonitor({
      responseTime: 3000,
      memoryUsage: 80,
      cpuUsage: 70,
      errorRate: 5
    });
    
    this.databaseOptimizer = new DatabaseOptimizer({
      enableQueryLogging: true,
      slowQueryThreshold: 1000,
      connectionPoolSize: 20,
      queryTimeout: 30000,
      enablePreparedStatements: true
    });
    
    this.initializeMiddleware();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Performance monitoring middleware
    this.app.use((req: any, res: any, next: any) => {
      req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.startTime = Date.now();
      
      res.setHeader('X-Request-ID', req.requestId);
      
      // Log request start
      this.logger.info('Request started', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Log request completion and record performance metrics
      res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        
        // Record performance metrics
        this.performanceMonitor.recordResponseTime(req.path, duration, res.statusCode);
        
        this.metricsCollector.recordHistogram('http_request_duration_ms', duration, {
          method: req.method,
          status_code: res.statusCode.toString(),
          route: req.route?.path || req.path
        });

        this.logger.info('Request completed', {
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`
        });
      });

      next();
    });

    // Comprehensive logging middleware
    if (config.server.nodeEnv !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => {
            this.logger.info('HTTP Request', { message: message.trim() });
          }
        }
      }));
    }

    // Security middleware
    this.app.use(securityMiddleware);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static files from frontend build in production
    if (config.server.nodeEnv === 'production') {
      const path = require('path');
      this.app.use(express.static(path.join(__dirname, '../frontend')));
    }
  }

  private async initializeRoutes(): Promise<void> {
    // System monitoring endpoints
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Multilingual MandiChallenge API',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: config.server.nodeEnv
      });
    });

    this.app.get('/metrics', (req, res) => {
      res.json(this.metricsCollector.getMetrics());
    });

    this.app.get('/performance', (req, res) => {
      res.json(this.performanceMonitor.getPerformanceReport());
    });

    this.app.get('/database-performance', async (req, res) => {
      try {
        const analysis = await this.databaseOptimizer.analyzeQueryPerformance();
        res.json(analysis);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to analyze database performance',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    this.app.get('/cache-stats', async (req, res) => {
      try {
        if (this.intelligentCache) {
          const stats = await this.intelligentCache.getStats();
          res.json(stats);
        } else {
          res.json({ message: 'Cache not initialized' });
        }
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get cache stats',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    this.app.get('/services', (req, res) => {
      res.json({
        services: this.serviceRegistry.getAllServices(),
        loadBalancer: this.loadBalancer.getStatus()
      });
    });

    // Dynamically import and use routes after database initialization
    const routes = await import('./routes');
    this.app.use('/api/v1', routes.default);

    // Root endpoint
    this.app.get('/', (req, res) => {
      if (config.server.nodeEnv === 'production') {
        // Serve React app in production
        const path = require('path');
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
      } else {
        res.json({
          message: 'Welcome to Multilingual MandiChallenge API',
          version: '1.0.0',
          documentation: '/api/v1/health',
          frontend: 'Run `npm run dev:frontend` to start the frontend development server',
          monitoring: {
            health: '/health',
            metrics: '/metrics',
            performance: '/performance',
            databasePerformance: '/database-performance',
            cacheStats: '/cache-stats',
            services: '/services'
          }
        });
      }
    });

    // Handle React Router - send all non-API requests to index.html in production
    if (config.server.nodeEnv === 'production') {
      this.app.get('*', (req, res) => {
        const path = require('path');
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
      });
    } else {
      // 404 handler for development
      this.app.use('*', (req, res) => {
        res.status(404).json({
          error: 'Endpoint not found',
          code: 'ENDPOINT_NOT_FOUND',
          path: req.originalUrl,
        });
      });
    }
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Starting application initialization');

      // Validate environment variables
      validateEnvironment();
      this.logger.info('Environment validation completed');

      // Initialize database connections
      await this.dbManager.initializeConnections(config.database);
      this.logger.info('Database connections initialized');

      // Initialize routes after database connections
      await this.initializeRoutes();
      this.logger.info('Routes initialized');

      // Initialize intelligent cache
      const redis = this.dbManager.getRedisClient();
      this.intelligentCache = new IntelligentCache(redis, {
        defaultTTL: 3600,
        maxMemory: '100mb',
        evictionPolicy: 'allkeys-lru',
        compressionThreshold: 1024
      });
      this.logger.info('Intelligent cache initialized');

      // Create optimal database indexes
      const postgres = this.dbManager.getPostgresClient();
      await this.databaseOptimizer.createOptimalIndexes(postgres);
      this.logger.info('Database indexes optimized');

      // Initialize WebSocket communication service
      this.communicationService = new WebSocketCommunicationService(this.server);
      this.logger.info('WebSocket communication service initialized');

      // Register microservices with the API Gateway
      await this.registerServices();
      this.logger.info('Services registered with API Gateway');

      // Start health checks
      await this.serviceRegistry.startHealthChecks();
      this.logger.info('Health checks started');

      // Start performance monitoring
      this.performanceMonitor.startMonitoring();
      this.logger.info('Performance monitoring started');

      // Setup performance alerts
      this.performanceMonitor.onAlert((alert) => {
        this.logger.warn('Performance alert', alert);
        // In production, you might want to send alerts to external monitoring systems
      });

      // Warm up cache with frequently accessed data
      await this.warmupCache();
      this.logger.info('Cache warmup completed');

      this.logger.info('Application initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize application', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  private async warmupCache(): Promise<void> {
    try {
      const warmupKeys = [
        'price_cache:rice:default',
        'price_cache:wheat:default',
        'price_cache:cotton:default'
      ];

      const fetchFunctions = new Map<string, () => Promise<any>>();
      
      // Add fetch functions for common price data
      fetchFunctions.set('price_cache:rice:default', async () => {
        // This would normally fetch from external APIs
        return {
          currentPrice: 2000,
          priceRange: { min: 1800, max: 2200, modal: 2000 },
          lastUpdated: new Date(),
          sources: ['AGMARKNET']
        };
      });

      fetchFunctions.set('price_cache:wheat:default', async () => {
        return {
          currentPrice: 2500,
          priceRange: { min: 2300, max: 2700, modal: 2500 },
          lastUpdated: new Date(),
          sources: ['AGMARKNET']
        };
      });

      fetchFunctions.set('price_cache:cotton:default', async () => {
        return {
          currentPrice: 5500,
          priceRange: { min: 5200, max: 5800, modal: 5500 },
          lastUpdated: new Date(),
          sources: ['AGMARKNET']
        };
      });

      await this.intelligentCache.warmup(warmupKeys, fetchFunctions);
    } catch (error) {
      this.logger.warn('Cache warmup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async registerServices(): Promise<void> {
    // Register internal services (these would be external microservices in a real deployment)
    const baseUrl = `http://localhost:${config.server.port}`;

    // Authentication Service
    this.serviceRegistry.register({
      name: 'auth-service',
      path: '/api/v1/auth',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 5000,
      retries: 3,
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs for auth
      }
    });

    // Translation Service
    this.serviceRegistry.register({
      name: 'translation-service',
      path: '/api/v1/translation',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 3000,
      retries: 2,
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 200 // limit each IP to 200 translation requests per minute
      }
    });

    // Price Discovery Service
    this.serviceRegistry.register({
      name: 'price-discovery-service',
      path: '/api/v1/price-discovery',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 5000,
      retries: 3
    });

    // Communication Service
    this.serviceRegistry.register({
      name: 'communication-service',
      path: '/api/v1/communication',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 3000,
      retries: 2
    });

    // Vendor Profile Service
    this.serviceRegistry.register({
      name: 'vendor-profile-service',
      path: '/api/v1/vendors',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 4000,
      retries: 3
    });

    // Negotiation Service
    this.serviceRegistry.register({
      name: 'negotiation-service',
      path: '/api/v1/negotiation',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 4000,
      retries: 2
    });

    // Analytics Service
    this.serviceRegistry.register({
      name: 'analytics-service',
      path: '/api/v1/analytics',
      target: baseUrl,
      healthCheck: '/api/v1/health',
      timeout: 6000,
      retries: 3
    });

    this.logger.info('All services registered successfully');
  }

  public async start(): Promise<void> {
    try {
      await this.initialize();

      const httpServer = this.server.listen(config.server.port, () => {
        this.logger.info('Server started successfully', {
          port: config.server.port,
          environment: config.server.nodeEnv,
          apiBaseUrl: `http://localhost:${config.server.port}/api/v1`,
          webSocketEnabled: true,
          gatewayEnabled: true
        });

        console.log(`🚀 Server running on port ${config.server.port}`);
        console.log(`📱 Environment: ${config.server.nodeEnv}`);
        console.log(`🔗 API Base URL: http://localhost:${config.server.port}/api/v1`);
        console.log(`🔌 WebSocket server initialized`);
        console.log(`🌐 API Gateway enabled with service discovery`);
        console.log(`📊 Monitoring endpoints:`);
        console.log(`   - Health: http://localhost:${config.server.port}/health`);
        console.log(`   - Metrics: http://localhost:${config.server.port}/metrics`);
        console.log(`   - Services: http://localhost:${config.server.port}/services`);
      });

      // Graceful shutdown
      const gracefulShutdown = async (signal: string) => {
        this.logger.info(`${signal} received, shutting down gracefully`);
        
        httpServer.close(async () => {
          try {
            // Stop performance monitoring
            this.performanceMonitor.stopMonitoring();
            
            // Stop health checks
            await this.serviceRegistry.stopHealthChecks();
            
            // Cleanup communication service
            if (this.communicationService) {
              await this.communicationService.cleanup();
            }
            
            // Close database connections
            await this.dbManager.closeConnections();
            
            this.logger.info('Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            this.logger.error('Error during graceful shutdown', { error: error instanceof Error ? error.message : String(error) });
            process.exit(1);
          }
        });
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
      this.logger.error('Failed to start server', { error: error instanceof Error ? error.message : String(error) });
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  const app = new App();
  app.start().catch((error) => {
    console.error('Application startup failed:', error);
    process.exit(1);
  });
}

export default App;