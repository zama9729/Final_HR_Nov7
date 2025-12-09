-- Migration: Create reminders table for smart memo reminders
-- This table stores reminders created from smart memos or direct user input

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  source_memo_text TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_unread ON reminders(user_id, is_read, is_dismissed) WHERE is_read = false AND is_dismissed = false;

-- Add RLS policies for tenant isolation
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see reminders from their tenant
CREATE POLICY reminders_select ON reminders
  FOR SELECT
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- Policy: Users can only insert reminders in their tenant
CREATE POLICY reminders_insert ON reminders
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid);

-- Policy: Users can only update reminders in their tenant
CREATE POLICY reminders_update ON reminders
  FOR UPDATE
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- Policy: Users can only delete reminders in their tenant
CREATE POLICY reminders_delete ON reminders
  FOR DELETE
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

COMMENT ON TABLE reminders IS 'Stores user reminders created from smart memos or direct input';
COMMENT ON COLUMN reminders.remind_at IS 'Timestamp when the reminder should trigger';
COMMENT ON COLUMN reminders.source_memo_text IS 'Original memo text that generated this reminder';
COMMENT ON COLUMN reminders.is_read IS 'Whether the reminder has been processed by the cron job';
COMMENT ON COLUMN reminders.is_dismissed IS 'Whether the user has dismissed the reminder';

