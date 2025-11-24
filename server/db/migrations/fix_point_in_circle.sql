-- Fix point_in_circle function to handle acos domain errors
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

