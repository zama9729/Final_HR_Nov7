-- Smart Memo with @mention support
-- Stores memos with structured mention references

CREATE TABLE IF NOT EXISTS smart_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  memo_text TEXT NOT NULL,
  base_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_memos_tenant ON smart_memos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_smart_memos_employee ON smart_memos(employee_id);
CREATE INDEX IF NOT EXISTS idx_smart_memos_user ON smart_memos(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_memos_date ON smart_memos(base_date);

-- Memo mentions - stores structured references to mentioned employees
CREATE TABLE IF NOT EXISTS memo_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id UUID NOT NULL REFERENCES smart_memos(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentioned_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL, -- The actual @mention text from the memo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memo_mentions_memo ON memo_mentions(memo_id);
CREATE INDEX IF NOT EXISTS idx_memo_mentions_tenant ON memo_mentions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memo_mentions_employee ON memo_mentions(mentioned_employee_id);
CREATE INDEX IF NOT EXISTS idx_memo_mentions_user ON memo_mentions(mentioned_user_id);

-- Add mentions support to team_schedule_events for shared meetings
ALTER TABLE team_schedule_events
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_with_employee_ids UUID[],
  ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES smart_memos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_schedule_events_shared ON team_schedule_events(is_shared) WHERE is_shared = true;
CREATE INDEX IF NOT EXISTS idx_team_schedule_events_memo ON team_schedule_events(memo_id);

-- RLS policies for smart_memos
ALTER TABLE smart_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS smart_memos_tenant_isolation ON smart_memos;
CREATE POLICY smart_memos_tenant_isolation ON smart_memos
  USING (tenant_id = (current_setting('app.org_id', true))::uuid);

-- RLS policies for memo_mentions
ALTER TABLE memo_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memo_mentions_tenant_isolation ON memo_mentions;
CREATE POLICY memo_mentions_tenant_isolation ON memo_mentions
  USING (tenant_id = (current_setting('app.org_id', true))::uuid);

