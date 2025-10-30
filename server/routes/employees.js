import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// Get all employees
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    let employeesQuery;
    const params = [tenantId];

    // If manager, only show their team
    if (req.user.role === 'manager') {
      const managerResult = await query(
        'SELECT id FROM employees WHERE user_id = $1',
        [req.user.id]
      );
      
      if (managerResult.rows.length > 0) {
        const managerId = managerResult.rows[0].id;
        employeesQuery = `
          SELECT 
            e.*,
            json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name,
              'email', p.email
            ) as profiles
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          WHERE e.tenant_id = $1 
            AND e.reporting_manager_id = $2
          ORDER BY e.created_at DESC
        `;
        params.push(managerId);
      } else {
        employeesQuery = `
          SELECT 
            e.*,
            json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name,
              'email', p.email
            ) as profiles
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          WHERE e.tenant_id = $1
          ORDER BY e.created_at DESC
        `;
      }
    } else {
      employeesQuery = `
        SELECT 
          e.*,
          json_build_object(
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email
          ) as profiles
        FROM employees e
        JOIN profiles p ON p.id = e.user_id
        WHERE e.tenant_id = $1
        ORDER BY e.created_at DESC
      `;
    }

    const result = await query(employeesQuery, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get org chart structure (all active employees with profiles)
router.get('/org-chart', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT 
        e.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email,
          'phone', p.phone
        ) as profiles
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.tenant_id = $1 AND e.status = 'active'
      ORDER BY e.employee_id`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching org chart:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if employee needs to change password
router.get('/check-password-change', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, must_change_password, onboarding_status FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({ must_change_password: false, onboarding_status: null });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error checking password change:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create employee (HR/CEO only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'director', 'ceo'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const {
      firstName,
      lastName,
      email,
      employeeId,
      department,
      position,
      workLocation,
      joinDate,
      reportingManagerId,
      role
    } = req.body;

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Generate random password
    const tempPassword = Math.random().toString(36).slice(-8) + 
                         Math.random().toString(36).slice(-8).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await query('BEGIN');

    try {
      // Create user ID
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;

      // Create profile
      await query(
        `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, firstName, lastName, tenantId]
      );

      // Create auth record
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, hashedPassword]
      );

      // Create employee record
      const empResult = await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, work_location,
          join_date, reporting_manager_id, tenant_id, must_change_password,
          onboarding_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'not_started')
        RETURNING *`,
        [
          userId, employeeId, department, position, workLocation,
          joinDate, reportingManagerId || null, tenantId
        ]
      );

      // Create user role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, role || 'employee', tenantId]
      );

      await query('COMMIT');

      res.status(201).json({
        success: true,
        email,
        message: 'Employee created successfully. They can use "First Time Login".',
        userId
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: error.message || 'Failed to create employee' });
  }
});

// Bulk CSV import
router.post('/import', authenticateToken, requireRole('hr', 'director', 'ceo'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const errors = [];
  let imported = 0;
  // Parse CSV rows
  let records;
  try {
    records = parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true
    });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV file' });
  }
  // Get org/tenant
  const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
  const tenantId = tenantResult.rows[0]?.tenant_id;
  if (!tenantId) return res.status(403).json({ error: 'No organization found' });

  for (const [idx, row] of records.entries()) {
    const {
      firstName, lastName, email, employeeId, department, position, workLocation,
      joinDate, grade, managerEmail, role = 'employee'
    } = row;
    if (!firstName || !lastName || !email || !employeeId || !role) {
      errors.push(`Row ${idx + 2}: Missing required fields`);
      continue;
    }
    // Find reporting_manager_id if managerEmail present
    let reportingManagerId = null;
    if (managerEmail) {
      const mgrRes = await query('SELECT e.id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE lower(p.email) = lower($1)', [managerEmail]);
      if (mgrRes.rows.length) reportingManagerId = mgrRes.rows[0].id;
    }
    // Deduplicate by email
    const existing = await query('SELECT id FROM profiles WHERE lower(email) = lower($1)', [email]);
    if (existing.rows.length) {
      errors.push(`Row ${idx + 2}: Email ${email} already exists`);
      continue;
    }
    // Use same logic as normal employee create (in transaction for safety)
    try {
      await query('BEGIN');
      // Create user ID
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;
      // Create profile
      await query(
        `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, firstName, lastName, tenantId]
      );
      // Generate random password
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      // Create auth record
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, hashedPassword]
      );
      // Create employee record
      await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, work_location,
          join_date, reporting_manager_id, tenant_id, must_change_password,
          onboarding_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'not_started')`,
        [userId, employeeId, department, position, workLocation, joinDate || null, reportingManagerId, tenantId]
      );
      // Create user role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, role, tenantId]
      );
      await query('COMMIT');
      imported++;
    } catch (err) {
      await query('ROLLBACK');
      errors.push(`Row ${idx + 2}: ${err?.message || 'Unknown error'}`);
    }
  }
  res.json({ imported, errors });
});

export default router;
