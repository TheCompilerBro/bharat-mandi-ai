import { Pool } from 'pg';
import { DatabaseManager } from '../config/database';
import { TrustRating } from '../types';

export interface RatingSubmission {
  raterId: string;
  ratedVendorId: string;
  sessionId: string;
  rating: number;
  deliveryRating?: number;
  communicationRating?: number;
  qualityRating?: number;
  feedback?: string;
}

export interface RatingStats {
  averageRating: number;
  totalRatings: number;
  ratingDistribution: { [key: number]: number };
  averageDeliveryRating: number;
  averageCommunicationRating: number;
  averageQualityRating: number;
  recentRatings: TrustRating[];
}

export interface VendorReliabilityScore {
  vendorId: string;
  overallScore: number;
  ratingScore: number;
  completionRate: number;
  responseTime: number;
  verificationBonus: number;
  lastUpdated: Date;
}

export class RatingFeedbackService {
  private pgPool: Pool;

  constructor() {
    this.pgPool = DatabaseManager.getInstance().getPostgreSQLPool();
  }

  async submitRating(ratingData: RatingSubmission): Promise<TrustRating> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Validate rating values
      this.validateRating(ratingData.rating);
      if (ratingData.deliveryRating) this.validateRating(ratingData.deliveryRating);
      if (ratingData.communicationRating) this.validateRating(ratingData.communicationRating);
      if (ratingData.qualityRating) this.validateRating(ratingData.qualityRating);

      // Check if rating already exists for this session
      const existingRating = await client.query(
        'SELECT id FROM trust_ratings WHERE rater_id = $1 AND rated_vendor_id = $2 AND session_id = $3',
        [ratingData.raterId, ratingData.ratedVendorId, ratingData.sessionId]
      );

      if (existingRating.rows.length > 0) {
        throw new Error('Rating already submitted for this session');
      }

      // Verify the session exists and both vendors participated
      const sessionCheck = await client.query(`
        SELECT ts.id, sp1.vendor_id as rater_exists, sp2.vendor_id as rated_exists
        FROM trade_sessions ts
        LEFT JOIN session_participants sp1 ON ts.id = sp1.session_id AND sp1.vendor_id = $1
        LEFT JOIN session_participants sp2 ON ts.id = sp2.session_id AND sp2.vendor_id = $2
        WHERE ts.id = $3 AND ts.status = 'completed'
      `, [ratingData.raterId, ratingData.ratedVendorId, ratingData.sessionId]);

      if (sessionCheck.rows.length === 0 || !sessionCheck.rows[0].rater_exists || !sessionCheck.rows[0].rated_exists) {
        throw new Error('Invalid session or vendors did not participate in this session');
      }

      // Insert the rating
      const result = await client.query(`
        INSERT INTO trust_ratings (
          rater_id, rated_vendor_id, session_id, rating,
          delivery_rating, communication_rating, quality_rating, feedback,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING 
          id, rater_id, rated_vendor_id, session_id, rating,
          delivery_rating, communication_rating, quality_rating, feedback, created_at
      `, [
        ratingData.raterId,
        ratingData.ratedVendorId,
        ratingData.sessionId,
        ratingData.rating,
        ratingData.deliveryRating || null,
        ratingData.communicationRating || null,
        ratingData.qualityRating || null,
        ratingData.feedback || null
      ]);

      // Update vendor's trust score
      await this.updateVendorReliabilityScore(ratingData.ratedVendorId);

      // Check if vendor should be flagged for low ratings
      await this.checkAndFlagLowRatedVendor(ratingData.ratedVendorId);

      await client.query('COMMIT');

