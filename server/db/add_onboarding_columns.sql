-- Add missing columns to onboarding_data table
-- This migration adds permanent address, current address, and passport fields

-- Add permanent address fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'permanent_address'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_address TEXT;
    RAISE NOTICE 'Added permanent_address column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'permanent_city'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_city TEXT;
    RAISE NOTICE 'Added permanent_city column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'permanent_state'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_state TEXT;
    RAISE NOTICE 'Added permanent_state column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'permanent_postal_code'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_postal_code TEXT;
    RAISE NOTICE 'Added permanent_postal_code column';
  END IF;
END $$;

-- Add current address fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'current_address'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN current_address TEXT;
    RAISE NOTICE 'Added current_address column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'current_city'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN current_city TEXT;
    RAISE NOTICE 'Added current_city column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'current_state'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN current_state TEXT;
    RAISE NOTICE 'Added current_state column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'current_postal_code'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN current_postal_code TEXT;
    RAISE NOTICE 'Added current_postal_code column';
  END IF;
END $$;

-- Add passport_number field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' AND column_name = 'passport_number'
  ) THEN
    ALTER TABLE onboarding_data ADD COLUMN passport_number TEXT;
    RAISE NOTICE 'Added passport_number column';
  END IF;
END $$;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'onboarding_data' 
AND column_name IN (
  'permanent_address', 'permanent_city', 'permanent_state', 'permanent_postal_code',
  'current_address', 'current_city', 'current_state', 'current_postal_code',
  'passport_number'
)
ORDER BY column_name;

