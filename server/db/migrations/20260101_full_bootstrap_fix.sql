-- Consolidated bootstrap fix migration
-- This file groups all the small schema tweaks we had to do manually
-- so that a fresh database can be brought in line with the application
-- in ONE go after running server/db/full-schema.sql.
--
-- It is written to be **idempotent** and safe to run multiple times.

-- 1) Organizations – extra metadata columns used by auth & org setup
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT;


-- 2) Attendance events – geolocation, consent & work-location fields
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS address_text TEXT,
  ADD COLUMN IF NOT EXISTS capture_method TEXT,
  ADD COLUMN IF NOT EXISTS consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_location_branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_type TEXT;


-- 3) Clock punch sessions – store in/out geo information, consent, and work location
ALTER TABLE clock_punch_sessions
  ADD COLUMN IF NOT EXISTS lat_in NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lon_in NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS address_text_in TEXT,
  ADD COLUMN IF NOT EXISTS capture_method_in TEXT,
  ADD COLUMN IF NOT EXISTS consent_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_ts_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lat_out NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lon_out NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS address_text_out TEXT,
  ADD COLUMN IF NOT EXISTS capture_method_out TEXT,
  ADD COLUMN IF NOT EXISTS consent_out BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_ts_out TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_location_branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_type TEXT;


-- 4) Branch geofences – used by attendance geofencing / branches
CREATE TABLE IF NOT EXISTS branch_geofences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES org_branches(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  coords JSONB NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 300,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_geofences_branch_active
  ON branch_geofences(branch_id)
  WHERE is_active = true;


-- 5) Employee projects – tenant scoping used by RLS and analytics
ALTER TABLE employee_projects
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE;


-- 6) Projects – optional team linkage
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;


-- 7) Skills – ensure tenant_id exists for RLS
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE;


-- 8) Compensation structures – additional components used in payroll UI
ALTER TABLE compensation_structures
  ADD COLUMN IF NOT EXISTS cca DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conveyance DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_allowance DECIMAL(12,2) DEFAULT 0;


-- 9) Background checks – ensure updated_at, completed_by, and notes columns exist
ALTER TABLE background_checks 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 10) Background check documents – link to onboarding docs plus status
CREATE TABLE IF NOT EXISTS background_check_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  background_check_id UUID NOT NULL REFERENCES background_checks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES onboarding_documents(id) ON DELETE CASCADE,
  onboarding_document_id UUID REFERENCES onboarding_documents(id),
  is_required BOOLEAN DEFAULT true,
  verification_status TEXT DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'APPROVED', 'HOLD', 'REJECTED')),
  decision TEXT DEFAULT 'pending',
  hr_comment TEXT,
  notes TEXT,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(background_check_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_bg_check_docs_bg_check ON background_check_documents(background_check_id);
CREATE INDEX IF NOT EXISTS idx_bg_check_docs_document ON background_check_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_bg_check_docs_status ON background_check_documents(verification_status);


-- 11) Onboarding documents & status enum – ensure base structure exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'document_status_enum'
  ) THEN
    CREATE TYPE document_status_enum AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS onboarding_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  file_size BIGINT,
  storage_key TEXT NOT NULL,
  status document_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_tenant
  ON onboarding_documents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_employee
  ON onboarding_documents(employee_id);



