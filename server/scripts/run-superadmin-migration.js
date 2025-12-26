import { runMigration } from '../utils/runMigration.js';
import { createPool } from '../db/pool.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    console.log('🔌 Connecting to database...');
    await createPool();
    
    const migrationPath = path.join(__dirname, '../db/migrations/20260120_super_admin_module.sql');
    console.log(`📄 Running migration: ${migrationPath}`);
    
    const success = await runMigration(migrationPath);
    
    if (success) {
      console.log('✅ Super Admin module migration completed successfully!');
      process.exit(0);
    } else {
      console.error('❌ Migration failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

main();

