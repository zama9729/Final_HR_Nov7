-- Team & Project Allocation Infrastructure
-- Multi-team org structure with reporting managers and project allocations

-- Create enum types
DO $$ BEGIN
  CREATE TYPE team_type AS ENUM ('FUNCTIONAL', 'PROJECT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE team_member_role AS ENUM ('MEMBER', 'MANAGER', 'LEAD', 'COORDINATOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reporting_relationship_type AS ENUM ('PRIMARY_MANAGER', 'SECONDARY_MANAGER', 'PROJECT_MANAGER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE allocation_type AS ENUM ('FULL_TIME', 'PART_TIME', 'AD_HOC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enhance teams table (add new columns if they don't exist)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_type team_type DEFAULT 'FUNCTIONAL';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS parent_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS owner_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create team_memberships table (separate from employee_assignments for clarity)
CREATE TABLE IF NOT EXISTS team_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role team_member_role NOT NULL DEFAULT 'MEMBER',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, team_id, employee_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_org ON team_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_employee ON team_memberships(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_primary ON team_memberships(org_id, employee_id, is_primary) WHERE is_primary = true AND end_date IS NULL;

-- Create reporting_lines table
CREATE TABLE IF NOT EXISTS reporting_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  relationship_type reporting_relationship_type NOT NULL DEFAULT 'PRIMARY_MANAGER',
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reporting_lines_org ON reporting_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_reporting_lines_employee ON reporting_lines(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_reporting_lines_manager ON reporting_lines(org_id, manager_id);
CREATE INDEX IF NOT EXISTS idx_reporting_lines_primary ON reporting_lines(org_id, employee_id, relationship_type) WHERE relationship_type = 'PRIMARY_MANAGER' AND end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_reporting_lines_active ON reporting_lines(org_id, employee_id) WHERE end_date IS NULL;

-- Enhance projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'open', 'closed'));

-- Create project_allocations table (enhanced version of assignments)
CREATE TABLE IF NOT EXISTS project_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  allocation_type allocation_type NOT NULL DEFAULT 'PART_TIME',
  percent_allocation INTEGER CHECK (percent_allocation >= 0 AND percent_allocation <= 100),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  role_on_project TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, project_id, employee_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_project_allocations_org ON project_allocations(org_id);
CREATE INDEX IF NOT EXISTS idx_project_allocations_project ON project_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_allocations_employee ON project_allocations(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_project_allocations_active ON project_allocations(org_id, project_id, employee_id) WHERE end_date IS NULL;

-- Enable RLS on new tables
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS org_isolation_team_memberships ON team_memberships;
CREATE POLICY org_isolation_team_memberships ON team_memberships
  USING (org_id = current_setting('app.org_id', true)::uuid);

DROP POLICY IF EXISTS org_isolation_reporting_lines ON reporting_lines;
CREATE POLICY org_isolation_reporting_lines ON reporting_lines
  USING (org_id = current_setting('app.org_id', true)::uuid);

DROP POLICY IF EXISTS org_isolation_project_allocations ON project_allocations;
CREATE POLICY org_isolation_project_allocations ON project_allocations
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- Function to ensure only one active primary team membership per employee
CREATE OR REPLACE FUNCTION enforce_single_primary_team_membership()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a new primary membership and it's active (end_date is null)
  IF NEW.is_primary = true AND NEW.end_date IS NULL THEN
    -- Close any existing active primary memberships for this employee in this org
    UPDATE team_memberships
    SET end_date = NEW.start_date - INTERVAL '1 day',
        updated_at = now()
    WHERE org_id = NEW.org_id
      AND employee_id = NEW.employee_id
      AND is_primary = true
      AND end_date IS NULL
      AND id != NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single primary team membership
DROP TRIGGER IF EXISTS trigger_enforce_single_primary_team ON team_memberships;
CREATE TRIGGER trigger_enforce_single_primary_team
  BEFORE INSERT OR UPDATE ON team_memberships
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_primary_team_membership();

-- Function to ensure only one active primary manager per employee
CREATE OR REPLACE FUNCTION enforce_single_primary_manager()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a new primary manager relationship and it's active
  IF NEW.relationship_type = 'PRIMARY_MANAGER' AND NEW.end_date IS NULL THEN
    -- Close any existing active primary manager relationships for this employee
    UPDATE reporting_lines
    SET end_date = NEW.start_date - INTERVAL '1 day',
        updated_at = now()
    WHERE org_id = NEW.org_id
      AND employee_id = NEW.employee_id
      AND relationship_type = 'PRIMARY_MANAGER'
      AND end_date IS NULL
      AND id != NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single primary manager
DROP TRIGGER IF EXISTS trigger_enforce_single_primary_manager ON reporting_lines;
CREATE TRIGGER trigger_enforce_single_primary_manager
  BEFORE INSERT OR UPDATE ON reporting_lines
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_primary_manager();

-- Function to auto-create PROJECT_MANAGER reporting line when project allocation is created
CREATE OR REPLACE FUNCTION auto_create_project_manager_reporting()
RETURNS TRIGGER AS $$
DECLARE
  v_project_manager_id UUID;
  v_project_team_id UUID;
BEGIN
  -- Get project manager and team_id from projects table
  SELECT project_manager_id, team_id INTO v_project_manager_id, v_project_team_id
  FROM projects
  WHERE id = NEW.project_id;
  
  -- If project has a manager, create PROJECT_MANAGER reporting line
  IF v_project_manager_id IS NOT NULL THEN
    -- Check if there's already an active PROJECT_MANAGER for this employee and project
    INSERT INTO reporting_lines (
      org_id, employee_id, manager_id, relationship_type, team_id, start_date
    )
    SELECT 
      NEW.org_id,
      NEW.employee_id,
      v_project_manager_id,
      'PROJECT_MANAGER',
      v_project_team_id,
      NEW.start_date
    WHERE NOT EXISTS (
      SELECT 1 FROM reporting_lines
      WHERE org_id = NEW.org_id
        AND employee_id = NEW.employee_id
        AND manager_id = v_project_manager_id
        AND relationship_type = 'PROJECT_MANAGER'
        AND team_id = v_project_team_id
        AND end_date IS NULL
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create project manager reporting lines
DROP TRIGGER IF EXISTS trigger_auto_project_manager ON project_allocations;
CREATE TRIGGER trigger_auto_project_manager
  AFTER INSERT ON project_allocations
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_project_manager_reporting();

-- Function to close PROJECT_MANAGER reporting line when allocation ends
CREATE OR REPLACE FUNCTION close_project_manager_on_allocation_end()
RETURNS TRIGGER AS $$
BEGIN
  -- If allocation is being ended (end_date set)
  IF NEW.end_date IS NOT NULL AND (OLD.end_date IS NULL OR OLD.end_date != NEW.end_date) THEN
    -- Close corresponding PROJECT_MANAGER reporting lines
    UPDATE reporting_lines
    SET end_date = NEW.end_date,
        updated_at = now()
    WHERE org_id = NEW.org_id
      AND employee_id = NEW.employee_id
      AND relationship_type = 'PROJECT_MANAGER'
      AND team_id IN (SELECT team_id FROM projects WHERE id = NEW.project_id)
      AND end_date IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to close project manager reporting when allocation ends
DROP TRIGGER IF EXISTS trigger_close_project_manager ON project_allocations;
CREATE TRIGGER trigger_close_project_manager
  AFTER UPDATE ON project_allocations
  FOR EACH ROW
  EXECUTE FUNCTION close_project_manager_on_allocation_end();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_team_memberships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_team_memberships_updated_at ON team_memberships;
CREATE TRIGGER update_team_memberships_updated_at
  BEFORE UPDATE ON team_memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_team_memberships_updated_at();

CREATE OR REPLACE FUNCTION update_reporting_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_reporting_lines_updated_at ON reporting_lines;
CREATE TRIGGER update_reporting_lines_updated_at
  BEFORE UPDATE ON reporting_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_reporting_lines_updated_at();

CREATE OR REPLACE FUNCTION update_project_allocations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_allocations_updated_at ON project_allocations;
CREATE TRIGGER update_project_allocations_updated_at
  BEFORE UPDATE ON project_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_project_allocations_updated_at();

COMMENT ON TABLE team_memberships IS 'Employee-team relationships with primary/secondary team support';
COMMENT ON TABLE reporting_lines IS 'Manager-employee reporting relationships (primary, secondary, project managers)';
COMMENT ON TABLE project_allocations IS 'Employee project allocations with allocation percentages and roles';


































