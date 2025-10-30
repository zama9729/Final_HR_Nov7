import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get employee ID for current user
router.get('/employee-id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee ID:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending timesheets for manager's team (must be before '/' route)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    // Get current user's employee ID and role
    const empResult = await query(
      `SELECT e.id, e.tenant_id, ur.role
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       LEFT JOIN user_roles ur ON ur.user_id = e.user_id
       WHERE e.user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { id: managerId, tenant_id: tenantId, role } = empResult.rows[0];

    // Check if user is manager or HR/CEO
    if (!['manager', 'hr', 'director', 'ceo'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Build query based on role
    let timesheetsQuery;
    if (role === 'manager') {
      // Managers can only see their team's timesheets
      timesheetsQuery = `
        SELECT 
          t.*,
          json_build_object(
            'id', e.id,
            'employee_id', e.employee_id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email
          ) as employee
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        JOIN profiles p ON p.id = e.user_id
        WHERE t.tenant_id = $1
          AND t.status = 'pending'
          AND e.reporting_manager_id = $2
        ORDER BY t.submitted_at DESC
      `;
    } else {
      // HR/CEO can see all pending timesheets
      timesheetsQuery = `
        SELECT 
          t.*,
          json_build_object(
            'id', e.id,
            'employee_id', e.employee_id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email
          ) as employee
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        JOIN profiles p ON p.id = e.user_id
        WHERE t.tenant_id = $1
          AND t.status = 'pending'
        ORDER BY t.submitted_at DESC
      `;
    }

    const result = await query(timesheetsQuery, role === 'manager' ? [tenantId, managerId] : [tenantId]);
    
    // Fetch entries separately for each timesheet
    const timesheetsWithEntries = await Promise.all(
      result.rows.map(async (timesheet) => {
        const entriesResult = await query(
          'SELECT id, work_date, hours, description FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
          [timesheet.id]
        );
        return {
          ...timesheet,
          entries: entriesResult.rows || [],
        };
      })
    );
    
    res.json(timesheetsWithEntries);
  } catch (error) {
    console.error('Error fetching pending timesheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get timesheet for a week
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { weekStart, weekEnd } = req.query;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: 'weekStart and weekEnd required' });
    }

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Get timesheet
    const timesheetResult = await query(
      `SELECT * FROM timesheets
       WHERE employee_id = $1 AND week_start_date = $2`,
      [employeeId, weekStart]
    );

    if (timesheetResult.rows.length === 0) {
      return res.json(null);
    }

    const timesheet = timesheetResult.rows[0];

    // Get entries
    const entriesResult = await query(
      'SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
      [timesheet.id]
    );

    res.json({
      ...timesheet,
      entries: entriesResult.rows,
    });
  } catch (error) {
    console.error('Error fetching timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save/update timesheet
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { weekStart, weekEnd, totalHours, entries } = req.body;

    // Log incoming data for debugging
    console.log('Received timesheet save request:', {
      weekStart,
      weekEnd,
      totalHours,
      entriesCount: entries?.length || 0,
      entries: entries,
    });

    // Validate entries have work_date
    if (entries && Array.isArray(entries)) {
      const invalidEntries = entries.filter(e => !e || !e.work_date);
      if (invalidEntries.length > 0) {
        console.error('Invalid entries received:', invalidEntries);
        return res.status(400).json({ 
          error: 'Some entries are missing work_date',
          invalidEntries 
        });
      }
    }

    // Get employee
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { id: employeeId, tenant_id: tenantId } = empResult.rows[0];

    await query('BEGIN');

    try {
      // Check if timesheet exists
      const existingResult = await query(
        'SELECT id, status FROM timesheets WHERE employee_id = $1 AND week_start_date = $2',
        [employeeId, weekStart]
      );

      let timesheetId;
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        timesheetId = existing.id;
        // Only update if not approved
        if (existing.status !== 'approved') {
          await query(
            `UPDATE timesheets SET
              week_end_date = $1,
              total_hours = $2,
              status = 'pending',
              updated_at = now()
            WHERE id = $3`,
            [weekEnd, totalHours, timesheetId]
          );
        }
      } else {
        // Insert new timesheet
        const insertResult = await query(
          `INSERT INTO timesheets (
            employee_id, tenant_id, week_start_date, week_end_date,
            total_hours, status
          )
          VALUES ($1, $2, $3, $4, $5, 'pending')
          RETURNING *`,
          [employeeId, tenantId, weekStart, weekEnd, totalHours]
        );
        timesheetId = insertResult.rows[0].id;
      }

      // Delete old entries
      await query(
        'DELETE FROM timesheet_entries WHERE timesheet_id = $1',
        [timesheetId]
      );

      // Insert new entries
      if (entries && Array.isArray(entries) && entries.length > 0) {
        for (const entry of entries) {
          // Validate entry has required fields
          if (!entry) {
            console.warn('Skipping null/undefined entry');
            continue;
          }
          
          if (!entry.work_date) {
            console.error('Entry missing work_date:', JSON.stringify(entry));
            throw new Error(`Entry is missing required field 'work_date': ${JSON.stringify(entry)}`);
          }
          
          const workDate = String(entry.work_date).trim();
          if (!workDate) {
            console.error('Entry has empty work_date:', JSON.stringify(entry));
            throw new Error(`Entry has empty 'work_date': ${JSON.stringify(entry)}`);
          }
          
          console.log('Inserting entry:', {
            timesheetId,
            tenantId,
            work_date: workDate,
            hours: Number(entry.hours) || 0,
          });
          
          await query(
            `INSERT INTO timesheet_entries (timesheet_id, tenant_id, work_date, hours, description)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              timesheetId,
              tenantId,
              workDate,
              Number(entry.hours) || 0,
              entry.description || '',
            ]
          );
        }
      }

      await query('COMMIT');

      // Return updated timesheet
      const updatedResult = await query(
        `SELECT * FROM timesheets WHERE id = $1`,
        [timesheetId]
      );

      const entriesResult = await query(
        'SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
        [timesheetId]
      );

      res.json({
        ...updatedResult.rows[0],
        entries: entriesResult.rows,
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error saving timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve or reject timesheet
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body; // action: 'approve', 'reject', or 'return'

    if (!action || !['approve', 'reject', 'return'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, reject, or return' });
    }

    if ((action === 'reject' || action === 'return') && !rejectionReason) {
      return res.status(400).json({ error: 'Reason required for reject or return' });
    }

    // Get current user's employee ID and role
    const empResult = await query(
      `SELECT e.id, ur.role
       FROM employees e
       LEFT JOIN user_roles ur ON ur.user_id = e.user_id
       WHERE e.user_id = $1`,
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { id: reviewerId, role } = empResult.rows[0];

    // Check if user has permission
    if (!['manager', 'hr', 'director', 'ceo'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get timesheet and verify permission
    const timesheetResult = await query(
      `SELECT t.*, e.reporting_manager_id
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id
       WHERE t.id = $1`,
      [id]
    );

    if (timesheetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const timesheet = timesheetResult.rows[0];

    // Check permission based on role
    if (role === 'manager' && timesheet.reporting_manager_id !== reviewerId) {
      return res.status(403).json({ error: 'You can only approve timesheets from your team' });
    }

    // Update timesheet
    let status, updateQuery, params;
    
    if (action === 'approve') {
      status = 'approved';
      updateQuery = `UPDATE timesheets SET 
           status = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           updated_at = now()
         WHERE id = $3
         RETURNING *`;
      params = [status, reviewerId, id];
    } else if (action === 'reject') {
      status = 'rejected';
      updateQuery = `UPDATE timesheets SET 
           status = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           rejection_reason = $4,
           updated_at = now()
         WHERE id = $3
         RETURNING *`;
      params = [status, reviewerId, id, rejectionReason];
    } else { // return
      status = 'pending';
      updateQuery = `UPDATE timesheets SET 
           status = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           rejection_reason = $4,
           updated_at = now(),
           resubmitted_at = NULL
         WHERE id = $3
         RETURNING *`;
      params = [status, reviewerId, id, rejectionReason];
    }

    const updateResult = await query(updateQuery, params);

    res.json({
      success: true,
      timesheet: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error approving/rejecting timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

