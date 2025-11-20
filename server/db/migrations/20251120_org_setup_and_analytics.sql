-- ============================================================================
-- Migration: 20251120_org_setup_and_analytics.sql
-- Purpose  : Introduce Organization Setup workflow data, branch/dept/team
--            hierarchy, policy templates/versioning, and analytics schema
-- ============================================================================

-- Safety: ensure UUID + helper functions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'standard';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS geo_region TEXT;

-- ============================================================================
-- Organization setup status
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_setup_status (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  current_step TEXT NOT NULL DEFAULT 'org-details',
  steps JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_setup_status_completed
  ON org_setup_status(is_completed);

ALTER TABLE org_setup_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_org_setup_status ON org_setup_status;
CREATE POLICY org_isolation_org_setup_status ON org_setup_status
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE TRIGGER trg_org_setup_status_updated_at
  BEFORE UPDATE ON org_setup_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Attendance settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_attendance_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  capture_method TEXT NOT NULL DEFAULT 'timesheets' CHECK (capture_method IN ('timesheets','clock_in_out')),
  enable_geofence BOOLEAN NOT NULL DEFAULT false,
  enable_kiosk BOOLEAN NOT NULL DEFAULT false,
  default_week_start INTEGER NOT NULL DEFAULT 1 CHECK (default_week_start BETWEEN 0 AND 6),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_attendance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_attendance_settings ON org_attendance_settings;
CREATE POLICY org_isolation_attendance_settings ON org_attendance_settings
  USING (org_id = current_setting('app.org_id', true)::uuid);


-- ============================================================================
-- Branch / Department / Team hierarchy
-- ============================================================================

CREATE TABLE IF NOT EXISTS holiday_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region_code TEXT,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pay_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cycle TEXT NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'INR',
  proration_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS org_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  holiday_calendar_id UUID REFERENCES holiday_calendars(id) ON DELETE SET NULL,
  pay_group_id UUID REFERENCES pay_groups(id) ON DELETE SET NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_org_branches_org ON org_branches(org_id);
CREATE INDEX IF NOT EXISTS idx_org_branches_active ON org_branches(org_id, is_active);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  host_branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_departments_org_name
  ON departments(org_id, LOWER(name));

CREATE UNIQUE INDEX IF NOT EXISTS ux_teams_org_branch_name
  ON teams(org_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name));

CREATE TABLE IF NOT EXISTS employee_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  pay_group_id UUID REFERENCES pay_groups(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  role TEXT,
  fte NUMERIC(4,2) DEFAULT 1.0 CHECK (fte > 0 AND fte <= 2.0),
  start_date DATE NOT NULL DEFAULT now(),
  end_date DATE,
  is_home BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_assignments_org ON employee_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_user ON employee_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_branch ON employee_assignments(branch_id);

CREATE TABLE IF NOT EXISTS timesheet_assignment_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  segment_start DATE NOT NULL,
  segment_end DATE NOT NULL,
  fte NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  pay_group_id UUID REFERENCES pay_groups(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  hours_worked NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(timesheet_id, assignment_id, segment_start)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_segments_timesheet ON timesheet_assignment_segments(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_segments_assignment ON timesheet_assignment_segments(assignment_id);

-- Ensure legacy tables carry tenant context
ALTER TABLE IF EXISTS skills
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_skills_tenant ON skills(tenant_id);

-- RLS enablement
ALTER TABLE holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_assignment_segments ENABLE ROW LEVEL SECURITY;

-- Shared policy helper
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

-- Policies
DROP POLICY IF EXISTS org_isolation_holiday_calendars ON holiday_calendars;
CREATE POLICY org_isolation_holiday_calendars ON holiday_calendars
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_pay_groups ON pay_groups;
CREATE POLICY org_isolation_pay_groups ON pay_groups
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_org_branches ON org_branches;
CREATE POLICY org_isolation_org_branches ON org_branches
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_departments ON departments;
CREATE POLICY org_isolation_departments ON departments
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_teams ON teams;
CREATE POLICY org_isolation_teams ON teams
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_employee_assignments ON employee_assignments;
CREATE POLICY org_isolation_employee_assignments ON employee_assignments
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_timesheet_segments ON timesheet_assignment_segments;
CREATE POLICY org_isolation_timesheet_segments ON timesheet_assignment_segments
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = timesheet_assignment_segments.employee_id
        AND org_rls_guard(e.tenant_id)
    )
  );

-- ============================================================================
-- Policy templates + org policies
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'policy_status'
  ) THEN
    CREATE TYPE policy_status AS ENUM ('draft', 'active', 'retired');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'super_user'
  ) THEN
    ALTER TYPE app_role ADD VALUE 'super_user';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS policy_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'IN',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  legal_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES policy_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status policy_status NOT NULL DEFAULT 'draft',
  latest_version INTEGER NOT NULL DEFAULT 1,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_policy_id UUID NOT NULL REFERENCES org_policies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  effective_from DATE NOT NULL DEFAULT now(),
  effective_to DATE,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  legal_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_policy_id, version)
);

