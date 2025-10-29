-- SQL Query to check existing accounts
-- Run this in your Supabase SQL Editor

-- Check all users with their roles
SELECT 
  u.id,
  u.email,
  u.created_at,
  ur.role,
  p.first_name,
  p.last_name,
  o.name as organization_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.organizations o ON o.id = p.tenant_id
ORDER BY u.created_at DESC;

-- Count total users
SELECT COUNT(*) as total_users FROM auth.users;

