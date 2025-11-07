-- Fix typo: permanant_address -> permanent_address
-- Run this if your database has the typo 'permanant_address' instead of 'permanent_address'

-- Check if permanant_address column exists (with typo)
DO $$
BEGIN
  -- Check if the typo column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'onboarding_data' 
    AND column_name = 'permanant_address'
  ) THEN
    -- Rename the typo column to correct name
    ALTER TABLE onboarding_data RENAME COLUMN permanant_address TO permanent_address;
    RAISE NOTICE 'Renamed permanant_address to permanent_address';
    
    -- Check and rename other typo columns if they exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanant_city') THEN
      ALTER TABLE onboarding_data RENAME COLUMN permanant_city TO permanent_city;
      RAISE NOTICE 'Renamed permanant_city to permanent_city';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanant_state') THEN
      ALTER TABLE onboarding_data RENAME COLUMN permanant_state TO permanent_state;
      RAISE NOTICE 'Renamed permanant_state to permanent_state';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanant_postal_code') THEN
      ALTER TABLE onboarding_data RENAME COLUMN permanant_postal_code TO permanent_postal_code;
      RAISE NOTICE 'Renamed permanant_postal_code to permanent_postal_code';
    END IF;
  ELSE
    RAISE NOTICE 'No typo found - columns already have correct names';
  END IF;
END $$;

-- Verify the columns now exist with correct names
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'onboarding_data' 
AND column_name LIKE 'permanent%'
ORDER BY column_name;

