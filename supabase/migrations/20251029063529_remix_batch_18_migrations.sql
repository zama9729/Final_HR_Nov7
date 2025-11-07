
-- Migration: 20251028074932
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('employee', 'manager', 'hr', 'director', 'ceo');

-- Create enum for onboarding status
CREATE TYPE public.onboarding_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create enum for leave policy type
CREATE TYPE public.leave_type AS ENUM ('annual', 'sick', 'casual', 'maternity', 'paternity', 'bereavement');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'ceo' THEN 1
    WHEN 'director' THEN 2
    WHEN 'hr' THEN 3
    WHEN 'manager' THEN 4
    WHEN 'employee' THEN 5
  END
  LIMIT 1
$$;

-- Create employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  department TEXT,
  position TEXT,
  reporting_manager_id UUID REFERENCES public.employees(id),
  work_location TEXT,
  join_date DATE,
  status TEXT DEFAULT 'active',
  onboarding_status onboarding_status DEFAULT 'pending',
  temporary_password TEXT,
  must_change_password BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Create onboarding_data table
CREATE TABLE public.onboarding_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE NOT NULL,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  ifsc_code TEXT,
  pan_number TEXT,
  aadhar_number TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.onboarding_data ENABLE ROW LEVEL SECURITY;

-- Create leave_policies table
CREATE TABLE public.leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
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

ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;

-- Create workflows table
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  workflow_json JSONB NOT NULL,
  status TEXT DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "HR can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "HR can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "HR can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "HR can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

-- RLS Policies for employees
CREATE POLICY "Users can view their own employee record"
  ON public.employees FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view their team"
  ON public.employees FOR SELECT
  USING (
    public.has_role(auth.uid(), 'manager') AND 
    reporting_manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "HR can view all employees"
  ON public.employees FOR SELECT
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "HR can insert employees"
  ON public.employees FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "HR can update employees"
  ON public.employees FOR UPDATE
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "Employees can update their own record"
  ON public.employees FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for onboarding_data
CREATE POLICY "Users can view their own onboarding data"
  ON public.onboarding_data FOR SELECT
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own onboarding data"
  ON public.onboarding_data FOR UPDATE
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own onboarding data"
  ON public.onboarding_data FOR INSERT
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "HR can view all onboarding data"
  ON public.onboarding_data FOR SELECT
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "HR can insert onboarding data"
  ON public.onboarding_data FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

-- RLS Policies for leave_policies
CREATE POLICY "Everyone can view active leave policies"
  ON public.leave_policies FOR SELECT
  USING (is_active = true);

CREATE POLICY "HR can manage leave policies"
  ON public.leave_policies FOR ALL
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

-- RLS Policies for workflows
CREATE POLICY "Everyone can view active workflows"
  ON public.workflows FOR SELECT
  USING (status = 'active');

CREATE POLICY "HR can manage workflows"
  ON public.workflows FOR ALL
  USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'ceo'));

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_onboarding_data_updated_at
  BEFORE UPDATE ON public.onboarding_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_policies_updated_at
  BEFORE UPDATE ON public.leave_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: 20251028082158
-- Update the handle_new_user function to assign roles
-- First user gets CEO role, subsequent users get employee role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  
  -- Count existing users with roles
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  -- Assign CEO role to first user, employee role to others
  IF user_count = 0 THEN
    assigned_role := 'ceo';
  ELSE
    assigned_role := 'employee';
  END IF;
  
  -- Insert user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role);
  
  RETURN NEW;
END;
$$;

-- Migration: 20251028083853
-- Add 'not_started' to onboarding_status enum
ALTER TYPE onboarding_status ADD VALUE IF NOT EXISTS 'not_started';

-- Add security question columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS security_question_1 TEXT,
ADD COLUMN IF NOT EXISTS security_answer_1 TEXT,
ADD COLUMN IF NOT EXISTS security_question_2 TEXT,
ADD COLUMN IF NOT EXISTS security_answer_2 TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_onboarding_status ON public.employees(onboarding_status);

