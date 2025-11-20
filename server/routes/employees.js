import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryWithOrg } from '../db/pool.js';
import { rebuildSegmentsForEmployee } from '../services/assignment-segmentation.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { sendInviteEmail } from '../services/email.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

const assignmentSelectFragment = `
  COALESCE((
    SELECT json_build_object(
      'assignment_id', ea.id,
      'branch_id', ea.branch_id,
      'branch_name', ob.name,
      'department_id', ea.department_id,
      'department_name', dept.name,
      'team_id', ea.team_id,
      'team_name', team.name,
      'pay_group_id', pg.id,
      'pay_group_name', pg.name,
      'timezone', ob.timezone,
      'holiday_calendar_id', ob.holiday_calendar_id,
      'is_home', ea.is_home,
      'fte', ea.fte,
      'role', ea.role,
      'start_date', ea.start_date,
      'end_date', ea.end_date
    )
    FROM employee_assignments ea
    LEFT JOIN org_branches ob ON ob.id = ea.branch_id
    LEFT JOIN departments dept ON dept.id = ea.department_id
    LEFT JOIN teams team ON team.id = ea.team_id
    LEFT JOIN pay_groups pg ON pg.id = ea.pay_group_id
    WHERE ea.employee_id = e.id
    ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST
    LIMIT 1
  ), '{}'::json) as home_assignment,
  COALESCE((
    SELECT json_agg(json_build_object(
      'assignment_id', ea.id,
      'branch_id', ea.branch_id,
      'branch_name', ob.name,
      'department_id', ea.department_id,
      'department_name', dept.name,
      'team_id', ea.team_id,
      'team_name', team.name,
      'is_home', ea.is_home,
      'fte', ea.fte,
      'role', ea.role,
      'start_date', ea.start_date,
      'end_date', ea.end_date
    ) ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST)
    FROM employee_assignments ea
    LEFT JOIN org_branches ob ON ob.id = ea.branch_id
    LEFT JOIN departments dept ON dept.id = ea.department_id
    LEFT JOIN teams team ON team.id = ea.team_id
    WHERE ea.employee_id = e.id
  ), '[]'::json) as assignments
`;

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
              'email', p.email,
              'role', ur.role
            ) as profiles,
            ${assignmentSelectFragment}
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          LEFT JOIN user_roles ur ON ur.user_id = e.user_id
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
              'email', p.email,
              'role', ur.role
            ) as profiles,
            ${assignmentSelectFragment}
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          LEFT JOIN user_roles ur ON ur.user_id = e.user_id
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
            'email', p.email,
            'role', ur.role
          ) as profiles,
          ${assignmentSelectFragment}
        FROM employees e
        JOIN profiles p ON p.id = e.user_id
        LEFT JOIN user_roles ur ON ur.user_id = e.user_id
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

// Get org chart structure (all active employees with profiles) - MUST be before /:id
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
        ) as profiles,
        ${assignmentSelectFragment}
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

