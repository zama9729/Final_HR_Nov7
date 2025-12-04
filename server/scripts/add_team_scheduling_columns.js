/**
 * Migration script to add team_id and assignment_type columns to schedule_assignments
 * Run this if you're getting "column team_id does not exist" errors
 */

import { createPool, query } from '../db/pool.js';

async function addTeamSchedulingColumns() {
  // Initialize database pool
  await createPool();
  try {
    console.log('🔄 Adding team scheduling columns to schedule_assignments...');

    // Check if team_id column exists
    const teamIdCheck = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'schedule_assignments' 
        AND column_name = 'team_id'
      ) as exists;
    `);

    if (!teamIdCheck.rows[0].exists) {
      await query(`
        ALTER TABLE schedule_assignments
          ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_assignments_team ON schedule_assignments(team_id);`);
      console.log('✅ Added team_id column');
    } else {
      console.log('ℹ️  team_id column already exists');
    }

    // Check if assignment_type column exists
    const assignmentTypeCheck = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'schedule_assignments' 
        AND column_name = 'assignment_type'
      ) as exists;
    `);

    if (!assignmentTypeCheck.rows[0].exists) {
      await query(`
        ALTER TABLE schedule_assignments
          ADD COLUMN assignment_type TEXT DEFAULT 'employee' CHECK (assignment_type IN ('employee', 'team'));
      `);
      console.log('✅ Added assignment_type column');
    } else {
      console.log('ℹ️  assignment_type column already exists');
    }

    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addTeamSchedulingColumns();

