import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '../services/auth.service';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { authRateLimit } from '../middleware/security';
import { LoginRequest, RegisterRequest } from '../types';

const router = Router();

// Lazy initialization of AuthService
let authService: AuthService | null = null;
const getAuthService = () => {
  if (!authService) {
    authService = new AuthService();
  }
  return authService;
};

// Validation rules
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('phone').matches(/^[+]?[0-9]{10,15}$/).withMessage('Valid phone number is required'),
  body('location.state').trim().isLength({ min: 2, max: 50 }).withMessage('State is required'),
  body('location.district').trim().isLength({ min: 2, max: 50 }).withMessage('District is required'),
  body('location.market').trim().isLength({ min: 2, max: 100 }).withMessage('Market is required'),
  body('preferredLanguage').isIn([
    'hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa'
  ]).withMessage('Invalid preferred language'),
  body('businessType').isIn(['farmer', 'trader', 'wholesaler', 'retailer']).withMessage('Invalid business type'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Register endpoint
router.post('/register', authRateLimit, registerValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
      return;
    }

    const registerData: RegisterRequest = req.body;
    const result = await getAuthService().register(registerData);

    res.status(201).json({
      message: 'Vendor registered successfully',
      vendor: result.vendor,
      tokens: result.tokens,
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({
        error: error.message,
        code: 'VENDOR_EXISTS',
      });
      return;
    }

    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
    });
  }
});

// Login endpoint
router.post('/login', authRateLimit, loginValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
      return;
    }

    const loginData: LoginRequest = req.body;
    const result = await getAuthService().login(loginData);

    res.json({
      message: 'Login successful',
      vendor: result.vendor,
      tokens: result.tokens,
    });
  } catch (error) {
    console.error('Login error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid email or password')) {
      res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
      return;
    }

    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
    });
  }
});

// Refresh token endpoint
router.post('/refresh', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Refresh token is required',
        code: 'REFRESH_TOKEN_MISSING',
      });
      return;
    }

    const tokens = await getAuthService().refreshToken(refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      tokens,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    res.status(401).json({
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN',
    });
  }
});

// Get current vendor profile
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.vendor) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const vendor = await getAuthService().getVendorById(req.vendor.vendorId);

    if (!vendor) {
      res.status(404).json({
        error: 'Vendor not found',
        code: 'VENDOR_NOT_FOUND',
      });
      return;
    }

    res.json({
      vendor,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    
    res.status(500).json({
      error: 'Failed to fetch profile',
      code: 'PROFILE_FETCH_ERROR',
    });
  }
});

// Logout endpoint (optional - mainly for client-side token cleanup)
router.post('/logout', optionalAuth, (req: Request, res: Response) => {
  res.json({
    message: 'Logout successful',
  });
});

export default router;