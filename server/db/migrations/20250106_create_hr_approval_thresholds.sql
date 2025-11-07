-- Create hr_approval_thresholds table if it doesn't exist
CREATE TABLE IF NOT EXISTS hr_approval_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  leave_days_hr_threshold INTEGER NOT NULL DEFAULT 10,
  expense_amount_hr_threshold NUMERIC(12,2) NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_approval_thresholds_tenant ON hr_approval_thresholds(tenant_id);

-- Create trigger for updated_at if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_hr_approval_thresholds_updated_at'
  ) THEN
    CREATE TRIGGER update_hr_approval_thresholds_updated_at
      BEFORE UPDATE ON hr_approval_thresholds
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

