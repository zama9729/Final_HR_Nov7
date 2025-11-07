-- Clean all data from database while preserving schema
-- This script will delete all data from all tables but keep the schema intact
-- Run this script to start fresh with an empty database
-- 
-- IMPORTANT: This will delete ALL data but preserve all tables, constraints, indexes, and schema

BEGIN;

-- Clean all data from database while preserving schema
-- Using TRUNCATE CASCADE to automatically handle foreign key dependencies
-- This is safer and faster than DELETE

-- TRUNCATE CASCADE automatically handles foreign key relationships
-- Tables are truncated in dependency order (children first, parents last)

-- Note: We'll use a safer approach - disable triggers temporarily for performance
-- TRUNCATE CASCADE will cascade to all dependent tables automatically

-- 1. Attendance system tables
TRUNCATE TABLE attendance_audit_logs CASCADE;
TRUNCATE TABLE attendance_upload_rows CASCADE;
TRUNCATE TABLE attendance_uploads CASCADE;
TRUNCATE TABLE attendance_events CASCADE;

-- 2. Timesheet entries
TRUNCATE TABLE timesheet_entries CASCADE;

-- 3. Holiday system
TRUNCATE TABLE holidays CASCADE;
TRUNCATE TABLE holiday_lists CASCADE;

-- 4. Benefit points (references projects)
TRUNCATE TABLE benefit_points CASCADE;

-- 5. Projects and assignments
TRUNCATE TABLE assignments CASCADE;
TRUNCATE TABLE employee_projects CASCADE;
TRUNCATE TABLE projects CASCADE;

-- 6. Skills and certifications
TRUNCATE TABLE certifications CASCADE;
TRUNCATE TABLE skills CASCADE;

-- 7. AI and mini apps
TRUNCATE TABLE ai_suggestion_logs CASCADE;
TRUNCATE TABLE ai_conversations CASCADE;
TRUNCATE TABLE opal_mini_apps CASCADE;

-- 8. Check-in/Check-out
TRUNCATE TABLE check_in_check_outs CASCADE;

-- 9. Performance and appraisals
TRUNCATE TABLE performance_reviews CASCADE;
TRUNCATE TABLE appraisal_cycles CASCADE;

-- 10. Approvals system (if tables exist)
-- Note: These tables might not exist in all schemas
DO $$ BEGIN
  TRUNCATE TABLE approval_audit CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  TRUNCATE TABLE approvals CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  TRUNCATE TABLE hr_approval_thresholds CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 11. Workflows
TRUNCATE TABLE workflows CASCADE;

-- 12. Notifications
TRUNCATE TABLE notifications CASCADE;

-- 13. Shifts
TRUNCATE TABLE shifts CASCADE;

-- 14. Leave system
TRUNCATE TABLE leave_requests CASCADE;
TRUNCATE TABLE leave_policies CASCADE;

-- 15. Timesheets
TRUNCATE TABLE timesheets CASCADE;

-- 16. Onboarding data
TRUNCATE TABLE onboarding_data CASCADE;

-- 17. User authentication
TRUNCATE TABLE user_auth CASCADE;

-- 18. User roles
TRUNCATE TABLE user_roles CASCADE;

-- 19. Employees (references profiles and organizations)
TRUNCATE TABLE employees CASCADE;

-- 20. Profiles (references organizations)
TRUNCATE TABLE profiles CASCADE;

-- 21. Organizations (parent table - truncate last to clear all references)
TRUNCATE TABLE organizations CASCADE;

-- Reset sequences if any (for auto-incrementing IDs, though we use UUIDs)
-- Note: This won't affect UUID generation, but if there are any sequences, reset them
-- For example, if any table uses SERIAL instead of UUID:
-- ALTER SEQUENCE IF EXISTS table_name_id_seq RESTART WITH 1;

COMMIT;

-- Verify all tables are empty (optional - uncomment to check)
-- SELECT 
--   'attendance_audit_logs' as table_name, COUNT(*) as row_count FROM attendance_audit_logs
-- UNION ALL SELECT 'attendance_upload_rows', COUNT(*) FROM attendance_upload_rows
-- UNION ALL SELECT 'attendance_uploads', COUNT(*) FROM attendance_uploads
-- UNION ALL SELECT 'attendance_events', COUNT(*) FROM attendance_events
-- UNION ALL SELECT 'timesheet_entries', COUNT(*) FROM timesheet_entries
-- UNION ALL SELECT 'performance_reviews', COUNT(*) FROM performance_reviews
-- UNION ALL SELECT 'approval_audit', COUNT(*) FROM approval_audit
-- UNION ALL SELECT 'approvals', COUNT(*) FROM approvals
-- UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
-- UNION ALL SELECT 'shifts', COUNT(*) FROM shifts
-- UNION ALL SELECT 'leave_requests', COUNT(*) FROM leave_requests
-- UNION ALL SELECT 'timesheets', COUNT(*) FROM timesheets
-- UNION ALL SELECT 'workflows', COUNT(*) FROM workflows
-- UNION ALL SELECT 'appraisal_cycles', COUNT(*) FROM appraisal_cycles
-- UNION ALL SELECT 'onboarding_data', COUNT(*) FROM onboarding_data
-- UNION ALL SELECT 'hr_approval_thresholds', COUNT(*) FROM hr_approval_thresholds
-- UNION ALL SELECT 'leave_policies', COUNT(*) FROM leave_policies
-- UNION ALL SELECT 'user_auth', COUNT(*) FROM user_auth
-- UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
-- UNION ALL SELECT 'employees', COUNT(*) FROM employees
-- UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
-- UNION ALL SELECT 'organizations', COUNT(*) FROM organizations;

