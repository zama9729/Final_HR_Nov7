-- Complete Database Schema for HR Suite
-- No Supabase dependencies - Pure PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE app_role AS ENUM ('employee', 'manager', 'hr', 'director', 'ceo', 'admin');
CREATE TYPE onboarding_status AS ENUM ('pending', 'in_progress', 'completed', 'not_started');
CREATE TYPE leave_type AS ENUM ('annual', 'sick', 'casual', 'maternity', 'paternity', 'bereavement');

-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  company_size TEXT,
  industry TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Profiles table (users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  security_question_1 TEXT,
  security_answer_1 TEXT,
  security_question_2 TEXT,
  security_answer_2 TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User authentication table (password hashes)
CREATE TABLE user_auth (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User roles table
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  department TEXT,
  position TEXT,
  reporting_manager_id UUID REFERENCES employees(id),
  work_location TEXT,
  join_date DATE,
  status TEXT DEFAULT 'active',
  onboarding_status onboarding_status DEFAULT 'pending',
  temporary_password TEXT,
  must_change_password BOOLEAN DEFAULT true,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Onboarding data table
CREATE TABLE onboarding_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE UNIQUE NOT NULL,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  permanent_address TEXT,
  permanent_city TEXT,
  permanent_state TEXT,
  permanent_postal_code TEXT,
  current_address TEXT,
  current_city TEXT,
  current_state TEXT,
  current_postal_code TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  ifsc_code TEXT,
  pan_number TEXT,
  aadhar_number TEXT,
  passport_number TEXT,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Leave policies table
CREATE TABLE leave_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  leave_type leave_type NOT NULL,
  annual_entitlement INTEGER NOT NULL,
  probation_entitlement INTEGER DEFAULT 0,
  accrual_frequency TEXT,
  carry_forward_allowed BOOLEAN DEFAULT false,
  max_carry_forward INTEGER DEFAULT 0,
  encashment_allowed BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Leave requests table
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  leave_type_id UUID REFERENCES leave_policies(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Timesheets table
CREATE TABLE timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  total_hours DECIMAL(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Timesheet entries table
CREATE TABLE timesheet_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID REFERENCES timesheets(id) ON DELETE CASCADE NOT NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(4,2) NOT NULL,
  description TEXT,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Workflows table
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  workflow_json JSONB NOT NULL,
  status TEXT DEFAULT 'draft',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Appraisal cycles table
CREATE TABLE appraisal_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  cycle_name TEXT NOT NULL,
  cycle_year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'draft')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Performance reviews table
CREATE TABLE performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  appraisal_cycle_id UUID REFERENCES appraisal_cycles(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  reviewer_id UUID REFERENCES employees(id) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  performance_score DECIMAL(3,2) CHECK (performance_score >= 0 AND performance_score <= 5),
  strengths TEXT,
  areas_of_improvement TEXT,
  goals TEXT,
  comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'acknowledged')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(appraisal_cycle_id, employee_id)
);

-- Shifts table
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_type TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Approvals and Approval Audit tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('pending','approved','rejected');
  END IF;
END $$;

-- approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approvals_resource ON approvals(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- approval audit log
CREATE TABLE IF NOT EXISTS approval_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  approval_id UUID REFERENCES approvals(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'created' | 'routed' | 'approved' | 'rejected'
  actor_employee_id UUID REFERENCES employees(id),
  reason TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_approval ON approval_audit(approval_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_tenant ON approval_audit(tenant_id);

-- Optional: admin-configurable thresholds per tenant
CREATE TABLE IF NOT EXISTS hr_approval_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  leave_days_hr_threshold INTEGER NOT NULL DEFAULT 10,
  expense_amount_hr_threshold NUMERIC(12,2) NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Trigger function for updated_at (if not already exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;

CREATE TRIGGER update_approvals_updated_at
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper functions (replacing Supabase RPC functions)
CREATE OR REPLACE FUNCTION get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'admin' THEN 0
    WHEN 'ceo' THEN 1
    WHEN 'director' THEN 2
    WHEN 'hr' THEN 3
    WHEN 'manager' THEN 4
    WHEN 'employee' THEN 5
  END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT tenant_id FROM profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_employee_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM employees WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Create indexes for performance
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_employees_user_id ON employees(user_id);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_tenant ON leave_requests(tenant_id);
CREATE INDEX idx_timesheets_employee ON timesheets(employee_id);
CREATE INDEX idx_timesheets_tenant ON timesheets(tenant_id);
CREATE INDEX idx_shifts_employee ON shifts(employee_id);
CREATE INDEX idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_auth_updated_at BEFORE UPDATE ON user_auth FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_onboarding_data_updated_at BEFORE UPDATE ON onboarding_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leave_policies_updated_at BEFORE UPDATE ON leave_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timesheets_updated_at BEFORE UPDATE ON timesheets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appraisal_cycles_updated_at BEFORE UPDATE ON appraisal_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_performance_reviews_updated_at BEFORE UPDATE ON performance_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

