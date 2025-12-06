-- Personal calendar events table
-- Stores personal notes/tasks/events created by employees from "Add to My calendar"

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_tenant ON personal_calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_employee ON personal_calendar_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_user ON personal_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_date ON personal_calendar_events(event_date);



