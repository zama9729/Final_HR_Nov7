-- Team-Based Scheduling Migration
-- Created: 2025-12-03

-- 1. Update Shift Templates to support scheduling modes
ALTER TABLE shift_templates
ADD COLUMN IF NOT EXISTS schedule_mode TEXT DEFAULT 'employee' CHECK (schedule_mode IN ('employee', 'team', 'mixed'));

-- 2. Update Demand Requirements to support assignment types
ALTER TABLE shift_demand_requirements
ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'employee' CHECK (assignment_type IN ('employee', 'team'));

-- 3. Update Schedule Assignments to support team assignments
ALTER TABLE schedule_assignments
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'employee' CHECK (assignment_type IN ('employee', 'team'));

CREATE INDEX IF NOT EXISTS idx_assignments_team ON schedule_assignments(team_id);

-- 4. Team Shift Scores (Track fatigue for teams)
CREATE TABLE IF NOT EXISTS team_shift_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  score DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
  total_shifts INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  score_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_scores_tenant ON team_shift_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_scores_score ON team_shift_scores(tenant_id, score);

-- 5. Team Assignment History
CREATE TABLE IF NOT EXISTS team_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES generated_schedules(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL,
  score_delta DECIMAL(10, 4) NOT NULL,
  score_after DECIMAL(10, 4) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_history_team ON team_assignment_history(team_id);
CREATE INDEX IF NOT EXISTS idx_team_history_date ON team_assignment_history(shift_date);

-- 6. Trigger for updated_at on team_shift_scores
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_team_shift_scores_updated_at') THEN
    CREATE TRIGGER update_team_shift_scores_updated_at
      BEFORE UPDATE ON team_shift_scores
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
