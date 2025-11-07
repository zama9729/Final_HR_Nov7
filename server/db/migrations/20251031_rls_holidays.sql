-- Add RLS policies for holiday tables at organization level

-- Enable RLS
ALTER TABLE holiday_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS holiday_lists_select_policy ON holiday_lists;
DROP POLICY IF EXISTS holiday_lists_insert_policy ON holiday_lists;
DROP POLICY IF EXISTS holiday_lists_update_policy ON holiday_lists;
DROP POLICY IF EXISTS holiday_lists_delete_policy ON holiday_lists;

DROP POLICY IF EXISTS holidays_select_policy ON holidays;
DROP POLICY IF EXISTS holidays_insert_policy ON holidays;
DROP POLICY IF EXISTS holidays_update_policy ON holidays;
DROP POLICY IF EXISTS holidays_delete_policy ON holidays;

DROP POLICY IF EXISTS holiday_audit_logs_select_policy ON holiday_audit_logs;
DROP POLICY IF EXISTS holiday_audit_logs_insert_policy ON holiday_audit_logs;

-- Holiday Lists Policies
-- Users can view holiday lists in their organization
CREATE POLICY holiday_lists_select_policy ON holiday_lists
  FOR SELECT
  USING (
    org_id = current_setting('app.current_tenant', true)::uuid
  );

-- Users with HR/CEO/Director role can insert holiday lists in their organization
CREATE POLICY holiday_lists_insert_policy ON holiday_lists
  FOR INSERT
  WITH CHECK (
    org_id = current_setting('app.current_tenant', true)::uuid
  );

-- Users with HR/CEO/Director role can update holiday lists in their organization
CREATE POLICY holiday_lists_update_policy ON holiday_lists
  FOR UPDATE
  USING (
    org_id = current_setting('app.current_tenant', true)::uuid
  );

-- Users with HR/CEO/Director role can delete holiday lists in their organization
CREATE POLICY holiday_lists_delete_policy ON holiday_lists
  FOR DELETE
  USING (
    org_id = current_setting('app.current_tenant', true)::uuid
  );

-- Holidays Policies
-- Users can view holidays in their organization's holiday lists
CREATE POLICY holidays_select_policy ON holidays
  FOR SELECT
  USING (
    list_id IN (
      SELECT hl.id 
      FROM holiday_lists hl
      WHERE hl.org_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- Users with HR/CEO/Director role can insert holidays in their organization's lists
CREATE POLICY holidays_insert_policy ON holidays
  FOR INSERT
  WITH CHECK (
    list_id IN (
      SELECT hl.id 
      FROM holiday_lists hl
      WHERE hl.org_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- Users with HR/CEO/Director role can update holidays in their organization's lists
CREATE POLICY holidays_update_policy ON holidays
  FOR UPDATE
  USING (
    list_id IN (
      SELECT hl.id 
      FROM holiday_lists hl
      WHERE hl.org_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- Users with HR/CEO/Director role can delete holidays in their organization's lists
CREATE POLICY holidays_delete_policy ON holidays
  FOR DELETE
  USING (
    list_id IN (
      SELECT hl.id 
      FROM holiday_lists hl
      WHERE hl.org_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- Holiday Audit Logs Policies
-- Users can view audit logs in their organization
CREATE POLICY holiday_audit_logs_select_policy ON holiday_audit_logs
  FOR SELECT
  USING (
    org_id = current_setting('app.current_tenant', true)::uuid
  );

-- System can insert audit logs for organization
CREATE POLICY holiday_audit_logs_insert_policy ON holiday_audit_logs
  FOR INSERT
  WITH CHECK (
    org_id = current_setting('app.current_tenant', true)::uuid
  );

