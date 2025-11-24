-- SQL Query to list all emails in the system
-- Run this in your database SQL editor (e.g., Supabase SQL Editor, pgAdmin, psql)

-- List all emails with associated information
SELECT 
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.tenant_id,
  o.name as organization_name,
  ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL) as roles,
  e.employee_id,
  e.department,
  e.position,
  e.status as employee_status,
  p.created_at
FROM profiles p
LEFT JOIN organizations o ON o.id = p.tenant_id
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN employees e ON e.user_id = p.id
WHERE p.email IS NOT NULL
GROUP BY p.id, p.email, p.first_name, p.last_name, p.phone, p.tenant_id, o.name, e.employee_id, e.department, e.position, e.status, p.created_at
ORDER BY p.created_at DESC;

-- Simple version: Just emails
-- SELECT email, first_name, last_name, created_at 
-- FROM profiles 
-- WHERE email IS NOT NULL 
-- ORDER BY created_at DESC;

-- Count emails by organization
-- SELECT 
--   o.name as organization_name,
--   COUNT(*) as email_count
-- FROM profiles p
-- LEFT JOIN organizations o ON o.id = p.tenant_id
-- WHERE p.email IS NOT NULL
-- GROUP BY o.name
-- ORDER BY email_count DESC;

-- Count emails by role
-- SELECT 
--   ur.role,
--   COUNT(DISTINCT p.id) as user_count
-- FROM profiles p
-- LEFT JOIN user_roles ur ON ur.user_id = p.id
-- WHERE p.email IS NOT NULL
-- GROUP BY ur.role
-- ORDER BY user_count DESC;


