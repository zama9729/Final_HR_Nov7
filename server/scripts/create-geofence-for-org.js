import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function createGeofenceForOrg() {
  try {
    await createPool();
    console.log('📍 Creating geofence for user organization...\n');

    const userOrgId = '38171e00-dff3-44fc-9604-bccc7c775ed1';
    const branchName = 'HYD_Raidurgh';
    
    // Get the branch for this org
    const branchResult = await query(`
      SELECT id, name, org_id 
      FROM org_branches 
      WHERE org_id = $1 AND name LIKE $2
      LIMIT 1
    `, [userOrgId, `%${branchName}%`]);

    if (branchResult.rows.length === 0) {
      console.log('❌ Branch not found');
      return;
    }

    const branch = branchResult.rows[0];
    console.log(`   Found branch: ${branch.name} (${branch.id})`);

    // Create or update geofence
    const geofenceResult = await query(`
      INSERT INTO branch_geofences (branch_id, type, coords, radius_meters, is_active)
      VALUES ($1, 'circle', $2::jsonb, $3, true)
      ON CONFLICT (branch_id, type) DO UPDATE
      SET coords = EXCLUDED.coords,
          radius_meters = EXCLUDED.radius_meters,
          is_active = true,
          updated_at = now()
      RETURNING id, branch_id, radius_meters
    `, [
      branch.id,
      JSON.stringify({
        center: {
          lat: 17.4466385,
          lon: 78.3770118
        }
      }),
      1000 // 1000 meters radius
    ]);

    console.log(`   ✅ Created/Updated geofence: ${geofenceResult.rows[0].radius_meters}m radius`);
    
    // Test the geofence
    console.log('\n🧪 Testing geofence resolution...');
    const testResult = await query(`
      SELECT resolve_branch_from_coords($1::NUMERIC, $2::NUMERIC, $3::UUID) as branch_id
    `, [17.4535492, 78.37639, userOrgId]);
    
    if (testResult.rows[0]?.branch_id) {
      console.log(`   ✅ Test passed! Branch ID: ${testResult.rows[0].branch_id}`);
      console.log(`   ✅ WFO detection should now work!`);
    } else {
      console.log(`   ⚠️  Test failed - coordinates did not resolve`);
      
      // Test point_in_circle directly
      const directTest = await query(`
        SELECT point_in_circle($1::NUMERIC, $2::NUMERIC, $3::NUMERIC, $4::NUMERIC, $5) as is_inside
      `, [17.4535492, 78.37639, 17.4466385, 78.3770118, 1000]);
      
      console.log(`   Direct point_in_circle test: ${directTest.rows[0]?.is_inside ? 'INSIDE' : 'OUTSIDE'}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createGeofenceForOrg();

