-- Migration: Extended Onboarding Form + Background Check Workflow
-- Adds all required fields for comprehensive onboarding and background check tracking
-- Date: 2025-11-28

-- ============================================================================
-- PART 1: Extend onboarding_data table with new candidate fields
-- ============================================================================

-- Add personal information fields
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS full_legal_name TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    ADD COLUMN IF NOT EXISTS nationality TEXT,
    ADD COLUMN IF NOT EXISTS personal_phone TEXT,
    ADD COLUMN IF NOT EXISTS personal_email TEXT;

-- Add government ID fields (supporting multiple IDs via JSON)
-- Store as JSONB: {"aadhaar": "1234...", "pan": "ABCDE1234F", "passport": "A1234567"}
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS government_ids JSONB DEFAULT '{}'::jsonb;

-- Add tax details (can be JSON or individual fields)
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS tax_details JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS tax_regime TEXT CHECK (tax_regime IN ('old', 'new', NULL));

-- Add dependents information (stored as JSONB array)
-- Format: [{"name": "John Doe", "relation": "spouse", "date_of_birth": "1990-01-01", "gender": "male"}]
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS dependents JSONB DEFAULT '[]'::jsonb;

-- Add reference details (optional)
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS references JSONB DEFAULT '[]'::jsonb;

-- Add biometric registration status
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS biometric_registration_status TEXT DEFAULT 'PENDING' 
        CHECK (biometric_registration_status IN ('PENDING', 'COMPLETED', 'NOT_REQUIRED'));

-- ============================================================================
-- PART 2: Employer/HR-managed fields (in employees table or onboarding_data)
-- ============================================================================

-- Work location (already exists in employees.work_mode, but add explicit field)
-- Note: work_mode already exists, but we'll add work_location for clarity
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS work_location TEXT;

-- Shift schedule reference (can be ID or code)
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS shift_schedule_id UUID,
    ADD COLUMN IF NOT EXISTS shift_code TEXT;

-- HR notes for onboarding/background check
ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS hr_notes TEXT,
    ADD COLUMN IF NOT EXISTS hr_notes_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hr_notes_updated_by UUID REFERENCES profiles(id);

-- ============================================================================
-- PART 3: Enhanced onboarding_status enum and tracking
-- ============================================================================

-- Extend onboarding_status enum if needed
DO $$ 
BEGIN
    -- Check if enum exists and add new values if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'onboarding_status_extended'
    ) THEN
        CREATE TYPE onboarding_status_extended AS ENUM (
            'STARTED',
            'PASSWORD_SETUP',
            'DOCUMENTS_UPLOADED',
            'FIRST_LOGIN',
            'BG_CHECK_PENDING',
            'BG_CHECK_HOLD',
            'BG_CHECK_COMPLETED',
            'ONBOARDING_COMPLETED'
        );
    END IF;
END $$;

-- Add new status tracking column (keep old one for backward compatibility)
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS onboarding_status_extended TEXT 
        CHECK (onboarding_status_extended IN (
            'STARTED', 'PASSWORD_SETUP', 'DOCUMENTS_UPLOADED', 'FIRST_LOGIN',
            'BG_CHECK_PENDING', 'BG_CHECK_HOLD', 'BG_CHECK_COMPLETED', 'ONBOARDING_COMPLETED'
        ));

