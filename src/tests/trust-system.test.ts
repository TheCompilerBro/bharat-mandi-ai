import { describe, it, expect, beforeEach, vi, beforeAll, afterEach } from 'vitest';
import { VendorProfileService } from '../services/vendor-profile.service';
import { RatingFeedbackService } from '../services/rating-feedback.service';
import { RatingSubmission, VendorProfileData } from '../types';
import { DatabaseManager } from '../config/database';

// Mock the database manager
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
};

const mockDbManager = {
  getPostgreSQLPool: vi.fn(() => mockPool),
  getPostgresClient: vi.fn(() => mockPool), // Add alias for backward compatibility
};

vi.mock('../config/database', () => ({
  DatabaseManager: {
    getInstance: vi.fn(() => mockDbManager),
  },
}));

describe('Trust System Unit Tests', () => {
  let vendorProfileService: VendorProfileService;
  let ratingFeedbackService: RatingFeedbackService;

  beforeAll(() => {
    // Ensure the mock is applied before creating services
    (DatabaseManager.getInstance as any).mockReturnValue(mockDbManager);
    vendorProfileService = new VendorProfileService();
    ratingFeedbackService = new RatingFeedbackService();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful transaction behavior
    mockClient.query.mockImplementation((query: string) => {
      if (query.includes('BEGIN') || query.includes('COMMIT') || query.includes('ROLLBACK')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rating Calculation Algorithms', () => {
    it('should calculate trust score correctly with multiple rating components', async () => {
      // Mock rating statistics query
      mockClient.query.mockImplementation((query: string, params?: any[]) => {
        if (query.includes('AVG(rating)')) {
          return Promise.resolve({
            rows: [{
              total_ratings: 10,
              avg_rating: 4.2,
              avg_delivery: 4.0,
              avg_communication: 4.5,
              avg_quality: 4.1
            }]
          });
        }
        if (query.includes('COUNT(*) as total_trades')) {
          return Promise.resolve({
            rows: [{
              total_trades: 15,
              completed_trades: 12
            }]
          });
        }
        if (query.includes('verification_status')) {
          return Promise.resolve({
            rows: [{ verification_status: 'verified' }]
          });
        }
        if (query.includes('UPDATE vendors SET trust_score')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const trustScore = await vendorProfileService.calculateTrustScore('test-vendor-id');

      // Expected calculation:
      // Rating score: (4.2/5) * 4 = 3.36
      // Completion rate: (12/15) * 0.5 = 0.4
      // Verification bonus: 0.5
      // Total: 3.36 + 0.4 + 0.5 = 4.26
      expect(trustScore).toBeCloseTo(4.26, 2);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE vendors SET trust_score'),
        [trustScore, 'test-vendor-id']
      );
    });

    it('should handle zero ratings gracefully', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('AVG(rating)')) {
          return Promise.resolve({
            rows: [{
              total_ratings: 0,
              avg_rating: null,
              avg_delivery: null,
              avg_communication: null,
              avg_quality: null
            }]
          });
        }
        if (query.includes('COUNT(*) as total_trades')) {
          return Promise.resolve({
            rows: [{
              total_trades: 0,
              completed_trades: 0
            }]
          });
        }
        if (query.includes('verification_status')) {
          return Promise.resolve({
            rows: [{ verification_status: 'pending' }]
          });
        }
        if (query.includes('UPDATE vendors SET trust_score')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const trustScore = await vendorProfileService.calculateTrustScore('new-vendor-id');

      // With no ratings, no trades, and no verification: score should be 0
      expect(trustScore).toBe(0);
    });

    it('should cap trust score at maximum value of 5.0', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('AVG(rating)')) {
          return Promise.resolve({
            rows: [{
              total_ratings: 20,
              avg_rating: 5.0,
              avg_delivery: 5.0,
              avg_communication: 5.0,
              avg_quality: 5.0
            }]
          });
        }
        if (query.includes('COUNT(*) as total_trades')) {
          return Promise.resolve({
            rows: [{
              total_trades: 50,
              completed_trades: 50
            }]
          });
        }
        if (query.includes('verification_status')) {
          return Promise.resolve({
            rows: [{ verification_status: 'verified' }]
          });
        }
        if (query.includes('UPDATE vendors SET trust_score')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const trustScore = await vendorProfileService.calculateTrustScore('excellent-vendor-id');

      // Should be capped at 5.0 even if calculation exceeds it
      expect(trustScore).toBe(5.0);
    });
  });

  describe('Profile Flagging Thresholds', () => {
    it('should flag vendor when average rating drops below 3.0', async () => {
      // Mock recent ratings query
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('ORDER BY created_at DESC LIMIT 10')) {
          return Promise.resolve({
            rows: [
              { rating: 2.5, created_at: new Date() },
              { rating: 2.8, created_at: new Date() },
              { rating: 2.9, created_at: new Date() },
              { rating: 2.7, created_at: new Date() },
              { rating: 2.6, created_at: new Date() }
            ]
          });
        }
        if (query.includes('INSERT INTO vendor_flags')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const shouldFlag = await ratingFeedbackService.checkAndFlagLowRatedVendor('low-rated-vendor');

      expect(shouldFlag).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vendor_flags'),
        expect.arrayContaining(['low-rated-vendor', 'low_rating'])
      );
    });

    it('should not flag vendor with acceptable ratings', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('ORDER BY created_at DESC LIMIT 10')) {
          return Promise.resolve({
            rows: [
              { rating: 4.2, created_at: new Date() },
              { rating: 3.8, created_at: new Date() },
              { rating: 4.1, created_at: new Date() },
              { rating: 3.9, created_at: new Date() },
              { rating: 4.0, created_at: new Date() }
            ]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const shouldFlag = await ratingFeedbackService.checkAndFlagLowRatedVendor('good-vendor');

      expect(shouldFlag).toBe(false);
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vendor_flags'),
        expect.anything()
      );
    });

    it('should not flag vendor with insufficient ratings', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('ORDER BY created_at DESC LIMIT 10')) {
          return Promise.resolve({
            rows: [
              { rating: 2.0, created_at: new Date() },
              { rating: 2.5, created_at: new Date() }
            ]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const shouldFlag = await ratingFeedbackService.checkAndFlagLowRatedVendor('new-vendor');

      // Should not flag with less than 3 ratings
      expect(shouldFlag).toBe(false);
    });
  });

  describe('Verification Workflow Edge Cases', () => {
    it('should handle verification with missing documents gracefully', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM vendors WHERE email')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO vendors')) {
          return Promise.resolve({
            rows: [{
              id: 'test-vendor-id',
              name: 'Test Vendor',
              email: 'test@example.com',
              phone: '+911234567890',
              state: 'Test State',
              district: 'Test District',
              market: 'Test Market',
              preferred_language: 'hi',
              secondary_languages: [],
              business_type: 'trader',
              verification_status: 'pending',
              trust_score: 0,
              created_at: new Date(),
              last_active: new Date()
            }]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      const profileData: VendorProfileData = {
        name: 'Test Vendor',
        email: 'test@example.com',
        phone: '+911234567890',
        location: {
          state: 'Test State',
          district: 'Test District',
          market: 'Test Market'
        },
        preferredLanguage: 'hi',
        businessType: 'trader'
      };

      const profile = await vendorProfileService.createVendorProfile(profileData);

      expect(profile.verificationStatus).toBe('pending');
      expect(profile.trustScore).toBe(0);
    });

    it('should reject verification with invalid status', async () => {
      await expect(
        vendorProfileService.verifyVendor('vendor-id', 'admin-id', 'invalid' as any, 'notes')
      ).rejects.toThrow();
    });

    it('should handle verification status updates correctly', async () => {
      mockClient.query.mockImplementation((query: string, params?: any[]) => {
        if (query.includes('UPDATE vendors SET verification_status')) {
          return Promise.resolve({ rowCount: 1 });
        }
        if (query.includes('UPDATE verification_documents')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      const result = await vendorProfileService.verifyVendor(
        'vendor-id',
        'admin-id',
        'verified',
        'All documents verified'
      );

      expect(result.success).toBe(true);
      expect(result.verificationStatus).toBe('verified');
      expect(result.verifiedBy).toBe('admin-id');
    });
  });

  describe('Rating Submission Validation', () => {
    it('should validate rating values are within acceptable range', async () => {
      const invalidRating: RatingSubmission = {
        raterId: 'rater-id',
        ratedVendorId: 'vendor-id',
        sessionId: 'session-id',
        rating: 6, // Invalid: above 5
        deliveryRating: 0, // Invalid: below 1
        communicationRating: 3.5,
        qualityRating: 4.2
      };

      await expect(
        ratingFeedbackService.submitRating(invalidRating)
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should prevent duplicate ratings for same session', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM trust_ratings WHERE rater_id')) {
          return Promise.resolve({
            rows: [{ id: 'existing-rating-id' }]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const ratingData: RatingSubmission = {
        raterId: 'rater-id',
        ratedVendorId: 'vendor-id',
        sessionId: 'session-id',
        rating: 4.0
      };

      await expect(
        ratingFeedbackService.submitRating(ratingData)
      ).rejects.toThrow('Rating already submitted for this session');
    });

    it('should validate session participation before allowing rating', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM trust_ratings WHERE rater_id')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('LEFT JOIN session_participants')) {
          return Promise.resolve({ rows: [] }); // No valid session found
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const ratingData: RatingSubmission = {
        raterId: 'rater-id',
        ratedVendorId: 'vendor-id',
        sessionId: 'invalid-session-id',
        rating: 4.0
      };

      await expect(
        ratingFeedbackService.submitRating(ratingData)
      ).rejects.toThrow('Invalid session or vendors did not participate in this session');
    });
  });

  describe('Trust Score Updates', () => {
    it('should update trust score after rating submission', async () => {
      mockClient.query.mockImplementation((query: string, params?: any[]) => {
        if (query.includes('SELECT id FROM trust_ratings WHERE rater_id')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('LEFT JOIN session_participants')) {
          return Promise.resolve({
            rows: [{
              id: 'session-id',
              rater_exists: 'rater-id',
              rated_exists: 'vendor-id'
            }]
          });
        }
        if (query.includes('INSERT INTO trust_ratings')) {
          return Promise.resolve({
            rows: [{
              id: 'new-rating-id',
              rater_id: 'rater-id',
              rated_vendor_id: 'vendor-id',
              session_id: 'session-id',
              rating: 4.5,
              delivery_rating: null,
              communication_rating: null,
              quality_rating: null,
              feedback: null,
              created_at: new Date()
            }]
          });
        }
        // Mock trust score calculation queries
        if (query.includes('AVG(rating)')) {
          return Promise.resolve({
            rows: [{
              total_ratings: 1,
              avg_rating: 4.5,
              avg_delivery: null,
              avg_communication: null,
              avg_quality: null
            }]
          });
        }
        if (query.includes('COUNT(*) as total_trades')) {
          return Promise.resolve({
            rows: [{ total_trades: 1, completed_trades: 1 }]
          });
        }
        if (query.includes('verification_status')) {
          return Promise.resolve({
            rows: [{ verification_status: 'verified' }]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      const ratingData: RatingSubmission = {
        raterId: 'rater-id',
        ratedVendorId: 'vendor-id',
        sessionId: 'session-id',
        rating: 4.5
      };

      const rating = await ratingFeedbackService.submitRating(ratingData);

      expect(rating.rating).toBe(4.5);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE vendors SET trust_score'),
        expect.any(Array)
      );
    });

    it('should recalculate trust score after rating deletion', async () => {
      mockClient.query.mockImplementation((query: string, params?: any[]) => {
        if (query.includes('SELECT rated_vendor_id FROM trust_ratings WHERE id')) {
          return Promise.resolve({
            rows: [{ rated_vendor_id: 'vendor-id' }]
          });
        }
        if (query.includes('DELETE FROM trust_ratings')) {
          return Promise.resolve({ rowCount: 1 });
        }
        // Mock recalculation queries
        if (query.includes('AVG(rating)')) {
          return Promise.resolve({
            rows: [{
              total_ratings: 0,
              avg_rating: null,
              avg_delivery: null,
              avg_communication: null,
              avg_quality: null
            }]
          });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      const deleted = await ratingFeedbackService.deleteRating('rating-id', 'rater-id');

      expect(deleted).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE vendors SET trust_score'),
        expect.any(Array)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      mockPool.connect.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        vendorProfileService.calculateTrustScore('vendor-id')
      ).rejects.toThrow('Database connection failed');
    });

    it('should rollback transaction on rating submission failure', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO trust_ratings')) {
          throw new Error('Database constraint violation');
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const ratingData: RatingSubmission = {
        raterId: 'rater-id',
        ratedVendorId: 'vendor-id',
        sessionId: 'session-id',
        rating: 4.0
      };

      await expect(
        ratingFeedbackService.submitRating(ratingData)
      ).rejects.toThrow('Database constraint violation');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle missing vendor gracefully in trust score calculation', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('verification_status')) {
          return Promise.resolve({ rows: [] }); // Vendor not found
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      // Should not throw error, but handle gracefully
      const trustScore = await vendorProfileService.calculateTrustScore('non-existent-vendor');
      expect(trustScore).toBe(0);
    });
  });
});