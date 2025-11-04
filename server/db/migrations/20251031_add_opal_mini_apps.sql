-- Opal Mini Apps table
-- Stores Opal-created mini apps that can be used by AI Assistant

CREATE TABLE IF NOT EXISTS opal_mini_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'leave', 'timesheet', 'employee', 'workflow', etc.
  opal_app_id TEXT, -- ID from Opal platform
  opal_app_url TEXT, -- URL to Opal mini app
  app_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Opal app configuration
  function_name TEXT, -- Function name for AI to call this mini app
  enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opal_mini_apps_tenant ON opal_mini_apps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_opal_mini_apps_category ON opal_mini_apps(category);
CREATE INDEX IF NOT EXISTS idx_opal_mini_apps_function ON opal_mini_apps(function_name);
CREATE INDEX IF NOT EXISTS idx_opal_mini_apps_enabled ON opal_mini_apps(enabled) WHERE enabled = true;

-- Trigger for updated_at
CREATE TRIGGER update_opal_mini_apps_updated_at
  BEFORE UPDATE ON opal_mini_apps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();




