-- Add holiday fields to timesheet_entries table
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN DEFAULT false;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS holiday_id UUID REFERENCES holidays(id) ON DELETE SET NULL;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_holiday ON timesheet_entries(holiday_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_is_holiday ON timesheet_entries(is_holiday);

-- Create trigger for timesheet_entries updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_timesheet_entries_updated_at'
  ) THEN
    CREATE TRIGGER update_timesheet_entries_updated_at
    BEFORE UPDATE ON timesheet_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

