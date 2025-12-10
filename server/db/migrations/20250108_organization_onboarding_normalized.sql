-- Migration: Normalized Organization Onboarding Data Model
-- This migration adds normalized tables for multi-branch organizations
-- while maintaining backward compatibility with existing data

-- Step 1: Enhance organizations table with company information fields
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS registered_business_name TEXT,
  ADD COLUMN IF NOT EXISTS registration_number TEXT,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS cin_number TEXT,
  ADD COLUMN IF NOT EXISTS registered_address TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Step 2: Create normalized tables for designations
CREATE TABLE IF NOT EXISTS org_designations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, LOWER(name))
);

CREATE INDEX IF NOT EXISTS idx_org_designations_org ON org_designations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_designations_branch ON org_designations(branch_id);

-- Step 3: Create normalized tables for grades/levels
CREATE TABLE IF NOT EXISTS org_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, LOWER(name)),
  UNIQUE(organisation_id, level)
);

CREATE INDEX IF NOT EXISTS idx_org_grades_org ON org_grades(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_grades_branch ON org_grades(branch_id);

-- Step 4: Create normalized table for reporting hierarchy
CREATE TABLE IF NOT EXISTS org_reporting_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  designation_id UUID NOT NULL REFERENCES org_designations(id) ON DELETE CASCADE,
  parent_designation_id UUID REFERENCES org_designations(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, designation_id, parent_designation_id)
);

CREATE INDEX IF NOT EXISTS idx_org_reporting_lines_org ON org_reporting_lines(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_reporting_lines_designation ON org_reporting_lines(designation_id);
CREATE INDEX IF NOT EXISTS idx_org_reporting_lines_parent ON org_reporting_lines(parent_designation_id);

-- Step 5: Create table for organization-level roles
CREATE TABLE IF NOT EXISTS org_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, LOWER(role_name))
);

CREATE INDEX IF NOT EXISTS idx_org_roles_org ON org_roles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_roles_branch ON org_roles(branch_id);

-- Step 6: Create table for role permissions (approval rights)
CREATE TABLE IF NOT EXISTS org_role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL, -- 'hr', 'payroll', 'leave', 'attendance', etc.
  permission_type TEXT NOT NULL, -- 'view', 'create', 'update', 'delete', 'approve'
  has_permission BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, module, permission_type)
);

CREATE INDEX IF NOT EXISTS idx_org_role_permissions_org ON org_role_permissions(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_role_permissions_role ON org_role_permissions(role_id);

-- Step 7: Create table for default employment types
CREATE TABLE IF NOT EXISTS org_employment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL, -- 'Permanent', 'Contract', 'Intern', etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, LOWER(employment_type))
);

CREATE INDEX IF NOT EXISTS idx_org_employment_types_org ON org_employment_types(organisation_id);

-- Step 8: Create table for default work locations
CREATE TABLE IF NOT EXISTS org_work_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  location_name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, LOWER(location_name))
);

CREATE INDEX IF NOT EXISTS idx_org_work_locations_org ON org_work_locations(organisation_id);

-- Step 9: Add branch_id to employees table (nullable for backward compatibility)
ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);

-- Step 10: Add branch_id to departments if not already present (it should be from previous migration)
-- This is just a safety check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'departments' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE departments 
      ADD COLUMN branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_departments_branch ON departments(branch_id);
  END IF;
END $$;

-- Step 11: Enable RLS on new tables
ALTER TABLE org_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_reporting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_employment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_work_locations ENABLE ROW LEVEL SECURITY;

-- Step 12: Create RLS policies for new tables
DO $$
BEGIN
  -- org_designations
  DROP POLICY IF EXISTS org_isolation_org_designations ON org_designations;
  CREATE POLICY org_isolation_org_designations ON org_designations
    USING (org_rls_guard(organisation_id));

  -- org_grades
  DROP POLICY IF EXISTS org_isolation_org_grades ON org_grades;
  CREATE POLICY org_isolation_org_grades ON org_grades
    USING (org_rls_guard(organisation_id));

  -- org_reporting_lines
  DROP POLICY IF EXISTS org_isolation_org_reporting_lines ON org_reporting_lines;
  CREATE POLICY org_isolation_org_reporting_lines ON org_reporting_lines
    USING (org_rls_guard(organisation_id));

  -- org_roles
  DROP POLICY IF EXISTS org_isolation_org_roles ON org_roles;
  CREATE POLICY org_isolation_org_roles ON org_roles
    USING (org_rls_guard(organisation_id));

  -- org_role_permissions
  DROP POLICY IF EXISTS org_isolation_org_role_permissions ON org_role_permissions;
  CREATE POLICY org_isolation_org_role_permissions ON org_role_permissions
    USING (org_rls_guard(organisation_id));

  -- org_employment_types
  DROP POLICY IF EXISTS org_isolation_org_employment_types ON org_employment_types;
  CREATE POLICY org_isolation_org_employment_types ON org_employment_types
    USING (org_rls_guard(organisation_id));

  -- org_work_locations
  DROP POLICY IF EXISTS org_isolation_org_work_locations ON org_work_locations;
  CREATE POLICY org_isolation_org_work_locations ON org_work_locations
    USING (org_rls_guard(organisation_id));
END $$;

-- Step 13: Add comments for documentation
COMMENT ON TABLE org_designations IS 'Normalized table for organization designations/roles, supports multi-branch';
COMMENT ON TABLE org_grades IS 'Normalized table for organization grades/levels, supports multi-branch';
COMMENT ON TABLE org_reporting_lines IS 'Normalized table for reporting hierarchy mapping designations to parent designations';
COMMENT ON TABLE org_roles IS 'Organization-level roles that can be assigned to users, supports multi-branch';
COMMENT ON TABLE org_role_permissions IS 'Permission matrix for organization roles, defines approval rights per module';
COMMENT ON TABLE org_employment_types IS 'Default employment types supported by the organization';
COMMENT ON TABLE org_work_locations IS 'Default work locations for the organization';

