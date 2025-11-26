CREATE TABLE IF NOT EXISTS profile_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_fields JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_change_requests_employee ON profile_change_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_profile_change_requests_status ON profile_change_requests(status);

