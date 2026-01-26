-- Migration for error handling and security monitoring tables

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id VARCHAR(255) PRIMARY KEY,
    service VARCHAR(100) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    error_code VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    metadata JSONB,
    original_error TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service alerts table
CREATE TABLE IF NOT EXISTS service_alerts (
    id VARCHAR(255) PRIMARY KEY,
    service VARCHAR(100) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('suspicious_login', 'multiple_failures', 'unusual_activity', 'data_breach_attempt', 'rate_limit_exceeded')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    details JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security alerts table
CREATE TABLE IF NOT EXISTS security_alerts (
    id VARCHAR(255) PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('account_lock', 'notification', 'investigation_required', 'immediate_response')),
    message TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (event_id) REFERENCES security_events(id) ON DELETE CASCADE
);

-- Add security fields to vendors table
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lock_reason TEXT,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_login_ip INET,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP WITH TIME ZONE;

-- Vendor alerts table for price and other notifications
CREATE TABLE IF NOT EXISTS vendor_alerts (
    id VARCHAR(255) PRIMARY KEY,
    vendor_id VARCHAR(255) NOT NULL,
    commodity VARCHAR(100),
    alert_type VARCHAR(50) NOT NULL,
    threshold_value DECIMAL(10,2),
    current_value DECIMAL(10,2),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Security notifications table
CREATE TABLE IF NOT EXISTS security_notifications (
    id VARCHAR(255) PRIMARY KEY,
    recipient_id VARCHAR(255) NOT NULL,
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('vendor', 'admin', 'system')),
    alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('email', 'sms', 'push', 'webhook')),
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security responses table
CREATE TABLE IF NOT EXISTS security_responses (
    id VARCHAR(255) PRIMARY KEY,
    alert_id VARCHAR(255),
    response_type VARCHAR(20) NOT NULL CHECK (response_type IN ('automatic', 'manual')),
    action VARCHAR(50) NOT NULL CHECK (action IN ('account_lock', 'ip_block', 'notification', 'investigation', 'escalation')),
    executed_by VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    details JSONB,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (alert_id) REFERENCES security_notifications(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_error_logs_service_timestamp ON error_logs(service, timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_timestamp ON error_logs(severity, timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_service_alerts_service_timestamp ON service_alerts(service, timestamp);
CREATE INDEX IF NOT EXISTS idx_service_alerts_acknowledged ON service_alerts(acknowledged);

CREATE INDEX IF NOT EXISTS idx_security_events_type_timestamp ON security_events(type, timestamp);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id_timestamp ON security_events(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address_timestamp ON security_events(ip_address, timestamp);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);

CREATE INDEX IF NOT EXISTS idx_security_alerts_event_id ON security_alerts(event_id);
CREATE INDEX IF NOT EXISTS idx_security_alerts_acknowledged ON security_alerts(acknowledged);

CREATE INDEX IF NOT EXISTS idx_vendors_account_locked ON vendors(account_locked);
CREATE INDEX IF NOT EXISTS idx_vendors_last_login ON vendors(last_login_at);

CREATE INDEX IF NOT EXISTS idx_vendor_alerts_vendor_id ON vendor_alerts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_alerts_created_at ON vendor_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_vendor_alerts_read_at ON vendor_alerts(read_at);

CREATE INDEX IF NOT EXISTS idx_security_notifications_recipient ON security_notifications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_security_notifications_status ON security_notifications(status);
CREATE INDEX IF NOT EXISTS idx_security_notifications_priority ON security_notifications(priority);
CREATE INDEX IF NOT EXISTS idx_security_notifications_created_at ON security_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_security_responses_alert_id ON security_responses(alert_id);
CREATE INDEX IF NOT EXISTS idx_security_responses_action ON security_responses(action);
CREATE INDEX IF NOT EXISTS idx_security_responses_executed_at ON security_responses(executed_at);

-- Add some sample data for testing (optional)
-- This would be removed in production
INSERT INTO error_logs (id, service, operation, error_code, message, severity, timestamp) VALUES
('test_error_1', 'translation', 'translateMessage', 'API_TIMEOUT', 'Translation API timeout', 'medium', NOW()),
('test_error_2', 'price_discovery', 'getCurrentPrice', 'DATA_VALIDATION_FAILURE', 'Invalid price data received', 'high', NOW())
ON CONFLICT (id) DO NOTHING;

-- Create a function to clean up old logs (optional)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
    -- Delete error logs older than 30 days
    DELETE FROM error_logs WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Delete security events older than 90 days
    DELETE FROM security_events WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Delete resolved security alerts older than 30 days
    DELETE FROM security_alerts WHERE acknowledged = true AND acknowledged_at < NOW() - INTERVAL '30 days';
    
    -- Delete read vendor alerts older than 7 days
    DELETE FROM vendor_alerts WHERE read_at IS NOT NULL AND read_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-logs', '0 2 * * *', 'SELECT cleanup_old_logs();');