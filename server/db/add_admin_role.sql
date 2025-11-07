-- Add admin role to app_role enum
-- Run this manually if auto-migration fails

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';

-- Verify it was added:
SELECT unnest(enum_range(NULL::app_role))::text as role;
