-- SQL Query to Confirm User and Fix Login
-- Run this in Supabase SQL Editor

-- Confirm the user zama@zc.com
UPDATE auth.users 
SET 
  confirmed_at = now(),
  email_confirmed_at = now()
WHERE email = 'zama@zc.com';

-- Verify the user is now confirmed
SELECT 
  email,
  confirmed_at,
  email_confirmed_at,
  last_sign_in_at,
  raw_user_meta_data->>'first_name' as first_name,
  raw_user_meta_data->>'org_name' as organization
FROM auth.users 
WHERE email = 'zama@zc.com';

