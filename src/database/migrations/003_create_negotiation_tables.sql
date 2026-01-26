-- Migration: Create Negotiation Assistant Tables
-- Description: Creates tables for negotiation history, steps, offers, and learning data

-- Negotiation steps table for tracking all negotiation actions
CREATE TABLE IF NOT EXISTS negotiation_steps (
    id SERIAL PRIMARY KEY,
    step_id VARCHAR(100) NOT NULL UNIQUE,
    session_id VARCHAR(100) NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('offer', 'counter', 'accept', 'reject', 'message')),
    offer_data JSONB,
    message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    ai_assistance_used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key to vendors table
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Offer analyses table for storing AI analysis of offers
CREATE TABLE IF NOT EXISTS offer_analyses (
    id SERIAL PRIMARY KEY,
    offer_id VARCHAR(100) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    recommendation VARCHAR(20) NOT NULL CHECK (recommendation IN ('accept', 'counter', 'reject')),
    market_deviation DECIMAL(8,4) NOT NULL,
    risk_level VARCHAR(10) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Response recommendations table for storing AI recommendations
CREATE TABLE IF NOT EXISTS response_recommendations (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    recommended_action VARCHAR(20) NOT NULL CHECK (recommended_action IN ('accept', 'counter', 'reject', 'negotiate_terms')),
    reasoning TEXT NOT NULL,
    recommendation_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deal evaluations table for storing completed deal assessments
CREATE TABLE IF NOT EXISTS deal_evaluations (
    id SERIAL PRIMARY KEY,
    deal_quality VARCHAR(10) NOT NULL CHECK (deal_quality IN ('excellent', 'good', 'fair', 'poor')),
    market_comparison DECIMAL(8,4) NOT NULL,
    profit_margin DECIMAL(8,4) NOT NULL,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    evaluation_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Learning data table for machine learning improvements
CREATE TABLE IF NOT EXISTS learning_data (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('successful', 'failed', 'partial')),
    market_conditions JSONB NOT NULL,
    negotiation_metrics JSONB NOT NULL,
    participant_feedback JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cultural profiles table for regional trading customs
CREATE TABLE IF NOT EXISTS cultural_profiles (
    id SERIAL PRIMARY KEY,
    region VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(50) NOT NULL,
    trading_customs JSONB NOT NULL,
    communication_patterns JSONB NOT NULL,
    market_practices JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Negotiation sessions table for tracking complete negotiation sessions
CREATE TABLE IF NOT EXISTS negotiation_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL UNIQUE,
    participants TEXT[] NOT NULL, -- Array of vendor IDs
    commodity VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    final_deal JSONB,
    cultural_context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Price suggestions cache table for learning and optimization
CREATE TABLE IF NOT EXISTS price_suggestions (
    id SERIAL PRIMARY KEY,
    commodity VARCHAR(100) NOT NULL,
    context_hash VARCHAR(64) NOT NULL, -- Hash of market context for caching
    suggested_price DECIMAL(10,2) NOT NULL,
    confidence_level DECIMAL(4,3) NOT NULL,
    reasoning TEXT NOT NULL,
    market_justification TEXT NOT NULL,
    price_range JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Unique constraint for context-based caching
    UNIQUE(commodity, context_hash)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_negotiation_steps_session_id ON negotiation_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_steps_vendor_id ON negotiation_steps(vendor_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_steps_timestamp ON negotiation_steps(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_offer_analyses_session_id ON offer_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_offer_analyses_offer_id ON offer_analyses(offer_id);

CREATE INDEX IF NOT EXISTS idx_response_recommendations_session_id ON response_recommendations(session_id);

CREATE INDEX IF NOT EXISTS idx_learning_data_session_id ON learning_data(session_id);
CREATE INDEX IF NOT EXISTS idx_learning_data_outcome ON learning_data(outcome);

CREATE INDEX IF NOT EXISTS idx_cultural_profiles_region ON cultural_profiles(region);
CREATE INDEX IF NOT EXISTS idx_cultural_profiles_state ON cultural_profiles(state);

CREATE INDEX IF NOT EXISTS idx_negotiation_sessions_session_id ON negotiation_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_sessions_status ON negotiation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_negotiation_sessions_commodity ON negotiation_sessions(commodity);

CREATE INDEX IF NOT EXISTS idx_price_suggestions_commodity ON price_suggestions(commodity);
CREATE INDEX IF NOT EXISTS idx_price_suggestions_expires_at ON price_suggestions(expires_at);

-- Update triggers for timestamp fields
CREATE OR REPLACE FUNCTION update_negotiation_timestamp()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cultural_profiles_timestamp
    BEFORE UPDATE ON cultural_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_negotiation_timestamp();

CREATE TRIGGER trigger_update_negotiation_sessions_timestamp
    BEFORE UPDATE ON negotiation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_negotiation_timestamp();

-- Insert default cultural profiles for major Indian states
INSERT INTO cultural_profiles (region, state, trading_customs, communication_patterns, market_practices) VALUES
('punjab', 'Punjab', 
 '{"negotiationStyle": "direct", "decisionMaking": "quick", "priceFlexibility": "medium", "relationshipImportance": "high"}',
 '{"formalityLevel": "semi-formal", "directness": "direct", "timeOrientation": "punctual"}',
 '{"commonPaymentTerms": ["cash_on_delivery", "advance_payment", "15_days_credit"], "typicalDeliveryMethods": ["farm_pickup", "mandi_delivery", "warehouse_delivery"], "qualityAssessmentMethods": ["visual_inspection", "moisture_testing", "sample_testing"], "disputeResolutionPreferences": ["community_elder", "mandi_committee", "direct_negotiation"]}'
),
('maharashtra', 'Maharashtra',
 '{"negotiationStyle": "relationship-based", "decisionMaking": "deliberate", "priceFlexibility": "high", "relationshipImportance": "high"}',
 '{"formalityLevel": "formal", "directness": "indirect", "timeOrientation": "flexible"}',
 '{"commonPaymentTerms": ["cash_on_delivery", "30_days_credit", "seasonal_payment"], "typicalDeliveryMethods": ["mandi_delivery", "warehouse_delivery", "direct_transport"], "qualityAssessmentMethods": ["grade_certification", "visual_inspection", "lab_testing"], "disputeResolutionPreferences": ["mandi_committee", "arbitration", "community_mediation"]}'
),
('tamil_nadu', 'Tamil Nadu',
 '{"negotiationStyle": "indirect", "decisionMaking": "consensus", "priceFlexibility": "medium", "relationshipImportance": "high"}',
 '{"formalityLevel": "formal", "directness": "indirect", "timeOrientation": "flexible"}',
 '{"commonPaymentTerms": ["cash_on_delivery", "advance_payment", "cooperative_payment"], "typicalDeliveryMethods": ["cooperative_collection", "mandi_delivery", "direct_pickup"], "qualityAssessmentMethods": ["cooperative_grading", "visual_inspection", "traditional_methods"], "disputeResolutionPreferences": ["cooperative_committee", "village_elder", "government_officer"]}'
),
('default', 'Default',
 '{"negotiationStyle": "direct", "decisionMaking": "deliberate", "priceFlexibility": "medium", "relationshipImportance": "medium"}',
 '{"formalityLevel": "semi-formal", "directness": "direct", "timeOrientation": "punctual"}',
 '{"commonPaymentTerms": ["cash_on_delivery", "15_days_credit"], "typicalDeliveryMethods": ["mandi_delivery", "direct_pickup"], "qualityAssessmentMethods": ["visual_inspection", "sample_testing"], "disputeResolutionPreferences": ["direct_negotiation", "mandi_committee"]}'
)
ON CONFLICT (region) DO NOTHING;

-- Create a cleanup function for expired price suggestions
CREATE OR REPLACE FUNCTION cleanup_expired_price_suggestions()
RETURNS void AS $
BEGIN
    DELETE FROM price_suggestions WHERE expires_at < CURRENT_TIMESTAMP;
END;
$ LANGUAGE plpgsql;

-- Create a scheduled job to clean up expired suggestions (if pg_cron is available)
-- This would typically be set up separately in production
-- SELECT cron.schedule('cleanup-price-suggestions', '0 */6 * * *', 'SELECT cleanup_expired_price_suggestions();');