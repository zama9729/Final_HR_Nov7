-- Termination / Rehire / Background Check schema

DO $$ BEGIN
    CREATE TYPE termination_type_enum AS ENUM ('resignation','cause','retrenchment','redundancy','mutual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE termination_status_enum AS ENUM ('initiated','manager_review','hr_review','legal_review','payroll_hold','completed','rejected','disputed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE termination_dispute_status_enum AS ENUM ('open','in_review','resolved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE background_check_kind_enum AS ENUM ('prehire','rehire','periodic');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE background_check_status_enum AS ENUM ('pending','in_progress','vendor_delay','completed_green','completed_amber','completed_red','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE rehire_status_enum AS ENUM ('draft','awaiting_checks','offer','onboarding','completed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE rehire_eligibility_enum AS ENUM ('eligible','ineligible','needs_review','pending_checks');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE labour_notification_status_enum AS ENUM ('draft','submitted','acknowledged','closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS consent_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID,
    subject_type TEXT,
    consent_text TEXT NOT NULL,
    scope JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    signed_by UUID,
    signed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS terminations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
    type termination_type_enum NOT NULL,
    initiator_id UUID REFERENCES profiles(id),
    initiator_role TEXT,
    reason_text TEXT,
    evidence_refs JSONB DEFAULT '[]'::jsonb,
    proposed_lwd DATE,
    final_lwd DATE,
    notice_days INT DEFAULT 0,
    notice_source TEXT,
    notice_pay_amount NUMERIC(14,2) DEFAULT 0,
    gratuity_amount NUMERIC(14,2) DEFAULT 0,
    retrenchment_comp_amount NUMERIC(14,2) DEFAULT 0,
    leave_encash_amount NUMERIC(14,2) DEFAULT 0,
    settlement_amount NUMERIC(14,2) DEFAULT 0,
    currency CHAR(3) DEFAULT 'INR',
    consent_snapshot_id UUID REFERENCES consent_snapshots(id),
    dispute_status termination_dispute_status_enum DEFAULT 'open',
    status termination_status_enum DEFAULT 'initiated' NOT NULL,
    checklist JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    feature_flag TEXT DEFAULT 'termination_rehire_v1',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_terminations_tenant ON terminations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_terminations_employee ON terminations(employee_id);
CREATE INDEX IF NOT EXISTS idx_terminations_status ON terminations(status);

CREATE TABLE IF NOT EXISTS termination_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termination_id UUID REFERENCES terminations(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id),
    actor_role TEXT,
    reason TEXT,
    snapshot_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_termination_audit_termination ON termination_audit(termination_id);

CREATE TABLE IF NOT EXISTS termination_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termination_id UUID REFERENCES terminations(id) ON DELETE CASCADE NOT NULL,
    label TEXT NOT NULL,
    assignee_role TEXT,
    due_on DATE,
    completed_by UUID REFERENCES profiles(id),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS termination_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termination_id UUID REFERENCES terminations(id) ON DELETE CASCADE NOT NULL,
    doc_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS termination_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termination_id UUID REFERENCES terminations(id) ON DELETE CASCADE NOT NULL,
    raised_by UUID REFERENCES profiles(id),
    statement TEXT NOT NULL,
    status termination_dispute_status_enum DEFAULT 'open',
    resolution_note TEXT,
    resolved_by UUID REFERENCES profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labour_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termination_id UUID REFERENCES terminations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    state_code TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    status labour_notification_status_enum DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    acknowledgement_ref TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Background checks
CREATE TABLE IF NOT EXISTS background_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    candidate_id UUID,
    employee_id UUID REFERENCES employees(id),
    type background_check_kind_enum NOT NULL DEFAULT 'prehire',
    status background_check_status_enum NOT NULL DEFAULT 'pending',
    vendor_id UUID,
    consent_snapshot JSONB DEFAULT '{}'::jsonb,
    request_payload JSONB DEFAULT '{}'::jsonb,
    result_summary JSONB DEFAULT '{}'::jsonb,
    raw_report_url TEXT,
    retention_until DATE,
    initiated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_background_checks_tenant ON background_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_background_checks_status ON background_checks(status);

CREATE TABLE IF NOT EXISTS background_check_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID REFERENCES background_checks(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT,
    note TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_check_events_check ON background_check_events(check_id);

-- Rehire models
CREATE TABLE IF NOT EXISTS do_not_rehire_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID,
    profile_id UUID REFERENCES profiles(id),
    reason TEXT NOT NULL,
    supporting_docs JSONB DEFAULT '[]'::jsonb,
    expires_at DATE,
    created_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rehire_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    ex_employee_id UUID,
    requested_by UUID REFERENCES profiles(id),
    requested_start_date DATE,
    prior_termination_id UUID REFERENCES terminations(id),
    eligibility_status rehire_eligibility_enum DEFAULT 'pending_checks',
    eligibility_reason TEXT,
    rehire_policy_snapshot JSONB DEFAULT '{}'::jsonb,
    approvals JSONB DEFAULT '[]'::jsonb,
    rehire_flags JSONB DEFAULT '{}'::jsonb,
    background_check_id UUID REFERENCES background_checks(id),
    onboarding_employee_id UUID REFERENCES employees(id),
    status rehire_status_enum DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rehire_requests_tenant ON rehire_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rehire_requests_status ON rehire_requests(status);


