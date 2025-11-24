-- Migration: Multi-branch Attendance v1
-- Feature flag: multi_branch_attendance_v1
-- Adds geolocation, address capture, WFO/WFH tracking, and geofence support

-- Enable PostGIS extension for geospatial operations (if available)
-- If PostGIS is not available, we'll use simple distance calculations
DO $$
BEGIN
  -- Try to enable PostGIS, but don't fail if it's not available
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION
  WHEN OTHERS THEN
    -- PostGIS not available, will use manual distance calculations
    NULL;
END $$;

-- Add geolocation and address fields to attendance_events
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lon NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS address_text TEXT,
  ADD COLUMN IF NOT EXISTS capture_method TEXT CHECK (capture_method IN ('geo', 'manual', 'kiosk', 'unknown')) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_location_branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_type TEXT CHECK (work_type IN ('WFO', 'WFH')) DEFAULT 'WFH';

-- Add geolocation fields to clock_punch_sessions
ALTER TABLE clock_punch_sessions
  ADD COLUMN IF NOT EXISTS lat_in NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lon_in NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS address_text_in TEXT,
  ADD COLUMN IF NOT EXISTS lat_out NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS lon_out NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS address_text_out TEXT,
  ADD COLUMN IF NOT EXISTS capture_method_in TEXT CHECK (capture_method_in IN ('geo', 'manual', 'kiosk', 'unknown')),
  ADD COLUMN IF NOT EXISTS capture_method_out TEXT CHECK (capture_method_out IN ('geo', 'manual', 'kiosk', 'unknown')),
  ADD COLUMN IF NOT EXISTS consent_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_ts_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_out BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_ts_out TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_location_branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_type TEXT CHECK (work_type IN ('WFO', 'WFH')) DEFAULT 'WFH';

-- Create branch_geofences table
CREATE TABLE IF NOT EXISTS branch_geofences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES org_branches(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('circle', 'polygon')) DEFAULT 'circle',
  coords JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- For circle: {"center": {"lat": 12.9716, "lon": 77.5946}, "radius_meters": 100}
  -- For polygon: {"points": [{"lat": 12.9716, "lon": 77.5946}, ...]}
  radius_meters INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(branch_id, type)
);

CREATE INDEX IF NOT EXISTS idx_branch_geofences_branch ON branch_geofences(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_geofences_active ON branch_geofences(branch_id, is_active);

-- Create indexes for geolocation queries
CREATE INDEX IF NOT EXISTS idx_attendance_events_geo ON attendance_events(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_events_work_type ON attendance_events(work_type);
CREATE INDEX IF NOT EXISTS idx_attendance_events_branch ON attendance_events(work_location_branch_id);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_work_type ON clock_punch_sessions(work_type);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_branch ON clock_punch_sessions(work_location_branch_id);

-- Function to check if a point is within a circle geofence
CREATE OR REPLACE FUNCTION point_in_circle(
  point_lat NUMERIC,
  point_lon NUMERIC,
  center_lat NUMERIC,
  center_lon NUMERIC,
  radius_meters INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  distance_km NUMERIC;
  acos_input NUMERIC;
BEGIN
  -- Haversine formula for distance calculation
  -- Calculate the input to acos, clamping to [-1, 1] to avoid domain errors
  acos_input := cos(radians(center_lat)) *
                cos(radians(point_lat)) *
                cos(radians(point_lon) - radians(center_lon)) +
                sin(radians(center_lat)) *
                sin(radians(point_lat));
  
  -- Clamp to valid range for acos
  IF acos_input > 1.0 THEN
    acos_input := 1.0;
  ELSIF acos_input < -1.0 THEN
    acos_input := -1.0;
  END IF;
  
  distance_km := 6371 * acos(acos_input);
  
  RETURN distance_km * 1000 <= radius_meters;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if a point is within a polygon geofence (simple ray casting)
CREATE OR REPLACE FUNCTION point_in_polygon(
  point_lat NUMERIC,
  point_lon NUMERIC,
  polygon_points JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  point_count INTEGER;
  i INTEGER;
  j INTEGER;
  inside BOOLEAN := false;
  p1 JSONB;
  p2 JSONB;
BEGIN
  -- Extract points array
  IF jsonb_typeof(polygon_points->'points') != 'array' THEN
    RETURN false;
  END IF;
  
  point_count := jsonb_array_length(polygon_points->'points');
  
  IF point_count < 3 THEN
    RETURN false;
  END IF;
  
  -- Ray casting algorithm
  i := 0;
  j := point_count - 1;
  
  WHILE i < point_count LOOP
    p1 := polygon_points->'points'->i;
    p2 := polygon_points->'points'->j;
    
    IF (
      ((p1->>'lat')::NUMERIC > point_lat) != ((p2->>'lat')::NUMERIC > point_lat) AND
      (point_lon < ((p2->>'lon')::NUMERIC - (p1->>'lon')::NUMERIC) * 
       (point_lat - (p1->>'lat')::NUMERIC) / 
       ((p2->>'lat')::NUMERIC - (p1->>'lat')::NUMERIC) + (p1->>'lon')::NUMERIC)
    ) THEN
      inside := NOT inside;
    END IF;
    
    j := i;
    i := i + 1;
  END LOOP;
  
  RETURN inside;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to resolve branch from coordinates
CREATE OR REPLACE FUNCTION resolve_branch_from_coords(
  p_lat NUMERIC,
  p_lon NUMERIC,
  p_org_id UUID
) RETURNS UUID AS $$
DECLARE
  v_branch_id UUID;
  v_geofence RECORD;
BEGIN
  -- Check all active geofences for the organization
  FOR v_geofence IN
    SELECT bg.id, bg.branch_id, bg.type, bg.coords, bg.radius_meters
    FROM branch_geofences bg
    JOIN org_branches ob ON ob.id = bg.branch_id
    WHERE ob.org_id = p_org_id
      AND bg.is_active = true
  LOOP
    IF v_geofence.type = 'circle' THEN
      IF point_in_circle(
        p_lat,
        p_lon,
        (v_geofence.coords->'center'->>'lat')::NUMERIC,
        (v_geofence.coords->'center'->>'lon')::NUMERIC,
        v_geofence.radius_meters
      ) THEN
        RETURN v_geofence.branch_id;
      END IF;
    ELSIF v_geofence.type = 'polygon' THEN
      IF point_in_polygon(p_lat, p_lon, v_geofence.coords) THEN
        RETURN v_geofence.branch_id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add updated_at trigger for branch_geofences
CREATE TRIGGER update_branch_geofences_updated_at
  BEFORE UPDATE ON branch_geofences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE branch_geofences IS 'Geofence definitions for branches to determine WFO/WFH status';
COMMENT ON FUNCTION resolve_branch_from_coords IS 'Resolves which branch a coordinate pair belongs to based on geofences';