      const ratingRow = result.rows[0];
      return this.mapRowToTrustRating(ratingRow);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRatingStats(vendorId: string): Promise<RatingStats> {
    const client = await this.pgPool.connect();
    
    try {
      // Get overall rating statistics
      const statsResult = await client.query(`
        SELECT 
          AVG(rating) as avg_rating,
          COUNT(*) as total_ratings,
          AVG(delivery_rating) as avg_delivery,
          AVG(communication_rating) as avg_communication,
          AVG(quality_rating) as avg_quality
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
      `, [vendorId]);

      // Get rating distribution
      const distributionResult = await client.query(`
        SELECT 
          FLOOR(rating) as rating_value,
          COUNT(*) as count
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
        GROUP BY FLOOR(rating)
        ORDER BY rating_value
      `, [vendorId]);

      // Get recent ratings (last 10)
      const recentResult = await client.query(`
        SELECT 
          id, rater_id, rated_vendor_id, session_id, rating,
          delivery_rating, communication_rating, quality_rating, feedback, created_at
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [vendorId]);

      const stats = statsResult.rows[0];
      const distribution: { [key: number]: number } = {};
      
      distributionResult.rows.forEach(row => {
        distribution[row.rating_value] = parseInt(row.count);
      });

      return {
        averageRating: parseFloat(stats.avg_rating) || 0,
        totalRatings: parseInt(stats.total_ratings) || 0,
        ratingDistribution: distribution,
        averageDeliveryRating: parseFloat(stats.avg_delivery) || 0,
        averageCommunicationRating: parseFloat(stats.avg_communication) || 0,
        averageQualityRating: parseFloat(stats.avg_quality) || 0,
        recentRatings: recentResult.rows.map(row => this.mapRowToTrustRating(row))
      };
    } finally {
      client.release();
    }
  }

  async updateVendorReliabilityScore(vendorId: string): Promise<VendorReliabilityScore> {
    const client = await this.pgPool.connect();
    
    try {
      // Get rating statistics
      const ratingStats = await this.getRatingStats(vendorId);

      // Get trade completion rate
      const tradeResult = await client.query(`
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_trades
        FROM trade_sessions 
        WHERE buyer_id = $1 OR seller_id = $1
      `, [vendorId]);

      // Get verification status
      const verificationResult = await client.query(`
        SELECT verification_status FROM vendors WHERE id = $1
      `, [vendorId]);

      const trades = tradeResult.rows[0];
      const verification = verificationResult.rows[0];

      // Calculate component scores
      const ratingScore = (ratingStats.averageRating / 5) * 4; // 0-4 points from ratings
      const completionRate = trades.total_trades > 0 ? 
        (trades.completed_trades / trades.total_trades) : 0;
      const verificationBonus = verification?.verification_status === 'verified' ? 0.5 : 0;

      // Calculate overall reliability score (0-5 scale)
      const overallScore = Math.min(ratingScore + (completionRate * 0.5) + verificationBonus, 5.0);

      // Update vendor's trust score in database
      await client.query(`
        UPDATE vendors 
        SET trust_score = $1, updated_at = NOW()
        WHERE id = $2
      `, [overallScore, vendorId]);

      return {
        vendorId,
        overallScore,
        ratingScore,
        completionRate,
        responseTime: 0, // Would need to calculate from actual response data
        verificationBonus,
        lastUpdated: new Date()
      };
    } finally {
      client.release();
    }
  }

  async checkAndFlagLowRatedVendor(vendorId: string): Promise<boolean> {
    const client = await this.pgPool.connect();
    
    try {
      // Get recent ratings (last 10 or all if less than 10)
      const recentRatings = await client.query(`
        SELECT rating, created_at
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [vendorId]);

      if (recentRatings.rows.length < 3) {
        // Need at least 3 ratings to flag
        return false;
      }

      // Calculate average of recent ratings
      const totalRating = recentRatings.rows.reduce((sum, row) => sum + parseFloat(row.rating), 0);
      const averageRating = totalRating / recentRatings.rows.length;

      // Flag if average rating is below 3.0 (Requirement 4.5)
      if (averageRating < 3.0) {
        // Add a flag or notification (in a real system, this might trigger admin review)
        await client.query(`
          INSERT INTO vendor_flags (vendor_id, flag_type, flag_reason, created_at)
          VALUES ($1, 'low_rating', $2, NOW())
          ON CONFLICT (vendor_id, flag_type) 
          DO UPDATE SET flag_reason = $2, created_at = NOW()
        `, [vendorId, `Average rating ${averageRating.toFixed(2)} below threshold`]);

        return true;
      }

      return false;
    } catch (error) {
      // If vendor_flags table doesn't exist, just log the flag
      console.warn(`Vendor ${vendorId} should be flagged for low ratings but flags table not available`);
      return false;
    } finally {
      client.release();
    }
  }

