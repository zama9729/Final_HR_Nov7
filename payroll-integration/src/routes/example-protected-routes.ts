/**
 * Example Protected Routes for Payroll Application
 * 
 * Demonstrates how to use RBAC guards and org scoping
 * 
 * Usage:
 *   import { requirePayrollAdmin, requirePayrollEmployee, requireOrgContext } from '../middleware/rbac';
 *   import exampleRoutes from './example-protected-routes';
 *   app.use('/api', exampleRoutes);
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { 
  requirePayrollAdmin, 
  requirePayrollEmployee, 
  requireOrgContext,
  requirePayrollAdminWithOrg,
  requirePayrollEmployeeWithOrg,
  getOrgId,
  getPayrollRole
} from '../middleware/rbac';

const router = Router();
const pool = new Pool({
  connectionString: process.env.PAYROLL_DB_URL || process.env.DATABASE_URL,
});

/**
 * Admin Dashboard
 * GET /admin/dashboard
 * 
 * Requires: payroll_admin role + org context
 */
router.get('/admin/dashboard', requirePayrollAdminWithOrg, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req)!;
    
    // Get payroll runs for this org
    const runsResult = await pool.query(
      `SELECT * FROM payroll_runs 
       WHERE org_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [orgId]
    );
    
    // Get employee count for this org
    const employeesResult = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE org_id = $1`,
      [orgId]
    );
    
    res.json({
      success: true,
      data: {
        payrollRuns: runsResult.rows,
        employeeCount: parseInt(employeesResult.rows[0].count),
        orgId
      }
    });
  } catch (error: any) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard data',
      message: error.message 
    });
  }
});

/**
 * Employee Home
 * GET /employee/home
 * 
 * Requires: payroll_employee role (or higher) + org context
 */
router.get('/employee/home', requirePayrollEmployeeWithOrg, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req)!;
    const userId = (req.session as any)?.userId || (req as any)?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get user's payslips for this org
    const payslipsResult = await pool.query(
      `SELECT * FROM payslips 
       WHERE user_id = $1 AND org_id = $2
       ORDER BY pay_period_end DESC 
       LIMIT 10`,
      [userId, orgId]
    );
    
    // Get tax forms for this org
    const taxFormsResult = await pool.query(
      `SELECT * FROM tax_forms 
       WHERE user_id = $1 AND org_id = $2
       ORDER BY year DESC`,
      [userId, orgId]
    );
    
    res.json({
      success: true,
      data: {
        payslips: payslipsResult.rows,
        taxForms: taxFormsResult.rows,
        orgId
      }
    });
  } catch (error: any) {
    console.error('Error fetching employee home:', error);
    res.status(500).json({ 
      error: 'Failed to fetch employee data',
      message: error.message 
    });
  }
});

/**
 * Get Payroll Runs (Admin only)
 * GET /admin/payroll-runs
 * 
 * Requires: payroll_admin role + org context
 */
router.get('/admin/payroll-runs', requirePayrollAdminWithOrg, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req)!;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    const result = await pool.query(
      `SELECT * FROM payroll_runs 
       WHERE org_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM payroll_runs WHERE org_id = $1`,
      [orgId]
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error: any) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payroll runs',
      message: error.message 
    });
  }
});

/**
 * Get Payslips (Employee)
 * GET /employee/payslips
 * 
 * Requires: payroll_employee role (or higher) + org context
 */
router.get('/employee/payslips', requirePayrollEmployeeWithOrg, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req)!;
    const userId = (req.session as any)?.userId || (req as any)?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    const result = await pool.query(
      `SELECT * FROM payslips 
       WHERE user_id = $1 AND org_id = $2
       ORDER BY pay_period_end DESC 
       LIMIT $3 OFFSET $4`,
      [userId, orgId, limit, offset]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching payslips:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payslips',
      message: error.message 
    });
  }
});

/**
 * Create Payroll Run (Admin only)
 * POST /admin/payroll-runs
 * 
 * Requires: payroll_admin role + org context
 */
router.post('/admin/payroll-runs', requirePayrollAdminWithOrg, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req)!;
    const userId = (req.session as any)?.userId || (req as any)?.user?.id;
    const { pay_period_start, pay_period_end, pay_date } = req.body;
    
    if (!pay_period_start || !pay_period_end || !pay_date) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['pay_period_start', 'pay_period_end', 'pay_date']
      });
    }
    
    const result = await pool.query(
      `INSERT INTO payroll_runs (
        org_id, pay_period_start, pay_period_end, pay_date, 
        status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [orgId, pay_period_start, pay_period_end, pay_date, 'draft', userId]
    );
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating payroll run:', error);
    res.status(500).json({ 
      error: 'Failed to create payroll run',
      message: error.message 
    });
  }
});

export default router;


