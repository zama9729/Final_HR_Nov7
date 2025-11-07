import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

// Get all shifts (with role-based filtering)
router.get('/', async (req, res) => {
  try {
    // Check if filtering by specific employee_id
    const { employee_id } = req.query;
    
    // First get user role and tenant_id
    const userResult = await query(
      `SELECT p.tenant_id, ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { tenant_id: tenantId, role } = userResult.rows[0];

    // Get employee ID if user has an employee record
    let employeeId = null;
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (empResult.rows.length > 0) {
      employeeId = empResult.rows[0].id;
    }

    let shiftsQuery;
    let params;
    
    if (['hr', 'director', 'ceo'].includes(role)) {
      // HR/CEO can see all shifts, optionally filtered by employee_id
      if (employee_id) {
        shiftsQuery = `
          SELECT 
            s.*,
            json_build_object(
              'employee_id', e.employee_id,
              'profiles', json_build_object(
                'first_name', p.first_name,
                'last_name', p.last_name
              )
            ) as employees
          FROM shifts s
          JOIN employees e ON e.id = s.employee_id
          JOIN profiles p ON p.id = e.user_id
          WHERE s.tenant_id = $1 AND s.employee_id = $2
          ORDER BY s.shift_date ASC, s.start_time ASC
        `;
        params = [tenantId, employee_id];
      } else {
        shiftsQuery = `
          SELECT 
            s.*,
            json_build_object(
              'employee_id', e.employee_id,
              'profiles', json_build_object(
                'first_name', p.first_name,
                'last_name', p.last_name
              )
            ) as employees
          FROM shifts s
          JOIN employees e ON e.id = s.employee_id
          JOIN profiles p ON p.id = e.user_id
          WHERE s.tenant_id = $1
          ORDER BY s.shift_date ASC, s.start_time ASC
        `;
        params = [tenantId];
      }
    } else if (role === 'manager') {
      // Managers can see their team's shifts
      shiftsQuery = `
        SELECT 
          s.*,
          json_build_object(
            'employee_id', e.employee_id,
            'profiles', json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name
            )
          ) as employees
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        JOIN profiles p ON p.id = e.user_id
        WHERE s.tenant_id = $1
          AND e.reporting_manager_id = $2
        ORDER BY s.shift_date ASC, s.start_time ASC
      `;
    } else {
      // Employees can only see their own shifts
      shiftsQuery = `
        SELECT 
          s.*,
          json_build_object(
            'employee_id', e.employee_id,
            'profiles', json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name
            )
          ) as employees
        FROM shifts s
        JOIN employees e ON e.id = s.employee_id
        JOIN profiles p ON p.id = e.user_id
        WHERE s.tenant_id = $1
          AND s.employee_id = $2
        ORDER BY s.shift_date ASC, s.start_time ASC
      `;
    }

    // Set params for manager and employee roles if not already set
    if (!params) {
      if (role === 'manager' && employeeId) {
        params = [tenantId, employeeId];
      } else if (employeeId) {
        params = [tenantId, employeeId];
      } else {
        // User has no employee record and is not an admin
        return res.json([]);
      }
    }

    const result = await query(shiftsQuery, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new shift
router.post('/', async (req, res) => {
  try {
    const { employee_id, shift_date, start_time, end_time, shift_type, notes, status } = req.body;

    // Validate required fields
    if (!employee_id || !shift_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get current user's tenant_id and role
    const userResult = await query(
      `SELECT p.tenant_id, ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { tenant_id: tenantId, role } = userResult.rows[0];

    // Get employee ID if user has an employee record
    let employeeId = null;
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (empResult.rows.length > 0) {
      employeeId = empResult.rows[0].id;
    }

    // Check if user has permission to create shifts
    if (!['hr', 'director', 'ceo', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // If manager, verify they can manage this employee
    if (role === 'manager' && employeeId) {
      const targetEmpResult = await query(
        'SELECT reporting_manager_id FROM employees WHERE id = $1',
        [employee_id]
      );
      if (targetEmpResult.rows.length === 0) {
        return res.status(404).json({ error: 'Target employee not found' });
      }
      if (targetEmpResult.rows[0].reporting_manager_id !== employeeId) {
        return res.status(403).json({ error: 'You can only create shifts for your team members' });
      }
    }

    // Insert shift
    const insertResult = await query(
      `INSERT INTO shifts (
        tenant_id, employee_id, shift_date, start_time, 
        end_time, shift_type, notes, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        tenantId,
        employee_id,
        shift_date,
        start_time,
        end_time,
        shift_type || 'regular',
        notes || null,
        status || 'scheduled',
        req.user.id
      ]
    );

    // Fetch the shift with employee details
    const shiftResult = await query(
      `SELECT 
        s.*,
        json_build_object(
          'employee_id', e.employee_id,
          'profiles', json_build_object(
            'first_name', p.first_name,
            'last_name', p.last_name
          )
        ) as employees
      FROM shifts s
      JOIN employees e ON e.id = s.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE s.id = $1`,
      [insertResult.rows[0].id]
    );

    res.status(201).json(shiftResult.rows[0]);
  } catch (error) {
    console.error('Error creating shift:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

