-- Promotions & Employee History Timeline Migration
-- Creates promotions table and employee_events table for tracking employee lifecycle

-- Create promotion status enum
DO $$ BEGIN
  CREATE TYPE promotion_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create employee event type enum
DO $$ BEGIN
  CREATE TYPE employee_event_type AS ENUM (
    'JOINING',
    'PROMOTION',
    'APPRAISAL',
    'HIKE',
    'PROJECT_ASSIGNMENT',
    'PROJECT_END',
    'TRANSFER',
    'ROLE_CHANGE',
    'DEPARTMENT_CHANGE',
    'TERMINATION',
    'RESIGNATION',
    'AWARD',
    'TRAINING',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Promotions table
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  appraisal_id UUID REFERENCES performance_reviews(id) ON DELETE SET NULL,
  
  -- Old values (snapshot at time of promotion)
  old_designation TEXT,
  old_grade TEXT,
  old_department_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  old_ctc NUMERIC(12, 2),
  
  -- New values
  new_designation TEXT NOT NULL,
  new_grade TEXT,
  new_department_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  new_ctc NUMERIC(12, 2),
  
  -- Approval workflow
  reason_text TEXT,
  recommendation_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status promotion_status NOT NULL DEFAULT 'DRAFT',
  effective_date DATE NOT NULL,
  
  -- Rejection details
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Application tracking
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_effective_date CHECK (effective_date >= DATE(created_at))
);

-- Employee events table (history timeline)
CREATE TABLE IF NOT EXISTS employee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  event_type employee_event_type NOT NULL,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  
  -- Source tracking
  source_table TEXT, -- 'promotions', 'appraisals', 'project_allocations', etc.
  source_id UUID, -- ID in the source table
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_event_date CHECK (event_date IS NOT NULL)
);

-- Indexes for promotions
CREATE INDEX IF NOT EXISTS idx_promotions_org ON promotions(org_id);
CREATE INDEX IF NOT EXISTS idx_promotions_employee ON promotions(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_promotions_effective_date ON promotions(org_id, effective_date) WHERE status = 'APPROVED' AND applied = false;
CREATE INDEX IF NOT EXISTS idx_promotions_appraisal ON promotions(appraisal_id) WHERE appraisal_id IS NOT NULL;

-- Indexes for employee_events
CREATE INDEX IF NOT EXISTS idx_employee_events_org ON employee_events(org_id);
CREATE INDEX IF NOT EXISTS idx_employee_events_employee ON employee_events(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_events_date ON employee_events(org_id, employee_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_events_type ON employee_events(org_id, employee_id, event_type);
CREATE INDEX IF NOT EXISTS idx_employee_events_source ON employee_events(source_table, source_id) WHERE source_table IS NOT NULL;

-- Trigger to update updated_at for promotions
CREATE OR REPLACE FUNCTION update_promotions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_promotions_updated_at();

-- RLS Policies
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy for promotions
DROP POLICY IF EXISTS org_isolation_promotions ON promotions;
CREATE POLICY org_isolation_promotions ON promotions
  USING (
    org_id IN (
      SELECT tenant_id FROM profiles WHERE id = current_setting('app.current_user_id', true)::UUID
    )
  );

-- RLS Policy for employee_events
DROP POLICY IF EXISTS org_isolation_employee_events ON employee_events;
CREATE POLICY org_isolation_employee_events ON employee_events
  USING (
    org_id IN (
      SELECT tenant_id FROM profiles WHERE id = current_setting('app.current_user_id', true)::UUID
    )
  );

-- Function to create employee event from promotion
CREATE OR REPLACE FUNCTION create_promotion_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status != 'APPROVED') THEN
    INSERT INTO employee_events (
      org_id,
      employee_id,
      event_type,
      event_date,
      title,
      description,
      metadata_json,
      source_table,
      source_id
    ) VALUES (
      NEW.org_id,
      NEW.employee_id,
      'PROMOTION',
      NEW.effective_date,
      'Promoted to ' || NEW.new_designation,
      COALESCE(NEW.reason_text, 'Promotion based on performance'),
      jsonb_build_object(
        'oldDesignation', NEW.old_designation,
        'newDesignation', NEW.new_designation,
        'oldGrade', NEW.old_grade,
        'newGrade', NEW.new_grade,
        'oldCTC', NEW.old_ctc,
        'newCTC', NEW.new_ctc,
        'approvedBy', NEW.approved_by_id,
        'appraisalId', NEW.appraisal_id
      ),
      'promotions',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER promotion_approved_event
  AFTER UPDATE OF status ON promotions
  FOR EACH ROW
  WHEN (NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status != 'APPROVED'))
  EXECUTE FUNCTION create_promotion_event();

