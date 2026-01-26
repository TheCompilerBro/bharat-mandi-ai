import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from '../config/environment';

// Rate limiting configuration
export const createRateLimiter = (windowMs?: number, max?: number) => {
  return rateLimit({
    windowMs: windowMs || config.security.rateLimitWindowMs,
    max: max || config.security.rateLimitMaxRequests,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General rate limiter
export const generalRateLimit = config.server.nodeEnv === 'development' 
  ? (req: Request, res: Response, next: NextFunction) => next() // Disable in development
  : createRateLimiter();

// Stricter rate limiter for authentication endpoints
export const authRateLimit = config.server.nodeEnv === 'development' 
  ? (req: Request, res: Response, next: NextFunction) => next() // Disable in development
  : createRateLimiter(
      15 * 60 * 1000, // 15 minutes
      5 // 5 attempts per window
    );

// CORS configuration
export const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (config.server.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // In production, you should specify allowed origins
    const allowedOrigins = [
      'https://yourdomain.com',
      'https://www.yourdomain.com',
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

// Security headers configuration
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Request validation middleware
export const validateContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (!req.is('application/json')) {
      res.status(400).json({
        error: 'Content-Type must be application/json',
        code: 'INVALID_CONTENT_TYPE',
      });
      return;
    }
  }
  next();
};

// Request size limiter
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction): void => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > maxSize) {
      res.status(413).json({
        error: 'Request entity too large',
        code: 'REQUEST_TOO_LARGE',
      });
      return;
    }
  }
  next();
};

// Error handling middleware
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  console.error('Error:', err);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.message,
    });
    return;
  }

  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    error: config.server.nodeEnv === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_SERVER_ERROR',
  });
};

// Compression middleware
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
});

// Security middleware bundle
export const securityMiddleware = [
  helmetConfig,
  cors(corsOptions),
  compressionMiddleware,
  generalRateLimit,
  validateContentType,
  requestSizeLimit,
];