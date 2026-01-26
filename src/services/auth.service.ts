import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { DatabaseManager } from '../config/database';
import { config } from '../config/environment';
import { generateTokens, verifyRefreshToken } from '../middleware/auth';
import { LoginRequest, RegisterRequest, Vendor } from '../types';

export class AuthService {
  private pgPool: Pool;

  constructor() {
    this.pgPool = DatabaseManager.getInstance().getPostgreSQLPool();
  }

  async register(registerData: RegisterRequest): Promise<{ vendor: Omit<Vendor, 'password'>; tokens: { accessToken: string; refreshToken: string } }> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if vendor already exists
      const existingVendor = await client.query(
        'SELECT id FROM vendors WHERE email = $1 OR phone = $2',
        [registerData.email, registerData.phone]
      );

      if (existingVendor.rows.length > 0) {
        throw new Error('Vendor with this email or phone already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(registerData.password, config.security.bcryptRounds);

      // Insert new vendor
      const result = await client.query(`
        INSERT INTO vendors (
          name, email, password_hash, phone, 
          state, district, market, 
          preferred_language, business_type,
          verification_status, trust_score,
          created_at, last_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 0, NOW(), NOW()
        ) RETURNING 
          id, name, email, phone, state, district, market,
          preferred_language, business_type, verification_status,
          trust_score, created_at, last_active
      `, [
        registerData.name,
        registerData.email,
        hashedPassword,
        registerData.phone,
        registerData.location.state,
        registerData.location.district,
        registerData.location.market,
        registerData.preferredLanguage,
        registerData.businessType,
      ]);

      await client.query('COMMIT');

      const vendorRow = result.rows[0];
      const vendor: Omit<Vendor, 'password'> = {
        id: vendorRow.id,
        name: vendorRow.name,
        email: vendorRow.email,
        phone: vendorRow.phone,
        location: {
          state: vendorRow.state,
          district: vendorRow.district,
          market: vendorRow.market,
        },
        preferredLanguage: vendorRow.preferred_language,
        secondaryLanguages: [], // Will be populated later
        businessType: vendorRow.business_type,
        verificationStatus: vendorRow.verification_status,
        trustScore: vendorRow.trust_score,
        createdAt: vendorRow.created_at,
        lastActive: vendorRow.last_active,
      };

      const tokens = generateTokens(vendor.id, vendor.email);

      return { vendor, tokens };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(loginData: LoginRequest): Promise<{ vendor: Omit<Vendor, 'password'>; tokens: { accessToken: string; refreshToken: string } }> {
    const client = await this.pgPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id, name, email, password_hash, phone, 
          state, district, market, preferred_language, 
          business_type, verification_status, trust_score,
          created_at, last_active
        FROM vendors 
        WHERE email = $1
      `, [loginData.email]);

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const vendorRow = result.rows[0];
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(loginData.password, vendorRow.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Update last active
      await client.query(
        'UPDATE vendors SET last_active = NOW() WHERE id = $1',
        [vendorRow.id]
      );

      const vendor: Omit<Vendor, 'password'> = {
        id: vendorRow.id,
        name: vendorRow.name,
        email: vendorRow.email,
        phone: vendorRow.phone,
        location: {
          state: vendorRow.state,
          district: vendorRow.district,
          market: vendorRow.market,
        },
        preferredLanguage: vendorRow.preferred_language,
        secondaryLanguages: [], // Will be populated later
        businessType: vendorRow.business_type,
        verificationStatus: vendorRow.verification_status,
        trustScore: vendorRow.trust_score,
        createdAt: vendorRow.created_at,
        lastActive: new Date(),
      };

      const tokens = generateTokens(vendor.id, vendor.email);

      return { vendor, tokens };
    } finally {
      client.release();
    }
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      
      // Verify vendor still exists and is active
      const client = await this.pgPool.connect();
      try {
        const result = await client.query(
          'SELECT id, email FROM vendors WHERE id = $1',
          [decoded.vendorId]
        );

        if (result.rows.length === 0) {
          throw new Error('Vendor not found');
        }

        const vendor = result.rows[0];
        return generateTokens(vendor.id, vendor.email);
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async getVendorById(vendorId: string): Promise<Omit<Vendor, 'password'> | null> {
    const client = await this.pgPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id, name, email, phone, state, district, market,
          preferred_language, business_type, verification_status,
          trust_score, created_at, last_active
        FROM vendors 
        WHERE id = $1
      `, [vendorId]);

      if (result.rows.length === 0) {
        return null;
      }

      const vendorRow = result.rows[0];
      return {
        id: vendorRow.id,
        name: vendorRow.name,
        email: vendorRow.email,
        phone: vendorRow.phone,
        location: {
          state: vendorRow.state,
          district: vendorRow.district,
          market: vendorRow.market,
        },
        preferredLanguage: vendorRow.preferred_language,
        secondaryLanguages: [], // Will be populated later
        businessType: vendorRow.business_type,
        verificationStatus: vendorRow.verification_status,
        trustScore: vendorRow.trust_score,
        createdAt: vendorRow.created_at,
        lastActive: vendorRow.last_active,
      };
    } finally {
      client.release();
    }
  }
}