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
import { calculateMonthlyTDS, getPayrollComponents } from '../services/taxEngine.js';

const getFinancialYearForDate = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    const year = now.getFullYear();
    const startYear = now.getMonth() >= 3 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
  }
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

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

    CREATE TABLE IF NOT EXISTS payroll_run_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE NOT NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
      component_name TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      is_taxable BOOLEAN NOT NULL DEFAULT true,
      created_by UUID REFERENCES profiles(id),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
    CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_run ON payroll_run_employees(payroll_run_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_employee ON payroll_run_employees(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_run ON payroll_run_adjustments(payroll_run_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee ON payroll_run_adjustments(employee_id);
  `).catch(err => {
    if (!err.message.includes('already exists')) {
      console.error('Error creating payroll tables:', err);
    }
  });
};

ensurePayrollTables();

const getTenantIdForUser = async (userId) => {
  const tenantResult = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId]
  );
  return tenantResult.rows[0]?.tenant_id || null;
};

/**
 * Recalculates employee pay after adjustments are added/edited/deleted
 * Updates payroll_run_employees.net_pay_cents and payroll_runs.total_amount_cents
 * 
 * Formula: New Net Pay = (Base Gross - Base Deductions) + Sum(Adjustments)
 * 
 * @param {string} runId - Payroll run ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<void>}
 */
const recalculateEmployeePay = async (runId, employeeId) => {
  try {
    // Step 1: Fetch current payroll_run_employees record
    const employeeResult = await query(
      `SELECT 
        gross_pay_cents,
        deductions_cents,
        net_pay_cents,
        metadata
       FROM payroll_run_employees
       WHERE payroll_run_id = $1 AND employee_id = $2`,
      [runId, employeeId]
    );

    if (employeeResult.rows.length === 0) {
      console.warn(`No payroll_run_employees record found for run ${runId}, employee ${employeeId}`);
      return;
    }

    const employeeRecord = employeeResult.rows[0];
    const baseGrossCents = Number(employeeRecord.gross_pay_cents || 0);
    const baseDeductionsCents = Number(employeeRecord.deductions_cents || 0);

    // Step 2: Fetch ALL adjustments for this employee and run
    const adjustmentsResult = await query(
      `SELECT amount, is_taxable
       FROM payroll_run_adjustments
       WHERE payroll_run_id = $1 AND employee_id = $2`,
      [runId, employeeId]
    );

    // Step 3: Calculate sum of adjustments
    // Adjustments are stored as NUMERIC(12,2) in the database (e.g., 1000.50)
    // We need to convert to cents (multiply by 100)
    // Note: The stored gross_pay_cents may or may not include adjustments depending on when they were added
    // For recalculation, we treat gross_pay_cents as the base and add all adjustments
    let taxableAdjustmentCents = 0;
    let nonTaxableAdjustmentCents = 0;

    adjustmentsResult.rows.forEach((adj) => {
      const adjCents = Math.round(Number(adj.amount || 0) * 100);
      if (adj.is_taxable) {
        // Taxable adjustments are added to gross pay before deductions
        taxableAdjustmentCents += adjCents;
      } else {
        // Non-taxable adjustments are added directly to net pay after deductions
        nonTaxableAdjustmentCents += adjCents;
      }
    });

    // Step 4: Calculate new net pay
    // Formula: New Net Pay = (Base Gross + Taxable Adjustments - Base Deductions) + Non-Taxable Adjustments
    // This ensures that:
    // - Taxable adjustments increase gross (and thus net after deductions)
    // - Non-taxable adjustments increase net directly
    const adjustedGrossCents = baseGrossCents + taxableAdjustmentCents;
    const newNetPayCents = adjustedGrossCents - baseDeductionsCents + nonTaxableAdjustmentCents;

    // Ensure net pay is not negative (safety check)
    const finalNetPayCents = Math.max(0, newNetPayCents);

    // Step 5: Update payroll_run_employees table
    await query(
      `UPDATE payroll_run_employees
       SET net_pay_cents = $1,
           updated_at = now()
       WHERE payroll_run_id = $2 AND employee_id = $3`,
      [finalNetPayCents, runId, employeeId]
    );

    // Step 6: Update payroll_runs.total_amount_cents by summing all employees
    const totalResult = await query(
      `SELECT COALESCE(SUM(net_pay_cents), 0) as total_cents
       FROM payroll_run_employees
       WHERE payroll_run_id = $1 AND status != 'excluded'`,
      [runId]
    );

    const newTotalAmountCents = Number(totalResult.rows[0]?.total_cents || 0);

    await query(
      `UPDATE payroll_runs
       SET total_amount_cents = $1,
           updated_at = now()
       WHERE id = $2`,
      [newTotalAmountCents, runId]
    );

    console.log(
      `Recalculated pay for employee ${employeeId} in run ${runId}: ` +
      `Base Net: ${baseGrossCents - baseDeductionsCents}, ` +
      `Taxable Adjustments: ${taxableAdjustmentCents}, ` +
      `Non-Taxable Adjustments: ${nonTaxableAdjustmentCents}, ` +
      `New Net: ${finalNetPayCents}, ` +
      `Run Total: ${newTotalAmountCents}`
    );
  } catch (error) {
    console.error(`Error recalculating pay for employee ${employeeId} in run ${runId}:`, error);
    throw error;
  }
};

// Get payroll calendar
router.get('/calendar', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);

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
    const tenantId = await getTenantIdForUser(req.user.id);

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

router.get('/runs/:id/adjustments', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;

    const runResult = await query(
      'SELECT id FROM payroll_runs WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const adjustments = await query(
      `SELECT pra.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id
        ) AS employee
       FROM payroll_run_adjustments pra
       JOIN employees e ON e.id = pra.employee_id
       WHERE pra.payroll_run_id = $1
         AND pra.tenant_id = $2
       ORDER BY pra.created_at DESC`,
      [id, tenantId]
    );

    res.json(adjustments.rows);
  } catch (error) {
    console.error('Error fetching payroll adjustments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payroll adjustments' });
  }
});

router.post('/runs/:id/adjustments', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    const { employee_id, component_name, amount, is_taxable = true, notes } = req.body;

    if (!employee_id || !component_name || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'employee_id, component_name and amount are required' });
    }

    const runResult = await query(
      'SELECT id, status FROM payroll_runs WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    if (runResult.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Adjustments can only be added when payroll run is in draft status' });
    }

    const employeeResult = await query(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employee_id, tenantId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found for this tenant' });
    }

    const adjustmentResult = await query(
      `INSERT INTO payroll_run_adjustments (
        tenant_id, payroll_run_id, employee_id, component_name, amount, is_taxable, created_by, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [tenantId, id, employee_id, component_name, amount, is_taxable, req.user.id, notes || null]
    );

    await audit({
      actorId: req.user.id,
      action: 'payroll_adjustment_created',
      entityType: 'payroll_run_adjustment',
      entityId: adjustmentResult.rows[0].id,
      details: { payroll_run_id: id, employee_id, component_name, amount, is_taxable },
    });

    // Immediately recalculate employee pay after adjustment is added
    await recalculateEmployeePay(id, employee_id);

    res.status(201).json(adjustmentResult.rows[0]);
  } catch (error) {
    console.error('Error creating payroll adjustment:', error);
    res.status(500).json({ error: error.message || 'Failed to create payroll adjustment' });
  }
});

