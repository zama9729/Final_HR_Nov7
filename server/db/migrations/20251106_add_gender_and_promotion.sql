-- Migration: Add gender field and promotion logic
-- Add gender to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

-- Add gender to onboarding_data table
ALTER TABLE onboarding_data 
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

-- Create function to check and auto-promote employees to manager based on direct reports
CREATE OR REPLACE FUNCTION check_and_promote_to_manager()
RETURNS TRIGGER AS $$
DECLARE
  direct_reports_count INTEGER;
  emp_user_id UUID;
  emp_tenant_id UUID;
  current_role TEXT;
BEGIN
  -- Only check if reporting_manager_id is being set or updated
  IF NEW.reporting_manager_id IS NOT NULL THEN
    -- Get the manager's user_id and tenant_id
    SELECT user_id, tenant_id INTO emp_user_id, emp_tenant_id
    FROM employees
    WHERE id = NEW.reporting_manager_id;
    
    IF emp_user_id IS NOT NULL THEN
      -- Count direct reports for this manager
      SELECT COUNT(*) INTO direct_reports_count
      FROM employees
      WHERE reporting_manager_id = NEW.reporting_manager_id
        AND status = 'active';
      
      -- If manager has 2 or more direct reports, promote to manager role
      IF direct_reports_count >= 2 THEN
        -- Check if already has manager role or higher
        IF NOT EXISTS (
          SELECT 1 FROM user_roles 
          WHERE user_id = emp_user_id 
          AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')
        ) THEN
          -- Promote to manager
          INSERT INTO user_roles (user_id, role, tenant_id)
          VALUES (emp_user_id, 'manager', emp_tenant_id)
          ON CONFLICT (user_id, role) DO NOTHING;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-promote when employee reporting_manager_id changes
DROP TRIGGER IF EXISTS trigger_auto_promote_on_manager_assignment ON employees;
CREATE TRIGGER trigger_auto_promote_on_manager_assignment
  AFTER INSERT OR UPDATE OF reporting_manager_id ON employees
  FOR EACH ROW
  WHEN (NEW.reporting_manager_id IS NOT NULL)
  EXECUTE FUNCTION check_and_promote_to_manager();

-- Function to check and promote all employees with 2+ direct reports (one-time fix)
CREATE OR REPLACE FUNCTION promote_existing_managers()
RETURNS INTEGER AS $$
DECLARE
  promoted_count INTEGER := 0;
  emp_record RECORD;
BEGIN
  -- Find all employees with 2+ direct reports who are not already managers
  FOR emp_record IN
    SELECT 
      e.id as emp_id,
      e.user_id,
      e.tenant_id,
      COUNT(dr.id) as direct_reports_count
    FROM employees e
    LEFT JOIN employees dr ON dr.reporting_manager_id = e.id AND dr.status = 'active'
    WHERE e.status = 'active'
    GROUP BY e.id, e.user_id, e.tenant_id
    HAVING COUNT(dr.id) >= 2
  LOOP
    -- Check if they already have manager role or higher
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = emp_record.user_id
      AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')
    ) THEN
      -- Promote to manager
      INSERT INTO user_roles (user_id, role, tenant_id)
      VALUES (emp_record.user_id, 'manager', emp_record.tenant_id)
      ON CONFLICT (user_id, role) DO NOTHING;
      
      promoted_count := promoted_count + 1;
    END IF;
  END LOOP;
  
  RETURN promoted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to promote based on performance (call this after performance review submission)
CREATE OR REPLACE FUNCTION check_performance_promotion(
  p_employee_id UUID,
  p_performance_score DECIMAL,
  p_tenant_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  emp_user_id UUID;
  avg_performance DECIMAL;
  recent_reviews_count INTEGER;
  promotion_threshold DECIMAL := 4.0; -- Minimum score for promotion consideration
BEGIN
  -- Get employee user_id
  SELECT user_id INTO emp_user_id
  FROM employees
  WHERE id = p_employee_id;
  
  IF emp_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if employee already has manager role or higher
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = emp_user_id
    AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')
  ) THEN
    RETURN FALSE; -- Already promoted
  END IF;
  
  -- Get average performance score from recent reviews (last 2 cycles)
  SELECT 
    AVG(performance_score)::DECIMAL,
    COUNT(*)
  INTO avg_performance, recent_reviews_count
  FROM performance_reviews
  WHERE employee_id = p_employee_id
    AND tenant_id = p_tenant_id
    AND status = 'submitted'
    AND performance_score IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 2;
  
  -- If average performance is above threshold and has at least 1 review
  IF avg_performance >= promotion_threshold AND recent_reviews_count >= 1 THEN
    -- Check if they have direct reports (if yes, promote to manager)
    IF EXISTS (
      SELECT 1 FROM employees
      WHERE reporting_manager_id = p_employee_id
      AND status = 'active'
    ) THEN
      -- Promote to manager
      INSERT INTO user_roles (user_id, role, tenant_id)
      VALUES (emp_user_id, 'manager', p_tenant_id)
      ON CONFLICT (user_id, role) DO NOTHING;
      
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

