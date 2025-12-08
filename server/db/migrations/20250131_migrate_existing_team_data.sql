-- Migration script to migrate existing team/department data to new structure
-- This should be run after 20250131_team_project_allocation.sql

-- Step 1: Migrate existing teams to have team_type = 'FUNCTIONAL' if not set
UPDATE teams SET team_type = 'FUNCTIONAL' WHERE team_type IS NULL;

-- Step 2: Create team_memberships from employee_assignments
-- Migrate employees with team_id in employee_assignments to team_memberships
INSERT INTO team_memberships (org_id, team_id, employee_id, role, is_primary, start_date, end_date, created_at, updated_at)
SELECT DISTINCT
  ea.org_id,
  ea.team_id,
  ea.employee_id,
  CASE 
    WHEN ea.role ILIKE '%manager%' OR ea.role ILIKE '%lead%' THEN 'MANAGER'::team_member_role
    WHEN ea.role ILIKE '%coordinator%' THEN 'COORDINATOR'::team_member_role
    ELSE 'MEMBER'::team_member_role
  END,
  COALESCE(ea.is_home, true),
  COALESCE(ea.start_date, CURRENT_DATE),
  ea.end_date,
  COALESCE(ea.created_at, now()),
  COALESCE(ea.updated_at, now())
FROM employee_assignments ea
WHERE ea.team_id IS NOT NULL
  AND ea.employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.org_id = ea.org_id
      AND tm.team_id = ea.team_id
      AND tm.employee_id = ea.employee_id
      AND tm.start_date = COALESCE(ea.start_date, CURRENT_DATE)
  )
ON CONFLICT (org_id, team_id, employee_id, start_date) DO NOTHING;

-- Step 3: Create reporting_lines from employees.reporting_manager_id
-- Migrate existing reporting_manager_id to PRIMARY_MANAGER reporting_lines
INSERT INTO reporting_lines (org_id, employee_id, manager_id, relationship_type, start_date, created_at, updated_at)
SELECT DISTINCT
  e.tenant_id as org_id,
  e.id as employee_id,
  e.reporting_manager_id as manager_id,
  'PRIMARY_MANAGER'::reporting_relationship_type,
  COALESCE(e.join_date, CURRENT_DATE) as start_date,
  COALESCE(e.created_at, now()) as created_at,
  COALESCE(e.updated_at, now()) as updated_at
FROM employees e
WHERE e.reporting_manager_id IS NOT NULL
  AND e.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM reporting_lines rl
    WHERE rl.org_id = e.tenant_id
      AND rl.employee_id = e.id
      AND rl.manager_id = e.reporting_manager_id
      AND rl.relationship_type = 'PRIMARY_MANAGER'
      AND rl.end_date IS NULL
  )
ON CONFLICT DO NOTHING;

-- Step 4: Migrate existing assignments to project_allocations
-- Convert assignments table data to project_allocations
INSERT INTO project_allocations (
  org_id, project_id, employee_id, allocation_type, percent_allocation,
  start_date, end_date, role_on_project, created_at, updated_at
)
SELECT DISTINCT
  p.org_id,
  a.project_id,
  a.employee_id,
  CASE 
    WHEN a.allocation_percent >= 100 THEN 'FULL_TIME'::allocation_type
    WHEN a.allocation_percent >= 50 THEN 'PART_TIME'::allocation_type
    ELSE 'AD_HOC'::allocation_type
  END,
  a.allocation_percent,
  COALESCE(a.start_date, CURRENT_DATE),
  a.end_date,
  a.role,
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM assignments a
JOIN projects p ON p.id = a.project_id
WHERE NOT EXISTS (
  SELECT 1 FROM project_allocations pa
  WHERE pa.org_id = p.org_id
    AND pa.project_id = a.project_id
    AND pa.employee_id = a.employee_id
    AND pa.start_date = COALESCE(a.start_date, CURRENT_DATE)
)
ON CONFLICT (org_id, project_id, employee_id, start_date) DO NOTHING;

