import express, { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import { ServiceRegistry } from './service-registry';
import { LoadBalancer } from './load-balancer';
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics-collector';
import { CircuitBreaker } from '../utils/circuit-breaker';

export interface ServiceConfig {
  name: string;
  path: string;
  target: string;
  healthCheck: string;
  timeout: number;
  retries: number;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export class APIGateway {
  private app: express.Application;
  private serviceRegistry: ServiceRegistry;
  private loadBalancer: LoadBalancer;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor() {
    this.app = express();
    this.serviceRegistry = new ServiceRegistry();
    this.loadBalancer = new LoadBalancer();
    this.logger = new Logger('APIGateway');
    this.metricsCollector = new MetricsCollector();
    this.circuitBreakers = new Map();
    
    this.initializeMiddleware();
    this.setupRoutes();
  }

  private initializeMiddleware(): void {
    // Request logging and metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Log incoming request
      this.logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      // Collect metrics
      this.metricsCollector.incrementCounter('gateway_requests_total', {
        method: req.method,
        path: req.path
      });

      // Response time tracking
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.metricsCollector.recordHistogram('gateway_request_duration_ms', duration, {
          method: req.method,
          path: req.path,
          status_code: res.statusCode.toString()
        });

        this.logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`
        });
      });

      next();
    });

    // Global rate limiting
    const globalRateLimit = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: {
        error: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use(globalRateLimit);

    // CORS and security headers
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
      res.header('X-Gateway-Version', '1.0.0');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Health check for the gateway itself
    this.app.get('/health', (req: Request, res: Response) => {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: this.serviceRegistry.getHealthStatus(),
        metrics: this.metricsCollector.getMetrics()
      };

      res.json(healthStatus);
    });

    // Service discovery endpoint
    this.app.get('/services', (req: Request, res: Response) => {
      res.json({
        services: this.serviceRegistry.getAllServices(),
        loadBalancer: this.loadBalancer.getStatus()
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req: Request, res: Response) => {
      res.json(this.metricsCollector.getMetrics());
    });
  }

  public registerService(config: ServiceConfig): void {
    this.logger.info(`Registering service: ${config.name}`, config);
    
    // Register service in service registry
    this.serviceRegistry.register(config);
    
    // Create circuit breaker for service
    const circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000,
      monitoringPeriod: 10000
    });
    this.circuitBreakers.set(config.name, circuitBreaker);

    // Create service-specific rate limiter if configured
    let serviceRateLimit: any = null;
    if (config.rateLimit) {
      serviceRateLimit = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        message: {
          error: `Too many requests to ${config.name} service`,
          code: 'SERVICE_RATE_LIMIT_EXCEEDED'
        }
      });
    }

    // Create proxy middleware with load balancing
    const proxyOptions: Options = {
      target: config.target,
      changeOrigin: true,
      pathRewrite: {
        [`^${config.path}`]: ''
      },
      timeout: config.timeout,
      onError: (err: Error, req: Request, res: Response) => {
        this.logger.error(`Proxy error for ${config.name}`, {
          error: err.message,
          url: req.url,
          method: req.method
        });

        // Record failure in circuit breaker
        circuitBreaker.recordFailure();

        // Increment error metrics
        this.metricsCollector.incrementCounter('gateway_proxy_errors_total', {
          service: config.name,
          error_type: 'proxy_error'
        });

        if (!res.headersSent) {
          res.status(502).json({
            error: 'Service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE',
            service: config.name
          });
        }
      },
      onProxyReq: (proxyReq, req: Request) => {
        // Add tracing headers
        proxyReq.setHeader('X-Gateway-Request-ID', req.headers['x-request-id'] || 'unknown');
        proxyReq.setHeader('X-Gateway-Timestamp', new Date().toISOString());
        
        this.logger.debug(`Proxying request to ${config.name}`, {
          originalUrl: req.url,
          targetUrl: proxyReq.path,
          method: req.method
        });
      },
      onProxyRes: (proxyRes, req: Request) => {
        // Record success in circuit breaker
        if (proxyRes.statusCode < 500) {
          circuitBreaker.recordSuccess();
        } else {
          circuitBreaker.recordFailure();
        }

        // Record response metrics
        this.metricsCollector.incrementCounter('gateway_proxy_responses_total', {
          service: config.name,
          status_code: proxyRes.statusCode.toString()
        });
      },
      router: (req: Request) => {
        // Use load balancer to select target
        const selectedTarget = this.loadBalancer.selectTarget(config.name);
        return selectedTarget || config.target;
      }
    };

    // Setup route with middleware chain
    const middlewares: any[] = [];
    
    // Add service-specific rate limiting if configured
    if (serviceRateLimit) {
      middlewares.push(serviceRateLimit);
    }

    // Add circuit breaker middleware
    middlewares.push((req: Request, res: Response, next: NextFunction) => {
      if (circuitBreaker.isOpen()) {
        this.logger.warn(`Circuit breaker open for ${config.name}`, {
          url: req.url,
          method: req.method
        });

        this.metricsCollector.incrementCounter('gateway_circuit_breaker_open_total', {
          service: config.name
        });

        return res.status(503).json({
          error: 'Service temporarily unavailable - circuit breaker open',
          code: 'CIRCUIT_BREAKER_OPEN',
          service: config.name
        });
      }
      next();
    });

    // Add the proxy middleware
    middlewares.push(createProxyMiddleware(proxyOptions));

    // Register the route
    this.app.use(config.path, ...middlewares);

    this.logger.info(`Service ${config.name} registered successfully on path ${config.path}`);
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async startHealthChecks(): Promise<void> {
    this.logger.info('Starting health checks for all services');
    await this.serviceRegistry.startHealthChecks();
  }

  public async stopHealthChecks(): Promise<void> {
    this.logger.info('Stopping health checks');
    await this.serviceRegistry.stopHealthChecks();
  }
}