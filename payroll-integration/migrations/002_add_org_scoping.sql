-- Payroll Integration Migration - Org Scoping
-- Adds org_id to Payroll tables for multi-tenant isolation
-- Run this migration on the Payroll database

-- Add org_id to key Payroll tables (adjust table names based on actual Payroll schema)
-- Example migrations - customize based on actual Payroll schema

-- Payroll runs
ALTER TABLE payroll_runs 
ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_id ON payroll_runs(org_id);

-- Payroll run employees
ALTER TABLE payroll_run_employees 
ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_org_id ON payroll_run_employees(org_id);

-- Payroll adjustments
ALTER TABLE payroll_adjustments 
ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_org_id ON payroll_adjustments(org_id);

-- Payroll payslips
ALTER TABLE payslips 
ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_payslips_org_id ON payslips(org_id);

-- Payroll tax forms
ALTER TABLE tax_forms 
ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_tax_forms_org_id ON tax_forms(org_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(org_id, payroll_role);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_status ON payroll_runs(org_id, status);

-- Note: After adding org_id columns, update existing rows:
-- UPDATE payroll_runs SET org_id = (SELECT org_id FROM users WHERE users.id = payroll_runs.created_by) WHERE org_id IS NULL;
-- Similar updates for other tables