router.put('/adjustments/:adjustmentId', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { adjustmentId } = req.params;
    const { component_name, amount, is_taxable, notes } = req.body;

    const adjustmentResult = await query(
      `SELECT pra.*, pr.status
       FROM payroll_run_adjustments pra
       JOIN payroll_runs pr ON pr.id = pra.payroll_run_id
       WHERE pra.id = $1 AND pra.tenant_id = $2`,
      [adjustmentId, tenantId]
    );

    if (adjustmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    if (adjustmentResult.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Adjustments can only be edited when payroll run is in draft status' });
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (component_name !== undefined) {
      fields.push(`component_name = $${index++}`);
      values.push(component_name);
    }

    if (amount !== undefined) {
      fields.push(`amount = $${index++}`);
      values.push(amount);
    }

    if (is_taxable !== undefined) {
      fields.push(`is_taxable = $${index++}`);
      values.push(is_taxable);
    }

    if (notes !== undefined) {
      fields.push(`notes = $${index++}`);
      values.push(notes);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update' });
    }

    values.push(adjustmentId);

    const updatedResult = await query(
      `UPDATE payroll_run_adjustments
       SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${index}
       RETURNING *`,
      values
    );

    await audit({
      actorId: req.user.id,
      action: 'payroll_adjustment_updated',
      entityType: 'payroll_run_adjustment',
      entityId: adjustmentId,
      details: { fields: Object.keys(req.body || {}) },
    });

    // Immediately recalculate employee pay after adjustment is updated
    const adjustment = adjustmentResult.rows[0];
    await recalculateEmployeePay(adjustment.payroll_run_id, adjustment.employee_id);

    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Error updating payroll adjustment:', error);
    res.status(500).json({ error: error.message || 'Failed to update payroll adjustment' });
  }
});

