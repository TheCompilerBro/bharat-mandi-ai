import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ServiceRegistry } from '../../gateway/service-registry';
import { LoadBalancer } from '../../gateway/load-balancer';
import { PerformanceMonitor } from '../../utils/performance-monitor';

describe('API Gateway Integration Tests', () => {
  let app: express.Application;
  let server: any;
  let serviceRegistry: ServiceRegistry;
  let loadBalancer: LoadBalancer;
  let performanceMonitor: PerformanceMonitor;

  beforeAll(async () => {
    // Create a minimal Express app for testing
    app = express();
    
    // Initialize components
    serviceRegistry = new ServiceRegistry();
    loadBalancer = new LoadBalancer(serviceRegistry);
    performanceMonitor = new PerformanceMonitor();

    // Add basic middleware
    app.use(express.json());

    // Add health endpoint
    app.get('/health', (_req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Test API Gateway',
        version: '1.0.0'
      });
    });

    // Add metrics endpoint
    app.get('/metrics', (_req, res) => {
      res.json({
        timestamp: new Date().toISOString(),
        counters: {},
        histograms: {},
        gauges: {}
      });
    });

    // Add performance endpoint
    app.get('/performance', (_req, res) => {
      res.json(performanceMonitor.getPerformanceReport());
    });

    // Add services endpoint
    app.get('/services', (_req, res) => {
      res.json({
        services: serviceRegistry.getAllServices(),
        loadBalancer: loadBalancer.getStatus()
      });
    });

    // Start server
    const testPort = 3001;
    server = app.listen(testPort);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (performanceMonitor) {
      performanceMonitor.stopMonitoring();
    }
    if (serviceRegistry) {
      await serviceRegistry.stopHealthChecks();
    }
  });

  describe('Core API Gateway Functionality', () => {
    it('should provide health check endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service');
    });

    it('should provide metrics endpoint', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('counters');
      expect(response.body).toHaveProperty('histograms');
      expect(response.body).toHaveProperty('gauges');
    });

    it('should provide performance monitoring endpoint', async () => {
      const response = await request(app)
        .get('/performance')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
    });

    it('should provide services status endpoint', async () => {
      const response = await request(app)
        .get('/services')
        .expect(200);

      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('loadBalancer');
    });
  });

  describe('Service Registry Integration', () => {
    it('should register and track services', () => {
      const testService = {
        name: 'test-service',
        path: '/api/test',
        target: 'http://localhost:3002',
        healthCheck: '/health',
        timeout: 5000,
        retries: 3
      };

      serviceRegistry.register(testService);

      const services = serviceRegistry.getAllServices();
      expect(services).toHaveProperty('test-service');
      expect(services['test-service']).toHaveLength(1);
      expect(services['test-service'][0].name).toBe('test-service');
    });

    it('should provide health status for registered services', () => {
      const healthStatus = serviceRegistry.getHealthStatus();
      expect(healthStatus).toHaveProperty('test-service');
      expect(healthStatus['test-service']).toHaveProperty('total');
      expect(healthStatus['test-service']).toHaveProperty('status');
    });
  });

  describe('Load Balancer Integration', () => {
    it('should provide load balancer status', () => {
      const status = loadBalancer.getStatus();
      expect(status).toHaveProperty('strategy');
      expect(status).toHaveProperty('healthCheckEnabled');
      expect(status).toHaveProperty('roundRobinCounters');
      expect(status).toHaveProperty('connectionCounts');
    });

    it('should handle service selection', () => {
      // This will return null since no healthy instances exist
      const target = loadBalancer.selectTarget('test-service');
      expect(target).toBeNull();
    });
  });

  describe('Performance Monitoring Integration', () => {
    it('should record and report performance metrics', () => {
      // Record some test metrics
      performanceMonitor.recordResponseTime('/test', 150, 200);
      performanceMonitor.recordResponseTime('/test', 200, 200);

      const report = performanceMonitor.getPerformanceReport();
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('uptime');
      expect(report).toHaveProperty('memory');
      expect(report).toHaveProperty('metrics');
    });

    it('should handle performance alerts', (done) => {
      performanceMonitor.onAlert((alert) => {
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('message');
        done();
      });

      // Trigger an alert by recording a slow response time
      performanceMonitor.recordResponseTime('/slow', 5000, 200);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors gracefully', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      // Express default 404 handling
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/health')
        .send('invalid json')
        .set('Content-Type', 'application/json');

      // Should handle gracefully without crashing
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});