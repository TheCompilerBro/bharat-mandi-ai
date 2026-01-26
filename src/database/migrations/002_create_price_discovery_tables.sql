-- Migration: Create Price Discovery Tables
-- Description: Creates tables for market data, price alerts, and vendor alerts

-- Market data table for storing historical price information
CREATE TABLE IF NOT EXISTS market_data (
    id SERIAL PRIMARY KEY,
    commodity VARCHAR(100) NOT NULL,
    market VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    min_price DECIMAL(10,2) NOT NULL,
    max_price DECIMAL(10,2) NOT NULL,
    modal_price DECIMAL(10,2) NOT NULL,
    arrivals INTEGER DEFAULT 0,
    sources JSONB,
    volatility DECIMAL(5,4) DEFAULT 0,
    data_quality VARCHAR(10) DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint to prevent duplicate entries
    UNIQUE(commodity, market, date)
);

-- Price alerts subscription table
CREATE TABLE IF NOT EXISTS price_alerts (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(50) NOT NULL,
    commodity VARCHAR(100) NOT NULL,
    alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('volatility', 'price_threshold', 'market_change')),
    threshold DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key to vendors table (assuming it exists)
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Vendor alerts table for storing triggered alerts
CREATE TABLE IF NOT EXISTS vendor_alerts (
    id VARCHAR(100) PRIMARY KEY,
    vendor_id VARCHAR(50) NOT NULL,
    commodity VARCHAR(100) NOT NULL,
    alert_type VARCHAR(20) NOT NULL,
    threshold_value DECIMAL(10,2) NOT NULL,
    current_value DECIMAL(10,2) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_commodity_date ON market_data(commodity, date DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_market_date ON market_data(market, date DESC);
CREATE INDEX IF NOT EXISTS idx_price_alerts_vendor_commodity ON price_alerts(vendor_id, commodity);
CREATE INDEX IF NOT EXISTS idx_vendor_alerts_vendor_unread ON vendor_alerts(vendor_id, is_read);

-- Update trigger for market_data
CREATE OR REPLACE FUNCTION update_market_data_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_market_data_timestamp
    BEFORE UPDATE ON market_data
    FOR EACH ROW
    EXECUTE FUNCTION update_market_data_timestamp();

-- Update trigger for price_alerts
CREATE TRIGGER trigger_update_price_alerts_timestamp
    BEFORE UPDATE ON price_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_market_data_timestamp();

-- Insert some sample data for testing
INSERT INTO market_data (commodity, market, state, date, min_price, max_price, modal_price, arrivals, sources, data_quality) VALUES
('Rice', 'Delhi', 'Delhi', CURRENT_DATE, 2200.00, 2800.00, 2500.00, 150, '["AGMARKNET"]', 'high'),
('Wheat', 'Delhi', 'Delhi', CURRENT_DATE, 1800.00, 2200.00, 2000.00, 200, '["AGMARKNET"]', 'high'),
('Onion', 'Mumbai', 'Maharashtra', CURRENT_DATE, 1500.00, 2000.00, 1750.00, 300, '["AGMARKNET", "data.gov.in"]', 'high'),
('Potato', 'Kolkata', 'West Bengal', CURRENT_DATE, 1200.00, 1600.00, 1400.00, 250, '["AGMARKNET"]', 'medium'),
('Turmeric', 'Chennai', 'Tamil Nadu', CURRENT_DATE, 8000.00, 9500.00, 8750.00, 50, '["AGMARKNET"]', 'high')
ON CONFLICT (commodity, market, date) DO NOTHING;