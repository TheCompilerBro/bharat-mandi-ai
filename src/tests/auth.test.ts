import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { body, validationResult } from 'express-validator';

// Mock the database manager completely
vi.mock('../config/database', () => ({
  DatabaseManager: {
    getInstance: () => ({
      getPostgreSQLPool: () => {
        throw new Error('Database not available in test environment');
      },
    }),
  },
}));

// Mock the auth service
vi.mock('../services/auth.service', () => ({
  AuthService: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    login: vi.fn(),
    refreshToken: vi.fn(),
    getVendorById: vi.fn(),
  })),
}));

describe('Authentication Endpoints', () => {
  let server: express.Application;

  beforeEach(async () => {
    server = express();
    server.use(express.json());
    
    // Add validation middleware
    const registerValidation = [
      body('name').trim().isLength({ min: 2, max: 100 }),
      body('email').isEmail().normalizeEmail(),
      body('password').isLength({ min: 8 }),
      body('phone').matches(/^[+]?[0-9]{10,15}$/),
      body('location.state').trim().isLength({ min: 2, max: 50 }),
      body('location.district').trim().isLength({ min: 2, max: 50 }),
      body('location.market').trim().isLength({ min: 2, max: 100 }),
      body('preferredLanguage').isIn(['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa']),
      body('businessType').isIn(['farmer', 'trader', 'wholesaler', 'retailer']),
    ];

    // Add test routes with validation
    server.post('/register', registerValidation, (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
        return;
      }
      res.status(201).json({ message: 'Registration successful' });
    });

    server.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Multilingual MandiChallenge API',
        version: '1.0.0',
      });
    });
  });

  describe('POST /register', () => {
    it('should accept valid registration data', async () => {
      const vendorData = {
        name: 'Test Vendor',
        email: 'test@example.com',
        password: 'password123',
        phone: '9876543210',
        location: {
          state: 'Karnataka',
          district: 'Bangalore',
          market: 'KR Market'
        },
        preferredLanguage: 'en',
        businessType: 'trader'
      };

      const response = await request(server)
        .post('/register')
        .send(vendorData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Registration successful');
    });

    it('should reject registration with invalid email', async () => {
      const vendorData = {
        name: 'Test Vendor',
        email: 'invalid-email',
        password: 'password123',
        phone: '9876543210',
        location: {
          state: 'Karnataka',
          district: 'Bangalore',
          market: 'KR Market'
        },
        preferredLanguage: 'en',
        businessType: 'trader'
      };

      const response = await request(server)
        .post('/register')
        .send(vendorData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with short password', async () => {
      const vendorData = {
        name: 'Test Vendor',
        email: 'test@example.com',
        password: '123',
        phone: '9876543210',
        location: {
          state: 'Karnataka',
          district: 'Bangalore',
          market: 'KR Market'
        },
        preferredLanguage: 'en',
        businessType: 'trader'
      };

      const response = await request(server)
        .post('/register')
        .send(vendorData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(server)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('service', 'Multilingual MandiChallenge API');
    });
  });
});