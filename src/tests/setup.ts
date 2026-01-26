import { beforeAll, afterAll } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.POSTGRES_DB = 'mandi_challenge_test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/mandi_challenge_test';

beforeAll(async () => {
  console.log('Setting up test environment...');
});

afterAll(async () => {
  console.log('Cleaning up test environment...');
});