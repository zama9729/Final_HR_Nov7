-- Fix skills table unique constraint for ON CONFLICT
-- The skills route uses ON CONFLICT but the unique constraint doesn't exist

-- Drop existing unique constraint/index if it exists (in case it's named differently)
DROP INDEX IF EXISTS ux_skills_employee_name_tenant;
DROP INDEX IF EXISTS ux_skills_employee_name;
DROP INDEX IF EXISTS skills_employee_id_name_key;
DROP INDEX IF EXISTS skills_employee_id_lower_name_key;

-- Drop constraint if exists
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_employee_id_name_key;
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_employee_id_lower_name_key;
ALTER TABLE skills DROP CONSTRAINT IF EXISTS ux_skills_employee_name_tenant;
ALTER TABLE skills DROP CONSTRAINT IF EXISTS ux_skills_employee_name;

-- Create unique index on (tenant_id, employee_id, lower(name)) for case-insensitive uniqueness
-- This supports multi-tenant and ensures one skill per name (case-insensitive) per employee per tenant
CREATE UNIQUE INDEX IF NOT EXISTS ux_skills_employee_name_tenant 
  ON skills(tenant_id, employee_id, lower(name));

COMMENT ON INDEX ux_skills_employee_name_tenant IS 'Ensures one skill per name (case-insensitive) per employee per tenant';

