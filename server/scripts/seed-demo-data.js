import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function seedDemoData() {
  try {
    await createPool();
    console.log('🌱 Seeding demo data...\n');

    // Get first organization
    const orgResult = await query('SELECT id, name FROM organizations LIMIT 1');
    
    if (orgResult.rows.length === 0) {
      console.log('❌ No organizations found. Please create an organization first.');
      return;
    }

    const orgId = orgResult.rows[0].id;
    console.log(`📋 Seeding for organization: ${orgResult.rows[0].name}`);

    // Create 2 branches with geofences
    console.log('\n📍 Creating branches with geofences...');
    
    const branches = [
      {
        name: 'Head Office',
        code: 'HO',
        address: { city: 'Bangalore', state: 'Karnataka' },
        geofence: {
          type: 'circle',
          center: { lat: 12.9716, lon: 77.5946 },
          radius: 100,
        },
      },
      {
        name: 'Mumbai Branch',
        code: 'MUM',
        address: { city: 'Mumbai', state: 'Maharashtra' },
        geofence: {
          type: 'circle',
          center: { lat: 19.0760, lon: 72.8777 },
          radius: 150,
        },
      },
    ];

    const createdBranches = [];
    for (const branch of branches) {
      const branchResult = await query(
        `INSERT INTO org_branches (org_id, name, code, address, is_active)
         VALUES ($1, $2, $3, $4::jsonb, true)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [orgId, branch.name, branch.code, JSON.stringify(branch.address)]
      );

      if (branchResult.rows.length > 0) {
        const branchId = branchResult.rows[0].id;
        createdBranches.push({ ...branch, id: branchId });

        // Create geofence
        await query(
          `INSERT INTO branch_geofences (branch_id, type, coords, radius_meters, is_active)
           VALUES ($1, $2, $3::jsonb, $4, true)
           ON CONFLICT DO NOTHING`,
          [
            branchId,
            branch.geofence.type,
            JSON.stringify({ center: branch.geofence.center }),
            branch.geofence.radius,
          ]
        );

        console.log(`  ✅ Created ${branch.name} with geofence`);
      } else {
        console.log(`  ⏭️  ${branch.name} already exists`);
      }
    }

    // Create departments
    console.log('\n🏢 Creating departments...');
    const departments = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations'];
    const createdDepts = [];
    
    for (const deptName of departments) {
      const deptResult = await query(
        `INSERT INTO departments (org_id, name, code)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [orgId, deptName, deptName.substring(0, 3).toUpperCase()]
      );

      if (deptResult.rows.length > 0) {
        createdDepts.push({ id: deptResult.rows[0].id, name: deptName });
        console.log(`  ✅ Created ${deptName}`);
      }
    }

    // Create teams
    console.log('\n👥 Creating teams...');
    const teams = [
      { name: 'Backend Team', dept: 'Engineering' },
      { name: 'Frontend Team', dept: 'Engineering' },
      { name: 'Sales Team A', dept: 'Sales' },
      { name: 'HR Operations', dept: 'HR' },
    ];

    for (const team of teams) {
      const dept = createdDepts.find(d => d.name === team.dept);
      if (dept) {
        await query(
          `INSERT INTO teams (org_id, department_id, name, code)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [orgId, dept.id, team.name, team.name.substring(0, 3).toUpperCase()]
        );
        console.log(`  ✅ Created ${team.name}`);
      }
    }

    console.log('\n✅ Demo data seeding completed!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Branches: ${createdBranches.length}`);
    console.log(`   - Departments: ${createdDepts.length}`);
    console.log(`   - Teams: ${teams.length}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Create employees and assign them to branches/departments`);
    console.log(`   2. Test clock in/out with geolocation`);
    console.log(`   3. View analytics at /analytics/attendance`);
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedDemoData();


