-- Add bank details columns to employees table for bank transfer file export
-- These columns are used to generate bank transfer files for salary disbursement

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN employees.bank_account_number IS 'Employee bank account number for salary transfer';
COMMENT ON COLUMN employees.bank_ifsc_code IS 'Bank IFSC code for salary transfer';
COMMENT ON COLUMN employees.bank_name IS 'Bank name for salary transfer';

