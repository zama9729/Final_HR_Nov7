-- Create enum types
DO $$ BEGIN
  CREATE TYPE offboarding_status AS ENUM ('pending', 'in_review', 'approved', 'denied', 'auto_approved', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create offboarding_requests table
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

CREATE INDEX IF NOT EXISTS idx_offboarding_org ON offboarding_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON offboarding_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_status ON offboarding_requests(status);

-- Create offboarding_approvals table
CREATE TABLE IF NOT EXISTS offboarding_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  approver_id UUID REFERENCES profiles(id),
  decision TEXT NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(offboarding_id, role)
);

CREATE INDEX IF NOT EXISTS idx_offboarding_approvals_request ON offboarding_approvals(offboarding_id);

