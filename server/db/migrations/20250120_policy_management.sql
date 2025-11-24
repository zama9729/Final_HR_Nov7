-- Policy Management System
-- Supports org-level and branch-level policies with versioning and templating

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES org_branches(id) ON DELETE CASCADE,
  key TEXT NOT NULL, -- Unique identifier like 'probation_policy', 'leave_policy'
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('doc', 'numeric', 'boolean', 'json')) DEFAULT 'doc',
  value_json JSONB DEFAULT '{}'::jsonb, -- For structured data (numeric params, boolean flags, etc.)
  template_text TEXT, -- For document policies with templating variables like {{probation_days}}
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  effective_from DATE,
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, branch_id, key, version)
);

CREATE INDEX IF NOT EXISTS idx_policies_org ON policies(org_id);
CREATE INDEX IF NOT EXISTS idx_policies_branch ON policies(branch_id);
CREATE INDEX IF NOT EXISTS idx_policies_key ON policies(org_id, key);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(org_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_effective ON policies(org_id, effective_from) WHERE effective_from IS NOT NULL;

-- Policy versions table (for audit trail)
CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version_int INT NOT NULL,
  change_note TEXT,
  author UUID REFERENCES profiles(id),
  content_snapshot_json JSONB NOT NULL, -- Full snapshot of policy at this version
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(policy_id, version_int)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_author ON policy_versions(author);

-- Function to create new policy version
CREATE OR REPLACE FUNCTION create_policy_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version snapshot if status changed to published or version changed
  IF NEW.status = 'published' AND (OLD.status != 'published' OR NEW.version != OLD.version) THEN
    INSERT INTO policy_versions (policy_id, version_int, change_note, author, content_snapshot_json)
    VALUES (
      NEW.id,
      NEW.version,
      COALESCE(NEW.value_json->>'change_note', 'Policy published'),
      NEW.created_by,
      jsonb_build_object(
        'title', NEW.title,
        'type', NEW.type,
        'value_json', NEW.value_json,
        'template_text', NEW.template_text,
        'effective_from', NEW.effective_from
      )
    )
    ON CONFLICT (policy_id, version_int) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create versions
DROP TRIGGER IF EXISTS trigger_create_policy_version ON policies;
CREATE TRIGGER trigger_create_policy_version
  AFTER INSERT OR UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION create_policy_version();

-- Updated_at trigger
CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get latest published version of a policy
CREATE OR REPLACE FUNCTION get_latest_policy(p_org_id UUID, p_key TEXT, p_branch_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  title TEXT,
  type TEXT,
  value_json JSONB,
  template_text TEXT,
  status TEXT,
  effective_from DATE,
  version INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.title, p.type, p.value_json, p.template_text, p.status, p.effective_from, p.version
  FROM policies p
  WHERE p.org_id = p_org_id
    AND p.key = p_key
    AND (p.branch_id = p_branch_id OR (p.branch_id IS NULL AND p_branch_id IS NULL))
    AND p.status = 'published'
  ORDER BY p.version DESC, p.effective_from DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE policies IS 'Organization and branch-level policies with versioning support';
COMMENT ON TABLE policy_versions IS 'Audit trail of policy changes';


