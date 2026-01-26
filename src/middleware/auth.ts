import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { AuthPayload } from '../types';

// Extend Express Request interface to include vendor
declare global {
  namespace Express {
    interface Request {
      vendor?: AuthPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_MISSING'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.vendor = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ 
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
      return;
    }

    res.status(500).json({ 
      error: 'Token verification failed',
      code: 'TOKEN_VERIFICATION_ERROR'
    });
  }
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.vendor = decoded;
  } catch (error) {
    // For optional auth, we don't return errors, just continue without setting req.vendor
    console.warn('Optional auth failed:', error instanceof Error ? error.message : 'Unknown error');
  }

  next();
};

export const generateTokens = (vendorId: string, email: string) => {
  const payload = { vendorId, email };
  
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);

  return { accessToken, refreshToken };
};

export const verifyRefreshToken = (token: string): AuthPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as AuthPayload;
};