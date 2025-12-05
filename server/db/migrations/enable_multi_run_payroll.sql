-- Migration: Enable Multi-Run Payroll Support
-- Description: Adds support for multiple payroll runs per month (regular and off-cycle)
-- Date: 2025-02-03

-- Step 1: Add run_type column to payroll_runs table
-- Default to 'regular' for backward compatibility
ALTER TABLE payroll_runs
ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'regular'
CHECK (run_type IN ('regular', 'off_cycle'));

-- Create index for efficient querying by run_type
CREATE INDEX IF NOT EXISTS idx_payroll_runs_run_type ON payroll_runs(run_type);

-- Step 2: Add already_paid_cents column to payroll_run_employees table
-- This stores the amount already paid in previous runs for audit trails
ALTER TABLE payroll_run_employees
ADD COLUMN IF NOT EXISTS already_paid_cents BIGINT NOT NULL DEFAULT 0
CHECK (already_paid_cents >= 0);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_already_paid ON payroll_run_employees(already_paid_cents);

-- Step 3: Add comment for documentation
COMMENT ON COLUMN payroll_runs.run_type IS 'Type of payroll run: regular (final settlement) or off_cycle (advance/partial payment)';
COMMENT ON COLUMN payroll_run_employees.already_paid_cents IS 'Amount already paid to employee in previous runs within the same pay period (in cents)';

