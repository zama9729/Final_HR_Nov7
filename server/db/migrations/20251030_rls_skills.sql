-- Add tenant_id to skills-related tables and enable RLS with org-level policies

ALTER TABLE skills ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE employee_projects ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Backfill tenant_id from employees -> profiles
UPDATE skills s SET tenant_id = p.tenant_id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE s.employee_id = e.id AND s.tenant_id IS NULL;
UPDATE certifications c SET tenant_id = p.tenant_id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE c.employee_id = e.id AND c.tenant_id IS NULL;
UPDATE employee_projects ep SET tenant_id = p.tenant_id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE ep.employee_id = e.id AND ep.tenant_id IS NULL;

-- Make tenant_id NOT NULL going forward
ALTER TABLE skills ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE certifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE employee_projects ALTER COLUMN tenant_id SET NOT NULL;

-- Helper function to fetch current tenant from session setting
CREATE OR REPLACE FUNCTION current_tenant()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Enable RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_projects ENABLE ROW LEVEL SECURITY;

-- Policies: allow access only to rows for current tenant
DROP POLICY IF EXISTS skills_tenant_isolation ON skills;
CREATE POLICY skills_tenant_isolation ON skills USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());

DROP POLICY IF EXISTS certs_tenant_isolation ON certifications;
CREATE POLICY certs_tenant_isolation ON certifications USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());

DROP POLICY IF EXISTS emp_projects_tenant_isolation ON employee_projects;
CREATE POLICY emp_projects_tenant_isolation ON employee_projects USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());


