-- Unified Policy Management System
-- Supports multi-org policies with categories (LEAVE, OFFBOARDING, GENERAL), versioning, PDF storage, and RAG integration

-- Create policy category enum
DO $$ BEGIN
  CREATE TYPE policy_category AS ENUM ('LEAVE', 'OFFBOARDING', 'GENERAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create policy status enum (extended)
DO $$ BEGIN
  CREATE TYPE unified_policy_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Unified policies table
CREATE TABLE IF NOT EXISTS unified_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category policy_category NOT NULL,
  code TEXT NOT NULL, -- e.g., LEAVE-001, OFFB-001
  title TEXT NOT NULL,
  short_description TEXT,
  content_html TEXT, -- Rich text content for editor
  content_markdown TEXT, -- Optional; used for RAG if easier
  status unified_policy_status NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  effective_from DATE,
  effective_to DATE,
  created_by_user_id UUID REFERENCES profiles(id),
  updated_by_user_id UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  published_by_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_unified_policies_org ON unified_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_unified_policies_category ON unified_policies(org_id, category);
CREATE INDEX IF NOT EXISTS idx_unified_policies_status ON unified_policies(org_id, status);
CREATE INDEX IF NOT EXISTS idx_unified_policies_code ON unified_policies(org_id, code);
CREATE INDEX IF NOT EXISTS idx_unified_policies_effective ON unified_policies(org_id, effective_from) WHERE effective_from IS NOT NULL;

-- Policy versions table (immutable snapshots)
CREATE TABLE IF NOT EXISTS unified_policy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES unified_policies(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  category policy_category NOT NULL,
  snapshot_html TEXT NOT NULL,
  snapshot_markdown TEXT,
  effective_from DATE,
  effective_to DATE,
  published_at TIMESTAMPTZ NOT NULL,
  published_by_user_id UUID REFERENCES profiles(id),
  changelog_text TEXT,
  file_storage_key TEXT, -- Where the PDF lives (bucket/key)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(policy_id, version)
);

CREATE INDEX IF NOT EXISTS idx_unified_policy_versions_policy ON unified_policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_unified_policy_versions_org ON unified_policy_versions(org_id);
CREATE INDEX IF NOT EXISTS idx_unified_policy_versions_version ON unified_policy_versions(policy_id, version);

-- Enable RLS on unified policy tables
ALTER TABLE unified_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_policy_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for unified_policies
DROP POLICY IF EXISTS org_isolation_unified_policies ON unified_policies;
CREATE POLICY org_isolation_unified_policies ON unified_policies
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- RLS Policies for unified_policy_versions
DROP POLICY IF EXISTS org_isolation_unified_policy_versions ON unified_policy_versions;
CREATE POLICY org_isolation_unified_policy_versions ON unified_policy_versions
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- Function to generate policy code
CREATE OR REPLACE FUNCTION generate_policy_code(p_org_id UUID, p_category policy_category)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_code TEXT;
BEGIN
  -- Determine prefix based on category
  CASE p_category
    WHEN 'LEAVE' THEN v_prefix := 'LEAVE';
    WHEN 'OFFBOARDING' THEN v_prefix := 'OFFB';
    WHEN 'GENERAL' THEN v_prefix := 'POL';
    ELSE v_prefix := 'POL';
  END CASE;
  
  -- Count existing policies in this category for this org
  SELECT COUNT(*) + 1 INTO v_count
  FROM unified_policies
  WHERE org_id = p_org_id AND category = p_category;
  
  -- Format: PREFIX-XXX (e.g., LEAVE-001)
  v_code := v_prefix || '-' || LPAD(v_count::TEXT, 3, '0');
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-increment version on publish
CREATE OR REPLACE FUNCTION handle_policy_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changed to PUBLISHED, increment version and set published_at
  IF NEW.status = 'PUBLISHED' AND (OLD.status IS NULL OR OLD.status != 'PUBLISHED') THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
    NEW.published_at := now();
    NEW.published_by_user_id := NEW.updated_by_user_id;
    
    -- Create version snapshot
    INSERT INTO unified_policy_versions (
      policy_id, org_id, version, title, category,
      snapshot_html, snapshot_markdown, effective_from, effective_to,
      published_at, published_by_user_id, changelog_text
    )
    VALUES (
      NEW.id, NEW.org_id, NEW.version, NEW.title, NEW.category,
      NEW.content_html, NEW.content_markdown, NEW.effective_from, NEW.effective_to,
      NEW.published_at, NEW.published_by_user_id, NULL
    )
    ON CONFLICT (policy_id, version) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-versioning on publish
DROP TRIGGER IF EXISTS trigger_policy_publish ON unified_policies;
CREATE TRIGGER trigger_policy_publish
  BEFORE UPDATE ON unified_policies
  FOR EACH ROW
  EXECUTE FUNCTION handle_policy_publish();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_unified_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_unified_policies_updated_at ON unified_policies;
CREATE TRIGGER update_unified_policies_updated_at
  BEFORE UPDATE ON unified_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_policies_updated_at();

-- Function to get latest published policy version
CREATE OR REPLACE FUNCTION get_latest_published_policy(p_org_id UUID, p_policy_id UUID)
RETURNS TABLE (
  id UUID,
  policy_id UUID,
  version INTEGER,
  title TEXT,
  category policy_category,
  snapshot_html TEXT,
  snapshot_markdown TEXT,
  effective_from DATE,
  effective_to DATE,
  published_at TIMESTAMPTZ,
  file_storage_key TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    upv.id,
    upv.policy_id,
    upv.version,
    upv.title,
    upv.category,
    upv.snapshot_html,
    upv.snapshot_markdown,
    upv.effective_from,
    upv.effective_to,
    upv.published_at,
    upv.file_storage_key
  FROM unified_policy_versions upv
  WHERE upv.policy_id = p_policy_id
    AND upv.org_id = p_org_id
  ORDER BY upv.version DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE unified_policies IS 'Unified policy management with categories (LEAVE, OFFBOARDING, GENERAL)';
COMMENT ON TABLE unified_policy_versions IS 'Immutable snapshots of published policy versions';
COMMENT ON FUNCTION generate_policy_code IS 'Generates unique policy codes per organization and category';
























