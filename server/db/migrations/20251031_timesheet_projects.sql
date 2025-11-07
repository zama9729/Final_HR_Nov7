-- Add project_id to timesheet_entries
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS project_type TEXT CHECK (project_type IN ('assigned', 'non-billable', 'internal'));

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project ON timesheet_entries(project_id);

