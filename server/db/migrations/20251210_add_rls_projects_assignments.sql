-- Add RLS policies for projects and assignments tables
-- Ensure organization-level data isolation

-- Ensure org_rls_guard function exists (from 20251120_org_setup_and_analytics.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'org_rls_guard'
  ) THEN
    CREATE OR REPLACE FUNCTION org_rls_guard(org UUID)
    RETURNS BOOLEAN LANGUAGE plpgsql AS $func$
    BEGIN
      RETURN org = current_setting('app.org_id', true)::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    $func$;
  END IF;
END $$;

-- Enable RLS on projects and assignments if not already enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Use org_rls_guard function for consistency with other tables
-- This function checks app.org_id session variable
DROP POLICY IF EXISTS org_isolation_projects ON projects;
CREATE POLICY org_isolation_projects ON projects
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_assignments ON assignments;
CREATE POLICY org_isolation_assignments ON assignments
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = assignments.project_id
        AND org_rls_guard(p.org_id)
    )
  );

-- Also ensure skills RLS uses the same pattern for consistency
-- Update skills policy to use org_rls_guard if tenant_id matches org_id pattern
-- Note: skills uses tenant_id, which should match org_id for employees
-- Only update if RLS is enabled on these tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'skills' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS skills_tenant_isolation ON skills;
    CREATE POLICY skills_tenant_isolation ON skills
      USING (org_rls_guard(tenant_id));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'certifications' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS certs_tenant_isolation ON certifications;
    CREATE POLICY certs_tenant_isolation ON certifications
      USING (org_rls_guard(tenant_id));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'employee_projects' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS emp_projects_tenant_isolation ON employee_projects;
    CREATE POLICY emp_projects_tenant_isolation ON employee_projects
      USING (org_rls_guard(tenant_id));
  END IF;
END $$;

