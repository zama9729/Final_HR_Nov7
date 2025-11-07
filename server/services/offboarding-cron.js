/**
 * Offboarding Cron Jobs
 * - Auto-approve pending requests after policy.autoApproveDays
 * - Recompute F&F settlement dates
 * - Prompt HR for letter generation when ready
 */

import { query } from '../db/pool.js';
import { calculateNextMonthFifteenth, isReadyForFnFScheduling, isWithinLastWeek } from '../utils/date-helpers.js';
import { audit } from '../utils/auditLog.js';

/**
 * Auto-approve offboarding requests that exceed autoApproveDays SLA
 * Runs daily at 00:30 Asia/Kolkata
 */
export async function autoApprovePendingRequests() {
  try {
    console.log('[Offboarding Cron] Starting auto-approve check...');
    
    // Find all pending/in_review requests that exceed autoApproveDays
    const result = await query(`
      SELECT 
        or_req.id,
        or_req.org_id,
        or_req.employee_id,
        or_req.requested_at,
        or_req.status,
        or_req.policy_snapshot,
        json_agg(
          json_build_object(
            'id', oa.id,
            'role', oa.role,
            'decision', oa.decision
          )
        ) as approvals
      FROM offboarding_requests or_req
      LEFT JOIN offboarding_approvals oa ON oa.offboarding_id = or_req.id
      WHERE or_req.status IN ('pending', 'in_review')
        AND (or_req.policy_snapshot->>'autoApproveDays')::integer IS NOT NULL
        AND now() - or_req.requested_at >= 
          INTERVAL '1 day' * (or_req.policy_snapshot->>'autoApproveDays')::integer
      GROUP BY or_req.id
      HAVING COUNT(oa.id) FILTER (WHERE oa.decision = 'approved') = 0
      LIMIT 100
    `);

    for (const row of result.rows) {
      const autoApproveDays = row.policy_snapshot.autoApproveDays || 7;
      
      // Auto-approve all pending approvals
      await query(`
        UPDATE offboarding_approvals
        SET decision = 'approved',
            decided_at = now(),
            comment = 'Auto-approved due to SLA breach (' || $1 || ' days)',
            approver_id = NULL
        WHERE offboarding_id = $2 AND decision = 'pending'
      `, [autoApproveDays, row.id]);

      // Update request status
      await query(`
        UPDATE offboarding_requests
        SET status = 'auto_approved',
            updated_at = now()
        WHERE id = $1
      `, [row.id]);

      // Audit log
      await audit({
        actorId: null, // System action
        action: 'offboarding_auto_approved',
        entityType: 'offboarding_request',
        entityId: row.id,
        reason: `Auto-approved after ${autoApproveDays} days of no response`,
        details: { autoApproveDays, requestedAt: row.requested_at },
      });

      console.log(`[Offboarding Cron] Auto-approved request ${row.id}`);
    }

    console.log(`[Offboarding Cron] Processed ${result.rows.length} auto-approvals`);
  } catch (error) {
    console.error('[Offboarding Cron] Error in auto-approve:', error);
  }
}

/**
 * Recompute and set F&F settlement dates
 * Runs daily at 01:00 Asia/Kolkata
 */
export async function recomputeFnFSettlementDates() {
  try {
    console.log('[Offboarding Cron] Recomputing F&F settlement dates...');
    
    // Find requests that are approved/auto_approved but don't have fnf_pay_date set
    // and are within last week of notice period or past it
    const result = await query(`
      SELECT 
        or_req.id,
        or_req.org_id,
        or_req.employee_id,
        or_req.last_working_day,
        or_req.status,
        or_req.fnf_pay_date,
        json_agg(
          json_build_object(
            'id', oa.id,
            'role', oa.role,
            'decision', oa.decision
          )
        ) as approvals,
        ec.finance_clear,
        ec.compliance_clear,
        ec.it_clear,
        ec.assets_pending
      FROM offboarding_requests or_req
      LEFT JOIN offboarding_approvals oa ON oa.offboarding_id = or_req.id
      LEFT JOIN exit_checklists ec ON ec.offboarding_id = or_req.id
      WHERE or_req.status IN ('approved', 'auto_approved')
        AND or_req.fnf_pay_date IS NULL
      GROUP BY or_req.id, ec.finance_clear, ec.compliance_clear, ec.it_clear, ec.assets_pending
    `);

    for (const row of result.rows) {
      const approvals = row.approvals || [];
      const checklist = {
        finance_clear: row.finance_clear || false,
        compliance_clear: row.compliance_clear || false,
        it_clear: row.it_clear || false,
        assets_pending: row.assets_pending || 0,
      };

      // Check if ready for F&F scheduling
      if (isReadyForFnFScheduling(approvals, checklist)) {
        const lastWorkingDay = new Date(row.last_working_day);
        const lastWeekStart = new Date(lastWorkingDay);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        
        const now = new Date();
        
        // Set F&F date if within last week or past last working day
        if (now >= lastWeekStart) {
          const fnfPayDate = calculateNextMonthFifteenth(lastWorkingDay);
          
          await query(`
            UPDATE offboarding_requests
            SET fnf_pay_date = $1,
                updated_at = now()
            WHERE id = $2
          `, [fnfPayDate, row.id]);

          // Audit log
          await audit({
            actorId: null, // System action
            action: 'fnf_date_scheduled',
            entityType: 'offboarding_request',
            entityId: row.id,
            details: { fnfPayDate, lastWorkingDay: row.last_working_day },
          });

          console.log(`[Offboarding Cron] Set F&F date for request ${row.id}: ${fnfPayDate}`);
        }
      }
    }

    console.log(`[Offboarding Cron] Processed ${result.rows.length} F&F date calculations`);
  } catch (error) {
    console.error('[Offboarding Cron] Error in F&F date calculation:', error);
  }
}

/**
 * Schedule all offboarding cron jobs
 */
export async function scheduleOffboardingJobs() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('node-cron not installed, skipping offboarding scheduler');
    return;
  }

  // Auto-approve: Daily at 00:30 Asia/Kolkata (18:30 UTC previous day)
  cron.schedule('30 18 * * *', async () => {
    await autoApprovePendingRequests();
  });

  // F&F date calculation: Daily at 01:00 Asia/Kolkata (19:30 UTC previous day)
  cron.schedule('30 19 * * *', async () => {
    await recomputeFnFSettlementDates();
  });

  console.log('✅ Offboarding cron jobs scheduled');
}

export default {
  autoApprovePendingRequests,
  recomputeFnFSettlementDates,
  scheduleOffboardingJobs,
};