-- Create onboarding_steps_history table
CREATE TABLE IF NOT EXISTS onboarding_steps_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    step_status TEXT DEFAULT 'completed' CHECK (step_status IN ('started', 'completed', 'skipped', 'failed')),
    occurred_at TIMESTAMPTZ DEFAULT now(),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('candidate', 'hr', 'system')),
    actor_id UUID REFERENCES profiles(id),
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- (Unique constraint removed in favor of application-level guard)

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_history_employee 
    ON onboarding_steps_history(employee_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_history_step 
    ON onboarding_steps_history(step, step_status);

-- ============================================================================
-- PART 4: Enhanced onboarding_documents table for S3/MinIO
-- ============================================================================

-- Add S3-specific fields if not exist
ALTER TABLE onboarding_documents
    ADD COLUMN IF NOT EXISTS s3_bucket TEXT,
    ADD COLUMN IF NOT EXISTS s3_key TEXT,
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_validated BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS document_category TEXT CHECK (document_category IN (
        'RESUME', 'EDUCATION_CERT', 'EXPERIENCE_LETTER', 'BG_CHECK_DOC', 
        'ID_PROOF', 'SIGNED_CONTRACT', 'OTHER'
    ));

-- Update document_type to support new types
-- Ensure document_status_enum exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status_enum') THEN
        CREATE TYPE document_status_enum AS ENUM (
            'uploaded', 'pending', 'approved', 'rejected', 'hold', 
            'resubmission_requested', 'quarantined'
        );
    END IF;
END $$;

-- Update status column to use enum if it's not already
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'onboarding_documents' 
        AND column_name = 'status' 
        AND data_type != 'document_status_enum'
    ) THEN
        -- Convert existing status column to enum
        ALTER TABLE onboarding_documents 
            ALTER COLUMN status TYPE TEXT;
        -- Will be converted to enum in next step if needed
    END IF;
END $$;

-- ============================================================================
-- PART 5: Background Check workflow tables
-- ============================================================================

