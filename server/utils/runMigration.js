import { query } from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run a SQL migration file
 */
export async function runMigration(sqlFilePath) {
  try {
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    await query(sql);
    console.log(`✅ Migration applied: ${path.basename(sqlFilePath)}`);
    return true;
  } catch (error) {
    if (error.message && error.message.includes('already exists') || 
        error.message && error.message.includes('duplicate')) {
      console.log(`⏭️  Migration already applied: ${path.basename(sqlFilePath)}`);
      return true;
    }
    console.error(`❌ Migration failed: ${path.basename(sqlFilePath)}`, error.message);
    return false;
  }
}

/**
 * Ensure admin role exists in app_role enum
 */
export async function ensureAdminRole() {
  try {
    // Check if admin role already exists by querying pg_enum
    const checkResult = await query(`
      SELECT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'admin' 
        AND enumtypid = (
          SELECT oid 
          FROM pg_type 
          WHERE typname = 'app_role'
        )
      ) as exists;
    `);
    
    if (checkResult.rows[0]?.exists) {
      console.log('✅ Admin role already exists in app_role enum');
      return true;
    }
    
    // Add admin role to enum
    // Note: ALTER TYPE ... ADD VALUE cannot use IF NOT EXISTS in older PostgreSQL versions
    // So we catch the error if it already exists
    try {
      await query(`ALTER TYPE app_role ADD VALUE 'admin'`);
      console.log('✅ Admin role added to app_role enum');
      return true;
    } catch (addError) {
      // If the error is that admin already exists, that's fine (race condition)
      if (addError.message && (
        addError.message.includes('already exists') ||
        addError.message.includes('duplicate') ||
        addError.message.includes('enum label "admin" already exists')
      )) {
        console.log('✅ Admin role already exists in app_role enum');
        return true;
      }
      throw addError;
    }
  } catch (error) {
    // If the error is that admin already exists, that's fine
    if (error.message && (
      error.message.includes('already exists') ||
      error.message.includes('duplicate') ||
      error.message.includes('enum label "admin" already exists')
    )) {
      console.log('✅ Admin role already exists in app_role enum');
      return true;
    }
    console.error('❌ Error ensuring admin role:', error.message);
    return false;
  }
}

