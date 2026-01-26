import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

describe('Application Core', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Add basic security middleware for testing
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    
    // Add basic routes for testing
    app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Multilingual MandiChallenge API',
        version: '1.0.0',
      });
    });

    app.get('/', (req, res) => {
      res.json({
        message: 'Welcome to Multilingual MandiChallenge API',
        version: '1.0.0',
        documentation: '/health',
      });
    });

    // Add error handling
    app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({
        error: err.message,
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });

  describe('Basic Endpoints', () => {
    it('should return welcome message on root endpoint', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Welcome to Multilingual MandiChallenge API');
      expect(response.body).toHaveProperty('version', '1.0.0');
    });

    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('service', 'Multilingual MandiChallenge API');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Security Middleware', () => {
    it('should set security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for security headers set by helmet
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });
});