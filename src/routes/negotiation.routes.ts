import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AIBasedNegotiationAssistant } from '../services/negotiation.service';
import {
  MarketContext,
  NegotiationOffer,
  NegotiationStep,
  LearningData,
  AuthPayload
} from '../types';

const router = Router();
const negotiationService = new AIBasedNegotiationAssistant();

// Extend Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

// POST /negotiation/suggest-opening-price
// Get AI-powered opening price suggestion
router.post('/suggest-opening-price', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commodity, quantity, context } = req.body;

    if (!commodity || !quantity || !context) {
      return res.status(400).json({
        error: 'Missing required fields: commodity, quantity, context'
      });
    }

    const marketContext: MarketContext = {
      commodity,
      quantity,
      location: context.location,
      quality: context.quality,
      deliveryTerms: context.deliveryTerms,
      urgency: context.urgency || 'medium',
      seasonality: context.seasonality || 'normal'
    };

    const suggestion = await negotiationService.suggestOpeningPrice(commodity, quantity, marketContext);

    res.json({
      success: true,
      data: suggestion,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Opening price suggestion error:', error);
    res.status(500).json({
      error: 'Failed to generate opening price suggestion',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /negotiation/analyze-offer
// Analyze a counter-offer and provide recommendations
router.post('/analyze-offer', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { offer, marketData } = req.body;

    if (!offer || !marketData) {
      return res.status(400).json({
        error: 'Missing required fields: offer, marketData'
      });
    }

    const negotiationOffer: NegotiationOffer = {
      offerId: offer.offerId,
      sessionId: offer.sessionId,
      fromVendorId: offer.fromVendorId,
      toVendorId: offer.toVendorId,
      commodity: offer.commodity,
      quantity: offer.quantity,
      proposedPrice: offer.proposedPrice,
      currentMarketPrice: offer.currentMarketPrice,
      offerType: offer.offerType,
      timestamp: new Date(offer.timestamp),
      expiresAt: offer.expiresAt ? new Date(offer.expiresAt) : undefined,
      terms: offer.terms
    };

    const analysis = await negotiationService.analyzeCounterOffer(negotiationOffer, marketData);

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Offer analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze offer',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /negotiation/recommend-response
// Get AI recommendation for responding to negotiation
router.post('/recommend-response', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { negotiationHistory } = req.body;

    if (!negotiationHistory || !Array.isArray(negotiationHistory)) {
      return res.status(400).json({
        error: 'Missing or invalid negotiationHistory array'
      });
    }

    const history: NegotiationStep[] = negotiationHistory.map((step: any) => ({
      stepId: step.stepId,
      sessionId: step.sessionId,
      vendorId: step.vendorId,
      action: step.action,
      offer: step.offer ? {
        ...step.offer,
        timestamp: new Date(step.offer.timestamp),
        expiresAt: step.offer.expiresAt ? new Date(step.offer.expiresAt) : undefined
      } : undefined,
      message: step.message,
      timestamp: new Date(step.timestamp),
      aiAssistanceUsed: step.aiAssistanceUsed
    }));

    const recommendation = await negotiationService.recommendResponse(history);

    res.json({
      success: true,
      data: recommendation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Response recommendation error:', error);
    res.status(500).json({
      error: 'Failed to generate response recommendation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /negotiation/evaluate-deal
// Evaluate a completed deal
router.post('/evaluate-deal', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { finalPrice, marketPrice } = req.body;

    if (typeof finalPrice !== 'number' || typeof marketPrice !== 'number') {
      return res.status(400).json({
        error: 'Missing or invalid finalPrice and marketPrice (must be numbers)'
      });
    }

    const evaluation = await negotiationService.evaluateDeal(finalPrice, marketPrice);

    res.json({
      success: true,
      data: evaluation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Deal evaluation error:', error);
    res.status(500).json({
      error: 'Failed to evaluate deal',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /negotiation/cultural-profile/:region
// Get cultural profile for a region
router.get('/cultural-profile/:region', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { region } = req.params;

    if (!region) {
      return res.status(400).json({
        error: 'Region parameter is required'
      });
    }

    const profile = await negotiationService.getCulturalProfile(region);

    res.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cultural profile error:', error);
    res.status(500).json({
      error: 'Failed to get cultural profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /negotiation/record-step
// Record a negotiation step for learning
router.post('/record-step', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { step } = req.body;

    if (!step) {
      return res.status(400).json({
        error: 'Missing step data'
      });
    }

    const negotiationStep: NegotiationStep = {
      stepId: step.stepId,
      sessionId: step.sessionId,
      vendorId: step.vendorId,
      action: step.action,
      offer: step.offer ? {
        ...step.offer,
        timestamp: new Date(step.offer.timestamp),
        expiresAt: step.offer.expiresAt ? new Date(step.offer.expiresAt) : undefined
      } : undefined,
      message: step.message,
      timestamp: new Date(step.timestamp),
      aiAssistanceUsed: step.aiAssistanceUsed
    };

    await negotiationService.recordNegotiationStep(negotiationStep);

    res.json({
      success: true,
      message: 'Negotiation step recorded successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Record step error:', error);
    res.status(500).json({
      error: 'Failed to record negotiation step',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /negotiation/learn
// Submit learning data from completed negotiation
router.post('/learn', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { learningData } = req.body;

    if (!learningData) {
      return res.status(400).json({
        error: 'Missing learning data'
      });
    }

    const data: LearningData = {
      sessionId: learningData.sessionId,
      outcome: learningData.outcome,
      marketConditions: learningData.marketConditions,
      negotiationMetrics: learningData.negotiationMetrics,
      participantFeedback: learningData.participantFeedback
    };

    await negotiationService.learnFromNegotiation(data);

    res.json({
      success: true,
      message: 'Learning data processed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Learning error:', error);
    res.status(500).json({
      error: 'Failed to process learning data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /negotiation/health
// Health check for negotiation service
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'Negotiation Assistant Service',
    timestamp: new Date().toISOString(),
    features: [
      'Opening price suggestions',
      'Offer analysis',
      'Response recommendations',
      'Deal evaluation',
      'Cultural adaptation',
      'Learning system'
    ]
  });
});

export default router;