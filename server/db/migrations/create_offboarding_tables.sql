-- Create offboarding types
DO $$ BEGIN
  CREATE TYPE offboarding_status AS ENUM ('pending', 'in_review', 'approved', 'denied', 'auto_approved', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approver_role AS ENUM ('hr', 'manager', 'ceo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_decision AS ENUM ('pending', 'approved', 'denied');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_type AS ENUM ('email', 'phone', 'address');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_state AS ENUM ('pending', 'sent', 'verified', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rehire_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create offboarding tables
CREATE TABLE IF NOT EXISTS offboarding_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  notice_period_days INTEGER NOT NULL DEFAULT 30,
  auto_approve_days INTEGER NOT NULL DEFAULT 7,
  use_ceo_approval BOOLEAN DEFAULT true,
  applies_to_department TEXT,
  applies_to_location TEXT,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offboarding_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL UNIQUE,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  survey_json JSONB,
  notice_period_days INTEGER NOT NULL DEFAULT 30,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_working_day DATE NOT NULL,
  status offboarding_status NOT NULL DEFAULT 'pending',
  letter_url TEXT,
  fnf_pay_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offboarding_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
  role approver_role NOT NULL,
  approver_id UUID REFERENCES profiles(id),
  decision approval_decision NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(offboarding_id, role)
);

CREATE TABLE IF NOT EXISTS offboarding_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
  type verification_type NOT NULL,
  masked_value TEXT NOT NULL,
  actual_value TEXT,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  state verification_state NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(offboarding_id, type)
);

CREATE TABLE IF NOT EXISTS exit_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL UNIQUE,
  leaves_remaining INTEGER DEFAULT 0,
  financials_due BIGINT DEFAULT 0,
  assets_pending INTEGER DEFAULT 0,
  compliance_clear BOOLEAN DEFAULT false,
  finance_clear BOOLEAN DEFAULT false,
  it_clear BOOLEAN DEFAULT false,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_policies_org ON offboarding_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_org ON offboarding_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON offboarding_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_status ON offboarding_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_offboarding ON offboarding_approvals(offboarding_id);
CREATE INDEX IF NOT EXISTS idx_verifications_offboarding ON offboarding_verifications(offboarding_id);
CREATE INDEX IF NOT EXISTS idx_checklist_offboarding ON exit_checklists(offboarding_id);


