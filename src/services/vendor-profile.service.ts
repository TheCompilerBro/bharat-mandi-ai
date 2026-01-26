import { Pool } from 'pg';
import { DatabaseManager } from '../config/database';
import { Vendor } from '../types';

export interface VendorProfileData {
  name: string;
  email: string;
  phone: string;
  location: {
    state: string;
    district: string;
    market: string;
    coordinates?: { lat: number; lng: number };
  };
  preferredLanguage: string;
  secondaryLanguages?: string[];
  businessType: 'farmer' | 'trader' | 'wholesaler' | 'retailer';
}

export interface VendorProfileUpdate {
  name?: string;
  phone?: string;
  location?: {
    state?: string;
    district?: string;
    market?: string;
    coordinates?: { lat: number; lng: number };
  };
  preferredLanguage?: string;
  secondaryLanguages?: string[];
  businessType?: 'farmer' | 'trader' | 'wholesaler' | 'retailer';
}

export interface VerificationDocument {
  documentType: string;
  documentNumber: string;
  documentUrl: string;
}

export interface VerificationResult {
  success: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  message: string;
  verifiedBy?: string;
}

export interface TradingSummary {
  totalTrades: number;
  successfulTrades: number;
  averageRating: number;
  totalVolume: number;
  preferredCommodities: string[];
  lastTradeDate?: Date;
}

export class VendorProfileService {
  private pgPool: Pool;

  constructor() {
    this.pgPool = DatabaseManager.getInstance().getPostgreSQLPool();
  }

  async createVendorProfile(profileData: VendorProfileData): Promise<Vendor> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if vendor already exists
      const existingVendor = await client.query(
        'SELECT id FROM vendors WHERE email = $1 OR phone = $2',
        [profileData.email, profileData.phone]
      );

      if (existingVendor.rows.length > 0) {
        throw new Error('Vendor with this email or phone already exists');
      }

      // Insert new vendor profile
      const result = await client.query(`
        INSERT INTO vendors (
          name, email, phone, 
          state, district, market, latitude, longitude,
          preferred_language, secondary_languages, business_type,
          verification_status, trust_score,
          created_at, last_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', 0, NOW(), NOW()
        ) RETURNING 
          id, name, email, phone, state, district, market, latitude, longitude,
          preferred_language, secondary_languages, business_type, verification_status,
          trust_score, created_at, last_active
      `, [
        profileData.name,
        profileData.email,
        profileData.phone,
        profileData.location.state,
        profileData.location.district,
        profileData.location.market,
        profileData.location.coordinates?.lat || null,
        profileData.location.coordinates?.lng || null,
        profileData.preferredLanguage,
        profileData.secondaryLanguages || [],
        profileData.businessType,
      ]);

      await client.query('COMMIT');

      const vendorRow = result.rows[0];
      return this.mapRowToVendor(vendorRow);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getVendorProfile(vendorId: string): Promise<Vendor | null> {
    const client = await this.pgPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id, name, email, phone, state, district, market, latitude, longitude,
          preferred_language, secondary_languages, business_type, verification_status,
          trust_score, created_at, last_active
        FROM vendors 
        WHERE id = $1
      `, [vendorId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToVendor(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async updateVendorProfile(vendorId: string, updateData: VendorProfileUpdate): Promise<Vendor> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Build dynamic update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateData.name) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateData.name);
      }

      if (updateData.phone) {
        updateFields.push(`phone = $${paramIndex++}`);
        values.push(updateData.phone);
      }

      if (updateData.location) {
        if (updateData.location.state) {
          updateFields.push(`state = $${paramIndex++}`);
          values.push(updateData.location.state);
        }
        if (updateData.location.district) {
          updateFields.push(`district = $${paramIndex++}`);
          values.push(updateData.location.district);
        }
        if (updateData.location.market) {
          updateFields.push(`market = $${paramIndex++}`);
          values.push(updateData.location.market);
        }
        if (updateData.location.coordinates) {
          updateFields.push(`latitude = $${paramIndex++}`, `longitude = $${paramIndex++}`);
          values.push(updateData.location.coordinates.lat, updateData.location.coordinates.lng);
        }
      }

      if (updateData.preferredLanguage) {
        updateFields.push(`preferred_language = $${paramIndex++}`);
        values.push(updateData.preferredLanguage);
      }

      if (updateData.secondaryLanguages) {
        updateFields.push(`secondary_languages = $${paramIndex++}`);
        values.push(updateData.secondaryLanguages);
      }

      if (updateData.businessType) {
        updateFields.push(`business_type = $${paramIndex++}`);
        values.push(updateData.businessType);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(vendorId);

      const query = `
        UPDATE vendors 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING 
          id, name, email, phone, state, district, market, latitude, longitude,
          preferred_language, secondary_languages, business_type, verification_status,
          trust_score, created_at, last_active
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Vendor not found');
      }

