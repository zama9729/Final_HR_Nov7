import { createPool } from '../db/pool.js';

async function verifyAndFix() {
    let pool;
    try {
        pool = await createPool();
        
        console.log('Verifying timesheets table columns...');
        
        // Check if columns exist
        const checkResult = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'timesheets'
            AND column_name IN ('submitted_by', 'approvals', 'audit_snapshot')
        `);
        
        const existingColumns = new Set(checkResult.rows.map(r => r.column_name));
        console.log('Existing columns:', Array.from(existingColumns));
        
        // Add missing columns
        if (!existingColumns.has('submitted_by')) {
            console.log('Adding submitted_by column...');
            await pool.query(`
                ALTER TABLE timesheets
                ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id)
            `);
            console.log('✅ Added submitted_by');
        }
        
        if (!existingColumns.has('approvals')) {
            console.log('Adding approvals column...');
            await pool.query(`
                ALTER TABLE timesheets
                ADD COLUMN IF NOT EXISTS approvals JSONB DEFAULT '[]'::jsonb
            `);
            console.log('✅ Added approvals');
        }
        
        if (!existingColumns.has('audit_snapshot')) {
            console.log('Adding audit_snapshot column...');
            await pool.query(`
                ALTER TABLE timesheets
                ADD COLUMN IF NOT EXISTS audit_snapshot JSONB
            `);
            console.log('✅ Added audit_snapshot');
        }
        
        // Verify again
        const verifyResult = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'timesheets'
            AND column_name IN ('submitted_by', 'approvals', 'audit_snapshot')
        `);
        
        console.log('\n✅ Final verification - All columns exist:');
        verifyResult.rows.forEach(row => {
            console.log(`  - ${row.column_name}`);
        });
        
        // Create index if it doesn't exist
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_timesheets_submitted_by ON timesheets(submitted_by)
        `);
        console.log('✅ Index created/verified');
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

verifyAndFix();



