-- Migration: 20251028083959
-- Update handle_new_user to only create profile, not roles
-- Roles are now handled by edge functions or signup flow
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  
  -- Only assign role if this is first user OR if it's a signup (not created by edge function)
  -- Edge function sets needs_password_setup metadata
  IF NEW.raw_user_meta_data->>'needs_password_setup' IS NULL THEN
    -- This is a regular signup, check if first user
    SELECT COUNT(*) INTO user_count FROM public.user_roles;
    
    IF user_count = 0 THEN
      assigned_role := 'ceo';
    ELSE
      assigned_role := 'employee';
    END IF;
    
    -- Insert user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, assigned_role);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Migration: 20251028085507
-- Add foreign key constraint from employees.user_id to profiles.id
ALTER TABLE public.employees 
DROP CONSTRAINT IF EXISTS employees_user_id_fkey;

ALTER TABLE public.employees 
ADD CONSTRAINT employees_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- Migration: 20251028090039
-- Create security definer function to get employee's manager ID
CREATE OR REPLACE FUNCTION public.get_employee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

-- Drop and recreate the manager policy to use the function
DROP POLICY IF EXISTS "Managers can view their team" ON public.employees;

CREATE POLICY "Managers can view their team" 
ON public.employees 
FOR SELECT 
USING (
  has_role(auth.uid(), 'manager') 
  AND reporting_manager_id = get_employee_id(auth.uid())
);

