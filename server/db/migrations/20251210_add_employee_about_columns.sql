-- Add about_me, job_love, and hobbies columns to employees table
-- These columns are used for employee onboarding "About Me" section

ALTER TABLE employees ADD COLUMN IF NOT EXISTS about_me TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_love TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hobbies TEXT;

-- Add comments for documentation
COMMENT ON COLUMN employees.about_me IS 'Employee personal introduction/about me text';
COMMENT ON COLUMN employees.job_love IS 'What the employee loves about their job';
COMMENT ON COLUMN employees.hobbies IS 'Employee hobbies and interests';

