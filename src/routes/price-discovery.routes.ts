import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { AGMARKNETPriceDiscoveryService } from '../services/price-discovery.service';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const priceDiscoveryService = new AGMARKNETPriceDiscoveryService();

// Validation middleware
const getCurrentPriceValidation = [
  query('commodity').notEmpty().withMessage('Commodity is required').isLength({ max: 100 }),
  query('location').optional().isLength({ max: 100 }).withMessage('Location too long'),
];

const getPriceHistoryValidation = [
  query('commodity').notEmpty().withMessage('Commodity is required').isLength({ max: 100 }),
  query('days').isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
];

const subscribeAlertsValidation = [
  body('commodities').isArray({ min: 1 }).withMessage('At least one commodity is required'),
  body('commodities.*').isLength({ min: 1, max: 100 }).withMessage('Invalid commodity name'),
];

// GET /api/v1/price-discovery/search - Frontend compatibility endpoint
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query as { q?: string };
    
    // Mock price data for common commodities
    const mockPriceData = [
      {
        id: '1',
        commodity: 'Rice',
        currentPrice: 2000,
        priceRange: { min: 1800, max: 2200, modal: 2000 },
        volatility: 5.2,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '2',
        commodity: 'Wheat',
        currentPrice: 2500,
        priceRange: { min: 2300, max: 2700, modal: 2500 },
        volatility: 3.8,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '3',
        commodity: 'Cotton',
        currentPrice: 5500,
        priceRange: { min: 5200, max: 5800, modal: 5500 },
        volatility: 8.1,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '4',
        commodity: 'Onion',
        currentPrice: 1200,
        priceRange: { min: 1000, max: 1400, modal: 1200 },
        volatility: 12.5,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '5',
        commodity: 'Potato',
        currentPrice: 800,
        priceRange: { min: 700, max: 900, modal: 800 },
        volatility: 6.3,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '6',
        commodity: 'Tomato',
        currentPrice: 1500,
        priceRange: { min: 1200, max: 1800, modal: 1500 },
        volatility: 15.2,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '7',
        commodity: 'Sugarcane',
        currentPrice: 350,
        priceRange: { min: 320, max: 380, modal: 350 },
        volatility: 4.1,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '8',
        commodity: 'Maize',
        currentPrice: 1800,
        priceRange: { min: 1650, max: 1950, modal: 1800 },
        volatility: 7.8,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      },
      {
        id: '9',
        commodity: 'Turmeric',
        currentPrice: 8500,
        priceRange: { min: 8000, max: 9000, modal: 8500 },
        volatility: 9.2,
        lastUpdated: new Date(),
        sources: ['AGMARKNET']
      }
    ];

    let results = mockPriceData;
    
    if (q && typeof q === 'string') {
      results = mockPriceData.filter(item => 
        item.commodity.toLowerCase().includes(q.toLowerCase())
      );
    }
    
    res.json({
      success: true,
      data: results,
      total: results.length
    });

  } catch (error) {
    console.error('Price search error:', error);
    res.status(500).json({
      error: 'Failed to search prices',
      code: 'SEARCH_ERROR'
    });
  }
});

// GET /api/v1/price-discovery/current-price
router.get('/current-price', authenticateToken, getCurrentPriceValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const { commodity, location } = req.query as { commodity: string; location?: string };

    const priceData = await priceDiscoveryService.getCurrentPrice(commodity, location);

    res.json({
      success: true,
      data: priceData
    });

  } catch (error) {
    console.error('Current price error:', error);
    res.status(500).json({
      error: 'Failed to retrieve current price',
      code: 'PRICE_DISCOVERY_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/price-discovery/price-history
router.get('/price-history', authenticateToken, getPriceHistoryValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const { commodity, days } = req.query as { commodity: string; days: string };

    const history = await priceDiscoveryService.getPriceHistory(commodity, parseInt(days));

    res.json({
      success: true,
      data: {
        commodity,
        days: parseInt(days),
        history
      }
    });

  } catch (error) {
    console.error('Price history error:', error);
    res.status(500).json({
      error: 'Failed to retrieve price history',
      code: 'PRICE_HISTORY_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/price-discovery/trends
router.get('/trends', authenticateToken, [
  query('commodity').notEmpty().withMessage('Commodity is required').isLength({ max: 100 }),
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const { commodity } = req.query as { commodity: string };

    const trends = await priceDiscoveryService.getPriceTrends(commodity);

    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('Price trends error:', error);
    res.status(500).json({
      error: 'Failed to retrieve price trends',
      code: 'PRICE_TRENDS_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/v1/price-discovery/subscribe-alerts
router.post('/subscribe-alerts', authenticateToken, subscribeAlertsValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const { commodities } = req.body;
    const vendorId = (req as any).vendor.vendorId; // From auth middleware

    await priceDiscoveryService.subscribeToAlerts(vendorId, commodities);

    res.json({
      success: true,
      message: 'Successfully subscribed to price alerts',
      data: {
        vendorId,
        commodities
      }
    });

  } catch (error) {
    console.error('Subscribe alerts error:', error);
    res.status(500).json({
      error: 'Failed to subscribe to alerts',
      code: 'ALERT_SUBSCRIPTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/price-discovery/supported-commodities
router.get('/supported-commodities', async (req: Request, res: Response) => {
  try {
    const supportedCommodities = [
      'Rice', 'Wheat', 'Jowar', 'Bajra', 'Maize', 'Ragi', 'Arhar', 'Moong', 'Urad',
      'Masoor', 'Gram', 'Groundnut', 'Sesamum', 'Nigerseed', 'Safflower', 'Sunflower',
      'Soyabean', 'Castor seed', 'Cotton', 'Jute', 'Mesta', 'Sugarcane', 'Potato',
      'Onion', 'Turmeric', 'Coriander', 'Garlic', 'Ginger', 'Chillies'
    ];

    res.json({
      success: true,
      data: {
        commodities: supportedCommodities,
        count: supportedCommodities.length
      }
    });

  } catch (error) {
    console.error('Supported commodities error:', error);
    res.status(500).json({
      error: 'Failed to retrieve supported commodities',
      code: 'COMMODITIES_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/price-discovery/price-ranges
router.get('/price-ranges', authenticateToken, [
  query('commodity').notEmpty().withMessage('Commodity is required').isLength({ max: 100 }),
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const { commodity, days } = req.query as { commodity: string; days?: string };

    const priceRanges = await priceDiscoveryService.calculatePriceRanges(
      commodity, 
      days ? parseInt(days) : 30
    );

    res.json({
      success: true,
      data: {
        commodity,
        analysis_period_days: days ? parseInt(days) : 30,
        ...priceRanges
      }
    });

  } catch (error) {
    console.error('Price ranges error:', error);
    res.status(500).json({
      error: 'Failed to calculate price ranges',
      code: 'PRICE_RANGES_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;