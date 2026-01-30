import { Pool } from 'pg';
import { DatabaseManager } from '../config/database';

export interface VendorItem {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  description?: string;
  price: number;
  unit: string;
  quantity: number;
  quality: 'premium' | 'standard' | 'economy';
  location: string;
  images: string[];
  status: 'active' | 'inactive' | 'sold_out';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVendorItemData {
  name: string;
  category: string;
  description?: string;
  price: number;
  unit: string;
  quantity: number;
  quality: 'premium' | 'standard' | 'economy';
  location: string;
  images?: string[];
}

export interface UpdateVendorItemData {
  name?: string;
  category?: string;
  description?: string;
  price?: number;
  unit?: string;
  quantity?: number;
  quality?: 'premium' | 'standard' | 'economy';
  location?: string;
  images?: string[];
  status?: 'active' | 'inactive' | 'sold_out';
}

export interface VendorItemFilters {
  category?: string;
  quality?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class VendorItemsService {
  private pgPool: Pool;

  constructor() {
    this.pgPool = DatabaseManager.getInstance().getPostgreSQLPool();
  }

  async createItem(vendorId: string, itemData: CreateVendorItemData): Promise<VendorItem> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      console.log('Creating item for vendor ID:', vendorId);
      console.log('Item data:', itemData);

      // Check if vendor exists
      const vendorCheck = await client.query('SELECT id FROM vendors WHERE id = $1', [vendorId]);
      if (vendorCheck.rows.length === 0) {
        throw new Error(`Vendor with ID ${vendorId} not found`);
      }

      const result = await client.query(`
        INSERT INTO vendor_items (
          vendor_id, name, category, description, price, unit, quantity,
          quality, location, images, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW(), NOW()
        ) RETURNING 
          id, vendor_id, name, category, description, price, unit, quantity,
          quality, location, images, status, created_at, updated_at
      `, [
        vendorId,
        itemData.name,
        itemData.category,
        itemData.description || null,
        itemData.price,
        itemData.unit,
        itemData.quantity,
        itemData.quality,
        itemData.location,
        JSON.stringify(itemData.images || [])
      ]);

      console.log('Database result:', result.rows[0]);

      await client.query('COMMIT');
      return this.mapRowToItem(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getVendorItems(vendorId: string, filters?: VendorItemFilters): Promise<VendorItem[]> {
    const client = await this.pgPool.connect();
    
    try {
      const conditions = ['vendor_id = $1'];
      const values: any[] = [vendorId];
      let paramIndex = 2;

      if (filters?.category) {
        conditions.push(`category = $${paramIndex++}`);
        values.push(filters.category);
      }

      if (filters?.quality) {
        conditions.push(`quality = $${paramIndex++}`);
        values.push(filters.quality);
      }

      if (filters?.minPrice !== undefined) {
        conditions.push(`price >= $${paramIndex++}`);
        values.push(filters.minPrice);
      }

      if (filters?.maxPrice !== undefined) {
        conditions.push(`price <= $${paramIndex++}`);
        values.push(filters.maxPrice);
      }

      if (filters?.location) {
        conditions.push(`location ILIKE $${paramIndex++}`);
        values.push(`%${filters.location}%`);
      }

      if (filters?.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }

      const whereClause = conditions.join(' AND ');
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      const query = `
        SELECT 
          id, vendor_id, name, category, description, price, unit, quantity,
          quality, location, images, status, created_at, updated_at
        FROM vendor_items 
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);

      const result = await client.query(query, values);
      return result.rows.map(row => this.mapRowToItem(row));
    } finally {
      client.release();
    }
  }

  async getItemById(itemId: string, vendorId?: string): Promise<VendorItem | null> {
    const client = await this.pgPool.connect();
    
    try {
      const conditions = ['id = $1'];
      const values = [itemId];

      if (vendorId) {
        conditions.push('vendor_id = $2');
        values.push(vendorId);
      }

      const whereClause = conditions.join(' AND ');

      const result = await client.query(`
        SELECT 
          id, vendor_id, name, category, description, price, unit, quantity,
          quality, location, images, status, created_at, updated_at
        FROM vendor_items 
        WHERE ${whereClause}
      `, values);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToItem(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async updateItem(itemId: string, vendorId: string, updateData: UpdateVendorItemData): Promise<VendorItem> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Build dynamic update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateData.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateData.name);
      }

      if (updateData.category !== undefined) {
        updateFields.push(`category = $${paramIndex++}`);
        values.push(updateData.category);
      }

      if (updateData.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updateData.description);
      }

      if (updateData.price !== undefined) {
        updateFields.push(`price = $${paramIndex++}`);
        values.push(updateData.price);
      }

      if (updateData.unit !== undefined) {
        updateFields.push(`unit = $${paramIndex++}`);
        values.push(updateData.unit);
      }

      if (updateData.quantity !== undefined) {
        updateFields.push(`quantity = $${paramIndex++}`);
        values.push(updateData.quantity);
      }

      if (updateData.quality !== undefined) {
        updateFields.push(`quality = $${paramIndex++}`);
        values.push(updateData.quality);
      }

      if (updateData.location !== undefined) {
        updateFields.push(`location = $${paramIndex++}`);
        values.push(updateData.location);
      }

      if (updateData.images !== undefined) {
        updateFields.push(`images = $${paramIndex++}`);
        values.push(JSON.stringify(updateData.images));
      }

      if (updateData.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(updateData.status);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(itemId, vendorId);

      const query = `
        UPDATE vendor_items 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND vendor_id = $${paramIndex++}
        RETURNING 
          id, vendor_id, name, category, description, price, unit, quantity,
          quality, location, images, status, created_at, updated_at
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Item not found or access denied');
      }

      await client.query('COMMIT');
      return this.mapRowToItem(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteItem(itemId: string, vendorId: string): Promise<boolean> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM vendor_items WHERE id = $1 AND vendor_id = $2',
        [itemId, vendorId]
      );

      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateItemStatus(itemId: string, vendorId: string, status: 'active' | 'inactive' | 'sold_out'): Promise<VendorItem> {
    return this.updateItem(itemId, vendorId, { status });
  }

  async searchItems(filters: VendorItemFilters & { searchTerm?: string }): Promise<VendorItem[]> {
    const client = await this.pgPool.connect();
    
    try {
      const conditions: string[] = ["status = 'active'"]; // Only show active items in search
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.searchTerm) {
        conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`);
        values.push(`%${filters.searchTerm}%`);
        paramIndex++;
      }

      if (filters.category) {
        conditions.push(`category = $${paramIndex++}`);
        values.push(filters.category);
      }

      if (filters.quality) {
        conditions.push(`quality = $${paramIndex++}`);
        values.push(filters.quality);
      }

      if (filters.minPrice !== undefined) {
        conditions.push(`price >= $${paramIndex++}`);
        values.push(filters.minPrice);
      }

      if (filters.maxPrice !== undefined) {
        conditions.push(`price <= $${paramIndex++}`);
        values.push(filters.maxPrice);
      }

      if (filters.location) {
        conditions.push(`location ILIKE $${paramIndex++}`);
        values.push(`%${filters.location}%`);
      }

      const whereClause = conditions.join(' AND ');
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const query = `
        SELECT 
          vi.id, vi.vendor_id, vi.name, vi.category, vi.description, vi.price, 
          vi.unit, vi.quantity, vi.quality, vi.location, vi.images, vi.status, 
          vi.created_at, vi.updated_at,
          v.name as vendor_name, v.trust_score, v.verification_status
        FROM vendor_items vi
        JOIN vendors v ON vi.vendor_id = v.id
        WHERE ${whereClause}
        ORDER BY v.trust_score DESC, vi.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);

      const result = await client.query(query, values);
      return result.rows.map(row => ({
        ...this.mapRowToItem(row),
        vendorName: row.vendor_name,
        vendorTrustScore: parseFloat(row.trust_score) || 0,
        vendorVerificationStatus: row.verification_status
      }));
    } finally {
      client.release();
    }
  }

  async getItemsByCategory(category: string, limit: number = 20): Promise<VendorItem[]> {
    const client = await this.pgPool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          vi.id, vi.vendor_id, vi.name, vi.category, vi.description, vi.price, 
          vi.unit, vi.quantity, vi.quality, vi.location, vi.images, vi.status, 
          vi.created_at, vi.updated_at,
          v.name as vendor_name, v.trust_score
        FROM vendor_items vi
        JOIN vendors v ON vi.vendor_id = v.id
        WHERE vi.category = $1 AND vi.status = 'active' AND vi.quantity > 0
        ORDER BY v.trust_score DESC, vi.price ASC
        LIMIT $2
      `, [category, limit]);

      return result.rows.map(row => ({
        ...this.mapRowToItem(row),
        vendorName: row.vendor_name,
        vendorTrustScore: parseFloat(row.trust_score) || 0
      }));
    } finally {
      client.release();
    }
  }

  async getVendorItemStats(vendorId: string): Promise<{
    totalItems: number;
    activeItems: number;
    totalValue: number;
    categoriesCount: number;
    topCategories: Array<{ category: string; count: number }>;
  }> {
    const client = await this.pgPool.connect();
    
    try {
      // Get basic stats
      const statsResult = await client.query(`
        SELECT 
          COUNT(*) as total_items,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_items,
          SUM(CASE WHEN status = 'active' THEN price * quantity ELSE 0 END) as total_value,
          COUNT(DISTINCT category) as categories_count
        FROM vendor_items 
        WHERE vendor_id = $1
      `, [vendorId]);

      // Get top categories
      const categoriesResult = await client.query(`
        SELECT category, COUNT(*) as count
        FROM vendor_items 
        WHERE vendor_id = $1 AND status = 'active'
        GROUP BY category
        ORDER BY count DESC
        LIMIT 5
      `, [vendorId]);

      const stats = statsResult.rows[0];
      
      return {
        totalItems: parseInt(stats.total_items) || 0,
        activeItems: parseInt(stats.active_items) || 0,
        totalValue: parseFloat(stats.total_value) || 0,
        categoriesCount: parseInt(stats.categories_count) || 0,
        topCategories: categoriesResult.rows.map(row => ({
          category: row.category,
          count: parseInt(row.count)
        }))
      };
    } finally {
      client.release();
    }
  }

  private mapRowToItem(row: any): VendorItem {
    return {
      id: row.id,
      vendorId: row.vendor_id,
      name: row.name,
      category: row.category,
      description: row.description,
      price: parseFloat(row.price),
      unit: row.unit,
      quantity: parseInt(row.quantity),
      quality: row.quality,
      location: row.location,
      images: this.parseImages(row.images),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private parseImages(imagesData: any): string[] {
    try {
      if (!imagesData) return [];
      if (typeof imagesData === 'string') {
        return JSON.parse(imagesData);
      }
      if (Array.isArray(imagesData)) {
        return imagesData;
      }
      return [];
    } catch (error) {
      console.error('Error parsing images data:', error, 'Data:', imagesData);
      return [];
    }
  }
}