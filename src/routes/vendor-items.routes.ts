import { Router, Request, Response } from 'express';
import { VendorItemsService, CreateVendorItemData, UpdateVendorItemData } from '../services/vendor-items.service';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const vendorItemsService = new VendorItemsService();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all items for the authenticated vendor
router.get('/', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    const { category, quality, minPrice, maxPrice, location, status, limit, offset } = req.query;

    const filters = {
      category: category as string,
      quality: quality as string,
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      location: location as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined
    };

    const items = await vendorItemsService.getVendorItems(vendorId, filters);
    
    res.json({
      success: true,
      items,
      count: items.length
    });
  } catch (error) {
    console.error('Error fetching vendor items:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch items' 
    });
  }
});

// Get a specific item by ID
router.get('/:itemId', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    const { itemId } = req.params;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    const item = await vendorItemsService.getItemById(itemId, vendorId);
    
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        error: 'Item not found' 
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch item' 
    });
  }
});

// Create a new item
router.post('/', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    const itemData: CreateVendorItemData = {
      name: req.body.name,
      category: req.body.category,
      description: req.body.description,
      price: parseFloat(req.body.price),
      unit: req.body.unit,
      quantity: parseInt(req.body.quantity),
      quality: req.body.quality,
      location: req.body.location,
      images: req.body.images || []
    };

    // Validate required fields
    if (!itemData.name || !itemData.category || !itemData.price || !itemData.unit || 
        itemData.quantity === undefined || !itemData.quality || !itemData.location) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Validate price and quantity
    if (itemData.price <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Price must be greater than 0' 
      });
    }

    if (itemData.quantity < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quantity cannot be negative' 
      });
    }

    // Validate quality
    if (!['premium', 'standard', 'economy'].includes(itemData.quality)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid quality value' 
      });
    }

    const item = await vendorItemsService.createItem(vendorId, itemData);
    
    res.status(201).json({
      success: true,
      item,
      message: 'Item created successfully'
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create item' 
    });
  }
});

// Update an existing item
router.put('/:itemId', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    const { itemId } = req.params;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    const updateData: UpdateVendorItemData = {};

    // Only update fields that are provided
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.price !== undefined) {
      const price = parseFloat(req.body.price);
      if (price <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Price must be greater than 0' 
        });
      }
      updateData.price = price;
    }
    if (req.body.unit !== undefined) updateData.unit = req.body.unit;
    if (req.body.quantity !== undefined) {
      const quantity = parseInt(req.body.quantity);
      if (quantity < 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Quantity cannot be negative' 
        });
      }
      updateData.quantity = quantity;
    }
    if (req.body.quality !== undefined) {
      if (!['premium', 'standard', 'economy'].includes(req.body.quality)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid quality value' 
        });
      }
      updateData.quality = req.body.quality;
    }
    if (req.body.location !== undefined) updateData.location = req.body.location;
    if (req.body.images !== undefined) updateData.images = req.body.images;
    if (req.body.status !== undefined) {
      if (!['active', 'inactive', 'sold_out'].includes(req.body.status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid status value' 
        });
      }
      updateData.status = req.body.status;
    }

    const item = await vendorItemsService.updateItem(itemId, vendorId, updateData);
    
    res.json({
      success: true,
      item,
      message: 'Item updated successfully'
    });
  } catch (error) {
    console.error('Error updating item:', error);
    if (error instanceof Error && error.message === 'Item not found or access denied') {
      res.status(404).json({ 
        success: false, 
        error: 'Item not found' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update item' 
      });
    }
  }
});

// Update item status only
router.patch('/:itemId/status', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    const { itemId } = req.params;
    const { status } = req.body;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    if (!status || !['active', 'inactive', 'sold_out'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status value' 
      });
    }

    const item = await vendorItemsService.updateItemStatus(itemId, vendorId, status);
    
    res.json({
      success: true,
      item,
      message: 'Item status updated successfully'
    });
  } catch (error) {
    console.error('Error updating item status:', error);
    if (error instanceof Error && error.message === 'Item not found or access denied') {
      res.status(404).json({ 
        success: false, 
        error: 'Item not found' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update item status' 
      });
    }
  }
});

// Delete an item
router.delete('/:itemId', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    const { itemId } = req.params;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    const deleted = await vendorItemsService.deleteItem(itemId, vendorId);
    
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        error: 'Item not found' 
      });
    }

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete item' 
    });
  }
});

// Get vendor item statistics
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const vendorId = req.vendor?.vendorId;
    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor ID not found' });
    }

    const stats = await vendorItemsService.getVendorItemStats(vendorId);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching vendor stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch statistics' 
    });
  }
});

export default router;