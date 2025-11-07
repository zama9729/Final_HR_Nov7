-- Migration: Add permanent and current address fields to onboarding_data table
-- Run this SQL script if the table already exists

-- Add permanent address fields if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanent_address') THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_address TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanent_city') THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_city TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanent_state') THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_state TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'permanent_postal_code') THEN
    ALTER TABLE onboarding_data ADD COLUMN permanent_postal_code TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'current_address') THEN
    ALTER TABLE onboarding_data ADD COLUMN current_address TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'current_city') THEN
    ALTER TABLE onboarding_data ADD COLUMN current_city TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'current_state') THEN
    ALTER TABLE onboarding_data ADD COLUMN current_state TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'onboarding_data' AND column_name = 'current_postal_code') THEN
    ALTER TABLE onboarding_data ADD COLUMN current_postal_code TEXT;
  END IF;
END $$;

