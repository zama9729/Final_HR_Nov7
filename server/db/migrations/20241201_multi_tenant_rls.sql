-- Multi-Tenant Migration with RLS
-- Adds slug to organizations, creates new tables, and implements Row-Level Security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update organizations table to add slug
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Update app_role enum to include ADMIN (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('INVITED', 'ACTIVE');
  END IF;
END $$;

-- Update profiles to add status (map to user_status enum)
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS status user_status DEFAULT 'ACTIVE';

-- Create users view/table (we'll use profiles as users, but add status field)
-- Note: profiles table already exists, we just added status

-- Create policy_catalog table
CREATE TABLE IF NOT EXISTS policy_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  value_type TEXT NOT NULL CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_catalog_key ON policy_catalog(key);
CREATE INDEX IF NOT EXISTS idx_policy_catalog_category ON policy_catalog(category);

-- Create org_policies table
CREATE TABLE IF NOT EXISTS org_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  policy_key TEXT REFERENCES policy_catalog(key) ON DELETE CASCADE NOT NULL,
  value JSONB NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(org_id, policy_key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_org_policies_org_id ON org_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_org_policies_key ON org_policies(policy_key);
CREATE INDEX IF NOT EXISTS idx_org_policies_dates ON org_policies(effective_from, effective_to);

-- Create employee_policies table
CREATE TABLE IF NOT EXISTS employee_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  policy_key TEXT REFERENCES policy_catalog(key) ON DELETE CASCADE NOT NULL,
  value JSONB NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, policy_key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_employee_policies_user_id ON employee_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_policies_key ON employee_policies(policy_key);
CREATE INDEX IF NOT EXISTS idx_employee_policies_dates ON employee_policies(effective_from, effective_to);

-- Create promotion_cycles table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_period') THEN
    CREATE TYPE promotion_period AS ENUM ('QUARTERLY', 'H1', 'ANNUAL', 'CUSTOM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_cycle_status') THEN
    CREATE TYPE promotion_cycle_status AS ENUM ('DRAFT', 'OPEN', 'REVIEW', 'APPROVAL', 'CLOSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS promotion_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  period promotion_period NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status promotion_cycle_status DEFAULT 'DRAFT',
  criteria JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_cycles_org_id ON promotion_cycles(org_id);
CREATE INDEX IF NOT EXISTS idx_promotion_cycles_status ON promotion_cycles(status);
CREATE INDEX IF NOT EXISTS idx_promotion_cycles_dates ON promotion_cycles(start_date, end_date);

-- Create promotion_evaluations table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_recommendation') THEN
    CREATE TYPE promotion_recommendation AS ENUM ('NONE', 'PROMOTE', 'HOLD');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS promotion_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id UUID REFERENCES promotion_cycles(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  manager_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rating NUMERIC(3,2) CHECK (rating >= 0 AND rating <= 5),
  remarks TEXT,
  recommendation promotion_recommendation DEFAULT 'NONE',
  attachments JSONB,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_cycle_id ON promotion_evaluations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_employee_id ON promotion_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_cycle_employee ON promotion_evaluations(cycle_id, employee_id);

-- Create invite_tokens table
CREATE TABLE IF NOT EXISTS invite_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_org_id ON invite_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON invite_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires ON invite_tokens(expires_at);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_object ON audit_logs(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable Row-Level Security on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS org_isolation_orgs ON organizations;
DROP POLICY IF EXISTS org_isolation_users ON profiles;
DROP POLICY IF EXISTS org_isolation_org_policies ON org_policies;
DROP POLICY IF EXISTS org_isolation_employee_policies ON employee_policies;
DROP POLICY IF EXISTS org_isolation_cycles ON promotion_cycles;
DROP POLICY IF EXISTS org_isolation_evals ON promotion_evaluations;
DROP POLICY IF EXISTS org_isolation_audit ON audit_logs;
DROP POLICY IF EXISTS org_isolation_invites ON invite_tokens;

-- Create RLS policies
-- Note: We'll use a session variable app.org_id set by middleware
-- Use SET LOCAL for transaction-scoped RLS (better for connection pooling)
-- Policy: rows must match current org
CREATE POLICY org_isolation_orgs ON organizations
  USING (id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_users ON profiles
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_org_policies ON org_policies
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_employee_policies ON employee_policies
  USING (user_id IN (SELECT id FROM profiles WHERE tenant_id = current_setting('app.org_id', true)::uuid));

CREATE POLICY org_isolation_cycles ON promotion_cycles
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_evals ON promotion_evaluations
  USING (cycle_id IN (SELECT id FROM promotion_cycles WHERE org_id = current_setting('app.org_id', true)::uuid));

CREATE POLICY org_isolation_audit ON audit_logs
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_invites ON invite_tokens
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- Also enable RLS on existing tenant-scoped tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for existing tables
DROP POLICY IF EXISTS org_isolation_employees ON employees;
DROP POLICY IF EXISTS org_isolation_user_roles ON user_roles;
DROP POLICY IF EXISTS org_isolation_leave_policies ON leave_policies;
DROP POLICY IF EXISTS org_isolation_leave_requests ON leave_requests;
DROP POLICY IF EXISTS org_isolation_timesheets ON timesheets;
DROP POLICY IF EXISTS org_isolation_onboarding_data ON onboarding_data;
DROP POLICY IF EXISTS org_isolation_workflows ON workflows;
DROP POLICY IF EXISTS org_isolation_appraisal_cycles ON appraisal_cycles;
DROP POLICY IF EXISTS org_isolation_performance_reviews ON performance_reviews;
DROP POLICY IF EXISTS org_isolation_shifts ON shifts;
DROP POLICY IF EXISTS org_isolation_notifications ON notifications;
DROP POLICY IF EXISTS org_isolation_approvals ON approvals;

CREATE POLICY org_isolation_employees ON employees
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_user_roles ON user_roles
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_leave_policies ON leave_policies
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_leave_requests ON leave_requests
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_timesheets ON timesheets
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_onboarding_data ON onboarding_data
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_workflows ON workflows
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_appraisal_cycles ON appraisal_cycles
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_performance_reviews ON performance_reviews
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_shifts ON shifts
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_notifications ON notifications
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY org_isolation_approvals ON approvals
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- Helper function to resolve policy value (employee override > org policy)
CREATE OR REPLACE FUNCTION resolve_policy_value(
  _user_id UUID,
  _policy_key TEXT,
  _date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _org_id UUID;
  _employee_value JSONB;
  _org_value JSONB;
BEGIN
  -- Get user's org_id
  SELECT tenant_id INTO _org_id FROM profiles WHERE id = _user_id;
  
  IF _org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check for employee override (active on date)
  SELECT value INTO _employee_value
  FROM employee_policies
  WHERE user_id = _user_id
    AND policy_key = _policy_key
    AND effective_from <= _date
    AND (effective_to IS NULL OR effective_to >= _date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  -- If employee override exists, return it
  IF _employee_value IS NOT NULL THEN
    RETURN _employee_value;
  END IF;
  
  -- Otherwise, get org policy (active on date)
  SELECT value INTO _org_value
  FROM org_policies
  WHERE org_id = _org_id
    AND policy_key = _policy_key
    AND effective_from <= _date
    AND (effective_to IS NULL OR effective_to >= _date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN _org_value;
END;
$$;