// Get single employee by ID - MUST be after specific routes like /org-chart and /check-password-change
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's tenant_id for authorization
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const userTenantId = tenantResult.rows[0]?.tenant_id;
    
    if (!userTenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Get employee with profile data, reporting manager info, and organization info
    const employeeResult = await query(
      `SELECT 
        e.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email,
          'phone', p.phone
        ) as profiles,
        json_build_object(
          'id', mgr_e.id,
          'employee_id', mgr_e.employee_id,
          'first_name', mgr_p.first_name,
          'last_name', mgr_p.last_name,
          'email', mgr_p.email,
          'position', mgr_e.position,
          'department', mgr_e.department
        ) as reporting_manager,
        json_build_object(
          'name', o.name,
          'domain', o.domain
        ) as organization
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN employees mgr_e ON mgr_e.id = e.reporting_manager_id
      LEFT JOIN profiles mgr_p ON mgr_p.id = mgr_e.user_id
      LEFT JOIN organizations o ON o.id = e.tenant_id
      WHERE e.id = $1 AND e.tenant_id = $2`,
      [id, userTenantId]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employee = employeeResult.rows[0];
    
    // Get reporting team (direct reports)
    const teamResult = await query(
      `SELECT 
        e.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as profiles
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.reporting_manager_id = $1 AND e.tenant_id = $2 AND e.status = 'active'
      ORDER BY e.employee_id`,
      [id, userTenantId]
    );
    
    employee.reporting_team = teamResult.rows;
    
    // Get onboarding data
    const onboardingResult = await query(
      `SELECT * FROM onboarding_data WHERE employee_id = $1`,
      [id]
    );
    
    if (onboardingResult.rows.length > 0) {
      employee.onboarding_data = onboardingResult.rows[0];
    }
    
    // Get performance reviews
    const reviewsResult = await query(
      `SELECT 
        pr.*,
        json_build_object(
          'cycle_name', ac.cycle_name,
          'cycle_year', ac.cycle_year,
          'start_date', ac.start_date,
          'end_date', ac.end_date
        ) as appraisal_cycle,
        json_build_object(
          'first_name', reviewer_p.first_name,
          'last_name', reviewer_p.last_name,
          'position', reviewer_e.position
        ) as reviewer
      FROM performance_reviews pr
      LEFT JOIN appraisal_cycles ac ON ac.id = pr.appraisal_cycle_id
      LEFT JOIN employees reviewer_e ON reviewer_e.id = pr.reviewer_id
      LEFT JOIN profiles reviewer_p ON reviewer_p.id = reviewer_e.user_id
      WHERE pr.employee_id = $1 AND pr.tenant_id = $2
      ORDER BY pr.created_at DESC`,
      [id, userTenantId]
    );
    
    employee.performance_reviews = reviewsResult.rows;
    
    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create employee (HR/CEO/Director/Admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
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
      role,
      homeBranchId,
      homeDepartmentId,
      homeTeamId,
      assignmentStartDate,
      assignmentRole,
      assignmentFte,
      assignmentMetadata
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
      const createdEmployee = empResult.rows[0];

      if (homeBranchId || homeDepartmentId || homeTeamId) {
        await queryWithOrg(
          `INSERT INTO employee_assignments (
            org_id, user_id, employee_id, branch_id, department_id, team_id,
            role, fte, start_date, is_home, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 1.0), COALESCE($9::date, $10::date), true, COALESCE($11::jsonb, '{}'::jsonb))`,
          [
            tenantId,
            userId,
            createdEmployee.id,
            homeBranchId || null,
            homeDepartmentId || null,
            homeTeamId || null,
            assignmentRole || position || 'Member',
            assignmentFte || 1,
            assignmentStartDate || joinDate || new Date().toISOString().slice(0, 10),
            joinDate || new Date().toISOString().slice(0, 10),
            assignmentMetadata || {}
          ],
          tenantId
        );
        await rebuildSegmentsForEmployee(tenantId, createdEmployee.id);
      }

      // Create user role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, role || 'employee', tenantId]
      );

      // Create invite token and send email
      try {
        // Get org info for email (check if slug column exists)
        let orgResult;
        try {
          const columnCheck = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'organizations' AND column_name = 'slug'
          `);
          const hasSlugColumn = columnCheck.rows.length > 0;
          
          if (hasSlugColumn) {
            orgResult = await query('SELECT name, slug FROM organizations WHERE id = $1', [tenantId]);
          } else {
            orgResult = await query('SELECT name FROM organizations WHERE id = $1', [tenantId]);
            if (orgResult.rows.length > 0) {
              orgResult.rows[0].slug = null;
            }
          }
        } catch (error) {
          // Fallback if check fails
          orgResult = await query('SELECT name FROM organizations WHERE id = $1', [tenantId]);
          if (orgResult.rows.length > 0) {
            orgResult.rows[0].slug = null;
          }
        }
        
        const org = orgResult.rows[0] || { name: 'Organization', slug: null };

        // Check if invite_tokens table exists
        const tableCheck = await query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'invite_tokens'
        `);
        
        if (tableCheck.rows.length > 0) {
          // Generate invite token
          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours expiry

          // Create invite token
          await query(
            `INSERT INTO invite_tokens (org_id, email, token, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [tenantId, email.toLowerCase().trim(), token, expiresAt]
          );

          // Send invite email
          try {
            await sendInviteEmail(email, org.name, org.slug || 'org', token);
            console.log(`✅ Invite email sent to ${email}`);
          } catch (emailError) {
            console.error(`⚠️  Failed to send invite email to ${email}:`, emailError);
            // Continue even if email fails - invite token is still created
          }
        } else {
          console.log(`⚠️  invite_tokens table not found. Skipping invite email for ${email}.`);
          console.log(`   Please run the migration: server/db/migrations/20241201_multi_tenant_rls.sql`);
        }
      } catch (inviteError) {
        console.error(`⚠️  Failed to create invite token for ${email}:`, inviteError);
        // Continue even if invite creation fails
      }

      await query('COMMIT');

      // Sync employee to Payroll system using sync service
      const { syncUserToPayrollWithRetry } = await import('../services/payroll-sync.js');
      
      // This will automatically create the user in Payroll with correct role mapping
      // Include employee-specific data: employeeId, department, position, joinDate
      await syncUserToPayrollWithRetry({
        hr_user_id: userId,
        email: email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        org_id: tenantId,
        role: role || 'employee',
        employee_id: employeeId,
        department: department,
        position: position, // HR uses 'position', Payroll maps to 'designation'
        join_date: joinDate // Format: YYYY-MM-DD
      }, 3); // Retry up to 3 times

      res.status(201).json({
        success: true,
        email,
        message: 'Employee created successfully. Invite email has been sent.',
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

// Update employee (HR/CEO only)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check role - only HR/CEO/Director can update
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'director', 'ceo'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify employee belongs to same tenant
    const empCheck = await query(
      'SELECT tenant_id, user_id FROM employees WHERE id = $1',
      [id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empCheck.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      employeeId,
      department,
      position,
      workLocation,
      joinDate,
      reportingManagerId,
      status
    } = req.body;

    await query('BEGIN');

    try {
      const userId = empCheck.rows[0].user_id;

      // Update profile if provided
      if (firstName || lastName || email || phone !== undefined) {
        const profileUpdates = [];
        const profileParams = [];
        let paramIndex = 1;

        if (firstName !== undefined) {
          profileUpdates.push(`first_name = $${paramIndex++}`);
          profileParams.push(firstName);
        }
        if (lastName !== undefined) {
          profileUpdates.push(`last_name = $${paramIndex++}`);
          profileParams.push(lastName);
        }
        if (email !== undefined) {
          profileUpdates.push(`email = $${paramIndex++}`);
          profileParams.push(email);
        }
        if (phone !== undefined) {
          profileUpdates.push(`phone = $${paramIndex++}`);
          profileParams.push(phone);
        }

        if (profileUpdates.length > 0) {
          profileUpdates.push(`updated_at = now()`);
          profileParams.push(userId);
          
          await query(
            `UPDATE profiles SET ${profileUpdates.join(', ')} WHERE id = $${paramIndex}`,
            profileParams
          );
        }
      }

      // Update employee if provided
      if (employeeId || department || position || workLocation || joinDate !== undefined || reportingManagerId !== undefined || status !== undefined) {
        const employeeUpdates = [];
        const employeeParams = [];
        let paramIndex = 1;

        if (employeeId !== undefined) {
          employeeUpdates.push(`employee_id = $${paramIndex++}`);
          employeeParams.push(employeeId);
        }
        if (department !== undefined) {
          employeeUpdates.push(`department = $${paramIndex++}`);
          employeeParams.push(department);
        }
        if (position !== undefined) {
          employeeUpdates.push(`position = $${paramIndex++}`);
          employeeParams.push(position);
        }
        if (workLocation !== undefined) {
          employeeUpdates.push(`work_location = $${paramIndex++}`);
          employeeParams.push(workLocation);
        }
        if (joinDate !== undefined) {
          employeeUpdates.push(`join_date = $${paramIndex++}`);
          employeeParams.push(joinDate);
        }
        if (reportingManagerId !== undefined) {
          employeeUpdates.push(`reporting_manager_id = $${paramIndex++}`);
          employeeParams.push(reportingManagerId || null);
        }
        if (status !== undefined) {
          employeeUpdates.push(`status = $${paramIndex++}`);
          employeeParams.push(status);
        }

        if (employeeUpdates.length > 0) {
          employeeUpdates.push(`updated_at = now()`);
          employeeParams.push(id);
          
          await query(
            `UPDATE employees SET ${employeeUpdates.join(', ')} WHERE id = $${paramIndex}`,
            employeeParams
          );
        }
      }

      await query('COMMIT');

      // Check for auto-promotion if reporting_manager_id was updated
      if (reportingManagerId !== undefined) {
        // The trigger will handle auto-promotion automatically
        // But we can also manually check if needed by counting direct reports
        const managerCheckResult = await query(
          `SELECT COUNT(*) as count FROM employees 
           WHERE reporting_manager_id = $1 AND status = 'active'`,
          [reportingManagerId]
        );
        
        if (managerCheckResult.rows[0]?.count >= 2) {
          const managerEmpResult = await query(
            'SELECT user_id, tenant_id FROM employees WHERE id = $1',
            [reportingManagerId]
          );
          if (managerEmpResult.rows.length > 0) {
            const { user_id, tenant_id } = managerEmpResult.rows[0];
            // Check if already has manager role or higher
            const roleCheck = await query(
              `SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')`,
              [user_id]
            );
            if (roleCheck.rows.length === 0) {
              // Promote to manager
              await query(
                'INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, role) DO NOTHING',
                [user_id, 'manager', tenant_id]
              );
            }
          }
        }
      }
      
      // Also check if this employee should be promoted (if they now have 2+ reports)
      const directReportsResult = await query(
        `SELECT COUNT(*) as count FROM employees 
         WHERE reporting_manager_id = $1 AND status = 'active'`,
        [id]
      );
      
      if (directReportsResult.rows[0]?.count >= 2) {
        const empCheck = await query(
          'SELECT user_id, tenant_id FROM employees WHERE id = $1',
          [id]
        );
        if (empCheck.rows.length > 0) {
          const { user_id, tenant_id } = empCheck.rows[0];
          // Check if already has manager role
          const roleCheck = await query(
            `SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')`,
            [user_id]
          );
          if (roleCheck.rows.length === 0) {
            // Promote to manager
            await query(
              'INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, role) DO NOTHING',
              [user_id, 'manager', tenant_id]
            );
          }
        }
      }

      // Fetch updated employee
      const updatedResult = await query(
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
        WHERE e.id = $1 AND e.tenant_id = $2`,
        [id, tenantId]
      );

      res.json(updatedResult.rows[0]);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message || 'Failed to update employee' });
  }
});

// Bulk CSV import
router.post('/import', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const errors = [];
  let imported = 0;
  // Parse CSV rows
  let records;
  try {
    const csvContent = req.file.buffer.toString('utf8');
    console.log('CSV file received, size:', csvContent.length, 'bytes');
    console.log('First 500 chars of CSV:', csvContent.substring(0, 500));
    
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true // Handle UTF-8 BOM
    });
    
    console.log(`Parsed ${records.length} rows from CSV`);
    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'CSV file appears to be empty or has no valid rows',
        imported_count: 0,
        failed_count: 0,
        errors: ['No rows found in CSV file']
      });
    }
    console.log('First row sample:', JSON.stringify(records[0], null, 2));
  } catch (e) {
    console.error('CSV parsing error:', e);
    return res.status(400).json({ 
      error: 'Invalid CSV file: ' + e.message,
      imported_count: 0,
      failed_count: 0,
      errors: ['Failed to parse CSV: ' + e.message]
    });
  }
  // Get org/tenant
  const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
  const tenantId = tenantResult.rows[0]?.tenant_id;
  if (!tenantId) return res.status(403).json({ error: 'No organization found' });

  console.log(`Processing ${records.length} rows from CSV for tenant ${tenantId}`);
  const managerMappings = []; // Store employee_id -> manager_email mappings for second pass
  for (const [idx, row] of records.entries()) {
    console.log(`Row ${idx + 2}:`, row);
    // Normalize column names (case-insensitive)
    const normalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().trim();
      normalizedRow[normalizedKey] = value ? String(value).trim() : '';
    }
    const {
      firstname, lastname, email, employeeid, department, position, worklocation,
      joindate, grade, manageremail, role
    } = normalizedRow;
    
    // Map normalized keys back to expected names
    const firstName = (firstname || normalizedRow['first_name'] || '').trim();
    const lastName = (lastname || normalizedRow['last_name'] || '').trim();
    const employeeId = (employeeid || normalizedRow['employee_id'] || '').trim();
    const workLocation = (worklocation || normalizedRow['work_location'] || '').trim();
    let joinDate = (joindate || normalizedRow['join_date'] || '').trim();
    const managerEmail = (manageremail || normalizedRow['manager_email'] || '').trim();
    const deptValue = (department || normalizedRow['department'] || '').trim();
    const posValue = (position || normalizedRow['position'] || '').trim();
    
    // Normalize role (case-insensitive, handle common variations)
    const roleValue = (role || '').trim().toLowerCase();
    const roleMapping = {
      'employee': 'employee',
      'hr': 'hr',
      'ceo': 'ceo',
      'director': 'director',
      'manager': 'manager',
      'admin': 'admin'
    };
    const validatedRole = roleMapping[roleValue] || 'employee';
    if (roleValue && !roleMapping[roleValue]) {
      console.log(`Row ${idx + 2}: Invalid role '${role}', defaulting to 'employee'`);
    }
    
    // Validate required fields
    if (!firstName || !lastName || !email || !employeeId) {
      const missing = [];
      if (!firstName) missing.push('firstName');
      if (!lastName) missing.push('lastName');
      if (!email) missing.push('email');
      if (!employeeId) missing.push('employeeId');
      const errorMsg = `Row ${idx + 2}: Missing required fields: ${missing.join(', ')}. Found: firstName="${firstName}", lastName="${lastName}", email="${email}", employeeId="${employeeId}"`;
      errors.push(errorMsg);
      console.log(`Row ${idx + 2} skipped:`, errorMsg);
      console.log(`Raw row data:`, row);
      continue;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const errorMsg = `Row ${idx + 2}: Invalid email format: "${email}"`;
      errors.push(errorMsg);
      console.log(errorMsg);
      continue;
    }
    
    // Parse and normalize date format (handle DD-MM-YYYY, MM-DD-YYYY, YYYY-MM-DD, etc.)
    let normalizedJoinDate = null;
    if (joinDate) {
      try {
        // Try to parse various date formats
        const dateParts = joinDate.split(/[-\/]/);
        if (dateParts.length === 3) {
          let year, month, day;
          // Check if first part is likely year (4 digits)
          if (dateParts[0].length === 4) {
            // YYYY-MM-DD or YYYY/MM/DD
            year = dateParts[0];
            month = dateParts[1].padStart(2, '0');
            day = dateParts[2].padStart(2, '0');
          } else {
            // Assume DD-MM-YYYY (most common in Indian format)
            day = dateParts[0].padStart(2, '0');
            month = dateParts[1].padStart(2, '0');
            year = dateParts[2];
          }
          // Validate year is reasonable (1900-2100)
          const yearNum = parseInt(year);
          if (yearNum >= 1900 && yearNum <= 2100) {
            normalizedJoinDate = `${year}-${month}-${day}`;
            // Validate it's a valid date
            const testDate = new Date(normalizedJoinDate);
            if (isNaN(testDate.getTime())) {
              normalizedJoinDate = null;
              console.log(`Row ${idx + 2}: Invalid date format '${joinDate}', will be set to null`);
            }
          } else {
            console.log(`Row ${idx + 2}: Invalid year in date '${joinDate}', will be set to null`);
          }
        } else {
          console.log(`Row ${idx + 2}: Invalid date format '${joinDate}', will be set to null`);
        }
      } catch (e) {
        console.log(`Row ${idx + 2}: Error parsing date '${joinDate}':`, e.message);
      }
    }
    
    // Store manager email for later lookup (after all employees are created)
    // We'll import employees first, then update manager relationships
    // Deduplicate by email (check both in CSV being imported and existing in DB)
    const existing = await query('SELECT id FROM profiles WHERE lower(email) = lower($1) AND tenant_id = $2', [email, tenantId]);
    if (existing.rows.length) {
      const errorMsg = `Row ${idx + 2}: Email ${email} already exists in database`;
      errors.push(errorMsg);
      console.log(errorMsg);
      continue;
    }
    
    // Check for duplicate employeeId in same CSV (within current import)
    const duplicateEmployeeId = records.slice(0, idx).some(r => {
      const normalized = {};
      for (const [k, v] of Object.entries(r)) {
        normalized[k.toLowerCase().trim()] = String(v || '').trim();
      }
      const otherId = normalized['employeeid'] || normalized['employee_id'] || '';
      return otherId && otherId.toLowerCase() === employeeId.toLowerCase();
    });
    if (duplicateEmployeeId) {
      const errorMsg = `Row ${idx + 2}: Duplicate employeeId "${employeeId}" found in CSV file`;
      errors.push(errorMsg);
      console.log(errorMsg);
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
      // Create employee record (manager relationship will be set later)
      await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, work_location,
          join_date, reporting_manager_id, tenant_id, must_change_password,
          onboarding_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'not_started')`,
        [userId, employeeId, deptValue || null, posValue || null, workLocation || null, normalizedJoinDate, null, tenantId]
      );
      // Create user role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, validatedRole, tenantId]
      );
      await query('COMMIT');
      imported++;
      console.log(`Row ${idx + 2}: Successfully imported ${email} (employee_id: ${employeeId})`);
      
      // Store manager email mapping for second pass
      if (managerEmail) {
        managerMappings.push({
          employeeId: employeeId,
          managerEmail: managerEmail,
          rowIndex: idx + 2
        });
      }
    } catch (err) {
      await query('ROLLBACK');
      const errorMsg = err?.message || 'Unknown error';
      errors.push(`Row ${idx + 2}: ${errorMsg}`);
      console.error(`Row ${idx + 2} error:`, errorMsg, err);
    }
  }
  
  // Second pass: Update manager relationships
  console.log(`Updating manager relationships... (${managerMappings.length} relationships to update)`);
  let managerUpdates = 0;
  for (const mapping of managerMappings) {
    try {
      // Find the manager by email
      const mgrRes = await query(
        'SELECT e.id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE lower(p.email) = lower($1) AND e.tenant_id = $2',
        [mapping.managerEmail, tenantId]
      );
      if (mgrRes.rows.length) {
        const managerId = mgrRes.rows[0].id;
        // Update employee with manager relationship
        await query(
          'UPDATE employees SET reporting_manager_id = $1 WHERE employee_id = $2 AND tenant_id = $3',
          [managerId, mapping.employeeId, tenantId]
        );
        managerUpdates++;
        console.log(`Updated manager relationship for employee ${mapping.employeeId} -> manager ${mapping.managerEmail}`);
      } else {
        console.log(`Warning: Manager with email ${mapping.managerEmail} not found for employee ${mapping.employeeId} (Row ${mapping.rowIndex})`);
      }
    } catch (err) {
      console.error(`Error updating manager relationship for employee ${mapping.employeeId}:`, err.message);
    }
  }
  console.log(`Updated ${managerUpdates} manager relationships`);
  console.log(`Import complete: ${imported} imported, ${errors.length} errors`);
  res.json({ 
    imported_count: imported, 
    failed_count: errors.length,
    imported,
    errors 
  });
});

