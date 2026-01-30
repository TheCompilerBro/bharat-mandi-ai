-- Create vendor_items table for managing vendor inventory
CREATE TABLE IF NOT EXISTS vendor_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(12, 2) NOT NULL CHECK (price > 0),
    unit VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    quality VARCHAR(20) NOT NULL CHECK (quality IN ('premium', 'standard', 'economy')),
    location VARCHAR(255) NOT NULL,
    images JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vendor_items_vendor_id ON vendor_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_items_category ON vendor_items(category);
CREATE INDEX IF NOT EXISTS idx_vendor_items_status ON vendor_items(status);
CREATE INDEX IF NOT EXISTS idx_vendor_items_price ON vendor_items(price);
CREATE INDEX IF NOT EXISTS idx_vendor_items_quality ON vendor_items(quality);
CREATE INDEX IF NOT EXISTS idx_vendor_items_location ON vendor_items USING gin(to_tsvector('english', location));
CREATE INDEX IF NOT EXISTS idx_vendor_items_name_search ON vendor_items USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_vendor_items_created_at ON vendor_items(created_at DESC);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_vendor_items_vendor_status ON vendor_items(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_items_category_status ON vendor_items(category, status);
CREATE INDEX IF NOT EXISTS idx_vendor_items_status_price ON vendor_items(status, price);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vendor_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vendor_items_updated_at
    BEFORE UPDATE ON vendor_items
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_items_updated_at();

-- Add some sample data for testing (optional)
INSERT INTO vendor_items (vendor_id, name, category, description, price, unit, quantity, quality, location) 
SELECT 
    v.id,
    'Sample ' || categories.category,
    categories.category,
    'High quality ' || categories.category || ' from local farms',
    categories.price,
    categories.unit,
    FLOOR(RANDOM() * 100) + 10,
    (ARRAY['premium', 'standard', 'economy'])[FLOOR(RANDOM() * 3) + 1]::VARCHAR,
    v.state || ', ' || v.district
FROM vendors v
CROSS JOIN (
    VALUES 
        ('Rice', 2000.00, 'quintal'),
        ('Wheat', 2500.00, 'quintal'),
        ('Cotton', 5500.00, 'quintal'),
        ('Onion', 1200.00, 'quintal'),
        ('Potato', 800.00, 'quintal')
) AS categories(category, price, unit)
WHERE v.verification_status = 'verified'
LIMIT 20
ON CONFLICT DO NOTHING;

-- Create view for active items with vendor information
CREATE OR REPLACE VIEW active_vendor_items AS
SELECT 
    vi.*,
    v.name as vendor_name,
    v.trust_score,
    v.verification_status,
    v.state,
    v.district,
    v.market
FROM vendor_items vi
JOIN vendors v ON vi.vendor_id = v.id
WHERE vi.status = 'active' AND vi.quantity > 0;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_items TO multilingual_mandi_user;
GRANT SELECT ON active_vendor_items TO multilingual_mandi_user;
GRANT USAGE ON SEQUENCE vendor_items_id_seq TO multilingual_mandi_user;