-- Migration: 20251028093004
-- Create timesheets table
CREATE TABLE public.timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  total_hours DECIMAL(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.employees(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create timesheet_entries table for daily breakdown
CREATE TABLE public.timesheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  hours DECIMAL(4,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create leave_requests table
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id UUID REFERENCES public.leave_policies(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.employees(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Timesheets RLS Policies
CREATE POLICY "Employees can view their own timesheets"
  ON public.timesheets FOR SELECT
  USING (employee_id = get_employee_id(auth.uid()));

CREATE POLICY "Employees can insert their own timesheets"
  ON public.timesheets FOR INSERT
  WITH CHECK (employee_id = get_employee_id(auth.uid()));

CREATE POLICY "Employees can update their pending timesheets"
  ON public.timesheets FOR UPDATE
  USING (employee_id = get_employee_id(auth.uid()) AND status = 'pending');

CREATE POLICY "Managers can view their team timesheets"
  ON public.timesheets FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees 
      WHERE reporting_manager_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "Managers can update their team timesheets"
  ON public.timesheets FOR UPDATE
  USING (
    employee_id IN (
      SELECT id FROM public.employees 
      WHERE reporting_manager_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "HR can view all timesheets"
  ON public.timesheets FOR SELECT
  USING (has_role(auth.uid(), 'hr'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'ceo'::app_role));

-- Timesheet entries RLS
CREATE POLICY "Users can manage entries for their timesheets"
  ON public.timesheet_entries FOR ALL
  USING (
    timesheet_id IN (
      SELECT id FROM public.timesheets 
      WHERE employee_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "Managers can view team timesheet entries"
  ON public.timesheet_entries FOR SELECT
  USING (
    timesheet_id IN (
      SELECT t.id FROM public.timesheets t
      JOIN public.employees e ON t.employee_id = e.id
      WHERE e.reporting_manager_id = get_employee_id(auth.uid())
    )
  );

-- Leave requests RLS Policies
CREATE POLICY "Employees can view their own leave requests"
  ON public.leave_requests FOR SELECT
  USING (employee_id = get_employee_id(auth.uid()));

CREATE POLICY "Employees can insert their own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (employee_id = get_employee_id(auth.uid()));

CREATE POLICY "Employees can update their pending leave requests"
  ON public.leave_requests FOR UPDATE
  USING (employee_id = get_employee_id(auth.uid()) AND status = 'pending');

CREATE POLICY "Managers can view their team leave requests"
  ON public.leave_requests FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees 
      WHERE reporting_manager_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "Managers can update their team leave requests"
  ON public.leave_requests FOR UPDATE
  USING (
    employee_id IN (
      SELECT id FROM public.employees 
      WHERE reporting_manager_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "HR can view all leave requests"
  ON public.leave_requests FOR SELECT
  USING (has_role(auth.uid(), 'hr'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'ceo'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_timesheets_updated_at
  BEFORE UPDATE ON public.timesheets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251028093719
-- Drop existing manager policies that might be causing issues
DROP POLICY IF EXISTS "Managers can view their team timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Managers can update their team timesheets" ON public.timesheets;

-- Create improved policies for managers
CREATE POLICY "Managers can view their team timesheets"
  ON public.timesheets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = timesheets.employee_id
      AND e.reporting_manager_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "Managers can update their team timesheets"
  ON public.timesheets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = timesheets.employee_id
      AND e.reporting_manager_id = get_employee_id(auth.uid())
    )
  );

-- Same fix for leave requests
DROP POLICY IF EXISTS "Managers can view their team leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Managers can update their team leave requests" ON public.leave_requests;

CREATE POLICY "Managers can view their team leave requests"
  ON public.leave_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_requests.employee_id
      AND e.reporting_manager_id = get_employee_id(auth.uid())
    )
  );

CREATE POLICY "Managers can update their team leave requests"
  ON public.leave_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_requests.employee_id
      AND e.reporting_manager_id = get_employee_id(auth.uid())
    )
  );

-- Migration: 20251028095155
-- Add policy to allow all authenticated users to view employees for org chart
CREATE POLICY "All authenticated users can view employees for org chart"
ON public.employees
FOR SELECT
TO authenticated
USING (true);

-- Migration: 20251028100130
-- Enable realtime for timesheets and leave_requests tables for live notification updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.timesheets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;

-- Migration: 20251028102106
-- Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text UNIQUE NOT NULL,
  company_size text,
  industry text,
  timezone text DEFAULT 'Asia/Kolkata',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Add tenant_id columns
ALTER TABLE public.employees ADD COLUMN tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Helper function to get user's tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- Update signup trigger for CEO/org creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  assigned_role app_role;
  org_id uuid;
BEGIN
  -- Check if org signup (has org metadata)
  IF NEW.raw_user_meta_data->>'org_name' IS NOT NULL THEN
    INSERT INTO public.organizations (name, domain, company_size, industry, timezone)
    VALUES (
      NEW.raw_user_meta_data->>'org_name',
      NEW.raw_user_meta_data->>'domain',
      NEW.raw_user_meta_data->>'company_size',
      NEW.raw_user_meta_data->>'industry',
      COALESCE(NEW.raw_user_meta_data->>'timezone', 'Asia/Kolkata')
    )
    RETURNING id INTO org_id;
    assigned_role := 'ceo';
  ELSIF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    -- Employee created by edge function
    org_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
    assigned_role := NULL;
  ELSE
    RAISE EXCEPTION 'No organization specified';
  END IF;
  
  INSERT INTO public.profiles (id, email, first_name, last_name, tenant_id)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name', org_id);
  
  IF assigned_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, assigned_role, org_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- RLS for organizations
CREATE POLICY "Users can view their org" ON public.organizations FOR SELECT
USING (id = get_user_tenant_id(auth.uid()));

CREATE POLICY "CEOs can update their org" ON public.organizations FOR UPDATE
USING (id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'ceo'::app_role));

-- Update employee RLS
DROP POLICY IF EXISTS "Users can view their own employee record" ON public.employees;
DROP POLICY IF EXISTS "All authenticated users can view employees for org chart" ON public.employees;
DROP POLICY IF EXISTS "HR can view all employees" ON public.employees;
DROP POLICY IF EXISTS "Managers can view their team" ON public.employees;
DROP POLICY IF EXISTS "HR can insert employees" ON public.employees;
DROP POLICY IF EXISTS "HR can update employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can update their own record" ON public.employees;

CREATE POLICY "View org employees" ON public.employees FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "HR manage org employees" ON public.employees FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND 
  (has_role(auth.uid(), 'hr'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'ceo'::app_role)));

-- Update profile RLS
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "HR can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "View org profiles" ON public.profiles FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Update user_roles RLS
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "HR can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "HR can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "HR can update roles" ON public.user_roles;

CREATE POLICY "View org roles" ON public.user_roles FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "HR manage org roles" ON public.user_roles FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND 
  (has_role(auth.uid(), 'hr'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'ceo'::app_role)));

-- Migration: 20251028102221
-- Add tenant_id to remaining tables
ALTER TABLE public.timesheets ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.timesheet_entries ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.leave_policies ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Clean up old test data
DELETE FROM timesheet_entries WHERE tenant_id IS NULL;
DELETE FROM timesheets WHERE tenant_id IS NULL;
DELETE FROM leave_requests WHERE tenant_id IS NULL;
DELETE FROM onboarding_data WHERE tenant_id IS NULL;
DELETE FROM employees WHERE tenant_id IS NULL;
DELETE FROM profiles WHERE tenant_id IS NULL;

-- Migration: 20251028102911
-- Delete all data in correct order to avoid foreign key violations
DELETE FROM timesheet_entries;
DELETE FROM timesheets;
DELETE FROM leave_requests;
DELETE FROM onboarding_data;
DELETE FROM employees;
DELETE FROM user_roles;
DELETE FROM profiles;
DELETE FROM leave_policies;
DELETE FROM workflows;
DELETE FROM organizations;

-- Migration: 20251028102924
-- Delete all auth users (this will cascade delete everything)
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    PERFORM auth.uid();  -- Just to ensure we're in the right context
    DELETE FROM auth.users WHERE id = user_record.id;
  END LOOP;
END $$;

-- Migration: 20251028103416
-- Create storage bucket for organization logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for org-logos bucket
CREATE POLICY "Anyone can view org logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-logos');

CREATE POLICY "CEOs can upload their org logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'org-logos' AND
  (storage.foldername(name))[1] = (SELECT tenant_id::text FROM profiles WHERE id = auth.uid()) AND
  (has_role(auth.uid(), 'ceo'::app_role))
);

CREATE POLICY "CEOs can update their org logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'org-logos' AND
  (storage.foldername(name))[1] = (SELECT tenant_id::text FROM profiles WHERE id = auth.uid()) AND
  (has_role(auth.uid(), 'ceo'::app_role))
);

CREATE POLICY "CEOs can delete their org logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'org-logos' AND
  (storage.foldername(name))[1] = (SELECT tenant_id::text FROM profiles WHERE id = auth.uid()) AND
  (has_role(auth.uid(), 'ceo'::app_role))
);

-- Add logo_url to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url text;

-- Migration: 20251028125911
-- Create appraisal_cycles table
CREATE TABLE public.appraisal_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  cycle_name TEXT NOT NULL,
  cycle_year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'draft')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create performance_reviews table
