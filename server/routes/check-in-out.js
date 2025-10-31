import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Check in
router.post('/check-in', authenticateToken, async (req, res) => {
  try {
    // Get employee ID
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;
    const tenantId = empResult.rows[0].tenant_id;
    const checkInTime = new Date();

    // Insert check-in record
    const result = await query(
      `INSERT INTO check_in_check_outs (employee_id, check_in_time, tenant_id)
       VALUES ($1, $2, $3)
       RETURNING id, check_in_time, work_date`,
      [employeeId, checkInTime, tenantId]
    );

    res.json({
      success: true,
      id: result.rows[0].id,
      check_in_time: result.rows[0].check_in_time,
      work_date: result.rows[0].work_date
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check out
router.post('/check-out', authenticateToken, async (req, res) => {
  try {
    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;
    const checkOutTime = new Date();

    // Find the most recent check-in without check-out
    const checkInResult = await query(
      `SELECT id, check_in_time 
       FROM check_in_check_outs 
       WHERE employee_id = $1 
         AND check_out_time IS NULL 
       ORDER BY check_in_time DESC 
       LIMIT 1`,
      [employeeId]
    );

    if (checkInResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active check-in found' });
    }

    const checkInRecord = checkInResult.rows[0];

    // Update with check-out time
    const result = await query(
      `UPDATE check_in_check_outs 
       SET check_out_time = $1
       WHERE id = $2
       RETURNING id, check_in_time, check_out_time, hours_worked, work_date`,
      [checkOutTime, checkInRecord.id]
    );

    res.json({
      success: true,
      id: result.rows[0].id,
      check_in_time: result.rows[0].check_in_time,
      check_out_time: result.rows[0].check_out_time,
      hours_worked: result.rows[0].hours_worked,
      work_date: result.rows[0].work_date
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get today's check-in/check-out records
router.get('/today', authenticateToken, async (req, res) => {
  try {
    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;
    const today = new Date().toISOString().split('T')[0];

    // Get all check-in/out records for today
    const result = await query(
      `SELECT id, check_in_time, check_out_time, hours_worked, work_date
       FROM check_in_check_outs 
       WHERE employee_id = $1 
         AND work_date = $2
       ORDER BY check_in_time ASC`,
      [employeeId, today]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get today records error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get check-in/out records for a date range
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
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

    // Get all check-in/out records for the date range
    const result = await query(
      `SELECT id, check_in_time, check_out_time, hours_worked, work_date
       FROM check_in_check_outs 
       WHERE employee_id = $1 
         AND work_date >= $2 
         AND work_date <= $3
       ORDER BY work_date DESC, check_in_time ASC`,
      [employeeId, startDate, endDate]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current status (is currently checked in?)
router.get('/status', authenticateToken, async (req, res) => {
  try {
    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Check if there's an active check-in
    const result = await query(
      `SELECT id, check_in_time, work_date
       FROM check_in_check_outs 
       WHERE employee_id = $1 
         AND check_out_time IS NULL 
       ORDER BY check_in_time DESC 
       LIMIT 1`,
      [employeeId]
    );

    if (result.rows.length === 0) {
      return res.json({
        checkedIn: false,
        checkedInSince: null
      });
    }

    res.json({
      checkedIn: true,
      checkedInSince: result.rows[0].check_in_time,
      work_date: result.rows[0].work_date
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

