-- AI Configuration table
-- Stores AI assistant permissions per organization

CREATE TABLE IF NOT EXISTS ai_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Data access permissions
  can_access_projects BOOLEAN DEFAULT true,
  can_access_timesheets BOOLEAN DEFAULT true,
  can_access_leaves BOOLEAN DEFAULT true,
  can_access_attendance BOOLEAN DEFAULT true,
  can_access_expenses BOOLEAN DEFAULT true,
  can_access_onboarding BOOLEAN DEFAULT true,
  can_access_payroll BOOLEAN DEFAULT true,
  can_access_analytics BOOLEAN DEFAULT true,
  can_access_employee_directory BOOLEAN DEFAULT true,
  can_access_notifications BOOLEAN DEFAULT true,
  
  -- General settings
  enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_configuration_tenant ON ai_configuration(tenant_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_configuration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_configuration_updated_at
  BEFORE UPDATE ON ai_configuration
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_configuration_updated_at();

-- RLS policies
ALTER TABLE ai_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_configuration_tenant_isolation ON ai_configuration
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Insert default configuration for existing organizations
INSERT INTO ai_configuration (tenant_id, enabled)
SELECT id, true
FROM organizations
WHERE id NOT IN (SELECT tenant_id FROM ai_configuration)
ON CONFLICT (tenant_id) DO NOTHING;





