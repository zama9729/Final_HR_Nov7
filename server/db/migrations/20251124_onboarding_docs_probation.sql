-- Onboarding document lifecycle + probation engine + verified badge

DO $$ BEGIN
    CREATE TYPE document_status_enum AS ENUM (
        'uploaded',
        'pending_review',
        'approved',
        'rejected',
        'resubmission_requested',
        'quarantined'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE probation_status_enum AS ENUM (
        'in_probation',
        'extended',
        'completed',
        'failed',
        'confirmed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE probation_task_status_enum AS ENUM (
        'pending',
        'in_progress',
        'completed',
        'skipped'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE probation_review_status_enum AS ENUM (
        'pending',
        'passed',
        'failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE onboarding_documents
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS candidate_id UUID,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS status document_status_enum DEFAULT 'uploaded',
    ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hr_notes TEXT,
    ADD COLUMN IF NOT EXISTS retention_until DATE,
    ADD COLUMN IF NOT EXISTS consent_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS uploader_notes TEXT,
    ADD COLUMN IF NOT EXISTS doc_source TEXT DEFAULT 'candidate',
    ADD COLUMN IF NOT EXISTS quarantine_reason TEXT,
    ADD COLUMN IF NOT EXISTS audit_hash TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE onboarding_documents
    ALTER COLUMN uploaded_at SET DEFAULT now();

UPDATE onboarding_documents
SET status = 'uploaded'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_tenant
    ON onboarding_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_employee
    ON onboarding_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_status
    ON onboarding_documents(status);

CREATE TABLE IF NOT EXISTS document_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES onboarding_documents(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    comment TEXT,
    previous_status document_status_enum,
    next_status document_status_enum,
    snapshot_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_audit_document
    ON document_audit_logs(document_id);

CREATE TABLE IF NOT EXISTS probations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
    assignment_id UUID,
    probation_start DATE NOT NULL,
    probation_end DATE NOT NULL,
    probation_days INT NOT NULL,
    allowed_leave_days INT DEFAULT 0,
    status probation_status_enum NOT NULL DEFAULT 'in_probation',
    allowed_leave_policy JSONB DEFAULT '{}'::jsonb,
    is_eligible_for_perks BOOLEAN DEFAULT true,
    requires_mid_probation_review BOOLEAN DEFAULT false,
    mid_review_date DATE,
    mid_review_status probation_review_status_enum DEFAULT 'pending',
    auto_confirm_at_end BOOLEAN DEFAULT false,
    probation_notice_days INT DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_probations_tenant
    ON probations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_probations_employee
    ON probations(employee_id);
CREATE INDEX IF NOT EXISTS idx_probations_status
    ON probations(status);

CREATE TABLE IF NOT EXISTS probation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    probation_id UUID REFERENCES probations(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_probation_events_probation
    ON probation_events(probation_id);

CREATE TABLE IF NOT EXISTS probation_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    probation_id UUID REFERENCES probations(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    task_type TEXT NOT NULL,
    due_on DATE NOT NULL,
    assignee_id UUID REFERENCES profiles(id),
    status probation_task_status_enum DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_probation_tasks_probation
    ON probation_tasks(probation_id);

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_scope TEXT[],
    ADD COLUMN IF NOT EXISTS probation_status probation_status_enum,
    ADD COLUMN IF NOT EXISTS probation_end DATE;

ALTER TABLE background_checks
    ADD COLUMN IF NOT EXISTS verification_result TEXT,
    ADD COLUMN IF NOT EXISTS verification_scope TEXT[];

CREATE TABLE IF NOT EXISTS background_check_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    background_check_id UUID REFERENCES background_checks(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES onboarding_documents(id) ON DELETE CASCADE NOT NULL,
    attached_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_background_check_document
    ON background_check_documents(background_check_id, document_id);

