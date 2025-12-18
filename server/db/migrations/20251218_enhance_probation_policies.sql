-- Enhance probation_policies table with new organization rules fields
-- This migration adds fields for confirmation rules, notifications, and extensions

-- Add new columns to probation_policies table
ALTER TABLE probation_policies
  ADD COLUMN IF NOT EXISTS confirmation_effective_rule TEXT DEFAULT 'on_probation_end' 
    CHECK (confirmation_effective_rule IN ('on_probation_end', 'next_working_day')),
  ADD COLUMN IF NOT EXISTS notify_employee BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_manager BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_hr BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_extension BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_extension_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

-- Create index for active policies
CREATE INDEX IF NOT EXISTS idx_probation_policies_active 
  ON probation_policies(tenant_id, status, is_active) 
  WHERE status = 'published' AND is_active = true;

-- Create audit log table for probation policy changes
CREATE TABLE IF NOT EXISTS probation_policy_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES probation_policies(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'created', 'updated', 'published', 'archived'
  changes_json JSONB DEFAULT '{}'::jsonb, -- Snapshot of changed fields
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_probation_policy_audit_policy 
  ON probation_policy_audit_logs(policy_id);
CREATE INDEX IF NOT EXISTS idx_probation_policy_audit_tenant 
  ON probation_policy_audit_logs(tenant_id);

-- Create probation event notifications table
CREATE TABLE IF NOT EXISTS probation_event_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  probation_id UUID REFERENCES probations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('probation_start', 'probation_completion', 'auto_confirmation', 'probation_extension')),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('employee', 'manager', 'hr')),
  recipient_id UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_probation_notifications_employee 
  ON probation_event_notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_probation_notifications_status 
  ON probation_event_notifications(status) 
  WHERE status = 'pending';

