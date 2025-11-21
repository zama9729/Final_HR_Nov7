import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixPointInCircle() {
  try {
    await createPool();
    console.log('🔧 Fixing point_in_circle function...\n');

    const fixSQL = `
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
    `;

    await query(fixSQL);
    console.log('✅ Function updated successfully!\n');

    // Test the function
    console.log('🧪 Testing function...');
    const testResult = await query(`
      SELECT resolve_branch_from_coords($1, $2, $3) as branch_id
    `, [17.4466385, 78.3770118, '4fc0cc33-50d7-443c-b6d2-6cad4bf30c0c']);
    
    if (testResult.rows[0]?.branch_id) {
      console.log(`   ✅ Test passed! Branch ID: ${testResult.rows[0].branch_id}`);
      console.log(`   ✅ WFO detection should now work correctly!`);
    } else {
      console.log(`   ⚠️  Test returned NULL - no branch found for these coordinates`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing function:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixPointInCircle();

