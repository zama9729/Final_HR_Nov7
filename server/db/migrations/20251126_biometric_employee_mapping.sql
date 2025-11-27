-- Biometric Device Employee Mapping
-- Maps device user codes to employee IDs for biometric attendance integration

CREATE TABLE IF NOT EXISTS biometric_employee_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_user_code VARCHAR(50) NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  device_id VARCHAR(100), -- Optional: which device this mapping is for
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, device_user_code),
  UNIQUE (tenant_id, employee_id, device_id) -- One employee can map to different devices
);

CREATE INDEX IF NOT EXISTS idx_biometric_map_tenant ON biometric_employee_map(tenant_id);
CREATE INDEX IF NOT EXISTS idx_biometric_map_employee ON biometric_employee_map(employee_id);
CREATE INDEX IF NOT EXISTS idx_biometric_map_device_code ON biometric_employee_map(device_user_code);
CREATE INDEX IF NOT EXISTS idx_biometric_map_active ON biometric_employee_map(tenant_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_biometric_employee_map_updated_at
  BEFORE UPDATE ON biometric_employee_map
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE biometric_employee_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_biometric_map ON biometric_employee_map;
CREATE POLICY org_isolation_biometric_map ON biometric_employee_map
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

