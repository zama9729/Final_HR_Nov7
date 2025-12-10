import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPool } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    let pool;
    try {
        pool = await createPool();
        const migrationPath = path.join(__dirname, '../db/migrations/20251207_add_submitted_by_to_timesheets.sql');
        console.log(`Reading migration file from: ${migrationPath}`);

        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Executing migration...');

        await pool.query(sql);

        console.log('✅ Migration applied successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

runMigration();

