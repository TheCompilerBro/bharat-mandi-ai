import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AuthPayload } from '../types';

const router = Router();

// Extend Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

// GET /api/v1/analytics/dashboard - Dashboard data endpoint
router.get('/dashboard', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;

    // Mock dashboard data for now
    const dashboardData = {
      totalTrades: 45,
      activeNegotiations: 8,
      averagePrice: 2150,
      priceAlerts: 3,
      recentActivity: [
        {
          id: '1',
          type: 'price_alert',
          message: 'Rice price increased by 5% in Pune market',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          commodity: 'Rice'
        },
        {
          id: '2',
          type: 'negotiation',
          message: 'New negotiation started for Wheat - 500kg',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
          commodity: 'Wheat'
        },
        {
          id: '3',
          type: 'trade_completed',
          message: 'Successfully completed trade for Cotton - 200kg',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          commodity: 'Cotton'
        },
        {
          id: '4',
          type: 'translation',
          message: 'Message translated from Hindi to Tamil',
          timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
        },
        {
          id: '5',
          type: 'price_update',
          message: 'Onion prices updated for Mumbai market',
          timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          commodity: 'Onion'
        }
      ],
      marketTrends: {
        rising: ['Rice', 'Wheat', 'Turmeric'],
        falling: ['Onion', 'Potato'],
        stable: ['Cotton', 'Maize', 'Sugarcane']
      },
      weeklyStats: {
        trades: [12, 15, 8, 22, 18, 25, 20],
        revenue: [45000, 52000, 38000, 67000, 58000, 72000, 63000]
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to load dashboard data',
      code: 'DASHBOARD_ERROR'
    });
  }
});

// Track user interaction
router.post('/interactions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, details, sessionId } = req.body;
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    // Mock response for now - would use real analytics service
    res.status(201).json({ message: 'Interaction tracked successfully' });
  } catch (error) {
    console.error('Error tracking interaction:', error);
    res.status(500).json({ error: 'Failed to track interaction' });
  }
});

// Get trading performance metrics
router.get('/performance/:period', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period } = req.params;
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;

    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be daily, weekly, or monthly' });
    }

    // Mock response for now - would use real analytics service
    const metrics = {
      period,
      vendorId,
      totalTrades: 45,
      averageTradeValue: 25000,
      successRate: 92.5,
      responseTime: 2.3
    };

    res.json(metrics);
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(500).json({ error: 'Failed to get performance metrics' });
  }
});

// Get market trend analysis
router.get('/trends/:commodity', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { commodity } = req.params;
    const { region } = req.query;

    // Mock response for now - would use real analytics service
    const trends = {
      commodity,
      region,
      trend: 'rising',
      priceChange: '+5.2%',
      confidence: 85,
      forecast: 'Prices expected to continue rising for next 2 weeks'
    };

    res.json(trends);
  } catch (error) {
    console.error('Error getting market trends:', error);
    res.status(500).json({ error: 'Failed to get market trends' });
  }
});

// Generate weekly trading summary
router.get('/weekly-summary', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;
    
    // Mock response for now - would use real reporting service
    const summary = {
      vendorId,
      week: 'Jan 20-26, 2026',
      totalTrades: 12,
      totalRevenue: 156000,
      topCommodity: 'Rice',
      averagePrice: 2100
    };
    
    res.json(summary);
  } catch (error) {
    console.error('Error generating weekly summary:', error);
    res.status(500).json({ error: 'Failed to generate weekly summary' });
  }
});

// Get historical reports
router.get('/reports', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Mock response for now - would use real reporting service
    const reports = [
      {
        id: '1',
        vendorId,
        type: 'weekly',
        generatedAt: new Date(),
        summary: 'Weekly trading report for Jan 13-19'
      }
    ];
    
    res.json(reports);
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Export trading data
router.post('/export', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;
    const { format = 'csv' } = req.body;

    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be csv or json' });
    }

    // Mock response for now - would use real reporting service
    const exportData = {
      vendorId,
      format,
      downloadUrl: `http://localhost:3000/exports/${vendorId}_${Date.now()}.${format}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Get export history
router.get('/exports', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;
    
    // Mock response for now - would use real reporting service
    const exports = [
      {
        id: '1',
        vendorId,
        format: 'csv',
        createdAt: new Date(),
        status: 'completed'
      }
    ];
    
    res.json(exports);
  } catch (error) {
    console.error('Error getting export history:', error);
    res.status(500).json({ error: 'Failed to get export history' });
  }
});

// Generate and deliver personalized insights
router.post('/insights/generate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;
    
    // Mock response for now - would use real analytics service
    const insights = {
      vendorId,
      insights: [
        'Rice prices are trending upward in your region',
        'Consider diversifying into wheat trading',
        'Your negotiation success rate is above average'
      ],
      generatedAt: new Date()
    };
    
    res.json(insights);
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Deliver insights to vendor
router.post('/insights/deliver', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;
    
    // Mock response for now - would use real reporting service
    res.json({ 
      message: 'Insights delivered successfully',
      vendorId,
      deliveredAt: new Date()
    });
  } catch (error) {
    console.error('Error delivering insights:', error);
    res.status(500).json({ error: 'Failed to deliver insights' });
  }
});

// Admin route: Schedule weekly reports for all vendors
router.post('/admin/schedule-weekly-reports', authenticateToken, async (req: Request, res: Response) => {
  try {
    // In a real implementation, this would check for admin privileges
    // Mock response for now - would use real reporting service
    res.json({ 
      message: 'Weekly reports scheduled successfully',
      scheduledAt: new Date()
    });
  } catch (error) {
    console.error('Error scheduling weekly reports:', error);
    res.status(500).json({ error: 'Failed to schedule weekly reports' });
  }
});

// Admin route: Cleanup expired data
router.post('/admin/cleanup', authenticateToken, async (req: Request, res: Response) => {
  try {
    // In a real implementation, this would check for admin privileges
    // Mock response for now - would use real reporting service
    res.json({ 
      message: 'Data cleanup completed successfully',
      cleanedAt: new Date()
    });
  } catch (error) {
    console.error('Error during data cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup data' });
  }
});

export default router;