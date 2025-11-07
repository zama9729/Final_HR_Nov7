-- Unified HR-Payroll Database Schema Migration
-- This migration merges HR and Payroll into a single unified database
-- HR is the single source of truth for all employee and organization data
-- Payroll extends HR data through views and relationships

-- ============================================================================
-- STEP 1: Add missing payroll-specific fields to HR onboarding_data
-- ============================================================================

-- Add UAN (Universal Account Number) for EPF
ALTER TABLE onboarding_data 
  ADD COLUMN IF NOT EXISTS uan_number TEXT;

-- Add PF number (if different from UAN)
ALTER TABLE onboarding_data 
  ADD COLUMN IF NOT EXISTS pf_number TEXT;

-- Add ESI number (Employee State Insurance)
ALTER TABLE onboarding_data 
  ADD COLUMN IF NOT EXISTS esi_number TEXT;

-- Add tax declaration fields
ALTER TABLE onboarding_data 
  ADD COLUMN IF NOT EXISTS tax_declaration_section_80c DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_declaration_section_80d DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_declaration_section_24b DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_declaration_other DECIMAL(12,2) DEFAULT 0;

-- Add indexes for payroll lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_data_uan ON onboarding_data(uan_number) WHERE uan_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onboarding_data_pan ON onboarding_data(pan_number) WHERE pan_number IS NOT NULL;

-- ============================================================================
-- STEP 2: Create payroll-specific tables that reference HR tables
-- ============================================================================

