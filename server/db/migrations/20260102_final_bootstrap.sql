-- 2026-01-02 Final bootstrap migration for HR app
-- This migration is idempotent and can be run on a fresh or existing database.
-- It ensures all newer features have the tables/columns they require.

-------------------------------
-- Background checks extras
-------------------------------

ALTER TABLE background_checks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-------------------------------
-- Employee past projects
-------------------------------

-- Core table (if not already created by earlier migrations)
CREATE TABLE IF NOT EXISTS employee_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  role TEXT,
  start_date DATE,
  end_date DATE,
  technologies TEXT[],
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist even if table was created with an older schema
ALTER TABLE employee_projects
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS technologies TEXT[],
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_emp_projects_employee ON employee_projects(employee_id);

-------------------------------
-- Promotions & employee events
-------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_status') THEN
    CREATE TYPE promotion_status AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  appraisal_id UUID REFERENCES performance_reviews(id) ON DELETE SET NULL,

  old_designation TEXT,
  old_grade TEXT,
  old_department_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  old_ctc NUMERIC(12, 2),

  new_designation TEXT NOT NULL,
  new_grade TEXT,
  new_department_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  new_ctc NUMERIC(12, 2),

  reason_text TEXT,
  recommendation_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status promotion_status NOT NULL DEFAULT 'DRAFT',
  effective_date DATE NOT NULL,

  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,

  CONSTRAINT valid_effective_date CHECK (effective_date >= DATE(created_at))
);

CREATE TABLE IF NOT EXISTS employee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,

  source_table TEXT,
  source_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_event_date CHECK (event_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_promotions_org ON promotions(org_id);
CREATE INDEX IF NOT EXISTS idx_promotions_employee ON promotions(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_promotions_effective_date
  ON promotions(org_id, effective_date)
  WHERE status = 'APPROVED' AND applied = false;
CREATE INDEX IF NOT EXISTS idx_promotions_appraisal
  ON promotions(appraisal_id) WHERE appraisal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_events_org ON employee_events(org_id);
CREATE INDEX IF NOT EXISTS idx_employee_events_employee ON employee_events(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_events_date
  ON employee_events(org_id, employee_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_events_type
  ON employee_events(org_id, employee_id, event_type);
CREATE INDEX IF NOT EXISTS idx_employee_events_source
  ON employee_events(source_table, source_id) WHERE source_table IS NOT NULL;

-- Simple updated_at trigger for promotions if not already present
CREATE OR REPLACE FUNCTION update_promotions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_promotions_updated_at') THEN
    CREATE TRIGGER update_promotions_updated_at
      BEFORE UPDATE ON promotions
      FOR EACH ROW
      EXECUTE FUNCTION update_promotions_updated_at();
  END IF;
END
$$;

-- RLS (safe to run even if already enabled)
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_promotions ON promotions;
CREATE POLICY org_isolation_promotions ON promotions
  USING (
    org_id IN (
      SELECT tenant_id FROM profiles WHERE id = current_setting('app.current_user_id', true)::UUID
    )
  );

DROP POLICY IF EXISTS org_isolation_employee_events ON employee_events;
CREATE POLICY org_isolation_employee_events ON employee_events
  USING (
    org_id IN (
      SELECT tenant_id FROM profiles WHERE id = current_setting('app.current_user_id', true)::UUID
    )
  );

-------------------------------
-- Onboarding birthdays
-------------------------------

ALTER TABLE onboarding_data
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-------------------------------
-- Smart Memo & personal calendar
-------------------------------

-- Personal calendar events (used by Smart Memo and personal calendar)
CREATE TABLE IF NOT EXISTS personal_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  source_memo_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_tenant
  ON personal_calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_employee
  ON personal_calendar_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_user
  ON personal_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_date
  ON personal_calendar_events(event_date);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  source_memo_text TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_unread
  ON reminders(user_id, is_read, is_dismissed)
  WHERE is_read = false AND is_dismissed = false;

-- Team schedule events (team calendar)
CREATE TABLE IF NOT EXISTS team_schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'event',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_schedule_events
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_with_employee_ids UUID[],
  ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES smart_memos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_schedule_events_tenant
  ON team_schedule_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_team
  ON team_schedule_events(team_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_employee
  ON team_schedule_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_date
  ON team_schedule_events(start_date, end_date);

-- Smart memo and mentions
CREATE TABLE IF NOT EXISTS smart_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  memo_text TEXT NOT NULL,
  base_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memo_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id UUID NOT NULL REFERENCES smart_memos(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentioned_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_memos_tenant ON smart_memos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_smart_memos_employee ON smart_memos(employee_id);
CREATE INDEX IF NOT EXISTS idx_memo_mentions_memo ON memo_mentions(memo_id);
CREATE INDEX IF NOT EXISTS idx_memo_mentions_employee ON memo_mentions(mentioned_employee_id);

-- RLS for team_schedule_events using app.org_id/session org context
ALTER TABLE team_schedule_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_team_schedule_events ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_select ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_insert ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_update ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_delete ON team_schedule_events;

CREATE POLICY team_schedule_events_select ON team_schedule_events
  FOR SELECT
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY team_schedule_events_insert ON team_schedule_events
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY team_schedule_events_update ON team_schedule_events
  FOR UPDATE
  USING (tenant_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY team_schedule_events_delete ON team_schedule_events
  FOR DELETE
  USING (tenant_id = current_setting('app.org_id', true)::uuid);