router.delete('/adjustments/:adjustmentId', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { adjustmentId } = req.params;

    const adjustmentResult = await query(
      `SELECT pra.id, pra.payroll_run_id, pr.status
       FROM payroll_run_adjustments pra
       JOIN payroll_runs pr ON pr.id = pra.payroll_run_id
       WHERE pra.id = $1 AND pra.tenant_id = $2`,
      [adjustmentId, tenantId]
    );

    if (adjustmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    if (adjustmentResult.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Adjustments can only be deleted when payroll run is in draft status' });
    }

    const adjustment = adjustmentResult.rows[0];
    const payrollRunId = adjustment.payroll_run_id;
    const employeeId = adjustment.employee_id;

    await audit({
      actorId: req.user.id,
      action: 'payroll_adjustment_deleted',
      entityType: 'payroll_run_adjustment',
      entityId: adjustmentId,
      details: { payroll_run_id: payrollRunId },
    });

    // Delete the adjustment
    await query(
      'DELETE FROM payroll_run_adjustments WHERE id = $1',
      [adjustmentId]
    );

    // Immediately recalculate employee pay after adjustment is deleted
    await recalculateEmployeePay(payrollRunId, employeeId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting payroll adjustment:', error);
    res.status(500).json({ error: error.message || 'Failed to delete payroll adjustment' });
  }
});

