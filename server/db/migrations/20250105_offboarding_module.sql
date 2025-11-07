-- Offboarding Module Migration
-- Creates tables for policies, offboarding requests, approvals, verifications, checklists, rehires, and offboarded identities

-- Create enum types for offboarding
DO $$ BEGIN
  CREATE TYPE offboarding_status AS ENUM ('pending', 'in_review', 'approved', 'denied', 'auto_approved', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approver_role AS ENUM ('hr', 'manager', 'ceo');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_decision AS ENUM ('pending', 'approved', 'denied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_type AS ENUM ('email', 'phone', 'address');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_state AS ENUM ('pending', 'sent', 'verified', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rehire_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Policies table (configurable notice periods and auto-approval SLAs)
CREATE TABLE IF NOT EXISTS offboarding_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  notice_period_days INTEGER NOT NULL DEFAULT 30,
  auto_approve_days INTEGER NOT NULL DEFAULT 7,
  use_ceo_approval BOOLEAN DEFAULT true,
  applies_to_department TEXT, -- NULL means applies to all departments
  applies_to_location TEXT,  -- NULL means applies to all locations
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policies_org ON offboarding_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_policies_default ON offboarding_policies(org_id, is_default);

-- Update employees table to add offboarding fields
ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES offboarding_policies(id),
  ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN DEFAULT false;

-- Note: status field already exists in employees table, we'll use: 'active', 'offboarding', 'offboarded', 'rehired'

-- Offboarding requests table
CREATE TABLE IF NOT EXISTS offboarding_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL UNIQUE,
  policy_snapshot JSONB NOT NULL, -- freeze effective policy values at request time
  reason TEXT,
  survey_json JSONB, -- free-form Q&A exit survey
  notice_period_days INTEGER NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_working_day DATE NOT NULL, -- requestedAt + noticePeriodDays (allow HR edit)
  status offboarding_status NOT NULL DEFAULT 'pending',
  letter_url TEXT, -- URL to generated PDF
  fnf_pay_date DATE, -- computed scheduling (15th of next month if eligible)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offboarding_org ON offboarding_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON offboarding_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_status ON offboarding_requests(status);
CREATE INDEX IF NOT EXISTS idx_offboarding_requested_at ON offboarding_requests(requested_at);

-- Approvals table (for HR, Manager, CEO approvals)
CREATE TABLE IF NOT EXISTS offboarding_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
  role approver_role NOT NULL,
  approver_id UUID REFERENCES profiles(id), -- NULL if auto-approved
  decision approval_decision NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(offboarding_id, role)
);

CREATE INDEX IF NOT EXISTS idx_approvals_offboarding ON offboarding_approvals(offboarding_id);
CREATE INDEX IF NOT EXISTS idx_approvals_role ON offboarding_approvals(role, decision);

-- Verifications table (masked email, phone, address verification with OTP)
CREATE TABLE IF NOT EXISTS offboarding_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
  type verification_type NOT NULL,
  masked_value TEXT NOT NULL, -- e.g. s***k@g***l.com, 9******321
  actual_value TEXT, -- stored temporarily for OTP sending, should be purged after verification
  otp_code TEXT, -- hashed OTP
  otp_expires_at TIMESTAMPTZ,
  state verification_state NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(offboarding_id, type)
);

CREATE INDEX IF NOT EXISTS idx_verifications_offboarding ON offboarding_verifications(offboarding_id);
CREATE INDEX IF NOT EXISTS idx_verifications_state ON offboarding_verifications(state);

-- Exit checklist table (tracks blockers: leaves, finances, assets, compliance)
CREATE TABLE IF NOT EXISTS exit_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL UNIQUE,
  leaves_remaining INTEGER DEFAULT 0,
  financials_due BIGINT DEFAULT 0, -- store in minor currency units (paise)
  assets_pending INTEGER DEFAULT 0, -- count of assets to return
  compliance_clear BOOLEAN DEFAULT false,
  finance_clear BOOLEAN DEFAULT false,
  it_clear BOOLEAN DEFAULT false,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_offboarding ON exit_checklists(offboarding_id);

-- Rehire requests table
CREATE TABLE IF NOT EXISTS rehire_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  former_emp_id UUID, -- reference to offboarded_identity
  offboarded_identity_id UUID, -- FK to offboarded_identities
  new_employee_id UUID REFERENCES employees(id), -- set after rehire approved and employee created/restored
  status rehire_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rehire_org ON rehire_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_rehire_status ON rehire_requests(status);

-- Rehire approvals table
CREATE TABLE IF NOT EXISTS rehire_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rehire_id UUID REFERENCES rehire_requests(id) ON DELETE CASCADE NOT NULL,
  role approver_role NOT NULL CHECK (role IN ('hr', 'manager')), -- CEO not needed for rehire
  approver_id UUID REFERENCES profiles(id),
  decision approval_decision NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rehire_id, role)
);

CREATE INDEX IF NOT EXISTS idx_rehire_approvals_rehire ON rehire_approvals(rehire_id);

-- Offboarded identities table (minimal retained data for rehire matching)
CREATE TABLE IF NOT EXISTS offboarded_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  former_emp_id UUID NOT NULL, -- original employee.id
  emp_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email_hash TEXT NOT NULL, -- SHA-256 hash of email for matching (never store plaintext)
  last_working_day DATE NOT NULL,
  designation TEXT,
  grade TEXT,
  reason TEXT,
  letter_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, former_emp_id)
);

CREATE INDEX IF NOT EXISTS idx_offboarded_org ON offboarded_identities(org_id);
CREATE INDEX IF NOT EXISTS idx_offboarded_email_hash ON offboarded_identities(email_hash);
CREATE INDEX IF NOT EXISTS idx_offboarded_emp_code ON offboarded_identities(emp_code);

-- Add updated_at trigger for new tables
CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON offboarding_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offboarding_requests_updated_at
  BEFORE UPDATE ON offboarding_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exit_checklists_updated_at
  BEFORE UPDATE ON exit_checklists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rehire_requests_updated_at
  BEFORE UPDATE ON rehire_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

