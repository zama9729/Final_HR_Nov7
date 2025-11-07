-- Migration: Create view to access HR employees table dynamically
-- This view connects to HR database and pulls employee data in real-time

-- Step 1: Enable postgres_fdw extension
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Step 2: Create foreign server connection to HR database
-- Note: Adjust host, port, dbname based on your setup
-- In Docker, use service name 'postgres', otherwise use 'localhost' or actual host
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_foreign_server WHERE srvname = 'hr_server'
    ) THEN
        CREATE SERVER hr_server
        FOREIGN DATA WRAPPER postgres_fdw
        OPTIONS (
            host 'postgres',  -- HR database host (Docker service name, use 'localhost' if not in Docker network)
            port '5432',      -- HR database port
            dbname 'hr_suite' -- HR database name
        );
    ELSE
        -- Update existing server if needed
        ALTER SERVER hr_server OPTIONS (
            SET host 'postgres',
            SET port '5432',
            SET dbname 'hr_suite'
        );
    END IF;
END $$;

-- Step 3: Create user mapping for foreign server
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_user_mappings WHERE srvname = 'hr_server'
    ) THEN
        CREATE USER MAPPING FOR postgres
        SERVER hr_server
        OPTIONS (
            user 'postgres',
            password 'postgres'
        );
    END IF;
END $$;

-- Step 4: Create foreign table for HR profiles (needed for email, name)
-- This must be created BEFORE the employees foreign table and view
DROP FOREIGN TABLE IF EXISTS hr_profiles_foreign CASCADE;

CREATE FOREIGN TABLE hr_profiles_foreign (
    id UUID,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    tenant_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SERVER hr_server
OPTIONS (
    schema_name 'public',
    table_name 'profiles'
);

-- Step 5: Create foreign table mapping to HR's employees table
-- This maps HR's employees table structure to Payroll
DROP FOREIGN TABLE IF EXISTS hr_employees_foreign CASCADE;

CREATE FOREIGN TABLE hr_employees_foreign (
    id UUID,
    user_id UUID,
    employee_id TEXT,
    department TEXT,
    position TEXT,  -- HR uses 'position', we'll map to 'designation' in view
    work_location TEXT,
    join_date DATE,
    reporting_manager_id UUID,
    tenant_id UUID,
    status TEXT,
    onboarding_status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SERVER hr_server
OPTIONS (
    schema_name 'public',
    table_name 'employees'
);

-- Step 6: Create view that maps HR employees to Payroll structure
-- This view provides a unified interface with Payroll column names
-- This view can be used as a drop-in replacement for the employees table
CREATE OR REPLACE VIEW hr_employees_view AS
SELECT 
    e.id,
    e.tenant_id,
    e.employee_id as employee_code,  -- HR's employee_id -> Payroll's employee_code
    COALESCE(p.first_name || ' ' || p.last_name, p.email, e.employee_id) as full_name,
    p.email,
    p.phone,
    e.join_date as date_of_joining,  -- HR's join_date -> Payroll's date_of_joining
    NULL::DATE as date_of_birth,  -- Not in HR employees table
    e.department,
    e.position as designation,  -- HR's position -> Payroll's designation
    COALESCE(e.status, 'active') as status,
    NULL::TEXT as pan_number,  -- Not in HR employees table
    NULL::TEXT as aadhaar_number,  -- Not in HR employees table
    NULL::TEXT as bank_account_number,  -- Not in HR employees table
    NULL::TEXT as bank_ifsc,  -- Not in HR employees table
    NULL::TEXT as bank_name,  -- Not in HR employees table
    NULL::UUID as created_by,  -- Not in HR employees table
    NULL::UUID as updated_by,  -- Not in HR employees table
    e.created_at,
    e.updated_at,
    e.user_id as hr_user_id  -- Keep reference to HR user_id
FROM hr_employees_foreign e
LEFT JOIN hr_profiles_foreign p ON p.id = e.user_id
WHERE e.status != 'terminated' OR e.status IS NULL;

-- Step 6b: Create a synonym/alias for easier migration
-- This allows us to use 'employees' as an alias for 'hr_employees_view'
-- Note: PostgreSQL doesn't support synonyms, so we'll use a view with the same name
-- But we need to be careful not to conflict with existing employees table
-- Instead, we'll create a view that unions HR data with local payroll-specific data
CREATE OR REPLACE VIEW employees_view AS
SELECT * FROM hr_employees_view;

-- Step 7: Grant access to the view
GRANT SELECT ON hr_employees_view TO postgres;

-- Step 8: Create a function to refresh the view (if needed)
-- Note: Views are automatically refreshed, but this can be used for testing
CREATE OR REPLACE FUNCTION refresh_hr_employees_view()
RETURNS void AS $$
BEGIN
    -- Views are automatically refreshed, but we can force a refresh by recreating
    -- This is mainly for testing/debugging
    NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON VIEW hr_employees_view IS 'Dynamic view of HR employees table. Changes in HR are immediately reflected in Payroll.';
COMMENT ON FOREIGN TABLE hr_employees_foreign IS 'Foreign table mapping to HR database employees table';
COMMENT ON FOREIGN TABLE hr_profiles_foreign IS 'Foreign table mapping to HR database profiles table';

