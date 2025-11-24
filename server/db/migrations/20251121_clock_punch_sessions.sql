-- Clock-in / Clock-out session tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $FUNC$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $FUNC$ LANGUAGE plpgsql;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS clock_punch_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  in_event_id UUID REFERENCES attendance_events(id) ON DELETE SET NULL,
  out_event_id UUID REFERENCES attendance_events(id) ON DELETE SET NULL,
  timesheet_entry_id UUID REFERENCES timesheet_entries(id) ON DELETE SET NULL,
  clock_in_at TIMESTAMPTZ NOT NULL,
  clock_out_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  device_in TEXT,
  device_out TEXT,
  geo_in JSONB,
  geo_out JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clock_sessions_tenant ON clock_punch_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_employee ON clock_punch_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_open ON clock_punch_sessions(employee_id, tenant_id) WHERE clock_out_at IS NULL;

CREATE TRIGGER update_clock_punch_sessions_updated_at
  BEFORE UPDATE ON clock_punch_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

