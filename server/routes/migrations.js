import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

// Run migration for timesheet projects
router.post('/timesheet-projects', async (req, res) => {
  try {
    await query('BEGIN');
    
    try {
      // Add project_id column
      await query(`
        ALTER TABLE timesheet_entries 
        ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
      `);
      
      // Add project_type column
      await query(`
        ALTER TABLE timesheet_entries 
        ADD COLUMN IF NOT EXISTS project_type TEXT CHECK (project_type IN ('assigned', 'non-billable', 'internal'))
      `);
      
      // Create index
      await query(`
        CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project 
        ON timesheet_entries(project_id)
      `);
      
      await query('COMMIT');
      
      res.json({ success: true, message: 'Migration completed successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run fix assignments updated_at migration
router.post('/fix-assignments-updated-at', async (req, res) => {
  try {
    await query('BEGIN');
    
    try {
      // Add updated_at column
      await query(`
        ALTER TABLE assignments 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()
      `);
      
      // Add index for end_date
      await query(`
        CREATE INDEX IF NOT EXISTS idx_assignments_end_date ON assignments(end_date)
      `);
      
      // Create trigger for assignments updated_at
      await query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'update_assignments_updated_at'
          ) THEN
            CREATE TRIGGER update_assignments_updated_at
            BEFORE UPDATE ON assignments
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
          END IF;
        END $$
      `);
      
      // Create trigger for projects updated_at
      await query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'update_projects_updated_at'
          ) THEN
            CREATE TRIGGER update_projects_updated_at
            BEFORE UPDATE ON projects
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
          END IF;
        END $$
      `);
      
      // Create trigger for skills updated_at
      await query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'update_skills_updated_at'
          ) THEN
            CREATE TRIGGER update_skills_updated_at
            BEFORE UPDATE ON skills
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
          END IF;
        END $$
      `);
      
      await query('COMMIT');
      
      res.json({ success: true, message: 'Assignments updated_at migration completed successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run migration to add missing columns to timesheets
router.post('/add-submitted-by-to-timesheets', async (req, res) => {
  try {
    await query('BEGIN');
    
    try {
      // Add submitted_by column
      await query(`
        ALTER TABLE timesheets
        ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id)
      `);
      
      // Add approvals column
      await query(`
        ALTER TABLE timesheets
        ADD COLUMN IF NOT EXISTS approvals JSONB DEFAULT '[]'::jsonb
      `);
      
      // Add audit_snapshot column
      await query(`
        ALTER TABLE timesheets
        ADD COLUMN IF NOT EXISTS audit_snapshot JSONB
      `);
      
      // Create index for better query performance
      await query(`
        CREATE INDEX IF NOT EXISTS idx_timesheets_submitted_by ON timesheets(submitted_by)
      `);
      
      await query('COMMIT');
      
      res.json({ success: true, message: 'Migration completed successfully: added submitted_by, approvals, and audit_snapshot columns to timesheets' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

