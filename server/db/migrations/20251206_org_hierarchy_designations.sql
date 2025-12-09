-- Create designations table
CREATE TABLE IF NOT EXISTS designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0, -- 0 is highest (e.g. CEO)
  parent_designation_id UUID REFERENCES designations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Add designation_id to employees
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'designation_id') THEN
    ALTER TABLE employees ADD COLUMN designation_id UUID REFERENCES designations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_designations_org ON designations(org_id);
CREATE INDEX IF NOT EXISTS idx_designations_parent ON designations(parent_designation_id);
CREATE INDEX IF NOT EXISTS idx_employees_designation ON employees(designation_id);