-- Create payroll_status enum (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_status') THEN
    CREATE TYPE payroll_status AS ENUM ('draft', 'approved', 'processing', 'completed', 'failed', 'pending_approval', 'pending');
  END IF;
END $$;

-- Compensation structures table (references HR employees)
CREATE TABLE IF NOT EXISTS compensation_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  ctc DECIMAL(12,2) NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) DEFAULT 0,
  special_allowance DECIMAL(12,2) DEFAULT 0,
  da DECIMAL(12,2) DEFAULT 0,
  lta DECIMAL(12,2) DEFAULT 0,
  bonus DECIMAL(12,2) DEFAULT 0,
  pf_contribution DECIMAL(12,2) DEFAULT 0,
  esi_contribution DECIMAL(12,2) DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(employee_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_compensation_structures_tenant ON compensation_structures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compensation_structures_employee ON compensation_structures(employee_id);
CREATE INDEX IF NOT EXISTS idx_compensation_structures_dates ON compensation_structures(effective_from, effective_to);

-- Payroll cycles table
CREATE TABLE IF NOT EXISTS payroll_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  payday DATE,
  status payroll_status DEFAULT 'draft',
  total_employees INTEGER DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_cycles_tenant ON payroll_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_month_year ON payroll_cycles(tenant_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_status ON payroll_cycles(status);

-- Payroll items table (individual employee payslips)
CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  payroll_cycle_id UUID REFERENCES payroll_cycles(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  gross_salary DECIMAL(12,2) NOT NULL,
  deductions DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) DEFAULT 0,
  special_allowance DECIMAL(12,2) DEFAULT 0,
  pf_deduction DECIMAL(12,2) DEFAULT 0,
  esi_deduction DECIMAL(12,2) DEFAULT 0,
  tds_deduction DECIMAL(12,2) DEFAULT 0,
  pt_deduction DECIMAL(12,2) DEFAULT 0,
  other_deductions DECIMAL(12,2) DEFAULT 0,
  other_allowances DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(payroll_cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_tenant ON payroll_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_cycle ON payroll_items(payroll_cycle_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);

-- Tax declarations table (references HR employees)
CREATE TABLE IF NOT EXISTS tax_declarations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  financial_year TEXT NOT NULL,
  section_80c DECIMAL(12,2) DEFAULT 0,
  section_80d DECIMAL(12,2) DEFAULT 0,
  section_24b DECIMAL(12,2) DEFAULT 0,
  section_80g DECIMAL(12,2) DEFAULT 0,
  section_80e DECIMAL(12,2) DEFAULT 0,
  other_deductions DECIMAL(12,2) DEFAULT 0,
  total_deductions DECIMAL(12,2) DEFAULT 0,
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(employee_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_declarations_tenant ON tax_declarations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tax_declarations_employee ON tax_declarations(employee_id);
CREATE INDEX IF NOT EXISTS idx_tax_declarations_fy ON tax_declarations(financial_year);

-- Form 16 table (annual tax certificates)
CREATE TABLE IF NOT EXISTS form16 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  financial_year TEXT NOT NULL,
  pan_number TEXT,
  gross_salary DECIMAL(12,2) NOT NULL,
  total_deductions DECIMAL(12,2) DEFAULT 0,
  taxable_income DECIMAL(12,2) NOT NULL,
  tax_paid DECIMAL(12,2) DEFAULT 0,
  tax_refund DECIMAL(12,2) DEFAULT 0,
  tds_certificate_number TEXT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  generated_by UUID REFERENCES profiles(id),
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(employee_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_form16_tenant ON form16(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form16_employee ON form16(employee_id);
CREATE INDEX IF NOT EXISTS idx_form16_fy ON form16(financial_year);

-- Payroll settings table (organization-level payroll configuration)
CREATE TABLE IF NOT EXISTS payroll_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  pf_enabled BOOLEAN DEFAULT true,
  esi_enabled BOOLEAN DEFAULT false,
  pt_enabled BOOLEAN DEFAULT true,
  tds_enabled BOOLEAN DEFAULT true,
  pf_rate DECIMAL(5,2) DEFAULT 12.00,
  esi_rate DECIMAL(5,2) DEFAULT 1.75,
  pt_amount DECIMAL(8,2) DEFAULT 200.00,
  default_payday INTEGER CHECK (default_payday >= 1 AND default_payday <= 31),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_settings_tenant ON payroll_settings(tenant_id);

-- ============================================================================
-- STEP 3: Create views for Payroll to consume HR data
-- ============================================================================

-- View: payroll_employee_view - Complete employee data for payroll processing
CREATE OR REPLACE VIEW payroll_employee_view AS
SELECT 
  e.id AS employee_id,
  e.tenant_id AS org_id,
  e.employee_id AS employee_code,
  p.id AS user_id,
  p.email,
  p.first_name,
  p.last_name,
  CONCAT(p.first_name, ' ', p.last_name) AS full_name,
  p.phone,
  e.department,
  e.position AS designation,
  e.join_date AS date_of_joining,
  e.status AS employment_status,
  -- Onboarding data (payroll-specific fields)
  od.pan_number,
  od.aadhar_number AS aadhaar_number,
  od.uan_number,
  od.pf_number,
  od.esi_number,
  od.bank_account_number,
  od.bank_name,
  od.bank_branch,
  od.ifsc_code,
  od.tax_declaration_section_80c,
  od.tax_declaration_section_80d,
  od.tax_declaration_section_24b,
  od.tax_declaration_other,
  -- Current compensation
  cs.ctc,
  cs.basic_salary,
  cs.hra,
  cs.special_allowance,
  cs.da,
  cs.lta,
  cs.bonus,
  cs.pf_contribution,
  cs.esi_contribution,
  cs.effective_from AS compensation_effective_from,
  cs.effective_to AS compensation_effective_to,
  e.created_at,
  e.updated_at
FROM employees e
INNER JOIN profiles p ON e.user_id = p.id
LEFT JOIN onboarding_data od ON e.id = od.employee_id
LEFT JOIN LATERAL (
  SELECT * FROM compensation_structures cs
  WHERE cs.employee_id = e.id
    AND cs.effective_from <= CURRENT_DATE
    AND (cs.effective_to IS NULL OR cs.effective_to >= CURRENT_DATE)
  ORDER BY cs.effective_from DESC
  LIMIT 1
) cs ON true;

-- View: payroll_organization_view - Organization data for payroll
CREATE OR REPLACE VIEW payroll_organization_view AS
SELECT 
  o.id AS org_id,
  o.name AS company_name,
  o.domain,
  o.logo_url,
  o.timezone,
  ps.pf_enabled,
  ps.esi_enabled,
  ps.pt_enabled,
  ps.tds_enabled,
  ps.pf_rate,
  ps.esi_rate,
  ps.pt_amount,
  ps.default_payday
FROM organizations o
LEFT JOIN payroll_settings ps ON o.id = ps.tenant_id;

-- View: payroll_employee_payslip_view - Complete payslip data
CREATE OR REPLACE VIEW payroll_employee_payslip_view AS
SELECT 
  pi.id AS payslip_id,
  pi.tenant_id AS org_id,
  pi.employee_id,
  pev.employee_code,
  pev.full_name,
  pev.email,
  pev.department,
  pev.designation,
  pc.id AS payroll_cycle_id,
  pc.month,
  pc.year,
  pc.payday,
  pc.status AS cycle_status,
  pi.gross_salary,
  pi.basic_salary,
  pi.hra,
  pi.special_allowance,
  pi.pf_deduction,
  pi.esi_deduction,
  pi.tds_deduction,
  pi.pt_deduction,
  pi.other_deductions,
  pi.other_allowances,
  pi.deductions,
  pi.net_salary,
  pi.created_at AS payslip_generated_at,
  pi.updated_at AS payslip_updated_at
FROM payroll_items pi
INNER JOIN payroll_cycles pc ON pi.payroll_cycle_id = pc.id
INNER JOIN payroll_employee_view pev ON pi.employee_id = pev.employee_id;

-- ============================================================================
-- STEP 4: Enable Row-Level Security (RLS) on payroll tables
-- ============================================================================

-- Enable RLS on all payroll tables
ALTER TABLE compensation_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE form16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for compensation_structures
DROP POLICY IF EXISTS org_isolation_compensation_structures ON compensation_structures;
CREATE POLICY org_isolation_compensation_structures ON compensation_structures
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policies for payroll_cycles
DROP POLICY IF EXISTS org_isolation_payroll_cycles ON payroll_cycles;
CREATE POLICY org_isolation_payroll_cycles ON payroll_cycles
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policies for payroll_items
DROP POLICY IF EXISTS org_isolation_payroll_items ON payroll_items;
CREATE POLICY org_isolation_payroll_items ON payroll_items
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policies for tax_declarations
DROP POLICY IF EXISTS org_isolation_tax_declarations ON tax_declarations;
CREATE POLICY org_isolation_tax_declarations ON tax_declarations
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policies for form16
DROP POLICY IF EXISTS org_isolation_form16 ON form16;
CREATE POLICY org_isolation_form16 ON form16
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policies for payroll_settings
DROP POLICY IF EXISTS org_isolation_payroll_settings ON payroll_settings;
CREATE POLICY org_isolation_payroll_settings ON payroll_settings
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- ============================================================================
-- STEP 5: Create triggers for updated_at
-- ============================================================================

CREATE TRIGGER update_compensation_structures_updated_at 
  BEFORE UPDATE ON compensation_structures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payroll_cycles_updated_at 
  BEFORE UPDATE ON payroll_cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payroll_items_updated_at 
  BEFORE UPDATE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_declarations_updated_at 
  BEFORE UPDATE ON tax_declarations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_form16_updated_at 
  BEFORE UPDATE ON form16
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payroll_settings_updated_at 
  BEFORE UPDATE ON payroll_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 6: Grant permissions (if using separate roles)
-- ============================================================================

-- Note: Adjust based on your database user setup
-- GRANT SELECT ON payroll_employee_view TO payroll_app_user;
-- GRANT SELECT ON payroll_organization_view TO payroll_app_user;
-- GRANT SELECT, INSERT, UPDATE ON compensation_structures TO payroll_app_user;
-- GRANT SELECT, INSERT, UPDATE ON payroll_cycles TO payroll_app_user;
-- GRANT SELECT, INSERT, UPDATE ON payroll_items TO payroll_app_user;
-- GRANT SELECT, INSERT, UPDATE ON tax_declarations TO payroll_app_user;
-- GRANT SELECT, INSERT, UPDATE ON form16 TO payroll_app_user;
-- GRANT SELECT, INSERT, UPDATE ON payroll_settings TO payroll_app_user;

