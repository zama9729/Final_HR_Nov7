-- Holiday module schema additions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- employee_profiles extension (profiles table holds user profile; employees holds employment)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_mode TEXT CHECK (work_mode IN ('onsite','remote','hybrid'));
ALTER TABLE employees ADD COLUMN IF NOT EXISTS holiday_override JSONB;

-- holiday lists per org/state/year
CREATE TABLE IF NOT EXISTS holiday_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  region TEXT NOT NULL, -- state/region code
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_national BOOLEAN DEFAULT false,
  published BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_holiday_lists_org_year ON holiday_lists(org_id, year);

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES holiday_lists(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  is_national BOOLEAN DEFAULT false,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_holidays_list ON holidays(list_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_holiday_date_per_list ON holidays(list_id, date);

-- audit logs for actions
CREATE TABLE IF NOT EXISTS holiday_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL CHECK (action IN ('create','update','import','publish','lock','override')),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- timesheet rows extension
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN DEFAULT false;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS holiday_id UUID REFERENCES holidays(id);
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS readonly BOOLEAN DEFAULT false;
ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS conflict BOOLEAN DEFAULT false;


