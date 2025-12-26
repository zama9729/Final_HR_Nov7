-- Super Admin Module Migration
-- Adds tier-based pricing, feature flags, and audit logging

-- Create subscription tier enum
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('basic', 'premium', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create tenant status enum
DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'inactive', 'suspended', 'trial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add tier and status columns to organizations table
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS tier subscription_tier DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS status tenant_status DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create feature_flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) UNIQUE NOT NULL,
  feature_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled_by_default BOOLEAN DEFAULT false,
  tier_basic BOOLEAN DEFAULT false,
  tier_premium BOOLEAN DEFAULT true,
  tier_enterprise BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(feature_key);

-- Create tenant_features join table
CREATE TABLE IF NOT EXISTS tenant_features (
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL REFERENCES feature_flags(feature_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  overridden BOOLEAN NOT NULL DEFAULT false, -- true if manually overridden from tier defaults
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant ON tenant_features(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_features_feature ON tenant_features(feature_key);

-- Create superadmin_audit_logs table
CREATE TABLE IF NOT EXISTS superadmin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  superadmin_email VARCHAR(255), -- Store email for audit trail even if user is deleted
  action VARCHAR(100) NOT NULL, -- e.g., 'tier_changed', 'feature_toggled', 'tenant_activated'
  tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  tenant_name VARCHAR(255), -- Store name for audit trail
  metadata JSONB, -- Flexible storage for action-specific data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_superadmin ON superadmin_audit_logs(superadmin_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_tenant ON superadmin_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_action ON superadmin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_created ON superadmin_audit_logs(created_at DESC);

-- Insert default feature flags
INSERT INTO feature_flags (feature_key, feature_name, description, enabled_by_default, tier_basic, tier_premium, tier_enterprise) VALUES
  ('payroll', 'Payroll Management', 'Full payroll processing and management', false, false, true, true),
  ('advanced_analytics', 'Advanced Analytics', 'Advanced reporting and analytics dashboard', false, false, true, true),
  ('ai_assistant', 'AI Assistant', 'AI-powered assistant for HR queries', false, false, true, true),
  ('custom_workflows', 'Custom Workflows', 'Create and manage custom approval workflows', false, false, false, true),
  ('api_access', 'API Access', 'REST API access for integrations', false, false, true, true),
  ('white_label', 'White Label', 'Custom branding and white-label options', false, false, false, true),
  ('priority_support', 'Priority Support', 'Priority customer support', false, false, true, true),
  ('multi_branch', 'Multi-Branch Management', 'Manage multiple office branches', false, false, true, true),
  ('biometric_integration', 'Biometric Integration', 'Biometric device integration for attendance', false, false, false, true),
  ('advanced_onboarding', 'Advanced Onboarding', 'Enhanced onboarding workflows and automation', false, false, true, true),
  ('performance_reviews', 'Performance Reviews', 'Performance review and appraisal cycles', false, true, true, true),
  ('leave_management', 'Leave Management', 'Leave request and approval management', false, true, true, true),
  ('attendance_tracking', 'Attendance Tracking', 'Employee attendance tracking', false, true, true, true),
  ('timesheet', 'Timesheet Management', 'Timesheet submission and approval', false, true, true, true),
  ('employee_directory', 'Employee Directory', 'Employee directory and profiles', false, true, true, true),
  ('document_management', 'Document Management', 'Document storage and management', false, true, true, true),
  ('team_scheduling', 'Team Scheduling', 'Team shift and schedule management', false, false, true, true),
  ('project_management', 'Project Management', 'Project and task management', false, false, true, true),
  ('expense_management', 'Expense Management', 'Expense tracking and reimbursement', false, false, true, true),
  ('background_checks', 'Background Checks', 'Employee background verification', false, false, false, true)
ON CONFLICT (feature_key) DO NOTHING;

-- Function to sync tenant features based on tier
CREATE OR REPLACE FUNCTION sync_tenant_features()
RETURNS TRIGGER AS $$
DECLARE
  feature_record RECORD;
BEGIN
  -- If tier changed, update all features based on new tier
  IF TG_OP = 'UPDATE' AND (OLD.tier IS DISTINCT FROM NEW.tier) THEN
    -- Delete existing feature overrides that match tier defaults
    DELETE FROM tenant_features 
    WHERE tenant_id = NEW.id 
      AND overridden = false;
    
    -- Insert features based on new tier
    FOR feature_record IN 
      SELECT feature_key, 
             CASE 
               WHEN NEW.tier = 'basic' THEN tier_basic
               WHEN NEW.tier = 'premium' THEN tier_premium
               WHEN NEW.tier = 'enterprise' THEN tier_enterprise
               ELSE false
             END AS enabled
      FROM feature_flags
    LOOP
      INSERT INTO tenant_features (tenant_id, feature_key, enabled, overridden)
      VALUES (NEW.id, feature_record.feature_key, feature_record.enabled, false)
      ON CONFLICT (tenant_id, feature_key) 
      DO UPDATE SET 
        enabled = feature_record.enabled,
        overridden = false,
        updated_at = now();
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-sync features on tier change
DROP TRIGGER IF EXISTS trigger_sync_tenant_features ON organizations;
CREATE TRIGGER trigger_sync_tenant_features
  AFTER UPDATE OF tier ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION sync_tenant_features();

-- Function to initialize features for new tenants
CREATE OR REPLACE FUNCTION initialize_tenant_features()
RETURNS TRIGGER AS $$
DECLARE
  feature_record RECORD;
BEGIN
  -- Insert default features based on tier
  FOR feature_record IN 
    SELECT feature_key, 
           CASE 
             WHEN NEW.tier = 'basic' THEN tier_basic
             WHEN NEW.tier = 'premium' THEN tier_premium
             WHEN NEW.tier = 'enterprise' THEN tier_enterprise
             ELSE false
           END AS enabled
    FROM feature_flags
  LOOP
    INSERT INTO tenant_features (tenant_id, feature_key, enabled, overridden)
    VALUES (NEW.id, feature_record.feature_key, feature_record.enabled, false);
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to initialize features for new tenants
DROP TRIGGER IF EXISTS trigger_initialize_tenant_features ON organizations;
CREATE TRIGGER trigger_initialize_tenant_features
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION initialize_tenant_features();

-- Update existing organizations to have basic tier features if they don't have tier set
DO $$
DECLARE
  org_record RECORD;
  feature_record RECORD;
BEGIN
  FOR org_record IN SELECT id, COALESCE(tier, 'basic'::subscription_tier) AS current_tier FROM organizations WHERE tier IS NULL
  LOOP
    UPDATE organizations SET tier = 'basic' WHERE id = org_record.id;
    
    -- Initialize features for existing tenants
    FOR feature_record IN 
      SELECT feature_key, 
             CASE 
               WHEN org_record.current_tier = 'basic' THEN tier_basic
               WHEN org_record.current_tier = 'premium' THEN tier_premium
               WHEN org_record.current_tier = 'enterprise' THEN tier_enterprise
               ELSE false
             END AS enabled
      FROM feature_flags
    LOOP
      INSERT INTO tenant_features (tenant_id, feature_key, enabled, overridden)
      VALUES (org_record.id, feature_record.feature_key, feature_record.enabled, false)
      ON CONFLICT (tenant_id, feature_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON TABLE feature_flags IS 'Master list of all available features in the platform';
COMMENT ON TABLE tenant_features IS 'Feature flags per tenant with override capability';
COMMENT ON TABLE superadmin_audit_logs IS 'Audit trail for all Super Admin actions';