  async getVendorRatings(vendorId: string, limit: number = 20, offset: number = 0): Promise<TrustRating[]> {
    const client = await this.pgPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id, rater_id, rated_vendor_id, session_id, rating,
          delivery_rating, communication_rating, quality_rating, feedback, created_at
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [vendorId, limit, offset]);

      return result.rows.map(row => this.mapRowToTrustRating(row));
    } finally {
      client.release();
    }
  }

  async deleteRating(ratingId: string, raterId: string): Promise<boolean> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Verify the rating belongs to the rater
      const ratingCheck = await client.query(
        'SELECT rated_vendor_id FROM trust_ratings WHERE id = $1 AND rater_id = $2',
        [ratingId, raterId]
      );

      if (ratingCheck.rows.length === 0) {
        throw new Error('Rating not found or unauthorized');
      }

      const ratedVendorId = ratingCheck.rows[0].rated_vendor_id;

      // Delete the rating
      const result = await client.query(
        'DELETE FROM trust_ratings WHERE id = $1 AND rater_id = $2',
        [ratingId, raterId]
      );

      if (result.rowCount > 0) {
        // Recalculate vendor's trust score
        await this.updateVendorReliabilityScore(ratedVendorId);
      }

      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRating(ratingId: string, raterId: string, updateData: Partial<RatingSubmission>): Promise<TrustRating> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Verify the rating belongs to the rater
      const ratingCheck = await client.query(
        'SELECT rated_vendor_id FROM trust_ratings WHERE id = $1 AND rater_id = $2',
        [ratingId, raterId]
      );

      if (ratingCheck.rows.length === 0) {
        throw new Error('Rating not found or unauthorized');
      }

      const ratedVendorId = ratingCheck.rows[0].rated_vendor_id;

      // Build update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateData.rating !== undefined) {
        this.validateRating(updateData.rating);
        updateFields.push(`rating = $${paramIndex++}`);
        values.push(updateData.rating);
      }

      if (updateData.deliveryRating !== undefined) {
        this.validateRating(updateData.deliveryRating);
        updateFields.push(`delivery_rating = $${paramIndex++}`);
        values.push(updateData.deliveryRating);
      }

      if (updateData.communicationRating !== undefined) {
        this.validateRating(updateData.communicationRating);
        updateFields.push(`communication_rating = $${paramIndex++}`);
        values.push(updateData.communicationRating);
      }

      if (updateData.qualityRating !== undefined) {
        this.validateRating(updateData.qualityRating);
        updateFields.push(`quality_rating = $${paramIndex++}`);
        values.push(updateData.qualityRating);
      }

      if (updateData.feedback !== undefined) {
        updateFields.push(`feedback = $${paramIndex++}`);
        values.push(updateData.feedback);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(ratingId, raterId);

      const query = `
        UPDATE trust_ratings 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND rater_id = $${paramIndex++}
        RETURNING 
          id, rater_id, rated_vendor_id, session_id, rating,
          delivery_rating, communication_rating, quality_rating, feedback, created_at
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Rating not found');
      }

      // Recalculate vendor's trust score
      await this.updateVendorReliabilityScore(ratedVendorId);

      await client.query('COMMIT');
      return this.mapRowToTrustRating(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateRating(rating: number): void {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
  }

  private mapRowToTrustRating(row: any): TrustRating {
    return {
      id: row.id,
      raterId: row.rater_id,
      ratedVendorId: row.rated_vendor_id,
      sessionId: row.session_id,
      rating: parseFloat(row.rating),
      deliveryRating: row.delivery_rating ? parseFloat(row.delivery_rating) : undefined,
      communicationRating: row.communication_rating ? parseFloat(row.communication_rating) : undefined,
      qualityRating: row.quality_rating ? parseFloat(row.quality_rating) : undefined,
      feedback: row.feedback || undefined,
      createdAt: row.created_at
    };
  }
}