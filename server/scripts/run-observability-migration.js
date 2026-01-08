#!/usr/bin/env node
/**
 * Run Tenant Observability Migration
 * 
 * This script runs the migration that creates observability tables
 * for tenant health, metrics, and usage tracking.
 * 
 * Usage:
 *   node server/scripts/run-observability-migration.js
 */

import { createPool } from '../db/pool.js';
import { runMigration } from '../utils/runMigration.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationFile = path.join(
  __dirname,
  '../db/migrations/20260121_tenant_observability.sql'
);

console.log(`📄 Migration file: ${migrationFile}\n`);

try {
  // Initialize database pool
  await createPool();
  console.log('✅ Database connection established\n');
  
  // Run migration
  await runMigration(migrationFile);
  console.log('\n✅ Observability migration completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('   1. Restart the backend API server');
  console.log('   2. The observability cron job will start collecting metrics');
  console.log('   3. Access observability data via Super Admin Dashboard');
  console.log('   4. Metrics will be collected automatically going forward');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error);
  process.exit(1);
}

