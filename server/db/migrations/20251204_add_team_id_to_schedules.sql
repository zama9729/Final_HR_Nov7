ALTER TABLE generated_schedules ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