CREATE TABLE IF NOT EXISTS policy_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_policy_id UUID NOT NULL REFERENCES org_policies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_policy_id, version, key)
);

ALTER TABLE org_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_org_policies ON org_policies;
CREATE POLICY org_isolation_org_policies ON org_policies
  USING (org_rls_guard(org_id));

DROP POLICY IF EXISTS org_isolation_policy_versions ON policy_versions;
CREATE POLICY org_isolation_policy_versions ON policy_versions
  USING (
    EXISTS (
      SELECT 1 FROM org_policies op
      WHERE op.id = policy_versions.org_policy_id
        AND org_rls_guard(op.org_id)
    )
  );

DROP POLICY IF EXISTS org_isolation_policy_values ON policy_values;
CREATE POLICY org_isolation_policy_values ON policy_values
  USING (
    EXISTS (
      SELECT 1 FROM org_policies op
      WHERE op.id = policy_values.org_policy_id
        AND org_rls_guard(op.org_id)
    )
  );

-- ============================================================================
-- Analytics schema for super admin
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.organizations_daily (
  org_date DATE NOT NULL,
  org_count_new INTEGER NOT NULL DEFAULT 0,
  plan_tier TEXT,
  geo_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_date, plan_tier, geo_region)
);

CREATE TABLE IF NOT EXISTS analytics.employee_distribution (
  org_id_bucket TEXT NOT NULL,
  employee_count_bucket TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  org_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, org_id_bucket, employee_count_bucket)
);

CREATE TABLE IF NOT EXISTS analytics.feature_adoption (
  feature_key TEXT NOT NULL,
  org_count INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, snapshot_date)
);

-- Aggregates to support dashboards
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.org_signup_summary AS
SELECT
  date_trunc('day', created_at)::date AS signup_date,
  COUNT(*) AS org_count,
  COUNT(*) FILTER (WHERE company_size IN ('1-10','11-50')) AS small_orgs,
  COUNT(*) FILTER (WHERE company_size IN ('51-200','201-500')) AS growth_orgs
FROM organizations
GROUP BY 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.org_activity_summary AS
SELECT
  o.id AS org_id,
  MIN(o.created_at)::date AS signup_date,
  MAX(ts.updated_at)::date AS last_timesheet_activity,
  MAX(pr.updated_at)::date AS last_payroll_activity
FROM organizations o
LEFT JOIN timesheets ts ON ts.tenant_id = o.id
LEFT JOIN payroll_runs pr ON pr.tenant_id = o.id
GROUP BY o.id;

-- Indexes for faster refresh/export
CREATE INDEX IF NOT EXISTS idx_org_signup_summary_date
  ON analytics.org_signup_summary(signup_date);

CREATE INDEX IF NOT EXISTS idx_org_activity_summary_last_activity
  ON analytics.org_activity_summary(last_timesheet_activity, last_payroll_activity);

-- Helper to refresh materialized views
CREATE OR REPLACE FUNCTION analytics.refresh_org_views()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.org_signup_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.org_activity_summary;
END;
$$;

-- ============================================================================
-- Seed core policy templates (idempotent)
-- ============================================================================

INSERT INTO policy_templates (id, name, country, tags, sections, variables, legal_refs)
VALUES
  (
    '4dc5b2ba-02ff-4a4e-9e2c-0c6e7c111111',
    'Probation & Confirmation',
    'IN',
    ARRAY['india','probation','onboarding'],
    '[
      {"title": "Probation Period", "body": "Employees will undergo a probation period of {{probation_months}} months."},
      {"title": "Confirmation", "body": "Confirmation review will occur in the final month of probation."}
    ]'::jsonb,
    '{"probation_months": {"label": "Probation Months", "type": "number", "default": 3}}'::jsonb,
    '{"references": ["Shops & Establishments Act"]}'::jsonb
  ),
  (
    'e9188d39-0a7d-4bdc-8b33-0e9c2d522222',
    'POSH 2013 Compliance',
    'IN',
    ARRAY['india','posh','compliance'],
    '[
      {"title": "Scope", "body": "This policy complies with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013."},
      {"title": "Committee", "body": "An Internal Committee will handle complaints with confidentiality."}
    ]'::jsonb,
    '{"committee_members": {"label": "Committee Members", "type": "text"}}'::jsonb,
    '{"references": ["POSH Act 2013"]}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Auditing for super user access logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS super_user_audit (
  id BIGSERIAL PRIMARY KEY,
  super_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS super_users (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  mfa_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_mfa_at TIMESTAMPTZ
);


