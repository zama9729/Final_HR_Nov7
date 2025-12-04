import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPool } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const pool = await createPool();

  try {
    const migrations = [
      '../db/migrations/20250129_scheduler_schema.sql',
      '../db/migrations/20251128_score_rank_scheduler.sql',
    ];

    for (const relPath of migrations) {
      const migrationPath = path.join(__dirname, relPath);
      console.log(`Reading migration file from: ${migrationPath}`);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log(`Executing migration ${path.basename(migrationPath)}...`);

      await pool.query(sql);
      console.log(`✅ Migration ${path.basename(migrationPath)} applied successfully`);
    }

    console.log('✅ All scheduling schema migrations applied successfully!');
  } catch (error) {
    console.error('❌ Scheduling schema migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();


