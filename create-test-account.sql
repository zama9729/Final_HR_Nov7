-- SQL Script to create a test CEO account
-- Run this in your Supabase SQL Editor
-- Note: You'll need to manually set the password after creating the user

-- This creates a test CEO account
-- Email: ceo@test.com
-- Password: You'll need to set it via Supabase Dashboard or use the app's signup

-- Option 1: Create user via Supabase Dashboard
-- Go to Authentication > Users > Add User
-- Email: ceo@test.com
-- Password: Test123! (or your preferred password)
-- Then run the query below to assign CEO role

-- Option 2: Use the app's signup page at http://localhost:3000
-- The first signup will automatically become CEO

-- After creating a user, assign CEO role (replace 'YOUR_USER_ID' with actual user ID):
/*
INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT 
  u.id,
  'ceo'::app_role,
  o.id
FROM auth.users u
CROSS JOIN (
  SELECT id FROM public.organizations 
  ORDER BY created_at DESC 
  LIMIT 1
) o
WHERE u.email = 'ceo@test.com'
ON CONFLICT DO NOTHING;
*/

