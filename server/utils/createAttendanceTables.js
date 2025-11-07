import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query as dbQuery } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createAttendanceTables() {
  try {
    const migrationSQL = `
-- Attendance System Migration
-- Multi-tenant Punch In/Out + Bulk Upload system

-- Ensure pgcrypto extension is enabled for digest function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Attendance events table (for real-time punch in/out via API)
CREATE TABLE IF NOT EXISTS attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  raw_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('IN', 'OUT')),
  device_id TEXT,
  metadata JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  paired_timesheet_entry_id UUID
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_tenant ON attendance_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_employee ON attendance_events(employee_id);
-- Note: Date-based indexes are created automatically on raw_timestamp column

-- Attendance uploads table (for bulk CSV/Excel uploads)
CREATE TABLE IF NOT EXISTS attendance_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  uploader_id UUID REFERENCES profiles(id) NOT NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT,
  file_size BIGINT,
  file_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed')),
  total_rows INTEGER DEFAULT 0,
  succeeded_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  ignored_rows INTEGER DEFAULT 0,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_summary JSONB,
  mapping_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_uploads_tenant ON attendance_uploads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_uploads_status ON attendance_uploads(status);
CREATE INDEX IF NOT EXISTS idx_attendance_uploads_uploader ON attendance_uploads(uploader_id);

-- Attendance upload rows table (for row-level tracking)
CREATE TABLE IF NOT EXISTS attendance_upload_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES attendance_uploads(id) ON DELETE CASCADE NOT NULL,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  normalized_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'ignored')),
  error_message TEXT,
  timesheet_entry_id UUID,
  row_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(upload_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_attendance_upload_rows_upload ON attendance_upload_rows(upload_id);
CREATE INDEX IF NOT EXISTS idx_attendance_upload_rows_status ON attendance_upload_rows(status);
CREATE INDEX IF NOT EXISTS idx_attendance_upload_rows_hash ON attendance_upload_rows(row_hash);

-- Audit logs table (for tracking all actions)
CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_tenant ON attendance_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_actor ON attendance_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_type ON attendance_audit_logs(object_type);

-- Update timesheet_entries to support attendance source (if not already done)
DO $$ 
BEGIN
  -- Make timesheet_id optional for attendance-only entries
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'timesheet_id' AND is_nullable = 'NO') THEN
    ALTER TABLE timesheet_entries ALTER COLUMN timesheet_id DROP NOT NULL;
  END IF;
  
  -- Add source column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'source') THEN
    ALTER TABLE timesheet_entries ADD COLUMN source TEXT CHECK (source IN ('api', 'upload', 'manual')) DEFAULT 'manual';
  END IF;
  
  -- Add attendance_event_id column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'attendance_event_id') THEN
    ALTER TABLE timesheet_entries ADD COLUMN attendance_event_id UUID;
  END IF;
  
  -- Add attendance_upload_row_id column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'attendance_upload_row_id') THEN
    ALTER TABLE timesheet_entries ADD COLUMN attendance_upload_row_id UUID;
  END IF;
  
  -- Add start_time_utc column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'start_time_utc') THEN
    ALTER TABLE timesheet_entries ADD COLUMN start_time_utc TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add end_time_utc column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'end_time_utc') THEN
    ALTER TABLE timesheet_entries ADD COLUMN end_time_utc TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add payroll_status column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'payroll_status') THEN
    ALTER TABLE timesheet_entries ADD COLUMN payroll_status TEXT DEFAULT 'pending_for_payroll' CHECK (payroll_status IN ('pending_for_payroll', 'processed', 'excluded'));
  END IF;
  
  -- Add employee_id column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timesheet_entries' AND column_name = 'employee_id') THEN
    ALTER TABLE timesheet_entries ADD COLUMN employee_id UUID REFERENCES employees(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for timesheet entries by source
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_source ON timesheet_entries(source);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_payroll_status ON timesheet_entries(payroll_status);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_attendance_event ON timesheet_entries(attendance_event_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_attendance_upload_row ON timesheet_entries(attendance_upload_row_id);

-- Create unique constraint for idempotency (prevent duplicate attendance records)
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_upload_rows_hash_unique 
ON attendance_upload_rows(row_hash) 
WHERE row_hash IS NOT NULL AND status = 'success';

-- Function to calculate row hash for idempotency
CREATE OR REPLACE FUNCTION calculate_attendance_row_hash(
  p_tenant_id UUID,
  p_employee_id UUID,
  p_date DATE,
  p_start_time_utc TIMESTAMP WITH TIME ZONE,
  p_end_time_utc TIMESTAMP WITH TIME ZONE,
  p_source TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      p_tenant_id::TEXT || '|' || 
      p_employee_id::TEXT || '|' || 
      p_date::TEXT || '|' || 
      p_start_time_utc::TEXT || '|' || 
      COALESCE(p_end_time_utc::TEXT, '') || '|' || 
      p_source,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql;

-- Updated at trigger for attendance_uploads (if update_updated_at_column function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_attendance_uploads_updated_at ON attendance_uploads;
    CREATE TRIGGER update_attendance_uploads_updated_at
      BEFORE UPDATE ON attendance_uploads
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Function to update attendance_upload summary
CREATE OR REPLACE FUNCTION update_attendance_upload_summary()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE attendance_uploads
  SET 
    succeeded_rows = (SELECT COUNT(*) FROM attendance_upload_rows WHERE upload_id = NEW.upload_id AND status = 'success'),
    failed_rows = (SELECT COUNT(*) FROM attendance_upload_rows WHERE upload_id = NEW.upload_id AND status = 'failed'),
    ignored_rows = (SELECT COUNT(*) FROM attendance_upload_rows WHERE upload_id = NEW.upload_id AND status = 'ignored'),
    updated_at = now()
  WHERE id = NEW.upload_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update summary when row status changes
DROP TRIGGER IF EXISTS update_attendance_upload_summary_trigger ON attendance_upload_rows;
CREATE TRIGGER update_attendance_upload_summary_trigger
  AFTER INSERT OR UPDATE ON attendance_upload_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_upload_summary();
    `;

    await dbQuery(migrationSQL);
  } catch (error) {
    console.error('Error creating attendance tables:', error);
    throw error;
  }
}

