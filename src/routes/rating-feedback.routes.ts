import { Router, Request, Response } from 'express';
import { RatingFeedbackService } from '../services/rating-feedback.service';
import { authenticateToken } from '../middleware/auth';
import { RatingSubmission } from '../types';

const router = Router();
const ratingFeedbackService = new RatingFeedbackService();

// Submit a rating for a vendor
router.post('/ratings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const ratingData: RatingSubmission = {
      ...req.body,
      raterId: req.user!.vendorId
    };

    // Validate required fields
    if (!ratingData.ratedVendorId || !ratingData.sessionId || !ratingData.rating) {
      return res.status(400).json({ 
        error: 'ratedVendorId, sessionId, and rating are required' 
      });
    }

    // Validate rating range
    if (ratingData.rating < 1 || ratingData.rating > 5) {
      return res.status(400).json({ 
        error: 'Rating must be between 1 and 5' 
      });
    }

    // Validate optional ratings
    const optionalRatings = ['deliveryRating', 'communicationRating', 'qualityRating'];
    for (const field of optionalRatings) {
      const value = ratingData[field as keyof RatingSubmission] as number;
      if (value !== undefined && (value < 1 || value > 5)) {
        return res.status(400).json({ 
          error: `${field} must be between 1 and 5` 
        });
      }
    }

    const rating = await ratingFeedbackService.submitRating(ratingData);
    
    res.status(201).json({ 
      message: 'Rating submitted successfully',
      rating 
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    if (error instanceof Error) {
      if (error.message.includes('already submitted') || 
          error.message.includes('Invalid session')) {
        return res.status(400).json({ error: error.message });
      }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rating statistics for a vendor
router.get('/vendors/:vendorId/ratings/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    const stats = await ratingFeedbackService.getRatingStats(vendorId);
    
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching rating stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ratings for a vendor (paginated)
router.get('/vendors/:vendorId/ratings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    if (limit > 100) {
      return res.status(400).json({ error: 'Limit cannot exceed 100' });
    }

    const ratings = await ratingFeedbackService.getVendorRatings(vendorId, limit, offset);
    
    res.json({ ratings });
  } catch (error) {
    console.error('Error fetching vendor ratings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update vendor reliability score (can be called by system or admin)
router.post('/vendors/:vendorId/reliability-score', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    // In a real system, this might be restricted to admins or system processes
    const reliabilityScore = await ratingFeedbackService.updateVendorReliabilityScore(vendorId);
    
    res.json({ 
      message: 'Reliability score updated successfully',
      reliabilityScore 
    });
  } catch (error) {
    console.error('Error updating reliability score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a rating (only by the original rater)
router.put('/ratings/:ratingId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;
    const raterId = req.user!.vendorId;
    const updateData = req.body;

    // Validate rating values if provided
    const ratingFields = ['rating', 'deliveryRating', 'communicationRating', 'qualityRating'];
    for (const field of ratingFields) {
      const value = updateData[field];
      if (value !== undefined && (value < 1 || value > 5)) {
        return res.status(400).json({ 
          error: `${field} must be between 1 and 5` 
        });
      }
    }

    const updatedRating = await ratingFeedbackService.updateRating(ratingId, raterId, updateData);
    
    res.json({ 
      message: 'Rating updated successfully',
      rating: updatedRating 
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    if (error instanceof Error) {
      if (error.message.includes('not found') || 
          error.message.includes('unauthorized')) {
        return res.status(404).json({ error: error.message });
      }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a rating (only by the original rater)
router.delete('/ratings/:ratingId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;
    const raterId = req.user!.vendorId;

    const deleted = await ratingFeedbackService.deleteRating(ratingId, raterId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Rating not found or unauthorized' });
    }

    res.json({ message: 'Rating deleted successfully' });
  } catch (error) {
    console.error('Error deleting rating:', error);
    if (error instanceof Error) {
      if (error.message.includes('not found') || 
          error.message.includes('unauthorized')) {
        return res.status(404).json({ error: error.message });
      }
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if vendor should be flagged for low ratings (admin endpoint)
router.post('/vendors/:vendorId/check-flag', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    // TODO: Add admin role check here
    const shouldFlag = await ratingFeedbackService.checkAndFlagLowRatedVendor(vendorId);
    
    res.json({ 
      vendorId,
      shouldFlag,
      message: shouldFlag ? 'Vendor flagged for low ratings' : 'Vendor ratings are acceptable'
    });
  } catch (error) {
    console.error('Error checking vendor flag status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;