-- Background check file/record
CREATE TABLE IF NOT EXISTS background_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'in_progress', 'on_hold', 'completed', 'failed')),
    has_prior_background_check BOOLEAN DEFAULT false,
    prior_bg_check_verified_by UUID REFERENCES profiles(id),
    prior_bg_check_verified_at TIMESTAMPTZ,
    prior_bg_check_notes TEXT,
    initiated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'background_checks_employee_id_key'
          AND conrelid = 'background_checks'::regclass
    ) THEN
        ALTER TABLE background_checks
            ADD CONSTRAINT background_checks_employee_id_key UNIQUE (employee_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_background_checks_employee ON background_checks(employee_id);
CREATE INDEX IF NOT EXISTS idx_background_checks_status ON background_checks(status);
CREATE INDEX IF NOT EXISTS idx_background_checks_tenant ON background_checks(tenant_id);

-- Background check document mapping (links documents to background check)
CREATE TABLE IF NOT EXISTS background_check_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    background_check_id UUID NOT NULL REFERENCES background_checks(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES onboarding_documents(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT true,
    verification_status TEXT DEFAULT 'PENDING' 
        CHECK (verification_status IN ('PENDING', 'APPROVED', 'HOLD', 'REJECTED')),
    hr_comment TEXT,
    verified_by UUID REFERENCES profiles(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(background_check_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_bg_check_docs_bg_check ON background_check_documents(background_check_id);
CREATE INDEX IF NOT EXISTS idx_bg_check_docs_document ON background_check_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_bg_check_docs_status ON background_check_documents(verification_status);

-- ============================================================================
-- PART 6: Update existing records for backward compatibility
-- ============================================================================

-- Set default onboarding_status_extended for existing employees
UPDATE employees 
SET onboarding_status_extended = CASE 
    WHEN onboarding_status = 'completed' THEN 'ONBOARDING_COMPLETED'
    WHEN onboarding_status = 'in_progress' THEN 'DOCUMENTS_UPLOADED'
    WHEN onboarding_status = 'pending' THEN 'STARTED'
    ELSE 'STARTED'
END
WHERE onboarding_status_extended IS NULL;

-- Migrate existing document types to new categories
UPDATE onboarding_documents
SET document_category = CASE 
    WHEN document_type = 'ID_PROOF' OR document_type = 'PAN' OR document_type = 'AADHAAR' OR document_type = 'AADHAR' OR document_type = 'PASSPORT' THEN 'ID_PROOF'
    WHEN document_type = 'EDUCATION_CERT' THEN 'EDUCATION_CERT'
    WHEN document_type = 'EXPERIENCE_LETTER' THEN 'EXPERIENCE_LETTER'
    WHEN document_type = 'ADDRESS_PROOF' THEN 'ID_PROOF'
    WHEN document_type = 'OFFER_ACCEPTANCE' THEN 'SIGNED_CONTRACT'
    ELSE 'OTHER'
END
WHERE document_category IS NULL;

-- Set is_required for critical documents
UPDATE onboarding_documents
SET is_required = true
WHERE document_type IN ('ID_PROOF', 'PAN', 'AADHAAR', 'AADHAR', 'EDUCATION_CERT', 'EXPERIENCE_LETTER', 'OFFER_ACCEPTANCE')
AND is_required IS NULL;

-- ============================================================================
-- PART 7: Create triggers and functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_background_checks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for background_checks
DROP TRIGGER IF EXISTS trigger_update_background_checks_updated_at ON background_checks;
CREATE TRIGGER trigger_update_background_checks_updated_at
    BEFORE UPDATE ON background_checks
    FOR EACH ROW
    EXECUTE FUNCTION update_background_checks_updated_at();

-- Function to auto-create background check when documents are uploaded
CREATE OR REPLACE FUNCTION auto_create_background_check()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_id UUID;
    v_tenant_id UUID;
    v_bg_check_id UUID;
BEGIN
    -- Get employee_id and tenant_id
    v_employee_id := COALESCE(NEW.employee_id, NEW.candidate_id);
    
    IF v_employee_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get tenant_id from employee
    SELECT tenant_id INTO v_tenant_id
    FROM employees
    WHERE id = v_employee_id;
    
    IF v_tenant_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if background check exists, if not create one
    SELECT id INTO v_bg_check_id
    FROM background_checks
    WHERE employee_id = v_employee_id;
    
    IF v_bg_check_id IS NULL THEN
        INSERT INTO background_checks (employee_id, tenant_id, status)
        VALUES (v_employee_id, v_tenant_id, 'PENDING')
        RETURNING id INTO v_bg_check_id;
    END IF;
    
    -- Link document to background check if it's a BG-related document
    IF NEW.document_type IN ('RESUME', 'ID_PROOF', 'PAN', 'AADHAAR', 'AADHAR', 'PASSPORT', 'EDUCATION_CERT', 'EXPERIENCE_LETTER', 'BG_CHECK_DOC') THEN
        INSERT INTO background_check_documents (background_check_id, document_id, is_required)
        VALUES (v_bg_check_id, NEW.id, COALESCE(NEW.is_required, true))
        ON CONFLICT (background_check_id, document_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create background check on document upload
DROP TRIGGER IF EXISTS trigger_auto_create_background_check ON onboarding_documents;
CREATE TRIGGER trigger_auto_create_background_check
    AFTER INSERT ON onboarding_documents
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_background_check();

-- ============================================================================
-- PART 8: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN onboarding_data.full_legal_name IS 'Full legal name as per government ID (Candidate)';
COMMENT ON COLUMN onboarding_data.date_of_birth IS 'Date of birth (Candidate)';
COMMENT ON COLUMN onboarding_data.nationality IS 'Nationality/Citizenship status (Candidate)';
COMMENT ON COLUMN onboarding_data.government_ids IS 'JSON object storing multiple government IDs: {aadhaar, pan, passport} (Candidate)';
COMMENT ON COLUMN onboarding_data.dependents IS 'JSON array of dependents: [{name, relation, date_of_birth, gender}] (Candidate)';
COMMENT ON COLUMN onboarding_data.biometric_registration_status IS 'Status of biometric/security registration (Candidate or Employer)';
COMMENT ON COLUMN employees.work_location IS 'Work location assigned by HR (Employer)';
COMMENT ON COLUMN employees.shift_schedule_id IS 'Shift schedule reference assigned by HR (Employer)';
COMMENT ON COLUMN onboarding_data.hr_notes IS 'Internal HR notes for onboarding/background check (Employer)';

COMMENT ON TABLE background_checks IS 'Tracks background check workflow for each employee';
COMMENT ON TABLE background_check_documents IS 'Links documents to background check records';
COMMENT ON TABLE onboarding_steps_history IS 'Audit trail of onboarding step completions';

