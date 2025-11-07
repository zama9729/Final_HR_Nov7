-- Migration: Allow NULL for submitted_at in timesheets
-- This allows attendance uploads to create timesheets that haven't been submitted yet

-- Alter the timesheets table to allow NULL for submitted_at
ALTER TABLE timesheets 
  ALTER COLUMN submitted_at DROP NOT NULL;

-- Update existing timesheets to ensure they have submitted_at set
-- This migration is safe to run multiple times

