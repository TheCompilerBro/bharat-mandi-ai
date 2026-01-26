-- Migration: Create Analytics and Reporting Tables
-- Description: Creates tables for analytics data collection, trading metrics, and reporting

-- Weekly trading summaries table
CREATE TABLE IF NOT EXISTS weekly_trading_summaries (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    total_trades INTEGER DEFAULT 0,
    successful_trades INTEGER DEFAULT 0,
    total_volume DECIMAL(15,3) DEFAULT 0,
    average_price DECIMAL(10,2) DEFAULT 0,
    profit_margin DECIMAL(5,4) DEFAULT 0,
    top_commodities JSONB,
    market_performance JSONB,
    recommendations TEXT[],
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate summaries
    UNIQUE(vendor_id, week_start_date)
);

-- Data export requests table
CREATE TABLE IF NOT EXISTS data_export_requests (
    id VARCHAR(255) PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL,
    export_type VARCHAR(50) NOT NULL CHECK (export_type IN ('trading_history', 'performance_metrics', 'market_insights', 'complete_profile')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    file_format VARCHAR(10) NOT NULL DEFAULT 'csv' CHECK (file_format IN ('csv', 'json')),
    file_path VARCHAR(500),
    file_size_bytes BIGINT,
    download_url VARCHAR(500),
    expires_at TIMESTAMP WITH TIME ZONE,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Data deletion requests table (for GDPR compliance)
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id VARCHAR(255) PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('partial', 'complete')),
    data_categories TEXT[], -- Array of data categories to delete
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    verification_token VARCHAR(255),
    verified_at TIMESTAMP WITH TIME ZONE,
    processing_notes TEXT,
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Market insights delivery log
CREATE TABLE IF NOT EXISTS insight_delivery_log (
    id VARCHAR(255) PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL,
    insight_id VARCHAR(255) NOT NULL,
    delivery_method VARCHAR(20) NOT NULL CHECK (delivery_method IN ('email', 'sms', 'push', 'in_app')),
    delivery_status VARCHAR(20) NOT NULL CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Trading performance snapshots table
CREATE TABLE IF NOT EXISTS trading_performance_snapshots (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL,
    snapshot_date DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    total_trades INTEGER DEFAULT 0,
    successful_trades INTEGER DEFAULT 0,
    total_volume DECIMAL(15,3) DEFAULT 0,
    average_price DECIMAL(10,2) DEFAULT 0,
    profit_margin DECIMAL(5,4) DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0,
    average_negotiation_time DECIMAL(8,2) DEFAULT 0, -- in minutes
    commodities_traded TEXT[],
    performance_score DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- Unique constraint for snapshot per vendor per date per period
    UNIQUE(vendor_id, snapshot_date, period_type)
);

-- Market trend analysis results table
CREATE TABLE IF NOT EXISTS market_trend_analysis (
    id SERIAL PRIMARY KEY,
    commodity VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    analysis_date DATE NOT NULL,
    trend_direction VARCHAR(20) NOT NULL CHECK (trend_direction IN ('rising', 'falling', 'stable')),
    change_percent DECIMAL(8,4) NOT NULL,
    volatility DECIMAL(8,6) NOT NULL,
    demand_level VARCHAR(10) NOT NULL CHECK (demand_level IN ('high', 'medium', 'low')),
    supply_level VARCHAR(10) NOT NULL CHECK (supply_level IN ('high', 'medium', 'low')),
    seasonal_factor DECIMAL(6,4) DEFAULT 1.0,
    predicted_price DECIMAL(10,2) NOT NULL,
    confidence DECIMAL(4,3) NOT NULL,
    analysis_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint for one analysis per commodity per region per date
    UNIQUE(commodity, region, analysis_date)
);

-- Vendor analytics preferences table
CREATE TABLE IF NOT EXISTS vendor_analytics_preferences (
    vendor_id VARCHAR(255) PRIMARY KEY,
    weekly_summary_enabled BOOLEAN DEFAULT true,
    insight_notifications_enabled BOOLEAN DEFAULT true,
    preferred_delivery_method VARCHAR(20) DEFAULT 'email' CHECK (preferred_delivery_method IN ('email', 'sms', 'push', 'in_app')),
    insight_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (insight_frequency IN ('daily', 'weekly', 'monthly')),
    data_retention_days INTEGER DEFAULT 365,
    export_format_preference VARCHAR(10) DEFAULT 'csv' CHECK (export_format_preference IN ('csv', 'json')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_vendor_date ON weekly_trading_summaries(vendor_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_generated_at ON weekly_trading_summaries(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_requests_vendor_status ON data_export_requests(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_export_requests_requested_at ON data_export_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_requests_expires_at ON data_export_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_vendor_status ON data_deletion_requests(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_at ON data_deletion_requests(requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_insight_delivery_vendor_status ON insight_delivery_log(vendor_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_insight_delivery_attempted_at ON insight_delivery_log(attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots_vendor_date ON trading_performance_snapshots(vendor_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_period_type ON trading_performance_snapshots(period_type);

CREATE INDEX IF NOT EXISTS idx_trend_analysis_commodity_date ON market_trend_analysis(commodity, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_trend_analysis_region_date ON market_trend_analysis(region, analysis_date DESC);

-- Create update trigger for vendor analytics preferences
CREATE OR REPLACE FUNCTION update_analytics_preferences_timestamp()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_analytics_preferences_timestamp
    BEFORE UPDATE ON vendor_analytics_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_analytics_preferences_timestamp();

-- Insert default analytics preferences for existing vendors
INSERT INTO vendor_analytics_preferences (vendor_id)
SELECT id FROM vendors
ON CONFLICT (vendor_id) DO NOTHING;

-- Create a function to clean up expired export files
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS void AS $
BEGIN
    -- Mark expired export requests as failed
    UPDATE data_export_requests 
    SET status = 'failed', 
        error_message = 'Export expired'
    WHERE expires_at < NOW() 
      AND status IN ('pending', 'processing', 'completed');
      
    -- Clean up old completed export requests (older than 30 days)
    DELETE FROM data_export_requests 
    WHERE completed_at < NOW() - INTERVAL '30 days'
      AND status IN ('completed', 'failed');
      
    -- Clean up old performance snapshots (older than 2 years)
    DELETE FROM trading_performance_snapshots 
    WHERE created_at < NOW() - INTERVAL '2 years';
    
    -- Clean up old trend analysis (older than 1 year)
    DELETE FROM market_trend_analysis 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Clean up old insight delivery logs (older than 90 days)
    DELETE FROM insight_delivery_log 
    WHERE attempted_at < NOW() - INTERVAL '90 days';
END;
$ LANGUAGE plpgsql;

-- Create a function to generate weekly summaries for all active vendors
CREATE OR REPLACE FUNCTION generate_weekly_summaries()
RETURNS void AS $
BEGIN
    -- This would be called by the analytics service
    -- Placeholder for batch processing logic
    RAISE NOTICE 'Weekly summary generation triggered at %', NOW();
END;
$ LANGUAGE plpgsql;

-- Sample data for testing (optional - remove in production)
INSERT INTO weekly_trading_summaries (
    vendor_id, 
    week_start_date, 
    week_end_date, 
    total_trades, 
    successful_trades, 
    total_volume, 
    average_price,
    top_commodities,
    market_performance,
    recommendations
) 
SELECT 
    v.id,
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE,
    5,
    4,
    1250.50,
    2500.00,
    '[{"commodity": "Rice", "volume": 500, "profit": 1875}]'::jsonb,
    '{"bestPerformingCommodity": "Rice", "worstPerformingCommodity": "Wheat", "averageNegotiationTime": 45}'::jsonb,
    ARRAY['Focus on Rice - your best performing commodity', 'Consider improving negotiation efficiency']
FROM vendors v 
WHERE v.verification_status = 'verified'
LIMIT 3
ON CONFLICT (vendor_id, week_start_date) DO NOTHING;

-- Create scheduled job placeholders (would use pg_cron in production)
-- SELECT cron.schedule('cleanup-analytics', '0 2 * * *', 'SELECT cleanup_expired_exports();');
-- SELECT cron.schedule('weekly-summaries', '0 6 * * 1', 'SELECT generate_weekly_summaries();');