// Create payroll run
router.post('/runs', authenticateToken, requireCapability(CAPABILITIES.PAYROLL_RUN), async (req, res) => {
  try {
    const { pay_period_start, pay_period_end, pay_date, run_type = 'regular' } = req.body;

    if (!pay_period_start || !pay_period_end || !pay_date) {
      return res.status(400).json({ error: 'pay_period_start, pay_period_end, and pay_date are required' });
    }

    // Validate run_type
    if (run_type && !['regular', 'off_cycle', 'partial_payment'].includes(run_type)) {
      return res.status(400).json({ error: 'run_type must be one of "regular", "off_cycle", or "partial_payment"' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Create payroll run
    const runResult = await query(
      `INSERT INTO payroll_runs (
        tenant_id, pay_period_start, pay_period_end, pay_date,
        status, run_type, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [tenantId, pay_period_start, pay_period_end, pay_date, 'draft', run_type, req.user.id]
    );

    const run = runResult.rows[0];

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'payroll_run_created',
      entityType: 'payroll_run',
      entityId: run.id,
      details: { pay_period_start, pay_period_end, pay_date, run_type },
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

    const adjustmentsResult = await query(
      `SELECT employee_id, amount, is_taxable
       FROM payroll_run_adjustments
       WHERE payroll_run_id = $1 AND tenant_id = $2`,
      [id, run.tenant_id]
    );

    const adjustmentsByEmployee = adjustmentsResult.rows.reduce((acc, adjustment) => {
      if (!acc[adjustment.employee_id]) {
        acc[adjustment.employee_id] = [];
      }
      acc[adjustment.employee_id].push(adjustment);
      return acc;
    }, {});

    // Step A: Fetch all completed partial_payment runs within the same pay period
    // Only for regular runs - partial_payment runs are interim payouts deducted later
    const alreadyPaidByEmployee = new Map();
    if (run.run_type === 'regular') {
      const previousRunsResult = await query(
        `SELECT 
          pre.employee_id,
          SUM(pre.net_pay_cents) as total_already_paid_cents
         FROM payroll_runs pr
         JOIN payroll_run_employees pre ON pre.payroll_run_id = pr.id
         WHERE pr.tenant_id = $1
           AND pr.id != $2
           AND pr.run_type = 'partial_payment'
           AND pr.status = 'completed'
           AND pr.pay_period_start >= $3
           AND pr.pay_period_end <= $4
         GROUP BY pre.employee_id`,
        [run.tenant_id, id, run.pay_period_start, run.pay_period_end]
      );

      // Step B: Aggregate total net_pay_cents paid per employee
      previousRunsResult.rows.forEach((row) => {
        alreadyPaidByEmployee.set(row.employee_id, Number(row.total_already_paid_cents || 0));
      });
    }

    const isOffCycleRun = run.run_type === 'off_cycle';
    const isPartialPayment = run.run_type === 'partial_payment';

    // Process each employee (simplified - would need actual rate calculation)
    let totalAmount = 0;
    let totalEmployees = 0;

    for (const ts of timesheetsResult.rows) {
      // For off-cycle or partial runs, skip base component calculations entirely.
      // Start with zero gross so only adjustments contribute to payouts.
      const rateCents = (isOffCycleRun || isPartialPayment) ? 0 : 5000 * 100; // $50/hour placeholder
      const hours = (isOffCycleRun || isPartialPayment) ? 0 : (parseFloat(ts.total_hours) || 0);
      const baseGrossPayCents = (isOffCycleRun || isPartialPayment) ? 0 : Math.round(hours * rateCents);

      const adjustments = adjustmentsByEmployee[ts.employee_id] || [];
      let taxableAdjustmentCents = 0;
      let nonTaxableAdjustmentCents = 0;
      for (const adj of adjustments) {
        const adjCents = Math.round(Number(adj.amount || 0) * 100);
        if (adj.is_taxable) {
          taxableAdjustmentCents += adjCents;
        } else {
          nonTaxableAdjustmentCents += adjCents;
        }
      }

      const grossPayCents = (isOffCycleRun || isPartialPayment)
        ? taxableAdjustmentCents // only adjustments contribute to income
        : baseGrossPayCents + taxableAdjustmentCents;

      // Standard components are skipped for off-cycle and partial payment runs
      let pfCents = 0;
      let tdsCents = 0;
      let otherDeductionsCents = 0;

      if (!isOffCycleRun && !isPartialPayment) {
        const components = await getPayrollComponents(ts.employee_id, run.tenant_id);

        // Find component with name containing "Basic" (case-insensitive)
        const basicComponent = components.find(c => c.name && c.name.toLowerCase().includes('basic'));

        const basicSalary = basicComponent ? Number(basicComponent.amount || 0) : 0;
        // Apply pf rule to basic salary
        // If Basic <= 15000, PF = 12% of Basic
        // If Basic > 15000,  PF = 12% of 15000
        const pfWageCeiling = 15000;
        const pfBasis = (basicSalary <= pfWageCeiling) ? basicSalary : pfWageCeiling;
        const pfAmount = pfBasis * 0.12;

        pfCents = Math.round(pfAmount * 100);

        // NOTE: Reimbursements are now processed separately via reimbursement_runs
        // They are no longer included in payroll calculations

        try {
          const financialYear = getFinancialYearForDate(run.pay_date);
          const tdsResult = await calculateMonthlyTDS(ts.employee_id, run.tenant_id, financialYear);
          tdsCents = Math.round(tdsResult.monthlyTds * 100);
        } catch (tdsError) {
          console.warn('Failed to calculate TDS for employee', ts.employee_id, tdsError);
        }

        otherDeductionsCents = Math.round(grossPayCents * 0.1); // placeholder for other deductions
      }

      const totalDeductionsCents = tdsCents + pfCents + otherDeductionsCents;

      // Step C: Calculate base net pay
      // NOTE: Reimbursements are no longer included in payroll net pay calculation
      let baseNetPayCents = grossPayCents - totalDeductionsCents + nonTaxableAdjustmentCents;

      // Step C: For regular runs, deduct already paid amount from previous partial_payment runs
      const previousPaidCents = alreadyPaidByEmployee.get(ts.employee_id) || 0;
      let finalNetPayCents = baseNetPayCents;

      if (run.run_type === 'regular' && previousPaidCents > 0) {
        // Deduct the already paid amount
        finalNetPayCents = baseNetPayCents - previousPaidCents;

        // Safety: Handle negative net pay gracefully
        if (finalNetPayCents < 0) {
          console.warn(
            `Employee ${ts.employee_id} has negative net pay after deduction. ` +
            `Base: ${baseNetPayCents}, Already Paid: ${previousPaidCents}, Final: ${finalNetPayCents}. ` +
            `Setting to 0 and logging warning.`
          );
          // Option 1: Set to 0 (current implementation)
          finalNetPayCents = 0;
          // Option 2: Could also carry forward negative amount as a deduction in next period
          // For now, we'll set to 0 as per requirement
        }
      }

      // Prepare metadata with already_paid_cents for payslip display
      const metadata = {
        tds_cents: tdsCents,
        pf_cents: pfCents,
        non_taxable_adjustments_cents: nonTaxableAdjustmentCents,
        already_paid_cents: previousPaidCents,
        interim_payment_cents: previousPaidCents,
      };

      await query(
        `INSERT INTO payroll_run_employees (
          payroll_run_id, employee_id, hours, rate_cents,
          gross_pay_cents, deductions_cents, net_pay_cents, status,
          already_paid_cents, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          ts.employee_id,
          hours,
          rateCents,
          grossPayCents,
          totalDeductionsCents,
          finalNetPayCents,
          'processed',
          previousPaidCents,
          JSON.stringify(metadata),
        ]
      );

      // NOTE: Reimbursements are no longer processed in payroll runs
      // They are handled separately via reimbursement_runs

      totalAmount += finalNetPayCents;
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

    const tenantId = await getTenantIdForUser(req.user.id);

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
    const tenantId = await getTenantIdForUser(req.user.id);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get timesheets with exceptions (pending, rejected, or missing)
    // NOTE: Payroll exceptions are only relevant for active employees (business rule)
    // This is an explicit filter for payroll processing, not a general employee filter
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
       AND e.status = 'active'  -- Explicit filter: Payroll exceptions only for active employees
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
    const tenantId = await getTenantIdForUser(req.user.id);

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

