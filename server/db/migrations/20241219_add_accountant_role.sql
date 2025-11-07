-- Migration: Add accountant role to app_role enum
-- Date: 2024-12-19

-- Add accountant role to enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'accountant' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'accountant';
  END IF;
END $$;

-- Add comment to document the role
COMMENT ON TYPE app_role IS 'User roles: employee, manager, hr, director, ceo, admin, accountant';

