-- Onboarding enhancements: UAN capture + bank skip status

ALTER TABLE onboarding_data
    ADD COLUMN IF NOT EXISTS uan_number TEXT,
    ADD COLUMN IF NOT EXISTS bank_details_status TEXT DEFAULT 'pending';

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS uan_number TEXT;

