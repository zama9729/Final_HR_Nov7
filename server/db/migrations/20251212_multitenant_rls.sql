-- Migration: Strengthen multi-tenant RLS using app.current_org
-- Date: 2025-12-12

-- Helper: safe tenant guard using app.current_org (fallback to legacy variables)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'org_rls_guard') THEN
    CREATE OR REPLACE FUNCTION org_rls_guard(_tenant uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    AS $func$
    BEGIN
      RETURN _tenant = COALESCE(
        NULLIF(current_setting('app.current_org', true), '')::uuid,
        NULLIF(current_setting('app.org_id', true), '')::uuid,
        NULLIF(current_setting('app.current_tenant', true), '')::uuid
      );
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    $func$;
  ELSE
    CREATE OR REPLACE FUNCTION org_rls_guard(_tenant uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    AS $func$
    BEGIN
      RETURN _tenant = COALESCE(
        NULLIF(current_setting('app.current_org', true), '')::uuid,
        NULLIF(current_setting('app.org_id', true), '')::uuid,
        NULLIF(current_setting('app.current_tenant', true), '')::uuid
      );
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    $func$;
  END IF;
END$$;

-- Enable RLS and (re)create policies for core tenant-scoped tables
-- Note: idempotent drops before creation
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'employees',
    'user_roles',
    'departments',
    'teams',
    'projects',
    'assignments',
    'leave_requests',
    'timesheets',
    'notifications',
    'schedule_assignments',
    'schedules',
    'shift_templates',
    'team_schedule_events',
    'approvals',
    'approval_audit',
    'payroll_cycles',
    'payroll_items',
    'payroll_settings',
    'compensation_structures'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_%I_select ON %I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_%I_modify ON %I;', tbl, tbl);
    EXECUTE format($p$
      CREATE POLICY org_isolation_%I_select ON %I
        USING (org_rls_guard(tenant_id));
    $p$, tbl, tbl);
    EXECUTE format($p$
      CREATE POLICY org_isolation_%I_modify ON %I
        USING (org_rls_guard(tenant_id))
        WITH CHECK (org_rls_guard(tenant_id));
    $p$, tbl, tbl);
  END LOOP;
END$$;

-- Ensure tenant_id indexes (concurrent where possible)
DO $$
DECLARE
  idx text;
  tbl text;
BEGIN
  -- Indexes created if missing; CONCURRENTLY not allowed inside transaction, so we rely on IF NOT EXISTS where supported.
  FOREACH tbl IN ARRAY ARRAY[
    'profiles','employees','user_roles','departments','teams','projects','assignments',
    'leave_requests','timesheets','notifications','schedule_assignments','schedules',
    'shift_templates','team_schedule_events','approvals','approval_audit','payroll_cycles',
    'payroll_items','payroll_settings','compensation_structures'
  ]
  LOOP
    idx := format('idx_%s_tenant', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(tenant_id);', idx, tbl);
  END LOOP;
END$$;

-- Admin bypass policy (for explicit DB roles only; does not bypass app auth)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_superuser') THEN
    -- Optional: create a dedicated db role for admin bypass
    -- CREATE ROLE app_superuser;
    NULL;
  END IF;
END$$;

-- Example policy for a DB superuser role (kept restrictive)
-- Adjust if you manage a dedicated admin role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_superuser') THEN
    EXECUTE 'DROP POLICY IF EXISTS admin_bypass_profiles ON profiles';
    EXECUTE 'CREATE POLICY admin_bypass_profiles ON profiles FOR ALL TO app_superuser USING (true) WITH CHECK (true)';
  END IF;
END$$;

