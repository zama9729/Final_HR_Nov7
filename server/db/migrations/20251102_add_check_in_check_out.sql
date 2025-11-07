-- Check-in/Check-out tracking table
-- This allows employees to track their attendance with multiple check-in/check-out pairs per day

CREATE TABLE IF NOT EXISTS check_in_check_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  work_date DATE NOT NULL,
  hours_worked DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE
);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_check_in_check_outs_employee ON check_in_check_outs(employee_id);
CREATE INDEX IF NOT EXISTS idx_check_in_check_outs_date ON check_in_check_outs(work_date);
CREATE INDEX IF NOT EXISTS idx_check_in_check_outs_employee_date ON check_in_check_outs(employee_id, work_date);

-- Create trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_check_in_check_outs_updated_at'
  ) THEN
    CREATE TRIGGER update_check_in_check_outs_updated_at
    BEFORE UPDATE ON check_in_check_outs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Function to automatically calculate hours and set work_date when check_out_time is set
CREATE OR REPLACE FUNCTION calculate_check_in_hours()
RETURNS TRIGGER AS $$
BEGIN
  -- Set work_date from check_in_time if not provided
  IF NEW.work_date IS NULL THEN
    NEW.work_date := NEW.check_in_time::date;
  END IF;
  
  -- Calculate hours worked from check_in_time to check_out_time
  IF NEW.check_out_time IS NOT NULL AND NEW.check_in_time IS NOT NULL THEN
    NEW.hours_worked := EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600.0;
  ELSE
    NEW.hours_worked := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to calculate hours
DROP TRIGGER IF EXISTS trigger_calculate_check_in_hours ON check_in_check_outs;
CREATE TRIGGER trigger_calculate_check_in_hours
  BEFORE INSERT OR UPDATE ON check_in_check_outs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_check_in_hours();

-- Index for tenant queries
CREATE INDEX IF NOT EXISTS idx_check_in_check_outs_tenant ON check_in_check_outs(tenant_id);

