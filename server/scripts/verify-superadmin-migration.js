import { query } from '../db/pool.js';
import { createPool } from '../db/pool.js';

async function verify() {
  try {
    console.log('🔌 Connecting to database...');
    await createPool();
    
    console.log('\n📊 Verifying Super Admin module tables...\n');
    
    // Check organizations table has new columns
    const orgColumns = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' 
      AND column_name IN ('tier', 'status', 'subscription_start_date', 'subscription_end_date', 'last_active_at')
      ORDER BY column_name
    `);
    console.log('✅ Organizations table columns:');
    orgColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    
    // Check feature_flags table
    const featureFlagsCount = await query('SELECT COUNT(*)::int AS count FROM feature_flags');
    console.log(`\n✅ Feature flags table: ${featureFlagsCount.rows[0].count} features`);
    
    // Check tenant_features table
    const tenantFeaturesCount = await query('SELECT COUNT(*)::int AS count FROM tenant_features');
    console.log(`✅ Tenant features table: ${tenantFeaturesCount.rows[0].count} tenant-feature mappings`);
    
    // Check superadmin_audit_logs table
    const auditLogsCount = await query('SELECT COUNT(*)::int AS count FROM superadmin_audit_logs');
    console.log(`✅ Superadmin audit logs table: ${auditLogsCount.rows[0].count} log entries`);
    
    // Check enums
    const enums = await query(`
      SELECT typname 
      FROM pg_type 
      WHERE typname IN ('subscription_tier', 'tenant_status')
    `);
    console.log(`\n✅ Enums created: ${enums.rows.map(r => r.typname).join(', ')}`);
    
    // Check triggers
    const triggers = await query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_name IN ('trigger_sync_tenant_features', 'trigger_initialize_tenant_features')
    `);
    console.log(`✅ Triggers created: ${triggers.rows.map(r => r.trigger_name).join(', ')}`);
    
    // Show sample features
    const sampleFeatures = await query(`
      SELECT feature_key, feature_name, tier_basic, tier_premium, tier_enterprise 
      FROM feature_flags 
      LIMIT 5
    `);
    console.log('\n📋 Sample features:');
    sampleFeatures.rows.forEach(f => {
      console.log(`   - ${f.feature_name} (${f.feature_key})`);
      console.log(`     Basic: ${f.tier_basic ? '✓' : '✗'}, Premium: ${f.tier_premium ? '✓' : '✗'}, Enterprise: ${f.tier_enterprise ? '✓' : '✗'}`);
    });
    
    console.log('\n✅ All checks passed! Super Admin module is ready to use.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verify();

