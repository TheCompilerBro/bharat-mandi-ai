import dotenv from 'dotenv';
import { DatabaseConfig } from '../types';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  database: {
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'mandi_challenge',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
    },
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mandi_challenge',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
  } as DatabaseConfig,

  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-token-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  externalApis: {
    sarvamAiApiKey: process.env.SARVAM_AI_API_KEY || '',
    agmarknetApiKey: process.env.AGMARKNET_API_KEY || '',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required environment variables
export function validateEnvironment(): void {
  const requiredVars = [
    'JWT_SECRET',
    'POSTGRES_PASSWORD',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('Using default values. Please set these in production.');
  }

  if (config.server.nodeEnv === 'production') {
    const productionRequiredVars = [
      'JWT_SECRET',
      'POSTGRES_PASSWORD',
      'SARVAM_AI_API_KEY',
    ];

    const missingProductionVars = productionRequiredVars.filter(varName => !process.env[varName]);

    if (missingProductionVars.length > 0) {
      throw new Error(`Missing required environment variables for production: ${missingProductionVars.join(', ')}`);
    }
  }
}