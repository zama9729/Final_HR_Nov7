import { query } from '../db/pool.js';

/**
 * Ensure onboarding_data table has all required columns
 */
export async function ensureOnboardingColumns() {
  try {
    // Check which columns exist
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'onboarding_data'
      AND column_name IN (
        'permanent_address', 
        'permanent_city', 
        'permanent_state', 
        'permanent_postal_code',
        'current_address',
        'current_city',
        'current_state',
        'current_postal_code',
        'passport_number'
      );
    `);
    
    const existingColumns = new Set(columnCheck.rows.map(r => r.column_name));
    
    // Add missing columns
    const columnsToAdd = [];
    
    if (!existingColumns.has('permanent_address')) {
      columnsToAdd.push('permanent_address TEXT');
    }
    if (!existingColumns.has('permanent_city')) {
      columnsToAdd.push('permanent_city TEXT');
    }
    if (!existingColumns.has('permanent_state')) {
      columnsToAdd.push('permanent_state TEXT');
    }
    if (!existingColumns.has('permanent_postal_code')) {
      columnsToAdd.push('permanent_postal_code TEXT');
    }
    if (!existingColumns.has('current_address')) {
      columnsToAdd.push('current_address TEXT');
    }
    if (!existingColumns.has('current_city')) {
      columnsToAdd.push('current_city TEXT');
    }
    if (!existingColumns.has('current_state')) {
      columnsToAdd.push('current_state TEXT');
    }
    if (!existingColumns.has('current_postal_code')) {
      columnsToAdd.push('current_postal_code TEXT');
    }
    if (!existingColumns.has('passport_number')) {
      columnsToAdd.push('passport_number TEXT');
    }
    
    if (columnsToAdd.length > 0) {
      for (const columnDef of columnsToAdd) {
        const columnName = columnDef.split(' ')[0];
        try {
          await query(`ALTER TABLE onboarding_data ADD COLUMN ${columnDef}`);
          console.log(`✅ Added column: ${columnName} to onboarding_data`);
        } catch (error) {
          if (error.message && error.message.includes('already exists')) {
            console.log(`⏭️  Column ${columnName} already exists`);
          } else {
            console.error(`❌ Error adding column ${columnName}:`, error.message);
          }
        }
      }
    } else {
      console.log('✅ All onboarding columns already exist');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error ensuring onboarding columns:', error.message);
    return false;
  }
}

