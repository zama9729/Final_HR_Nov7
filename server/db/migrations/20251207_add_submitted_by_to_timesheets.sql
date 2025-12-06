-- Migration: Add missing columns to timesheets table
-- This migration adds submitted_by, approvals, and audit_snapshot columns

-- Add submitted_by column to track which user submitted the timesheet
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id);

-- Add approvals column for approval workflow tracking
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS approvals JSONB DEFAULT '[]'::jsonb;

-- Add audit_snapshot column for audit trail
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS audit_snapshot JSONB;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_timesheets_submitted_by ON timesheets(submitted_by);

