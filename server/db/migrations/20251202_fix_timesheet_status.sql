-- Fix timesheet status: migrate 'pending' to 'draft' and ensure only 'pending_approval' shows in approvals
-- This migration fixes the issue where timesheets were auto-created with 'pending' status
-- and were showing up in approvals without user submission

DO $$
BEGIN
  -- Update all timesheets with 'pending' status to 'draft' if they haven't been submitted
  -- Only update if submitted_at is NULL or doesn't exist, meaning they were never explicitly submitted
  UPDATE timesheets
  SET status = 'draft'
  WHERE status = 'pending'
    AND (submitted_at IS NULL OR submitted_at = '1970-01-01'::timestamp);
  
  -- Log how many were updated
  RAISE NOTICE 'Updated timesheets from pending to draft status';
END $$;





