/**
 * Script to clean all data from the database while preserving schema
 * Run this with: node server/db/clean_database.js
 */

import { createPool, query } from './pool.js';

async function cleanDatabase() {
  try {
    console.log('🔄 Connecting to database...');
    await createPool();
    
    console.log('🗑️  Cleaning all data from tables...');
    
    // Start transaction
    await query('BEGIN');
    
    try {
      // Delete from tables in reverse dependency order
      // Child tables first (most dependent), then parent tables
      const tables = [
        // Attendance system (most dependent)
        'attendance_audit_logs',
        'attendance_upload_rows',
        'attendance_uploads',
        'attendance_events',
        // Timesheet entries
        'timesheet_entries',
        // Holiday system
        'holidays',
        'holiday_lists',
        // Benefit points (references projects - must be before projects)
        'benefit_points',
        // Projects and assignments
        'assignments',
        'employee_projects',
        'projects',
        // Skills and certifications
        'certifications',
        'skills',
        // AI and mini apps
        'ai_suggestion_logs',
        'ai_conversations',
        'opal_mini_apps',
        // Check-in/Check-out
        'check_in_check_outs',
        // Performance and appraisals
        'performance_reviews',
        'appraisal_cycles',
        // Approvals system
        'approval_audit',
        'approvals',
        'hr_approval_thresholds',
        // Workflows
        'workflows',
        // Notifications
        'notifications',
        // Shifts
        'shifts',
        // Leave system
        'leave_requests',
        'leave_policies',
        // Timesheets
        'timesheets',
        // Onboarding data
        'onboarding_data',
        // User authentication
        'user_auth',
        // User roles
        'user_roles',
        // Employees (references profiles and organizations)
        'employees',
        // Profiles (references organizations)
        'profiles',
        // Organizations (parent table - delete last)
        'organizations'
      ];
      
      // First, try to get row counts before deletion
      for (const table of tables) {
        try {
          const countResult = await query(`SELECT COUNT(*) as count FROM ${table}`);
          const rowCount = parseInt(countResult.rows[0].count);
          if (rowCount > 0) {
            // Use TRUNCATE CASCADE to handle foreign keys automatically
            await query(`TRUNCATE TABLE ${table} CASCADE`);
            console.log(`   ✓ Cleaned ${table} (${rowCount} rows)`);
          } else {
            console.log(`   ✓ ${table} (already empty)`);
          }
        } catch (error) {
          // Table might not exist, skip it
          if (error.message.includes('does not exist')) {
            console.log(`   ⚠ Skipped ${table} (table does not exist)`);
          } else {
            // If TRUNCATE fails due to foreign key, try DELETE
            try {
              const result = await query(`DELETE FROM ${table}`);
              console.log(`   ✓ Cleaned ${table} using DELETE (${result.rowCount} rows)`);
            } catch (deleteError) {
              console.error(`   ❌ Error cleaning ${table}:`, deleteError.message);
              throw deleteError;
            }
          }
        }
      }
      
      // Commit transaction
      await query('COMMIT');
      console.log('\n✅ Database cleaned successfully! All data removed while preserving schema.');
      
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the cleanup
cleanDatabase();

