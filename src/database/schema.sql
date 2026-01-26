-- Multilingual MandiChallenge Database Schema
-- PostgreSQL Schema for structured data

-- Create database (run this separately if needed)
-- CREATE DATABASE mandi_challenge;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    
    -- Location information
    state VARCHAR(50) NOT NULL,
    district VARCHAR(50) NOT NULL,
    market VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Language preferences
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'hi',
    secondary_languages TEXT[], -- Array of language codes
    
    -- Business information
    business_type VARCHAR(20) NOT NULL CHECK (business_type IN ('farmer', 'trader', 'wholesaler', 'retailer')),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    trust_score DECIMAL(3, 2) DEFAULT 0.00 CHECK (trust_score >= 0 AND trust_score <= 5),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trade sessions table
CREATE TABLE IF NOT EXISTS trade_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commodity VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    
    -- Deal information
    final_price DECIMAL(10, 2),
    quantity DECIMAL(10, 3),
    buyer_id UUID REFERENCES vendors(id),
    seller_id UUID REFERENCES vendors(id),
    
    -- Timestamps
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session participants (many-to-many relationship)
CREATE TABLE IF NOT EXISTS session_participants (
    session_id UUID REFERENCES trade_sessions(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (session_id, vendor_id)
);

-- Negotiations table
CREATE TABLE IF NOT EXISTS negotiations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES trade_sessions(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id),
    
    -- Negotiation details
    offer_price DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL,
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'countered')),
    
    -- AI assistance data
    ai_suggestion DECIMAL(10, 2),
    market_justification TEXT,
    cultural_context TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE
);

-- Trust ratings table
CREATE TABLE IF NOT EXISTS trust_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rater_id UUID REFERENCES vendors(id),
    rated_vendor_id UUID REFERENCES vendors(id),
    session_id UUID REFERENCES trade_sessions(id),
    
    -- Rating details
    rating DECIMAL(2, 1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
    delivery_rating DECIMAL(2, 1) CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
    communication_rating DECIMAL(2, 1) CHECK (communication_rating >= 1 AND communication_rating <= 5),
    quality_rating DECIMAL(2, 1) CHECK (quality_rating >= 1 AND quality_rating <= 5),
    
    -- Feedback
    feedback TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one rating per vendor per session
    UNIQUE(rater_id, rated_vendor_id, session_id)
);

-- Market integrations configuration
CREATE TABLE IF NOT EXISTS market_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_name VARCHAR(50) NOT NULL UNIQUE,
    api_endpoint VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255),
    
    -- Configuration
    is_active BOOLEAN DEFAULT true,
    update_frequency_minutes INTEGER DEFAULT 15,
    last_sync TIMESTAMP WITH TIME ZONE,
    
    -- Data quality metrics
    success_rate DECIMAL(5, 2) DEFAULT 100.00,
    avg_response_time_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vendor verification documents
CREATE TABLE IF NOT EXISTS verification_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- Document details
    document_type VARCHAR(50) NOT NULL, -- 'aadhar', 'pan', 'business_license', etc.
    document_number VARCHAR(100),
    document_url VARCHAR(500), -- S3 or file storage URL
    
    -- Verification status
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_by UUID REFERENCES vendors(id), -- Admin who verified
    verification_notes TEXT,
    
    -- Timestamps
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE
);

-- Refresh tokens table (for JWT refresh token management)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vendor flags table (for flagging vendors with issues)
CREATE TABLE IF NOT EXISTS vendor_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    flag_type VARCHAR(50) NOT NULL, -- 'low_rating', 'suspicious_activity', 'verification_issue', etc.
    flag_reason TEXT,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES vendors(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate active flags of same type for same vendor
    UNIQUE(vendor_id, flag_type) WHERE is_resolved = false
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_phone ON vendors(phone);
CREATE INDEX IF NOT EXISTS idx_vendors_location ON vendors(state, district, market);
CREATE INDEX IF NOT EXISTS idx_vendors_business_type ON vendors(business_type);
CREATE INDEX IF NOT EXISTS idx_vendors_verification_status ON vendors(verification_status);
CREATE INDEX IF NOT EXISTS idx_vendors_last_active ON vendors(last_active);

CREATE INDEX IF NOT EXISTS idx_trade_sessions_status ON trade_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_commodity ON trade_sessions(commodity);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_start_time ON trade_sessions(start_time);

CREATE INDEX IF NOT EXISTS idx_negotiations_session_id ON negotiations(session_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_vendor_id ON negotiations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_status ON negotiations(status);

CREATE INDEX IF NOT EXISTS idx_trust_ratings_rated_vendor ON trust_ratings(rated_vendor_id);
CREATE INDEX IF NOT EXISTS idx_trust_ratings_rating ON trust_ratings(rating);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_vendor_id ON refresh_tokens(vendor_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_vendor_flags_vendor_id ON vendor_flags(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_flags_type ON vendor_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_vendor_flags_resolved ON vendor_flags(is_resolved);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trade_sessions_updated_at BEFORE UPDATE ON trade_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_integrations_updated_at BEFORE UPDATE ON market_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendor_flags_updated_at BEFORE UPDATE ON vendor_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();