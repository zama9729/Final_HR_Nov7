-- Enable RLS on team_schedule_events table
-- Add RLS policies for team calendar events

ALTER TABLE team_schedule_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS org_isolation_team_schedule_events ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_select ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_insert ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_update ON team_schedule_events;
DROP POLICY IF EXISTS team_schedule_events_delete ON team_schedule_events;

-- RLS Policy: Users can only see events from their tenant
CREATE POLICY org_isolation_team_schedule_events ON team_schedule_events
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policy: Users can select events from their tenant
CREATE POLICY team_schedule_events_select ON team_schedule_events
  FOR SELECT
  USING (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policy: Users can insert events in their tenant
CREATE POLICY team_schedule_events_insert ON team_schedule_events
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policy: Users can update events in their tenant
CREATE POLICY team_schedule_events_update ON team_schedule_events
  FOR UPDATE
  USING (tenant_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid);

-- RLS Policy: Users can delete events in their tenant (optional, can restrict further)
CREATE POLICY team_schedule_events_delete ON team_schedule_events
  FOR DELETE
  USING (tenant_id = current_setting('app.org_id', true)::uuid);




