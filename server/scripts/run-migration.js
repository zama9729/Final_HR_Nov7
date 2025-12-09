import fs from 'fs';
import path from 'path';
import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const runMigration = async () => {
    const migrationFile = process.argv[2];

    if (!migrationFile) {
        console.error('Please provide a migration file path');
        process.exit(1);
    }

    const fullPath = path.resolve(process.cwd(), migrationFile);

    if (!fs.existsSync(fullPath)) {
        console.error(`Migration file not found: ${fullPath}`);
        process.exit(1);
    }

    console.log(`Running migration: ${migrationFile}`);

    try {
        const sql = fs.readFileSync(fullPath, 'utf8');
        await createPool();
        await query('BEGIN');
        await query(sql);
        await query('COMMIT');
        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        await query('ROLLBACK');
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();
