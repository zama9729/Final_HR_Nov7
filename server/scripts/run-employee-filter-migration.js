#!/usr/bin/env node
/**
 * Run migration: Remove Implicit Active-Only Filters
 * 
 * This script runs the migration that documents the removal of implicit
 * status='active' filters from employee queries.
 * 
 * Usage:
 *   node server/scripts/run-employee-filter-migration.js
 * 
 * Or with explicit file:
 *   node server/scripts/run-migration.js server/db/migrations/20250130_remove_implicit_active_filters.sql
 */

import { createPool } from '../db/pool.js';
import { runMigration } from '../utils/runMigration.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationFile = path.join(
  __dirname,
  '../db/migrations/20250130_remove_implicit_active_filters.sql'
);

console.log('🚀 Running migration: Remove Implicit Active-Only Filters');
console.log(`📄 Migration file: ${migrationFile}\n`);

try {
  // Initialize database pool
  await createPool();
  console.log('✅ Database connection established\n');
  
  // Run migration
  await runMigration(migrationFile);
  console.log('\n✅ Migration completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('   1. Restart the backend API server');
  console.log('   2. Rebuild the frontend (npm run build)');
  console.log('   3. Restart Kubernetes deployments if using k8s');
  console.log('   4. Verify changes in the application UI');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error);
  process.exit(1);
}

