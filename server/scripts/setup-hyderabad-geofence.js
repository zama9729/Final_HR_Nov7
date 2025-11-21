import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function setupHyderabadGeofence() {
  try {
    await createPool();
    console.log('📍 Setting up Hyderabad geofence...\n');

    // Get the first Hyderabad branch
    const branchResult = await query(`
      SELECT id, name, org_id 
      FROM org_branches 
      WHERE name LIKE '%HYD%' OR name LIKE '%Hyd%' OR name LIKE '%Hyderabad%'
      LIMIT 1
    `);

    if (branchResult.rows.length === 0) {
      console.log('❌ No Hyderabad branch found. Creating one...');
      
      // Get first organization
      const orgResult = await query('SELECT id, name FROM organizations LIMIT 1');
      if (orgResult.rows.length === 0) {
        console.log('❌ No organization found');
        return;
      }
      
      const orgId = orgResult.rows[0].id;
      console.log(`   Using organization: ${orgResult.rows[0].name}`);
      
      // Create a Hyderabad branch
      const newBranchResult = await query(`
        INSERT INTO org_branches (org_id, name, code, is_active)
        VALUES ($1, $2, $3, true)
        RETURNING id, name
      `, [orgId, 'Hyderabad Office', 'HYD']);
      
      const branchId = newBranchResult.rows[0].id;
      console.log(`   ✅ Created branch: ${newBranchResult.rows[0].name}`);
      
      // Create geofence for Hyderabad office area
      // Using coordinates from user's clock-in: 17.4466385, 78.3770118
      // Setting 500 meter radius
      await query(`
        INSERT INTO branch_geofences (branch_id, type, coords, radius_meters, is_active)
        VALUES ($1, 'circle', $2::jsonb, $3, true)
        ON CONFLICT (branch_id, type) DO UPDATE
        SET coords = EXCLUDED.coords,
            radius_meters = EXCLUDED.radius_meters,
            is_active = true,
            updated_at = now()
      `, [
        branchId,
        JSON.stringify({
          center: {
            lat: 17.4466385,
            lon: 78.3770118
          }
        }),
        500 // 500 meters radius
      ]);
      
      console.log(`   ✅ Created geofence: 500m radius around (17.4466, 78.3770)`);
      console.log(`\n✅ Setup complete! Geofence is active.`);
    } else {
      const branch = branchResult.rows[0];
      console.log(`   Found branch: ${branch.name} (${branch.id})`);
      
      // Check if geofence exists
      const geofenceResult = await query(`
        SELECT id, type, coords, radius_meters, is_active
        FROM branch_geofences
        WHERE branch_id = $1 AND is_active = true
      `, [branch.id]);
      
      if (geofenceResult.rows.length > 0) {
        console.log(`   ⚠️  Geofence already exists:`);
        console.log(`      Type: ${geofenceResult.rows[0].type}`);
        console.log(`      Radius: ${geofenceResult.rows[0].radius_meters}m`);
        console.log(`      Coords: ${JSON.stringify(geofenceResult.rows[0].coords)}`);
        
        // Update it to cover the user's location
        await query(`
          UPDATE branch_geofences
          SET coords = $1::jsonb,
              radius_meters = $2,
              is_active = true,
              updated_at = now()
          WHERE branch_id = $3 AND type = 'circle'
        `, [
          JSON.stringify({
            center: {
              lat: 17.4466385,
              lon: 78.3770118
            }
          }),
          500,
          branch.id
        ]);
        console.log(`   ✅ Updated geofence to cover clock-in location`);
      } else {
        // Create new geofence
        await query(`
          INSERT INTO branch_geofences (branch_id, type, coords, radius_meters, is_active)
          VALUES ($1, 'circle', $2::jsonb, $3, true)
        `, [
          branch.id,
          JSON.stringify({
            center: {
              lat: 17.4466385,
              lon: 78.3770118
            }
          }),
          500 // 500 meters radius
        ]);
        console.log(`   ✅ Created geofence: 500m radius around (17.4466, 78.3770)`);
      }
      
      console.log(`\n✅ Setup complete! Geofence is active.`);
    }
    
    // Verify the geofence works
    console.log('\n🧪 Testing geofence resolution...');
    const testResult = await query(`
      SELECT resolve_branch_from_coords($1, $2, $3) as branch_id
    `, [17.4466385, 78.3770118, branchResult.rows[0]?.org_id || (await query('SELECT id FROM organizations LIMIT 1')).rows[0].id]);
    
    if (testResult.rows[0]?.branch_id) {
      console.log(`   ✅ Test passed! Coordinates resolve to branch: ${testResult.rows[0].branch_id}`);
    } else {
      console.log(`   ⚠️  Test failed - coordinates did not resolve to a branch`);
      console.log(`   This might be because the org_id doesn't match.`);
    }
    
  } catch (error) {
    console.error('❌ Error setting up geofence:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

setupHyderabadGeofence();

