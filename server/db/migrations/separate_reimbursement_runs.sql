-- Migration: Separate Reimbursement Runs from Payroll
-- This migration creates a new reimbursement_runs table and adds reimbursement_run_id to employee_reimbursements
-- This allows reimbursements to be processed independently of monthly payroll

-- Create reimbursement_run_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reimbursement_run_status') THEN
    CREATE TYPE reimbursement_run_status AS ENUM (
      'draft',
      'processing',
      'paid'
    );
  END IF;
END
$$;

-- Create reimbursement_runs table
CREATE TABLE IF NOT EXISTS reimbursement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status reimbursement_run_status NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_claims INTEGER NOT NULL DEFAULT 0,
  reference_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Add reimbursement_run_id column to employee_reimbursements
-- Keep payroll_run_id for historical data compatibility
ALTER TABLE employee_reimbursements
  ADD COLUMN IF NOT EXISTS reimbursement_run_id UUID REFERENCES reimbursement_runs(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reimbursement_runs_tenant_id
  ON reimbursement_runs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_reimbursement_runs_status
  ON reimbursement_runs(status);

CREATE INDEX IF NOT EXISTS idx_reimbursement_runs_run_date
  ON reimbursement_runs(run_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_reimbursements_run_id
  ON employee_reimbursements(reimbursement_run_id);

CREATE INDEX IF NOT EXISTS idx_employee_reimbursements_status_run
  ON employee_reimbursements(status, reimbursement_run_id)
  WHERE reimbursement_run_id IS NULL;

-- Add comment for documentation
COMMENT ON TABLE reimbursement_runs IS 'Separate runs for processing employee expense reimbursements independently of payroll';
COMMENT ON COLUMN employee_reimbursements.reimbursement_run_id IS 'Links reimbursement to a reimbursement run (new system). payroll_run_id is kept for historical data.';
COMMENT ON COLUMN employee_reimbursements.payroll_run_id IS 'Historical reference to payroll runs. New reimbursements should use reimbursement_run_id instead.';