// Delete employee (HR/CEO/Director/Admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check role - only HR/CEO/Director/Admin can delete
    const roleResult = await query(
      `SELECT role FROM user_roles
       WHERE user_id = $1
       ORDER BY CASE role
         WHEN 'admin' THEN 0
         WHEN 'ceo' THEN 1
         WHEN 'director' THEN 2
         WHEN 'hr' THEN 3
         WHEN 'manager' THEN 4
         WHEN 'employee' THEN 5
       END
       LIMIT 1`,
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify employee belongs to same tenant
    const empCheck = await query(
      'SELECT tenant_id, user_id FROM employees WHERE id = $1',
      [id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empCheck.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const userId = empCheck.rows[0].user_id;

    await query('BEGIN');

    try {
      // Delete employee record (this will cascade to onboarding_data due to FK)
      await query('DELETE FROM employees WHERE id = $1', [id]);

      // Delete user roles
      await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

      // Delete user auth
      await query('DELETE FROM user_auth WHERE user_id = $1', [userId]);

      // Delete profile (this will cascade to other related records)
      await query('DELETE FROM profiles WHERE id = $1', [userId]);

      await query('COMMIT');

      res.json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: error.message || 'Failed to delete employee' });
  }
});

// Employee assignments management
router.get('/:id/assignments', authenticateToken, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const assignments = await queryWithOrg(
      `SELECT ea.*, 
              ob.name as branch_name, 
              dept.name as department_name, 
              team.name as team_name
       FROM employee_assignments ea
       LEFT JOIN org_branches ob ON ob.id = ea.branch_id
       LEFT JOIN departments dept ON dept.id = ea.department_id
       LEFT JOIN teams team ON team.id = ea.team_id
       WHERE ea.employee_id = $1
       ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST`,
      [id],
      tenantId
    );

    res.json(assignments.rows);
  } catch (error) {
    console.error('Error fetching employee assignments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch assignments' });
  }
});

