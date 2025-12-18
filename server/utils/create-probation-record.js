import { query } from '../db/pool.js';
import { createEmployeeEvent } from './employee-events.js';

/**
 * Create probation record for an employee based on active policy
 */
export async function createProbationRecordForEmployee(tenantId, employeeId, joinDate) {
  try {
    if (!joinDate) {
      console.log(`[Probation] No join date for employee ${employeeId}, skipping probation creation`);
      return null;
    }

    // Get active probation policy
    const policyResult = await query(
      `SELECT * FROM probation_policies
       WHERE tenant_id = $1 AND status = 'published' AND is_active = true
       ORDER BY published_at DESC
       LIMIT 1`,
      [tenantId]
    );

    if (policyResult.rows.length === 0) {
      console.log(`[Probation] No active policy found for tenant ${tenantId}, skipping probation creation`);
      return null;
    }

    const policy = policyResult.rows[0];

    // Check if probation record already exists
    const existingCheck = await query(
      `SELECT id FROM probations 
       WHERE employee_id = $1 AND status IN ('in_probation', 'extended')
       LIMIT 1`,
      [employeeId]
    );

    if (existingCheck.rows.length > 0) {
      console.log(`[Probation] Probation record already exists for employee ${employeeId}`);
      return existingCheck.rows[0].id;
    }

    // Calculate probation dates
    const startDate = new Date(joinDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + policy.probation_days);

    const midReviewDate = policy.requires_mid_probation_review
      ? new Date(startDate.getTime() + (policy.probation_days / 2) * 24 * 60 * 60 * 1000)
      : null;

    // Create probation record
    const probationResult = await query(
      `INSERT INTO probations (
        tenant_id, employee_id, probation_start, probation_end,
        probation_days, allowed_leave_days, status,
        is_eligible_for_perks, requires_mid_probation_review,
        mid_review_date, auto_confirm_at_end, probation_notice_days,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'in_probation', $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        tenantId,
        employeeId,
        startDate,
        endDate,
        policy.probation_days,
        policy.allowed_leave_days,
        true, // is_eligible_for_perks
        policy.requires_mid_probation_review,
        midReviewDate,
        policy.auto_confirm_at_end,
        policy.probation_notice_days,
        null, // created_by - can be set if available
      ]
    );

    const probation = probationResult.rows[0];

    // Update employee record
    await query(
      `UPDATE employees
       SET probation_status = 'in_probation',
           probation_end = $1
       WHERE id = $2`,
      [endDate, employeeId]
    );

    // Create probation start event
    try {
      await createEmployeeEvent({
        orgId: tenantId,
        employeeId,
        eventType: 'PROBATION_START',
        eventDate: startDate.toISOString().split('T')[0],
        title: 'Probation Period Started',
        description: `Probation period of ${policy.probation_days} days started`,
        metadata: {
          probationId: probation.id,
          probationDays: policy.probation_days,
          probationEnd: endDate.toISOString().split('T')[0],
          autoConfirmAtEnd: policy.auto_confirm_at_end,
        },
        sourceTable: 'probations',
        sourceId: probation.id,
      });
    } catch (eventError) {
      console.error(`[Probation] Failed to create probation start event:`, eventError);
    }

    console.log(`[Probation] Created probation record for employee ${employeeId}, ends on ${endDate.toISOString().split('T')[0]}`);
    return probation.id;
  } catch (error) {
    console.error(`[Probation] Error creating probation record for employee ${employeeId}:`, error);
    return null;
  }
}

