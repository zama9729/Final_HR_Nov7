import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPool } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    const pool = await createPool();

    try {
        const migrationPath = path.join(__dirname, '../db/migrations/20251204_add_team_id_to_schedules.sql');
        console.log(`Reading migration file from: ${migrationPath}`);

        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Executing migration...');

        await pool.query(sql);

        console.log('✅ Migration applied successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
