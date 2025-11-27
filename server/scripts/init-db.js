import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createPool, query } from '../db/pool.js';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
    try {
        console.log('Connecting to database...');
        await createPool();

        const schemaPath = path.join(__dirname, '../db/full-schema.sql');
        console.log(`Reading schema from ${schemaPath}...`);
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split by semicolon followed by newline to separate statements roughly
        // This is not perfect for PL/pgSQL but might work if formatted well
        const statements = schema.split(/;\s*[\r\n]+/).filter(s => s.trim().length > 0);

        console.log(`Found ${statements.length} statements.`);

        for (const statement of statements) {
            try {
                // Skip empty statements
                if (!statement.trim()) continue;

                await query(statement);
            } catch (error) {
                // Ignore "relation already exists" (42P07) and "type already exists" (42710)
                if (error.code === '42P07' || error.code === '42710') {
                    // console.log('⚠️  Skipping existing relation/type');
                } else {
                    console.error('❌ Error executing statement:', error.message);
                    // console.error('Statement:', statement.substring(0, 100) + '...');
                }
            }
        }

        console.log('✅ Database initialized successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
}

initDb();
