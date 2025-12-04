-- Realtime timesheet support: raw punches, daily summaries, intervals, and audit

-- punches (raw clock events, separate from attendance_events)
CREATE TABLE IF NOT EXISTS punches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('IN','OUT','EDIT','INVALID')),
  "timestamp" TIMESTAMPTZ NOT NULL,
  timestamp_local TIMESTAMP NOT NULL,
  source TEXT,
  notes TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ,
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_punches_employee_ts
  ON punches (employee_id, "timestamp");

CREATE INDEX IF NOT EXISTS idx_punches_tenant_employee_ts
  ON punches (tenant_id, employee_id, "timestamp");

-- Daily summary per employee per date
CREATE TABLE IF NOT EXISTS timesheet_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "date" DATE NOT NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  rounded_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending','approved','rejected','locked')),
  last_recomputed_at TIMESTAMPTZ,
  approval_version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheet_days_emp_date
  ON timesheet_days (employee_id, "date");

CREATE INDEX IF NOT EXISTS idx_timesheet_days_tenant_emp_date
  ON timesheet_days (tenant_id, employee_id, "date");

CREATE INDEX IF NOT EXISTS idx_timesheet_days_status
  ON timesheet_days (status);

-- Materialised intervals for each day (for UI + audit)
CREATE TABLE IF NOT EXISTS timesheet_day_intervals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_day_id UUID NOT NULL REFERENCES timesheet_days(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  in_ts TIMESTAMPTZ,
  out_ts TIMESTAMPTZ,
  minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'punch'
    CHECK (source IN ('punch','manual','import')),
  flag TEXT NOT NULL DEFAULT 'OK'
    CHECK (flag IN ('OK','MISSING_IN','MISSING_OUT','OVERLAP','BREAK','AUTO_DEDUCT','UNRESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_timesheet_day_intervals_day_seq
  ON timesheet_day_intervals (timesheet_day_id, sequence);

-- Punch audit trail for manual edits
CREATE TABLE IF NOT EXISTS punch_audit (
  audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  punch_id UUID NOT NULL REFERENCES punches(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_punch_audit_punch
  ON punch_audit (punch_id);

CREATE INDEX IF NOT EXISTS idx_punch_audit_emp_changed
  ON punch_audit (employee_id, changed_at);

-- Timesheet approval events history
CREATE TABLE IF NOT EXISTS timesheet_approval_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_day_id UUID NOT NULL REFERENCES timesheet_days(id) ON DELETE CASCADE,
  approval_version INTEGER NOT NULL,
  status_before TEXT,
  status_after TEXT,
  actor_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);



