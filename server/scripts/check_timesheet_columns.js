import { createPool } from '../db/pool.js';

async function checkColumns() {
    let pool;
    try {
        pool = await createPool();
        
        console.log('Checking timesheets table columns...');
        
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'timesheets'
            AND column_name IN ('submitted_by', 'approvals', 'audit_snapshot')
            ORDER BY column_name
        `);
        
        console.log('\nFound columns:');
        if (result.rows.length === 0) {
            console.log('❌ None of the columns exist!');
        } else {
            result.rows.forEach(row => {
                console.log(`  ✅ ${row.column_name} (${row.data_type})`);
            });
        }
        
        // Check all columns in timesheets table
        const allColumns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'timesheets'
            ORDER BY ordinal_position
        `);
        
        console.log('\nAll columns in timesheets table:');
        allColumns.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})`);
        });
        
    } catch (error) {
        console.error('❌ Error checking columns:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

checkColumns();



















