import { describe, it, expect } from 'vitest';
import { config } from '../config/environment';

describe('Configuration', () => {
  describe('Environment Configuration', () => {
    it('should load default configuration values', () => {
      expect(config.server.port).toBe(3000);
      expect(config.server.nodeEnv).toBe('test'); // Set in setup.ts
      expect(config.database.postgres.host).toBe('localhost');
      expect(config.database.postgres.port).toBe(5432);
    });

    it('should have valid configuration structure', () => {
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('jwt');
      expect(config).toHaveProperty('security');
    });
  });

  describe('Database Configuration', () => {
    it('should have valid database configuration structure', () => {
      expect(config.database).toHaveProperty('postgres');
      expect(config.database).toHaveProperty('mongodb');
      expect(config.database).toHaveProperty('redis');
      
      expect(config.database.postgres).toHaveProperty('host');
      expect(config.database.postgres).toHaveProperty('port');
      expect(config.database.postgres).toHaveProperty('database');
      expect(config.database.postgres).toHaveProperty('user');
      expect(config.database.postgres).toHaveProperty('password');
    });

    it('should have valid MongoDB URI format', () => {
      expect(config.database.mongodb.uri).toMatch(/^mongodb:\/\//);
    });
  });

  describe('Security Configuration', () => {
    it('should have secure default values', () => {
      expect(config.security.bcryptRounds).toBeGreaterThanOrEqual(10);
      expect(config.security.rateLimitWindowMs).toBeGreaterThan(0);
      expect(config.security.rateLimitMaxRequests).toBeGreaterThan(0);
    });

    it('should have JWT configuration', () => {
      expect(config.jwt).toHaveProperty('secret');
      expect(config.jwt).toHaveProperty('expiresIn');
      expect(config.jwt).toHaveProperty('refreshSecret');
      expect(config.jwt).toHaveProperty('refreshExpiresIn');
    });
  });
});