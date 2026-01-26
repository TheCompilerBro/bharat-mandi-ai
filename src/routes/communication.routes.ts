import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { WebSocketCommunicationService } from '../services/communication.service';

const router = Router();

// Note: WebSocketCommunicationService instance will be injected via middleware
// For now, we'll create a placeholder that can be replaced with dependency injection

// GET /api/v1/communication/conversations - Get user conversations
router.get('/conversations', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = (req as any).vendor?.vendorId || (req as any).user?.vendorId;

    // Mock conversations data
    const conversations = [
      {
        id: 'conv-1',
        participants: [
          { id: 'vendor-1', name: 'Rajesh Kumar', language: 'hi' },
          { id: vendorId, name: 'Demo Vendor', language: 'en' }
        ],
        lastMessage: {
          content: 'What is your best price for 500kg rice?',
          timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          senderId: 'vendor-1'
        },
        commodity: 'Rice',
        status: 'active'
      },
      {
        id: 'conv-2',
        participants: [
          { id: 'vendor-2', name: 'Priya Sharma', language: 'ta' },
          { id: vendorId, name: 'Demo Vendor', language: 'en' }
        ],
        lastMessage: {
          content: 'Cotton quality looks good. Can we negotiate?',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          senderId: 'vendor-2'
        },
        commodity: 'Cotton',
        status: 'negotiating'
      },
      {
        id: 'conv-3',
        participants: [
          { id: 'vendor-3', name: 'Mohammed Ali', language: 'ur' },
          { id: vendorId, name: 'Demo Vendor', language: 'en' }
        ],
        lastMessage: {
          content: 'Thank you for the wheat. Transaction completed.',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          senderId: 'vendor-3'
        },
        commodity: 'Wheat',
        status: 'completed'
      }
    ];

    res.json({
      success: true,
      data: conversations
    });

  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({
      error: 'Failed to load conversations',
      code: 'CONVERSATIONS_ERROR'
    });
  }
});

/**
 * Create a new trade session
 * POST /api/v1/communication/sessions
 */
router.post('/sessions',
  authenticateToken,
  [
    body('participants').isArray().withMessage('Participants must be an array'),
    body('participants.*').isString().withMessage('Each participant must be a string'),
    body('commodity').isString().notEmpty().withMessage('Commodity is required'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { participants, commodity, metadata } = req.body;
      
      // Add current user to participants if not already included
      const vendorId = (req as any).vendor.vendorId;
      const allParticipants = participants.includes(vendorId) 
        ? participants 
        : [...participants, vendorId];

      // This would be injected in a real implementation
      // const session = await communicationService.createTradeSession(allParticipants, commodity, metadata);

      // Placeholder response
      const session = {
        id: 'session_' + Date.now(),
        participants: allParticipants,
        commodity,
        status: 'active',
        startTime: new Date(),
        metadata
      };

      res.status(201).json({
        success: true,
        data: session
      });

    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({
        error: 'Failed to create trade session',
        code: 'SESSION_CREATION_FAILED'
      });
    }
  }
);

/**
 * Get session history
 * GET /api/v1/communication/sessions/:sessionId/messages
 */
router.get('/sessions/:sessionId/messages',
  authenticateToken,
  [
    param('sessionId').isString().notEmpty().withMessage('Session ID is required')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const { sessionId } = req.params;
      
      // This would be injected in a real implementation
      // const messages = await communicationService.getSessionHistory(sessionId);

      // Placeholder response
      const messages = [
        {
          id: 'msg_1',
          senderId: 'vendor_1',
          content: 'Hello, I have rice for sale',
          originalLanguage: 'en',
          timestamp: new Date(),
          messageType: 'text',
          sessionId,
          translations: {
            'hi': 'नमस्ते, मेरे पास बेचने के लिए चावल है'
          }
        }
      ];

      res.json({
        success: true,
        data: messages
      });

    } catch (error) {
      console.error('Get session history error:', error);
      res.status(500).json({
        error: 'Failed to retrieve session history',
        code: 'SESSION_HISTORY_FAILED'
      });
    }
  }
);

/**
 * Get active connections (admin endpoint)
 * GET /api/v1/communication/connections
 */
router.get('/connections',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      // This would be injected in a real implementation
      // const connections = await communicationService.getActiveConnections();

      // Placeholder response
      const connections = [
        {
          id: 'conn_1',
          vendorId: 'vendor_1',
          socketId: 'socket_123',
          connectedAt: new Date(),
          lastActivity: new Date(),
          activeSessions: ['session_1']
        }
      ];

      res.json({
        success: true,
        data: connections
      });

    } catch (error) {
      console.error('Get connections error:', error);
      res.status(500).json({
        error: 'Failed to retrieve connections',
        code: 'CONNECTIONS_RETRIEVAL_FAILED'
      });
    }
  }
);

/**
 * Health check for communication service
 * GET /api/v1/communication/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'communication',
    status: 'healthy',
    timestamp: new Date(),
    features: {
      websocket: true,
      realTimeMessaging: true,
      translation: true,
      sessionManagement: true
    }
  });
});

export default router;