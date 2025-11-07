-- Add presence status to employees table
-- Status options: online, away, out_of_office, break

ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS presence_status TEXT DEFAULT 'online' 
CHECK (presence_status IN ('online', 'away', 'out_of_office', 'break'));

-- Add last_presence_update timestamp to track when status was last changed
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS last_presence_update TIMESTAMPTZ DEFAULT now();

-- Add index for presence queries
CREATE INDEX IF NOT EXISTS idx_employees_presence_status ON employees(presence_status);

-- Create function to automatically set Out of Office on leave approval
CREATE OR REPLACE FUNCTION update_presence_on_leave_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- When leave is approved, set presence to 'out_of_office'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE employees 
    SET presence_status = 'out_of_office',
        last_presence_update = now()
    WHERE id = NEW.employee_id;
  END IF;
  
  -- When leave ends, reset to 'online' if still in 'out_of_office'
  IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    UPDATE employees
    SET presence_status = 'online',
        last_presence_update = now()
    WHERE id = NEW.employee_id 
      AND presence_status = 'out_of_office'
      AND NOT EXISTS (
        SELECT 1 FROM leave_requests lr 
        WHERE lr.employee_id = NEW.employee_id 
          AND lr.status = 'approved'
          AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update presence on leave approval/rejection
DROP TRIGGER IF EXISTS trigger_update_presence_on_leave ON leave_requests;
CREATE TRIGGER trigger_update_presence_on_leave
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_presence_on_leave_approval();

-- Create function to check if employee has active approved leave
CREATE OR REPLACE FUNCTION has_active_approved_leave(emp_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leave_requests
    WHERE employee_id = emp_id
      AND status = 'approved'
      AND CURRENT_DATE BETWEEN start_date AND end_date
  );
$$;

