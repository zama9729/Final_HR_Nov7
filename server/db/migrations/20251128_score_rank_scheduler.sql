-- Migration: ScoreRank Scheduler Tables
-- Created: 2025-11-28

-- 1. Employee Shift Scores Table
CREATE TABLE IF NOT EXISTS employee_shift_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  score DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
  total_shifts INTEGER NOT NULL DEFAULT 0,
  total_night_shifts INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  score_history JSONB DEFAULT '[]'::jsonb, -- Keep track of score changes over time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_shift_scores_tenant ON employee_shift_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_shift_scores_score ON employee_shift_scores(tenant_id, score);

-- 2. Shift Assignment History Table
CREATE TABLE IF NOT EXISTS shift_assignment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  slot_id UUID REFERENCES schedule_slots(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL, -- 'night', 'evening', 'day'
  score_delta DECIMAL(10, 4) NOT NULL,
  score_after DECIMAL(10, 4) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by TEXT NOT NULL DEFAULT 'system', -- 'system' or 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignment_history_employee ON shift_assignment_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignment_history_date ON shift_assignment_history(shift_date);

-- 3. Update Schedule Slots
ALTER TABLE schedule_slots 
ADD COLUMN IF NOT EXISTS assigned_by TEXT DEFAULT 'system',
ADD COLUMN IF NOT EXISTS assignment_epoch BIGINT; -- For deterministic tie-breaking

-- 4. Trigger for updated_at on employee_shift_scores
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_employee_shift_scores_updated_at') THEN
    CREATE TRIGGER update_employee_shift_scores_updated_at
      BEFORE UPDATE ON employee_shift_scores
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 5. Update generated_schedules constraint to allow score_rank
DO $$ BEGIN
    ALTER TABLE generated_schedules DROP CONSTRAINT IF EXISTS generated_schedules_algorithm_used_check;
    ALTER TABLE generated_schedules ADD CONSTRAINT generated_schedules_algorithm_used_check
    CHECK (algorithm_used IN ('greedy', 'ilp', 'simulated_annealing', 'genetic', 'manual', 'score_rank'));
EXCEPTION
    WHEN undefined_table THEN NULL; -- Ignore if table doesn't exist yet
END $$;

-- 6. Add shift_type to schedule_assignments
DO $$ BEGIN
    ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'day';
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;
