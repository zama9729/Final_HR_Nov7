-- Tenant Observability Module Migration
-- Provides deep tenant health, usage, and risk monitoring for Super Admins

-- ============================================================================
-- 1. TENANT METRICS DAILY
-- ============================================================================
-- Aggregated daily metrics per tenant (no PII)
CREATE TABLE IF NOT EXISTS tenant_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- User metrics
  active_users_count INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  new_users_count INTEGER DEFAULT 0,
  
  -- Activity metrics
  payroll_runs_count INTEGER DEFAULT 0,
  attendance_events_count INTEGER DEFAULT 0,
  leave_requests_count INTEGER DEFAULT 0,
  expense_claims_count INTEGER DEFAULT 0,
  timesheet_submissions_count INTEGER DEFAULT 0,
  
  -- System metrics
  api_requests_count INTEGER DEFAULT 0,
  api_error_count INTEGER DEFAULT 0,
  api_success_count INTEGER DEFAULT 0,
  storage_used_mb NUMERIC(10, 2) DEFAULT 0,
  
  -- Performance metrics
  avg_response_time_ms INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tenant_metrics_tenant_date ON tenant_metrics_daily(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_date ON tenant_metrics_daily(date DESC);

-- ============================================================================
-- 2. TENANT FEATURE USAGE
-- ============================================================================
-- Track feature adoption and usage per tenant
CREATE TABLE IF NOT EXISTS tenant_feature_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  unique_users_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  first_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Period tracking
  usage_count_7d INTEGER DEFAULT 0,
  usage_count_30d INTEGER DEFAULT 0,
  usage_count_90d INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_usage_tenant ON tenant_feature_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_feature_usage_feature ON tenant_feature_usage(feature_key);
CREATE INDEX IF NOT EXISTS idx_tenant_feature_usage_last_used ON tenant_feature_usage(last_used_at DESC);

-- ============================================================================
-- 3. TENANT HEALTH FLAGS
-- ============================================================================
-- Health and risk indicators for tenants
CREATE TYPE health_flag_type AS ENUM (
  'INACTIVE',
  'PAYROLL_SKIPPED',
  'ERROR_SPIKE',
  'STORAGE_LIMIT',
  'LOW_ADOPTION',
  'HIGH_ERROR_RATE',
  'NO_RECENT_ACTIVITY',
  'SUBSCRIPTION_EXPIRING',
  'FEATURE_DEPRECATED'
);

CREATE TYPE health_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE IF NOT EXISTS tenant_health_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  flag_type health_flag_type NOT NULL,
  severity health_severity NOT NULL DEFAULT 'MEDIUM',
  
  -- Contextual data
  metadata JSONB DEFAULT '{}',
  message TEXT,
  
  -- Resolution tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  
  -- Auto-expiry for resolved flags (cleanup after 90 days)
  expires_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(tenant_id, flag_type, severity) -- One active flag per type/severity
);

CREATE INDEX IF NOT EXISTS idx_tenant_health_flags_tenant ON tenant_health_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_health_flags_type ON tenant_health_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_tenant_health_flags_severity ON tenant_health_flags(severity);
CREATE INDEX IF NOT EXISTS idx_tenant_health_flags_active ON tenant_health_flags(tenant_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_health_flags_created ON tenant_health_flags(created_at DESC);

-- ============================================================================
-- 4. OBSERVABILITY AUDIT LOGS
-- ============================================================================
-- Track Super Admin access to observability data
CREATE TABLE IF NOT EXISTS observability_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  superadmin_email VARCHAR(255),
  
  action VARCHAR(100) NOT NULL, -- 'viewed_overview', 'viewed_tenant_metrics', 'viewed_health', etc.
  tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  tenant_name VARCHAR(255),
  
  -- Request details
  endpoint VARCHAR(255),
  query_params JSONB,
  response_size_bytes INTEGER,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observability_audit_superadmin ON observability_audit_logs(superadmin_id);
CREATE INDEX IF NOT EXISTS idx_observability_audit_tenant ON observability_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_observability_audit_action ON observability_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_observability_audit_created ON observability_audit_logs(created_at DESC);

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to get tenant storage limit based on tier
CREATE OR REPLACE FUNCTION get_tenant_storage_limit_mb(tenant_tier subscription_tier)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE tenant_tier
    WHEN 'basic' THEN 1024      -- 1 GB
    WHEN 'premium' THEN 10240   -- 10 GB
    WHEN 'enterprise' THEN 102400 -- 100 GB
    ELSE 1024
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate error rate
CREATE OR REPLACE FUNCTION calculate_error_rate(error_count INTEGER, total_count INTEGER)
RETURNS NUMERIC AS $$
BEGIN
  IF total_count = 0 THEN
    RETURN 0;
  END IF;
  RETURN ROUND((error_count::NUMERIC / total_count::NUMERIC * 100), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 6. MATERIALIZED VIEWS (for performance)
-- ============================================================================

-- Recent tenant activity summary (last 30 days)
CREATE MATERIALIZED VIEW IF NOT EXISTS tenant_activity_summary_30d AS
SELECT 
  tm.tenant_id,
  o.name AS tenant_name,
  o.tier,
  o.status,
  COUNT(DISTINCT tm.date) AS active_days,
  SUM(tm.active_users_count) AS total_active_users,
  SUM(tm.payroll_runs_count) AS total_payroll_runs,
  SUM(tm.attendance_events_count) AS total_attendance_events,
  SUM(tm.api_error_count) AS total_errors,
  SUM(tm.api_requests_count) AS total_api_requests,
  calculate_error_rate(SUM(tm.api_error_count), SUM(tm.api_requests_count)) AS error_rate_pct,
  AVG(tm.storage_used_mb) AS avg_storage_mb,
  MAX(tm.date) AS last_activity_date
FROM tenant_metrics_daily tm
JOIN organizations o ON o.id = tm.tenant_id
WHERE tm.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tm.tenant_id, o.name, o.tier, o.status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_activity_summary_30d_tenant ON tenant_activity_summary_30d(tenant_id);

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE tenant_metrics_daily IS 'Daily aggregated metrics per tenant - no PII, safe for Super Admin viewing';
COMMENT ON TABLE tenant_feature_usage IS 'Feature adoption and usage tracking per tenant';
COMMENT ON TABLE tenant_health_flags IS 'Health and risk indicators for tenant monitoring';
COMMENT ON TABLE observability_audit_logs IS 'Audit trail of Super Admin access to observability data';

COMMENT ON COLUMN tenant_metrics_daily.active_users_count IS 'Users who logged in on this date';
COMMENT ON COLUMN tenant_metrics_daily.storage_used_mb IS 'Total storage used in MB (documents, uploads, etc.)';
COMMENT ON COLUMN tenant_health_flags.metadata IS 'Additional context: thresholds, counts, dates, etc.';
COMMENT ON COLUMN tenant_health_flags.resolved_at IS 'NULL = active flag, timestamp = resolved';

