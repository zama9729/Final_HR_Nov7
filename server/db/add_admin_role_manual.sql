-- Add admin role to app_role enum
-- Run this manually if auto-migration fails
-- Note: This cannot be run inside a transaction

-- Check if admin role exists first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'admin' 
    AND enumtypid = (
      SELECT oid 
      FROM pg_type 
      WHERE typname = 'app_role'
    )
  ) THEN
    ALTER TYPE app_role ADD VALUE 'admin';
    RAISE NOTICE 'Admin role added to app_role enum';
  ELSE
    RAISE NOTICE 'Admin role already exists in app_role enum';
  END IF;
END $$;

-- Verify it was added
SELECT unnest(enum_range(NULL::app_role))::text as role ORDER BY role;

