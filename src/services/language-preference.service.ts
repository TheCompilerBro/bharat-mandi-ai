import { Pool } from 'pg';
import { DatabaseManager } from '../config/database';
import { LanguagePreference } from '../types';

export interface LanguagePreferenceData {
  vendorId: string;
  preferredLanguage: string;
  secondaryLanguages?: string[];
}

export interface LanguagePreferenceUpdate {
  preferredLanguage?: string;
  secondaryLanguages?: string[];
}

export class LanguagePreferenceService {
  private pgPool: Pool;

  constructor() {
    const dbManager = DatabaseManager.getInstance();
    this.pgPool = dbManager.getPostgreSQLPool();
  }

  /**
   * Create or update language preferences for a vendor
   * Requirement 1.4: User language preference storage
   */
  async setLanguagePreference(data: LanguagePreferenceData): Promise<LanguagePreference> {
    const client = await this.pgPool.connect();
    
    try {
      const { vendorId, preferredLanguage, secondaryLanguages = [] } = data;

      // Validate language codes
      await this.validateLanguageCodes([preferredLanguage, ...secondaryLanguages]);

      const query = `
        INSERT INTO language_preferences (vendor_id, preferred_language, secondary_languages)
        VALUES ($1, $2, $3)
        ON CONFLICT (vendor_id) 
        DO UPDATE SET 
          preferred_language = EXCLUDED.preferred_language,
          secondary_languages = EXCLUDED.secondary_languages,
          updated_at = CURRENT_TIMESTAMP
        RETURNING vendor_id, preferred_language, secondary_languages, updated_at
      `;

      const result = await client.query(query, [vendorId, preferredLanguage, secondaryLanguages]);
      const row = result.rows[0];

      return {
        vendorId: row.vendor_id,
        preferredLanguage: row.preferred_language,
        secondaryLanguages: row.secondary_languages || [],
        updatedAt: row.updated_at
      };

    } catch (error) {
      console.error('Error setting language preference:', error);
      throw new Error('Failed to set language preference');
    } finally {
      client.release();
    }
  }

  /**
   * Get language preferences for a vendor
   * Requirement 1.4: Preference retrieval
   */
  async getLanguagePreference(vendorId: string): Promise<LanguagePreference | null> {
    const client = await this.pgPool.connect();
    
    try {
      const query = `
        SELECT vendor_id, preferred_language, secondary_languages, updated_at
        FROM language_preferences
        WHERE vendor_id = $1
      `;

      const result = await client.query(query, [vendorId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        vendorId: row.vendor_id,
        preferredLanguage: row.preferred_language,
        secondaryLanguages: row.secondary_languages || [],
        updatedAt: row.updated_at
      };

    } catch (error) {
      console.error('Error getting language preference:', error);
      throw new Error('Failed to get language preference');
    } finally {
      client.release();
    }
  }

  /**
   * Update specific language preference fields
   * Requirement 1.4: Preference update
   */
  async updateLanguagePreference(
    vendorId: string, 
    updates: LanguagePreferenceUpdate
  ): Promise<LanguagePreference | null> {
    const client = await this.pgPool.connect();
    
    try {
      // First check if preference exists
      const existing = await this.getLanguagePreference(vendorId);
      if (!existing) {
        throw new Error('Language preference not found for vendor');
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updates.preferredLanguage) {
        await this.validateLanguageCodes([updates.preferredLanguage]);
        updateFields.push(`preferred_language = $${paramIndex++}`);
        updateValues.push(updates.preferredLanguage);
      }

      if (updates.secondaryLanguages) {
        await this.validateLanguageCodes(updates.secondaryLanguages);
        updateFields.push(`secondary_languages = $${paramIndex++}`);
        updateValues.push(updates.secondaryLanguages);
      }

      if (updateFields.length === 0) {
        return existing; // No updates to make
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(vendorId);

      const query = `
        UPDATE language_preferences 
        SET ${updateFields.join(', ')}
        WHERE vendor_id = $${paramIndex}
        RETURNING vendor_id, preferred_language, secondary_languages, updated_at
      `;

      const result = await client.query(query, updateValues);
      const row = result.rows[0];

      return {
        vendorId: row.vendor_id,
        preferredLanguage: row.preferred_language,
        secondaryLanguages: row.secondary_languages || [],
        updatedAt: row.updated_at
      };

    } catch (error) {
      console.error('Error updating language preference:', error);
      throw new Error('Failed to update language preference');
    } finally {
      client.release();
    }
  }

  /**
   * Delete language preferences for a vendor
   */
  async deleteLanguagePreference(vendorId: string): Promise<boolean> {
    const client = await this.pgPool.connect();
    
    try {
      const query = `
        DELETE FROM language_preferences
        WHERE vendor_id = $1
      `;

      const result = await client.query(query, [vendorId]);
      return result.rowCount !== null && result.rowCount > 0;

    } catch (error) {
      console.error('Error deleting language preference:', error);
      throw new Error('Failed to delete language preference');
    } finally {
      client.release();
    }
  }

  /**
   * Get all vendors with a specific preferred language
   */
  async getVendorsByPreferredLanguage(languageCode: string): Promise<string[]> {
    const client = await this.pgPool.connect();
    
    try {
      await this.validateLanguageCodes([languageCode]);

      const query = `
        SELECT vendor_id
        FROM language_preferences
        WHERE preferred_language = $1
        ORDER BY updated_at DESC
      `;

      const result = await client.query(query, [languageCode]);
      return result.rows.map(row => row.vendor_id);

    } catch (error) {
      console.error('Error getting vendors by preferred language:', error);
      throw new Error('Failed to get vendors by preferred language');
    } finally {
      client.release();
    }
  }

  /**
   * Get language preference statistics
   */
  async getLanguagePreferenceStats(): Promise<Record<string, number>> {
    const client = await this.pgPool.connect();
    
    try {
      const query = `
        SELECT preferred_language, COUNT(*) as count
        FROM language_preferences
        GROUP BY preferred_language
        ORDER BY count DESC
      `;

      const result = await client.query(query);
      const stats: Record<string, number> = {};
      
      result.rows.forEach(row => {
        stats[row.preferred_language] = parseInt(row.count, 10);
      });

      return stats;

    } catch (error) {
      console.error('Error getting language preference stats:', error);
      throw new Error('Failed to get language preference statistics');
    } finally {
      client.release();
    }
  }

  /**
   * Validate language codes against supported languages
   */
  private async validateLanguageCodes(languageCodes: string[]): Promise<void> {
    const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'];
    
    const invalidCodes = languageCodes.filter(code => !supportedLanguages.includes(code));
    
    if (invalidCodes.length > 0) {
      throw new Error(`Unsupported language codes: ${invalidCodes.join(', ')}`);
    }
  }

  /**
   * Initialize language preference for a new vendor with default settings
   */
  async initializeDefaultPreference(vendorId: string, defaultLanguage: string = 'en'): Promise<LanguagePreference> {
    return this.setLanguagePreference({
      vendorId,
      preferredLanguage: defaultLanguage,
      secondaryLanguages: []
    });
  }
}