      await client.query('COMMIT');
      return this.mapRowToVendor(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteVendorProfile(vendorId: string): Promise<boolean> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete related data first (due to foreign key constraints)
      await client.query('DELETE FROM verification_documents WHERE vendor_id = $1', [vendorId]);
      await client.query('DELETE FROM refresh_tokens WHERE vendor_id = $1', [vendorId]);
      await client.query('DELETE FROM trust_ratings WHERE rater_id = $1 OR rated_vendor_id = $1', [vendorId]);
      await client.query('DELETE FROM session_participants WHERE vendor_id = $1', [vendorId]);
      
      // Delete vendor profile
      const result = await client.query('DELETE FROM vendors WHERE id = $1', [vendorId]);

      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async submitVerificationDocuments(vendorId: string, documents: VerificationDocument[]): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert verification documents
      for (const doc of documents) {
        await client.query(`
          INSERT INTO verification_documents (
            vendor_id, document_type, document_number, document_url,
            verification_status, uploaded_at
          ) VALUES ($1, $2, $3, $4, 'pending', NOW())
        `, [vendorId, doc.documentType, doc.documentNumber, doc.documentUrl]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyVendor(vendorId: string, verifiedBy: string, status: 'verified' | 'rejected', notes?: string): Promise<VerificationResult> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Update vendor verification status
      await client.query(`
        UPDATE vendors 
        SET verification_status = $1, updated_at = NOW()
        WHERE id = $2
      `, [status, vendorId]);

      // Update verification documents
      await client.query(`
        UPDATE verification_documents 
        SET verification_status = $1, verified_by = $2, verification_notes = $3, verified_at = NOW()
        WHERE vendor_id = $4 AND verification_status = 'pending'
      `, [status, verifiedBy, notes, vendorId]);

      await client.query('COMMIT');

      return {
        success: true,
        verificationStatus: status,
        message: status === 'verified' ? 'Vendor successfully verified' : 'Vendor verification rejected',
        verifiedBy
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async calculateTrustScore(vendorId: string): Promise<number> {
    const client = await this.pgPool.connect();
    
    try {
      // Get rating statistics
      const ratingResult = await client.query(`
        SELECT 
          COUNT(*) as total_ratings,
          AVG(rating) as avg_rating,
          AVG(delivery_rating) as avg_delivery,
          AVG(communication_rating) as avg_communication,
          AVG(quality_rating) as avg_quality
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
      `, [vendorId]);

      // Get trade statistics
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

      const ratings = ratingResult.rows[0];
      const trades = tradeResult.rows[0];
      const verification = verificationResult.rows[0];

      // Calculate trust score based on multiple factors
      let trustScore = 0;

      // Base score from ratings (0-4 points)
      if (ratings.total_ratings > 0) {
        const avgRating = parseFloat(ratings.avg_rating) || 0;
        trustScore += (avgRating / 5) * 4; // Convert 5-point scale to 4 points
      }

      // Verification bonus (0-0.5 points)
      if (verification.verification_status === 'verified') {
        trustScore += 0.5;
      }

      // Trade completion rate bonus (0-0.5 points)
      if (trades.total_trades > 0) {
        const completionRate = trades.completed_trades / trades.total_trades;
        trustScore += completionRate * 0.5;
      }

      // Cap at 5.0
      trustScore = Math.min(trustScore, 5.0);

      // Update trust score in database
      await client.query(`
        UPDATE vendors 
        SET trust_score = $1, updated_at = NOW()
        WHERE id = $2
      `, [trustScore, vendorId]);

      return trustScore;
    } finally {
      client.release();
    }
  }

  async getTradingSummary(vendorId: string): Promise<TradingSummary> {
    const client = await this.pgPool.connect();
    
    try {
      // Get trade statistics
      const tradeResult = await client.query(`
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_trades,
          MAX(end_time) as last_trade_date
        FROM trade_sessions 
        WHERE buyer_id = $1 OR seller_id = $1
      `, [vendorId]);

      // Get rating statistics
      const ratingResult = await client.query(`
        SELECT AVG(rating) as avg_rating
        FROM trust_ratings 
        WHERE rated_vendor_id = $1
      `, [vendorId]);

      // Get commodity preferences (most traded commodities)
      const commodityResult = await client.query(`
        SELECT commodity, COUNT(*) as trade_count
        FROM trade_sessions 
        WHERE (buyer_id = $1 OR seller_id = $1) AND status = 'completed'
        GROUP BY commodity
        ORDER BY trade_count DESC
        LIMIT 5
      `, [vendorId]);

      const trades = tradeResult.rows[0];
      const ratings = ratingResult.rows[0];
      const commodities = commodityResult.rows;

      return {
        totalTrades: parseInt(trades.total_trades) || 0,
        successfulTrades: parseInt(trades.successful_trades) || 0,
        averageRating: parseFloat(ratings.avg_rating) || 0,
        totalVolume: 0, // Would need to calculate from actual trade data
        preferredCommodities: commodities.map(c => c.commodity),
        lastTradeDate: trades.last_trade_date || undefined
      };
    } finally {
      client.release();
    }
  }

  async searchVendors(filters: {
    location?: { state?: string; district?: string; market?: string };
    businessType?: string;
    verificationStatus?: string;
    minTrustScore?: number;
    limit?: number;
    offset?: number;
  }): Promise<Vendor[]> {
    const client = await this.pgPool.connect();
    
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.location?.state) {
        conditions.push(`state = $${paramIndex++}`);
        values.push(filters.location.state);
      }

      if (filters.location?.district) {
        conditions.push(`district = $${paramIndex++}`);
        values.push(filters.location.district);
      }

      if (filters.location?.market) {
        conditions.push(`market = $${paramIndex++}`);
        values.push(filters.location.market);
      }

      if (filters.businessType) {
        conditions.push(`business_type = $${paramIndex++}`);
        values.push(filters.businessType);
      }

      if (filters.verificationStatus) {
        conditions.push(`verification_status = $${paramIndex++}`);
        values.push(filters.verificationStatus);
      }

      if (filters.minTrustScore !== undefined) {
        conditions.push(`trust_score >= $${paramIndex++}`);
        values.push(filters.minTrustScore);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const query = `
        SELECT 
          id, name, email, phone, state, district, market, latitude, longitude,
          preferred_language, secondary_languages, business_type, verification_status,
          trust_score, created_at, last_active
        FROM vendors 
        ${whereClause}
        ORDER BY trust_score DESC, created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);

      const result = await client.query(query, values);
      return result.rows.map(row => this.mapRowToVendor(row));
    } finally {
      client.release();
    }
  }

  private mapRowToVendor(row: any): Vendor {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      location: {
        state: row.state,
        district: row.district,
        market: row.market,
        coordinates: row.latitude && row.longitude ? {
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude)
        } : undefined
      },
      preferredLanguage: row.preferred_language,
      secondaryLanguages: row.secondary_languages || [],
      businessType: row.business_type,
      verificationStatus: row.verification_status,
      trustScore: parseFloat(row.trust_score) || 0,
      createdAt: row.created_at,
      lastActive: row.last_active,
    };
  }
}