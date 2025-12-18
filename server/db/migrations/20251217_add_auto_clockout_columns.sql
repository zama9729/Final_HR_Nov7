-- Add auto clock-out columns to attendance_events and clock_punch_sessions

-- Add is_auto_clockout column to attendance_events
ALTER TABLE attendance_events
ADD COLUMN IF NOT EXISTS is_auto_clockout BOOLEAN NOT NULL DEFAULT false;

-- Add auto clock-out columns to clock_punch_sessions
ALTER TABLE clock_punch_sessions
ADD COLUMN IF NOT EXISTS is_auto_clockout BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_clockout_reason TEXT;

-- Create index for faster queries on open sessions
CREATE INDEX IF NOT EXISTS idx_clock_punch_sessions_open 
ON clock_punch_sessions(tenant_id, employee_id, clock_out_at) 
WHERE clock_out_at IS NULL AND is_auto_clockout IS NOT TRUE;

-- Create index for auto clock-out events
CREATE INDEX IF NOT EXISTS idx_attendance_events_auto_clockout 
ON attendance_events(tenant_id, employee_id, is_auto_clockout, raw_timestamp) 
WHERE is_auto_clockout = true;

