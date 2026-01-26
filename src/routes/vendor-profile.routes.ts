import { Router, Request, Response } from 'express';
import { VendorProfileService } from '../services/vendor-profile.service';
import { authenticateToken } from '../middleware/auth';
import { VendorProfileData, VendorProfileUpdate, VerificationDocument, VendorSearchFilters } from '../types';

const router = Router();
const vendorProfileService = new VendorProfileService();

// Get vendor profile
router.get('/profile/:vendorId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    // Check if user is accessing their own profile or has admin privileges
    if (req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const profile = await vendorProfileService.getVendorProfile(vendorId);
    
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    res.json({ profile });
  } catch (error) {
    console.error('Error fetching vendor profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update vendor profile
router.put('/profile/:vendorId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const updateData: VendorProfileUpdate = req.body;
    
    // Check if user is updating their own profile
    if (req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedProfile = await vendorProfileService.updateVendorProfile(vendorId, updateData);
    
    res.json({ 
      message: 'Profile updated successfully',
      profile: updatedProfile 
    });
  } catch (error) {
    console.error('Error updating vendor profile:', error);
    if (error instanceof Error && error.message === 'Vendor not found') {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete vendor profile
router.delete('/profile/:vendorId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    // Check if user is deleting their own profile
    if (req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deleted = await vendorProfileService.deleteVendorProfile(vendorId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting vendor profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit verification documents
router.post('/profile/:vendorId/verification', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const documents: VerificationDocument[] = req.body.documents;
    
    // Check if user is submitting documents for their own profile
    if (req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'Documents are required' });
    }

    await vendorProfileService.submitVerificationDocuments(vendorId, documents);
    
    res.json({ message: 'Verification documents submitted successfully' });
  } catch (error) {
    console.error('Error submitting verification documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify vendor (admin only)
router.post('/profile/:vendorId/verify', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const { status, notes } = req.body;
    
    // TODO: Add admin role check here
    // For now, any authenticated user can verify (should be restricted to admins)
    
    if (!status || !['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Valid status (verified/rejected) is required' });
    }

    const result = await vendorProfileService.verifyVendor(
      vendorId, 
      req.user!.vendorId, 
      status, 
      notes
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error verifying vendor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trust score
router.get('/profile/:vendorId/trust-score', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    const trustScore = await vendorProfileService.calculateTrustScore(vendorId);
    
    res.json({ trustScore });
  } catch (error) {
    console.error('Error calculating trust score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trading summary
router.get('/profile/:vendorId/trading-summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    // Check if user is accessing their own summary or has appropriate permissions
    if (req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const summary = await vendorProfileService.getTradingSummary(vendorId);
    
    res.json({ summary });
  } catch (error) {
    console.error('Error fetching trading summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search vendors
router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const filters: VendorSearchFilters = {
      location: {
        state: req.query.state as string,
        district: req.query.district as string,
        market: req.query.market as string,
      },
      businessType: req.query.businessType as string,
      verificationStatus: req.query.verificationStatus as string,
      minTrustScore: req.query.minTrustScore ? parseFloat(req.query.minTrustScore as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof VendorSearchFilters] === undefined) {
        delete filters[key as keyof VendorSearchFilters];
      }
    });

    if (filters.location) {
      Object.keys(filters.location).forEach(key => {
        if (filters.location![key as keyof typeof filters.location] === undefined) {
          delete filters.location![key as keyof typeof filters.location];
        }
      });
      if (Object.keys(filters.location).length === 0) {
        delete filters.location;
      }
    }

    const vendors = await vendorProfileService.searchVendors(filters);
    
    res.json({ vendors });
  } catch (error) {
    console.error('Error searching vendors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;