router.post('/:id/assignments', authenticateToken, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      assignmentId,
      branchId,
      departmentId,
      teamId,
      startDate,
      endDate,
      fte,
      roleTitle,
      isHome,
      metadata
    } = req.body;

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const employeeRecord = await query(
      'SELECT id, user_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (employeeRecord.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    let result;
    if (assignmentId) {
      result = await queryWithOrg(
        `UPDATE employee_assignments
         SET branch_id = $1,
             department_id = $2,
             team_id = $3,
             start_date = COALESCE($4::date, start_date),
             end_date = $5::date,
             fte = COALESCE($6, fte),
             role = COALESCE($7, role),
             is_home = COALESCE($8, is_home),
             metadata = COALESCE($9::jsonb, metadata),
             updated_at = now()
         WHERE id = $10 AND employee_id = $11
         RETURNING *`,
        [
          branchId || null,
          departmentId || null,
          teamId || null,
          startDate || null,
          endDate || null,
          fte || null,
          roleTitle || null,
          typeof isHome === 'boolean' ? isHome : null,
          metadata || null,
          assignmentId,
          id
        ],
        tenantId
      );
    } else {
      result = await queryWithOrg(
        `INSERT INTO employee_assignments (
          org_id, user_id, employee_id, branch_id, department_id, team_id,
          role, fte, start_date, end_date, is_home, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 1.0), COALESCE($9::date, now()::date), $10::date, COALESCE($11, false), COALESCE($12::jsonb, '{}'::jsonb))
        RETURNING *`,
        [
          tenantId,
          employeeRecord.rows[0].user_id,
          employeeRecord.rows[0].id,
          branchId || null,
          departmentId || null,
          teamId || null,
          roleTitle || 'Assignment',
          fte || 1,
          startDate || null,
          endDate || null,
          Boolean(isHome),
          metadata || {}
        ],
        tenantId
      );
    }

    await rebuildSegmentsForEmployee(tenantId, employeeRecord.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving assignment:', error);
    res.status(500).json({ error: error.message || 'Failed to save assignment' });
  }
});

export default router;