CREATE TABLE public.performance_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  appraisal_cycle_id UUID NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.employees(id),
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

-- Enable RLS
ALTER TABLE public.appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for appraisal_cycles
CREATE POLICY "HR can manage appraisal cycles"
ON public.appraisal_cycles
FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  (has_role(auth.uid(), 'hr') OR has_role(auth.uid(), 'director') OR has_role(auth.uid(), 'ceo'))
);

CREATE POLICY "Managers can view appraisal cycles"
ON public.appraisal_cycles
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  has_role(auth.uid(), 'manager')
);

-- RLS Policies for performance_reviews
CREATE POLICY "Employees can view their own reviews"
ON public.performance_reviews
FOR SELECT
USING (employee_id = get_employee_id(auth.uid()));

CREATE POLICY "Managers can view and manage their team reviews"
ON public.performance_reviews
FOR ALL
USING (
  reviewer_id = get_employee_id(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = performance_reviews.employee_id
    AND e.reporting_manager_id = get_employee_id(auth.uid())
  )
);

CREATE POLICY "HR can manage all reviews"
ON public.performance_reviews
FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  (has_role(auth.uid(), 'hr') OR has_role(auth.uid(), 'director') OR has_role(auth.uid(), 'ceo'))
);

-- Add trigger for updated_at
CREATE TRIGGER update_appraisal_cycles_updated_at
  BEFORE UPDATE ON public.appraisal_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_reviews_updated_at
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251029042602
-- Create shifts table
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_type TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "HR can manage all shifts"
ON public.shifts
FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND 
  (has_role(auth.uid(), 'hr') OR has_role(auth.uid(), 'director') OR has_role(auth.uid(), 'ceo'))
);

CREATE POLICY "Managers can manage their team shifts"
ON public.shifts
FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  has_role(auth.uid(), 'manager') AND
  employee_id IN (
    SELECT id FROM public.employees 
    WHERE reporting_manager_id = get_employee_id(auth.uid())
  )
);

CREATE POLICY "Employees can view their own shifts"
ON public.shifts
FOR SELECT
USING (
  employee_id = get_employee_id(auth.uid())
);

-- Add updated_at trigger
CREATE TRIGGER update_shifts_updated_at
BEFORE UPDATE ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20251029043258
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- Enable realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
