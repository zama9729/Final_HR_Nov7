-- Timesheet clock events and task schema

CREATE TABLE IF NOT EXISTS timesheet_clock_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('in','out')),
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_accuracy DOUBLE PRECISION,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_open BOOLEAN DEFAULT true,
  paired_event_id UUID REFERENCES timesheet_clock_events(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_clock_employee ON timesheet_clock_events(employee_id, event_time DESC);

CREATE TABLE IF NOT EXISTS timesheet_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  month DATE NOT NULL,
  task_name TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  project_name TEXT DEFAULT '',
  description TEXT,
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, month, task_name, client_name, project_name)
);

CREATE TABLE IF NOT EXISTS timesheet_leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  leave_date DATE NOT NULL,
  leave_type TEXT NOT NULL,
  hours DECIMAL(4,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, leave_date, leave_type)
);

ALTER TABLE timesheet_entries
  ALTER COLUMN timesheet_id DROP NOT NULL;

ALTER TABLE timesheet_entries
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS clock_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clock_out TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clock_in_event_id UUID REFERENCES timesheet_clock_events(id),
  ADD COLUMN IF NOT EXISTS clock_out_event_id UUID REFERENCES timesheet_clock_events(id),
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS duration_hours DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES timesheet_tasks(id),
  ADD COLUMN IF NOT EXISTS leave_type TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE timesheet_clock_events
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_employee_date ON timesheet_entries(employee_id, work_date);

