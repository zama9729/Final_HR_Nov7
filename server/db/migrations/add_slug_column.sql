-- Add slug column to organizations table if it doesn't exist
-- This migration is safe to run multiple times

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'slug'
  ) THEN
    ALTER TABLE organizations ADD COLUMN slug TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
    
    -- Generate slugs for existing organizations
    UPDATE organizations 
    SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
    WHERE slug IS NULL;
    
    -- Remove leading/trailing hyphens
    UPDATE organizations 
    SET slug = TRIM(BOTH '-' FROM slug)
    WHERE slug IS NOT NULL;
    
    -- Handle duplicates by appending number
    DO $$
    DECLARE
      org_record RECORD;
      counter INTEGER;
      new_slug TEXT;
    BEGIN
      FOR org_record IN 
        SELECT id, slug FROM organizations WHERE slug IS NOT NULL
        ORDER BY created_at
      LOOP
        counter := 1;
        new_slug := org_record.slug;
        
        WHILE EXISTS (
          SELECT 1 FROM organizations 
          WHERE slug = new_slug AND id != org_record.id
        ) LOOP
          new_slug := org_record.slug || '-' || counter;
          counter := counter + 1;
        END LOOP;
        
        UPDATE organizations 
        SET slug = new_slug 
        WHERE id = org_record.id;
      END LOOP;
    END $$;
  END IF;
END $$;

