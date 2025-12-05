/**
 * Seed script to add new payroll components (CCA, Conveyance, Medical Allowance)
 * to the payroll_components table in the HR system
 * 
 * Run with: node server/scripts/seed_new_allowances.js
 */

import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const NEW_COMPONENTS = [
  { name: 'CCA', displayName: 'City Compensatory Allowance', type: 'earning', is_taxable: true },
  { name: 'Conveyance', displayName: 'Conveyance Allowance', type: 'earning', is_taxable: true },
  { name: 'Medical Allowance', displayName: 'Medical Allowance', type: 'earning', is_taxable: true },
];

async function seedNewAllowances() {
  try {
    console.log('🔄 Connecting to database...');
    await createPool();
    console.log('✅ Database connected');

    // Get all organizations
    const orgsResult = await query('SELECT id FROM organizations');
    const orgs = orgsResult.rows;

    if (orgs.length === 0) {
      console.log('⚠️  No organizations found. Skipping seed.');
      return;
    }

    console.log(`📦 Found ${orgs.length} organization(s). Seeding components...`);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const org of orgs) {
      const tenantId = org.id;
      console.log(`\n🏢 Processing organization: ${tenantId}`);

      for (const component of NEW_COMPONENTS) {
        try {
          // Check if component already exists (case-insensitive)
          const existing = await query(
            `SELECT id FROM payroll_components 
             WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
            [tenantId, component.name]
          );

          if (existing.rows.length > 0) {
            console.log(`  ⏭️  "${component.name}" already exists, skipping`);
            totalSkipped++;
            continue;
          }

          // Insert new component
          const result = await query(
            `INSERT INTO payroll_components (
              tenant_id, name, component_type, is_taxable, is_fixed_component, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name`,
            [
              tenantId,
              component.name,
              component.type,
              component.is_taxable,
              true, // is_fixed_component
              JSON.stringify({ displayName: component.displayName })
            ]
          );

          console.log(`  ✅ Created: "${component.name}" (ID: ${result.rows[0].id})`);
          totalCreated++;
        } catch (error) {
          console.error(`  ❌ Error creating "${component.name}":`, error.message);
        }
      }
    }

    console.log(`\n✅ Seed completed!`);
    console.log(`   Created: ${totalCreated} component(s)`);
    console.log(`   Skipped: ${totalSkipped} component(s) (already exist)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedNewAllowances();

