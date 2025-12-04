-- Fix: Make employee_id nullable to support team-only assignments
ALTER TABLE schedule_assignments ALTER COLUMN employee_id DROP NOT NULL;
