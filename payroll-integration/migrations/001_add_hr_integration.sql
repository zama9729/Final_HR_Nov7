-- Payroll Integration Migration
-- Adds HR system integration columns and tables
-- Run this migration on the Payroll database

-- Step 1: Add HR user ID and org ID to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS hr_user_id UUID,
ADD COLUMN IF NOT EXISTS org_id UUID;

-- Step 2: Add unique constraint on hr_user_id (once backfilled)
-- Note: Make this non-null after ETL backfill completes
-- ALTER TABLE users ALTER COLUMN hr_user_id SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_users_hr_user_id ON users(hr_user_id);

-- Step 3: Create extension table for Payroll-specific fields
CREATE TABLE IF NOT EXISTS payroll_user_ext (
  hr_user_id UUID PRIMARY KEY,
  bank_account VARCHAR(64),
  bank_name VARCHAR(255),
  bank_branch VARCHAR(255),
  ifsc_code VARCHAR(16),
  pan VARCHAR(16),
  aadhar VARCHAR(16),
  passport VARCHAR(32),
  tax_reg_no VARCHAR(32),
  esi_number VARCHAR(32),
  pf_number VARCHAR(32),
  uan VARCHAR(32),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 4: Create organizations mapping table (if Payroll has separate orgs table)
CREATE TABLE IF NOT EXISTS payroll_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_org_id UUID UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 5: Add org_id to existing Payroll tables (if needed)
-- Example: ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS org_id UUID;

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_hr_user_id ON users(hr_user_id);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_payroll_user_ext_hr_user_id ON payroll_user_ext(hr_user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_orgs_hr_org_id ON payroll_orgs(hr_org_id);

-- Step 7: Add payroll_role column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS payroll_role VARCHAR(50) CHECK (payroll_role IN ('payroll_admin', 'payroll_employee'));

CREATE INDEX IF NOT EXISTS idx_users_payroll_role ON users(payroll_role);

-- Step 8: Add updated_at trigger for payroll_user_ext
CREATE OR REPLACE FUNCTION update_payroll_user_ext_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS update_payroll_user_ext_updated_at
  BEFORE UPDATE ON payroll_user_ext
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_user_ext_updated_at();

-- Step 9: Add updated_at trigger for payroll_orgs
CREATE TRIGGER IF NOT EXISTS update_payroll_orgs_updated_at
  BEFORE UPDATE ON payroll_orgs
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_user_ext_updated_at();

-- Verification queries (run after migration)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('hr_user_id', 'org_id', 'payroll_role');
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('payroll_user_ext', 'payroll_orgs');