-- Step 5: Set owner_manager_id on teams based on team members with MANAGER role
UPDATE teams t
SET owner_manager_id = (
  SELECT tm.employee_id
  FROM team_memberships tm
  WHERE tm.team_id = t.id
    AND tm.role = 'MANAGER'
    AND tm.is_primary = true
    AND tm.end_date IS NULL
  ORDER BY tm.created_at ASC
  LIMIT 1
)
WHERE t.owner_manager_id IS NULL
  AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = t.id
      AND tm.role = 'MANAGER'
      AND tm.end_date IS NULL
  );

-- Step 6: Ensure all employees have at least one primary team membership
-- Create default team memberships for employees without any
DO $$
DECLARE
  v_org_id UUID;
  v_employee_id UUID;
  v_default_team_id UUID;
  v_department TEXT;
BEGIN
  -- For each employee without a primary team membership
  FOR v_org_id, v_employee_id, v_department IN
    SELECT DISTINCT
      e.tenant_id,
      e.id,
      e.department
    FROM employees e
    WHERE e.tenant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.org_id = e.tenant_id
          AND tm.employee_id = e.id
          AND tm.is_primary = true
          AND tm.end_date IS NULL
      )
  LOOP
    -- Try to find or create a default team based on department
    IF v_department IS NOT NULL THEN
      -- Find existing team for this department
      SELECT id INTO v_default_team_id
      FROM teams
      WHERE org_id = v_org_id
        AND LOWER(name) = LOWER(v_department)
        AND team_type = 'FUNCTIONAL'
      LIMIT 1;
      
      -- If no team found, create one
      IF v_default_team_id IS NULL THEN
        INSERT INTO teams (org_id, name, code, team_type, is_active)
        VALUES (
          v_org_id,
          v_department,
          UPPER(SUBSTRING(v_department, 1, 3)),
          'FUNCTIONAL',
          true
        )
        RETURNING id INTO v_default_team_id;
      END IF;
    ELSE
      -- Create or find a default "Unassigned" team
      SELECT id INTO v_default_team_id
      FROM teams
      WHERE org_id = v_org_id
        AND LOWER(name) = 'unassigned'
        AND team_type = 'FUNCTIONAL'
      LIMIT 1;
      
      IF v_default_team_id IS NULL THEN
        INSERT INTO teams (org_id, name, code, team_type, is_active)
        VALUES (v_org_id, 'Unassigned', 'UNASSIGNED', 'FUNCTIONAL', true)
        RETURNING id INTO v_default_team_id;
      END IF;
    END IF;
    
    -- Create primary team membership
    INSERT INTO team_memberships (org_id, team_id, employee_id, role, is_primary, start_date)
    VALUES (v_org_id, v_default_team_id, v_employee_id, 'MEMBER', true, CURRENT_DATE)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Step 7: Ensure all employees have a PRIMARY_MANAGER reporting line
-- Create default reporting lines for employees without one
DO $$
DECLARE
  v_org_id UUID;
  v_employee_id UUID;
  v_manager_id UUID;
BEGIN
  -- For each employee without a primary manager
  FOR v_org_id, v_employee_id, v_manager_id IN
    SELECT DISTINCT
      e.tenant_id,
      e.id,
      e.reporting_manager_id
    FROM employees e
    WHERE e.tenant_id IS NOT NULL
      AND e.reporting_manager_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM reporting_lines rl
        WHERE rl.org_id = e.tenant_id
          AND rl.employee_id = e.id
          AND rl.relationship_type = 'PRIMARY_MANAGER'
          AND rl.end_date IS NULL
      )
  LOOP
    -- Create primary manager reporting line
    INSERT INTO reporting_lines (org_id, employee_id, manager_id, relationship_type, start_date)
    VALUES (v_org_id, v_employee_id, v_manager_id, 'PRIMARY_MANAGER', CURRENT_DATE)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

COMMENT ON FUNCTION enforce_single_primary_team_membership() IS 'Ensures only one active primary team membership per employee';
COMMENT ON FUNCTION enforce_single_primary_manager() IS 'Ensures only one active primary manager per employee';
COMMENT ON FUNCTION auto_create_project_manager_reporting() IS 'Auto-creates PROJECT_MANAGER reporting line when employee is allocated to a project';


















