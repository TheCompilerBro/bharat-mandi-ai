-- Migration: Create language preferences table
-- This table stores vendor language preferences for the translation service

CREATE TABLE IF NOT EXISTS language_preferences (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL UNIQUE,
    preferred_language VARCHAR(10) NOT NULL,
    secondary_languages TEXT[], -- Array of secondary language codes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    CONSTRAINT valid_preferred_language CHECK (preferred_language IN ('hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'))
);

-- Index for fast lookups by vendor_id
CREATE INDEX IF NOT EXISTS idx_language_preferences_vendor_id ON language_preferences(vendor_id);

-- Index for preferred language queries
CREATE INDEX IF NOT EXISTS idx_language_preferences_preferred_language ON language_preferences(preferred_language);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_language_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_language_preferences_updated_at
    BEFORE UPDATE ON language_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_language_preferences_updated_at();