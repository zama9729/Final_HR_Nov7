import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { createEmployeeEvent } from '../utils/employee-events.js';

const router = express.Router();

// Helper to get tenant ID
async function getTenantId(userId) {
  const result = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.tenant_id || null;
}

/**
 * POST /api/probation/backfill
 * Backfill: Confirm all employees who have exceeded their probation period
 * Only accessible to HR and CEO
 */
router.post('/backfill', authenticateToken, setTenantContext, requireRole('hr', 'ceo'), async (req, res) => {
  try {
    // Use tenant_id from middleware (setTenantContext) or fallback to getTenantId
    const tenantId = req.orgId || req.tenant_id || await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    console.log(`[Probation Backfill] Using tenant ID: ${tenantId}`);

    console.log(`[Probation Backfill] Starting backfill for tenant ${tenantId}`);

    // Get active probation policy
    const policyResult = await query(
      `SELECT * FROM probation_policies
       WHERE tenant_id = $1 AND status = 'published' AND is_active = true
       ORDER BY published_at DESC
       LIMIT 1`,
      [tenantId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'No active probation policy found. Please create and publish a policy first.' 
      });
    }

    const policy = policyResult.rows[0];
    const probationDays = policy.probation_days;

    // Find employees who:
    // 1. Have a join_date
    // 2. Are active (not terminated/on hold/resigned)
    // 3. Have been with the company longer than probation period
    // 4. Don't have a completed probation record OR have status != 'confirmed'
    
    // First, let's get all employees with join_date to debug
    const debugResult = await query(
      `SELECT COUNT(*) as total, 
              COUNT(CASE WHEN status NOT IN ('terminated', 'on_hold', 'resigned') THEN 1 END) as active,
              COUNT(CASE WHEN (join_date + INTERVAL '1 day' * $2) < CURRENT_DATE THEN 1 END) as past_probation
       FROM employees 
       WHERE tenant_id = $1 AND join_date IS NOT NULL`,
      [tenantId, probationDays]
    );
    console.log(`[Probation Backfill] Debug stats:`, debugResult.rows[0]);

    // Simplified query: Find employees who:
    // 1. Have join_date
    // 2. Are not terminated/on_hold/resigned
    // 3. Have been with company longer than probation period
    // 4. Either don't have probation record, or probation is not completed, or employee is not confirmed
    const employeesResult = await query(
      `SELECT 
         e.id as employee_id,
         e.user_id,
         e.join_date,
         e.status as employee_status,
         e.probation_status,
         p.id as probation_id,
         p.status as probation_status_record,
         p.probation_end,
         p.completed_at
       FROM employees e
       LEFT JOIN probations p ON p.employee_id = e.id
       WHERE e.tenant_id = $1
         AND e.join_date IS NOT NULL
         AND COALESCE(e.status, 'active') NOT IN ('terminated', 'on_hold', 'resigned')
         AND (e.join_date + INTERVAL '1 day' * $2) < CURRENT_DATE
         AND (
           -- No probation record exists
           p.id IS NULL
           -- OR probation record exists but status is not 'completed'
           OR (p.status IS DISTINCT FROM 'completed')
           -- OR probation is completed but employee status is not 'confirmed'
           OR (p.status = 'completed' AND COALESCE(e.status, '') != 'confirmed' AND COALESCE(e.probation_status, '') != 'completed')
         )
       ORDER BY e.join_date ASC`,
      [tenantId, probationDays]
    );

    const employees = employeesResult.rows;
    console.log(`[Probation Backfill] Found ${employees.length} employees to process`);
    
    // Log sample employees for debugging
    if (employees.length > 0) {
      console.log(`[Probation Backfill] Sample employees:`, employees.slice(0, 3).map(e => ({
        id: e.employee_id,
        join_date: e.join_date,
        status: e.employee_status,
        probation_status: e.probation_status,
        has_probation_record: !!e.probation_id,
        probation_record_status: e.probation_status_record
      })));
    } else {
      // Check why no employees found
      const allEmployeesCheck = await query(
        `SELECT COUNT(*) as count FROM employees 
         WHERE tenant_id = $1 AND join_date IS NOT NULL 
           AND status NOT IN ('terminated', 'on_hold', 'resigned')`,
        [tenantId]
      );
      console.log(`[Probation Backfill] Total active employees with join_date:`, allEmployeesCheck.rows[0].count);
      
      const pastProbationCheck = await query(
        `SELECT COUNT(*) as count FROM employees 
         WHERE tenant_id = $1 AND join_date IS NOT NULL 
           AND status NOT IN ('terminated', 'on_hold', 'resigned')
           AND (join_date + INTERVAL '1 day' * $2) < CURRENT_DATE`,
        [tenantId, probationDays]
      );
      console.log(`[Probation Backfill] Employees past probation period:`, pastProbationCheck.rows[0].count);
    }

    let processed = 0;
    let skipped = 0;
    const errors = [];

    for (const emp of employees) {
      try {
        const joinDate = new Date(emp.join_date);
        const probationEndDate = new Date(joinDate);
        probationEndDate.setDate(probationEndDate.getDate() + probationDays);

        // Skip if probation end date is in the future (shouldn't happen, but safety check)
        if (probationEndDate > new Date()) {
          console.log(`[Probation Backfill] Skipping ${emp.employee_id}: Probation not ended yet`);
          skipped++;
          continue;
        }

        // Determine confirmation date based on policy rule
        let confirmationDate = new Date(probationEndDate);
        if (policy.confirmation_effective_rule === 'next_working_day') {
          // Get next working day
          confirmationDate.setDate(confirmationDate.getDate() + 1);
          while (confirmationDate.getDay() === 0 || confirmationDate.getDay() === 6) {
            confirmationDate.setDate(confirmationDate.getDate() + 1);
          }
        }

        // Create or update probation record
        if (emp.probation_id) {
          // Update existing probation record
          await query(
            `UPDATE probations 
             SET status = 'completed',
                 completed_at = $1,
                 updated_at = now()
             WHERE id = $2`,
            [confirmationDate, emp.probation_id]
          );
        } else {
          // Create new probation record
          const probationResult = await query(
            `INSERT INTO probations (
              tenant_id, employee_id, probation_start, probation_end,
              probation_days, allowed_leave_days, status,
              is_eligible_for_perks, requires_mid_probation_review,
              auto_confirm_at_end, probation_notice_days, completed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10, $11)
            RETURNING *`,
            [
              tenantId,
              emp.employee_id,
              joinDate,
              probationEndDate,
              probationDays,
              policy.allowed_leave_days,
              true, // is_eligible_for_perks
              policy.requires_mid_probation_review,
              policy.auto_confirm_at_end,
              policy.probation_notice_days,
              confirmationDate,
            ]
          );
          emp.probation_id = probationResult.rows[0].id;
        }

        // Update employee status
        await query(
          `UPDATE employees 
           SET status = 'confirmed',
               probation_status = 'completed',
               updated_at = now()
           WHERE id = $1`,
          [emp.employee_id]
        );

        // Create probation completion event if it doesn't exist
        const existingEvent = await query(
          `SELECT id FROM employee_events
           WHERE org_id = $1 AND employee_id = $2 
             AND event_type = 'PROBATION_END'
           LIMIT 1`,
          [tenantId, emp.employee_id]
        );

        if (existingEvent.rows.length === 0) {
          try {
            await createEmployeeEvent({
              orgId: tenantId,
              employeeId: emp.employee_id,
              eventType: 'PROBATION_END',
              eventDate: confirmationDate.toISOString().split('T')[0],
              title: 'Probation Completed',
              description: `Probation period of ${probationDays} days completed and confirmed`,
              metadata: {
                probationId: emp.probation_id,
                probationStart: joinDate.toISOString().split('T')[0],
                probationEnd: probationEndDate.toISOString().split('T')[0],
                confirmationDate: confirmationDate.toISOString().split('T')[0],
                autoConfirmed: true,
                backfilled: true,
              },
              sourceTable: 'probations',
              sourceId: emp.probation_id,
            });
          } catch (eventError) {
            console.error(`[Probation Backfill] Failed to create event for ${emp.employee_id}:`, eventError);
          }
        }

        processed++;
        console.log(`[Probation Backfill] Confirmed employee ${emp.employee_id} (joined ${joinDate.toISOString().split('T')[0]})`);
      } catch (error) {
        console.error(`[Probation Backfill] Error processing employee ${emp.employee_id}:`, error);
        errors.push({ employee_id: emp.employee_id, error: error.message });
        skipped++;
      }
    }

    console.log(`[Probation Backfill] Completed: ${processed} processed, ${skipped} skipped`);

    res.json({
      success: true,
      processed,
      skipped,
      total: employees.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Probation Backfill] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to backfill probation confirmations' });
  }
});

export default router;

