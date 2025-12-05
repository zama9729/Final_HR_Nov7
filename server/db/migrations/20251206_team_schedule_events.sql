-- Team schedule ad-hoc events (meetings, milestones, etc.)
-- These are lightweight events created from the Team Schedule UI

CREATE TABLE IF NOT EXISTS team_schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'event', -- 'event' | 'milestone' | 'announcement' | 'time_off'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_schedule_events_tenant ON team_schedule_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_team ON team_schedule_events(team_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_employee ON team_schedule_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_date ON team_schedule_events(start_date, end_date);



