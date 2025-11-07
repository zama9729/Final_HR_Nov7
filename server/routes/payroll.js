/**
 * Payroll Routes
 * 
 * Handles payroll calendar, pay runs, off-cycle runs, exports, and exceptions
 * Requires ACCOUNTANT role or CEO for read-only access
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireCapability, CAPABILITIES } from '../policy/authorize.js';
import { audit } from '../utils/auditLog.js';
import { Parser } from 'json2csv';

const router = express.Router();

// Ensure payroll tables exist
const ensurePayrollTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      pay_period_start DATE NOT NULL,
      pay_period_end DATE NOT NULL,
      pay_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'rolled_back', 'cancelled')),
      total_employees INTEGER DEFAULT 0,
      total_amount_cents BIGINT DEFAULT 0,
      created_by UUID REFERENCES profiles(id),
      processed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS payroll_run_employees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE NOT NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
      hours DECIMAL(10,2) DEFAULT 0,
      rate_cents BIGINT DEFAULT 0,
      gross_pay_cents BIGINT DEFAULT 0,
      deductions_cents BIGINT DEFAULT 0,
      net_pay_cents BIGINT DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'excluded', 'exception')),
      exception_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
    CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_run ON payroll_run_employees(payroll_run_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_employee ON payroll_run_employees(employee_id);
  `).catch(err => {
    if (!err.message.includes('already exists')) {
      console.error('Error creating payroll tables:', err);
    }
  });
};

ensurePayrollTables();

// Get payroll calendar
router.get('/calendar', authenticateToken, async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get payroll runs for calendar view
    const runs = await query(
      `SELECT 
        id,
        pay_period_start,
        pay_period_end,
        pay_date,
        status,
        total_employees,
        total_amount_cents
       FROM payroll_runs
       WHERE tenant_id = $1
       ORDER BY pay_date DESC
       LIMIT 12`,
      [tenantId]
    );

    res.json(runs.rows);
  } catch (error) {
    console.error('Error fetching payroll calendar:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payroll calendar' });
  }
});

// Get all payroll runs
router.get('/runs', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { status, limit = 50, offset = 0 } = req.query;

    let queryStr = `
      SELECT 
        pr.*,
        json_build_object(
          'id', p.id,
          'email', p.email,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as created_by_user
      FROM payroll_runs pr
      LEFT JOIN profiles p ON p.id = pr.created_by
      WHERE pr.tenant_id = $1
    `;
    const params = [tenantId];

    if (status) {
      queryStr += ` AND pr.status = $2`;
      params.push(status);
    }

    queryStr += ` ORDER BY pr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const result = await query(queryStr, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payroll runs' });
  }
});

// Get payroll run details
router.get('/runs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const runResult = await query(
      `SELECT pr.*,
        json_build_object(
          'id', p.id,
          'email', p.email,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as created_by_user
       FROM payroll_runs pr
       LEFT JOIN profiles p ON p.id = pr.created_by
       WHERE pr.id = $1`,
      [id]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    // Get employees in this run
    const employeesResult = await query(
      `SELECT 
        pre.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'user_id', e.user_id
        ) as employee,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as employee_profile
       FROM payroll_run_employees pre
       JOIN employees e ON e.id = pre.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE pre.payroll_run_id = $1
       ORDER BY p.last_name, p.first_name`,
      [id]
    );

    run.employees = employeesResult.rows;

    res.json(run);
  } catch (error) {
    console.error('Error fetching payroll run:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payroll run' });
  }
});

// Create payroll run
router.post('/runs', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const { pay_period_start, pay_period_end, pay_date } = req.body;

    if (!pay_period_start || !pay_period_end || !pay_date) {
      return res.status(400).json({ error: 'pay_period_start, pay_period_end, and pay_date are required' });
    }

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Create payroll run
    const runResult = await query(
      `INSERT INTO payroll_runs (
        tenant_id, pay_period_start, pay_period_end, pay_date,
        status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [tenantId, pay_period_start, pay_period_end, pay_date, 'draft', req.user.id]
    );

    const run = runResult.rows[0];

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'payroll_run_created',
      entityType: 'payroll_run',
      entityId: run.id,
      details: { pay_period_start, pay_period_end, pay_date },
    });

    res.status(201).json(run);
  } catch (error) {
    console.error('Error creating payroll run:', error);
    res.status(500).json({ error: error.message || 'Failed to create payroll run' });
  }
});

// Process payroll run (approve timesheets and calculate payroll)
router.post('/runs/:id/process', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const { id } = req.params;

    // Get payroll run
    const runResult = await query(
      'SELECT * FROM payroll_runs WHERE id = $1',
      [id]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    if (run.status !== 'draft') {
      return res.status(400).json({ error: 'Payroll run can only be processed from draft status' });
    }

    // Update status to processing
    await query(
      'UPDATE payroll_runs SET status = $1, processed_at = now() WHERE id = $2',
      ['processing', id]
    );

    // Get approved timesheets for this pay period
    const timesheetsResult = await query(
      `SELECT 
        t.id,
        t.employee_id,
        t.total_hours,
        e.employee_id as emp_id
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id
       WHERE t.tenant_id = $1
       AND t.status = 'approved'
       AND t.week_start_date >= $2
       AND t.week_end_date <= $3`,
      [run.tenant_id, run.pay_period_start, run.pay_period_end]
    );

    // Process each employee (simplified - would need actual rate calculation)
    let totalAmount = 0;
    let totalEmployees = 0;

    for (const ts of timesheetsResult.rows) {
      // Get employee rate (placeholder - would come from employee compensation table)
      const rateCents = 5000 * 100; // $50/hour placeholder
      const hours = parseFloat(ts.total_hours) || 0;
      const grossPayCents = Math.round(hours * rateCents);
      const deductionsCents = Math.round(grossPayCents * 0.2); // 20% placeholder
      const netPayCents = grossPayCents - deductionsCents;

      await query(
        `INSERT INTO payroll_run_employees (
          payroll_run_id, employee_id, hours, rate_cents,
          gross_pay_cents, deductions_cents, net_pay_cents, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, ts.employee_id, hours, rateCents, grossPayCents, deductionsCents, netPayCents, 'processed']
      );

      totalAmount += netPayCents;
      totalEmployees++;
    }

    // Update payroll run
    await query(
      `UPDATE payroll_runs 
       SET status = $1, total_employees = $2, total_amount_cents = $3, completed_at = now()
       WHERE id = $4`,
      ['completed', totalEmployees, totalAmount, id]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'payroll_run_processed',
      entityType: 'payroll_run',
      entityId: id,
      details: { total_employees: totalEmployees, total_amount_cents: totalAmount },
    });

    res.json({ success: true, message: 'Payroll run processed successfully' });
  } catch (error) {
    console.error('Error processing payroll run:', error);
    res.status(500).json({ error: error.message || 'Failed to process payroll run' });
  }
});

// Rollback payroll run
router.post('/runs/:id/rollback', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_ROLLBACK), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required for rollback' });
    }

    const runResult = await query(
      'SELECT * FROM payroll_runs WHERE id = $1',
      [id]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    if (run.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed payroll runs can be rolled back' });
    }

    // Update status
    await query(
      'UPDATE payroll_runs SET status = $1 WHERE id = $2',
      ['rolled_back', id]
    );

    // Delete payroll run employees (or mark as excluded)
    await query(
      'UPDATE payroll_run_employees SET status = $1 WHERE payroll_run_id = $2',
      ['excluded', id]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'payroll_run_rolled_back',
      entityType: 'payroll_run',
      entityId: id,
      reason,
      details: { reason },
    });

    res.json({ success: true, message: 'Payroll run rolled back successfully' });
  } catch (error) {
    console.error('Error rolling back payroll run:', error);
    res.status(500).json({ error: error.message || 'Failed to rollback payroll run' });
  }
});

// Export approved timesheets for payroll
router.get('/export/timesheets', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const { pay_period_start, pay_period_end } = req.query;

    if (!pay_period_start || !pay_period_end) {
      return res.status(400).json({ error: 'pay_period_start and pay_period_end are required' });
    }

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get approved timesheets
    const timesheetsResult = await query(
      `SELECT 
        e.employee_id,
        p.first_name || ' ' || p.last_name as employee_name,
        t.week_start_date,
        t.week_end_date,
        t.total_hours,
        t.status,
        t.submitted_at,
        t.reviewed_at
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE t.tenant_id = $1
       AND t.status = 'approved'
       AND t.week_start_date >= $2
       AND t.week_end_date <= $3
       ORDER BY e.employee_id, t.week_start_date`,
      [tenantId, pay_period_start, pay_period_end]
    );

    // Convert to CSV
    const parser = new Parser();
    const csv = parser.parse(timesheetsResult.rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-timesheets-${pay_period_start}-${pay_period_end}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting timesheets:', error);
    res.status(500).json({ error: error.message || 'Failed to export timesheets' });
  }
});

// Get exceptions report
router.get('/exceptions', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get timesheets with exceptions (pending, rejected, or missing)
    const exceptionsResult = await query(
      `SELECT 
        e.employee_id,
        p.first_name || ' ' || p.last_name as employee_name,
        t.week_start_date,
        t.week_end_date,
        t.status,
        t.rejection_reason,
        CASE 
          WHEN t.status = 'pending' THEN 'Pending Approval'
          WHEN t.status = 'rejected' THEN 'Rejected: ' || COALESCE(t.rejection_reason, 'No reason provided')
          ELSE 'Missing Timesheet'
        END as exception_type
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       LEFT JOIN timesheets t ON t.employee_id = e.id 
         AND t.week_start_date >= CURRENT_DATE - INTERVAL '14 days'
         AND t.week_end_date <= CURRENT_DATE
       WHERE e.tenant_id = $1
       AND e.status = 'active'
       AND (t.status IN ('pending', 'rejected') OR t.id IS NULL)
       ORDER BY e.employee_id`,
      [tenantId]
    );

    res.json(exceptionsResult.rows);
  } catch (error) {
    console.error('Error fetching exceptions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch exceptions' });
  }
});

// Get payroll totals (CEO read-only)
router.get('/totals', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_READ_TOTALS), async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get totals for last 12 months
    const totalsResult = await query(
      `SELECT 
        DATE_TRUNC('month', pay_date) as month,
        COUNT(*) as run_count,
        SUM(total_amount_cents) as total_amount_cents,
        SUM(total_employees) as total_employees
       FROM payroll_runs
       WHERE tenant_id = $1
       AND status = 'completed'
       AND pay_date >= CURRENT_DATE - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', pay_date)
       ORDER BY month DESC`,
      [tenantId]
    );

    res.json(totalsResult.rows);
  } catch (error) {
    console.error('Error fetching payroll totals:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payroll totals' });
  }
});

export default router;

