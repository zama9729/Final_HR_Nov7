-- HR: add subdomain for payroll tenant routing
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS subdomain VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS ux_orgs_subdomain
  ON organizations(subdomain);





