-- Run this SQL script to create the approvals table if it doesn't exist
-- This fixes the "relation approvals does not exist" error

-- Create approval_status enum type if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('pending','approved','rejected');
  END IF;
END $$;

-- Create approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  resource_type TEXT NOT NULL, -- e.g., 'leave' | 'expense'
  resource_id UUID NOT NULL,
  requester_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  stage_index INTEGER NOT NULL DEFAULT 0, -- 0-based index of current stage
  total_stages INTEGER NOT NULL DEFAULT 1,
  approver_id UUID REFERENCES employees(id),
  approver_type TEXT NOT NULL CHECK (approver_type IN ('manager','hr','ceo','director')),
  status approval_status NOT NULL DEFAULT 'pending',
  acted_by UUID REFERENCES employees(id),
  acted_at TIMESTAMPTZ,
  comment TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, resource_type, resource_id, approver_type, stage_index)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approvals_resource ON approvals(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Create approval_audit table
CREATE TABLE IF NOT EXISTS approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  approval_id UUID REFERENCES approvals(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'created' | 'routed' | 'approved' | 'rejected'
  actor_employee_id UUID REFERENCES employees(id),
  reason TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for approval_audit
CREATE INDEX IF NOT EXISTS idx_approval_audit_approval ON approval_audit(approval_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_tenant ON approval_audit(tenant_id);

-- Create hr_approval_thresholds table
CREATE TABLE IF NOT EXISTS hr_approval_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  leave_days_hr_threshold INTEGER NOT NULL DEFAULT 10,
  expense_amount_hr_threshold NUMERIC(12,2) NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for approvals table
DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;
CREATE TRIGGER update_approvals_updated_at
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

