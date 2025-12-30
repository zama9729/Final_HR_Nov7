-- 2025-01-30 Migration: Remove Implicit Active-Only Filters
-- This migration documents code changes that remove implicit status='active' filters
-- from employee queries across the application.
--
-- PURPOSE:
-- Previously, many API endpoints and queries implicitly filtered employees to only
-- show 'active' status. This migration documents the change to return ALL employees
-- by default, with explicit filtering available where needed.
--
-- CHANGES DOCUMENTED:
-- 1. API routes now return all employees unless explicitly filtered
-- 2. Frontend pages have explicit status filter dropdowns
-- 3. Business-rule specific filters (e.g., payroll exceptions) are documented
--
-- This migration is idempotent and primarily serves as documentation.
-- No schema changes are required as the employees.status column already exists.

-------------------------------
-- Ensure employees.status column exists and has proper constraints
-------------------------------

-- Verify employees table has status column (should already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'status'
  ) THEN
    ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'active';
    RAISE NOTICE 'Added status column to employees table';
  ELSE
    RAISE NOTICE 'Status column already exists in employees table';
  END IF;
END $$;

-- Ensure status has reasonable default and can handle various statuses
-- Common statuses: 'active', 'inactive', 'on_notice', 'exited', 'terminated', 'resigned', 'on_hold'
-- No constraint is added to allow flexibility for future statuses

-------------------------------
-- Add indexes for performance (if not already exist)
-------------------------------

-- Index for filtering by status (useful for explicit status filtering)
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status) WHERE status IS NOT NULL;

-- Index for tenant + status queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status ON employees(tenant_id, status) WHERE status IS NOT NULL;

-- Index for reporting manager queries (used in calendar, teams, etc.)
CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager ON employees(reporting_manager_id, tenant_id) WHERE reporting_manager_id IS NOT NULL;

-------------------------------
-- Add helpful comments to document the change
-------------------------------

COMMENT ON COLUMN employees.status IS 
'Employee status. Common values: active, inactive, on_notice, exited, terminated, resigned, on_hold. '
'API endpoints now return ALL employees by default unless explicitly filtered by status. '
'Frontend pages should provide explicit status filter controls for user selection.';

-------------------------------
-- Verification queries (for manual verification after migration)
-------------------------------

-- Uncomment to verify migration:
-- SELECT 
--   COUNT(*) FILTER (WHERE status = 'active') as active_count,
--   COUNT(*) FILTER (WHERE status != 'active' OR status IS NULL) as non_active_count,
--   COUNT(*) as total_count
-- FROM employees;

-- SELECT DISTINCT status, COUNT(*) 
-- FROM employees 
-- GROUP BY status 
-- ORDER BY COUNT(*) DESC;

-------------------------------
-- Migration complete
-------------------------------

-- This migration documents the removal of implicit active-only filters.
-- The actual code changes are in:
-- - server/routes/employees.js
-- - server/routes/employee-stats.js
-- - server/routes/calendar.js
-- - server/routes/scheduling.js
-- - server/routes/teams.js
-- - server/routes/analytics.js
-- - server/routes/payroll.js (documented as business rule)
-- - src/pages/Employees.tsx
-- - src/pages/ShiftManagement.tsx
-- - src/pages/ShiftManagement2.tsx

