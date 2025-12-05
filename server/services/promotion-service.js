import { query, queryWithOrg } from '../db/pool.js';

// Role precedence used across the app
const ROLE_RANK = {
  admin: 5,
  ceo: 4,
  director: 3,
  hr: 2,
  manager: 1,
  employee: 0,
};

function rankRole(role) {
  return ROLE_RANK[role] ?? -1;
}

// Map a designation/title to an application role (for permissions)
function mapDesignationToAppRole(designation = '', currentRole = 'employee') {
  const d = (designation || '').toLowerCase();
  const currentRank = rankRole(currentRole);

  // Heuristic mapping – only ever promote upwards, never demote here
  if (d.includes('ceo')) {
    return currentRank >= rankRole('ceo') ? currentRole : 'ceo';
  }
  if (d.includes('director') || d.includes('head') || d.includes('vp')) {
    return currentRank >= rankRole('director') ? currentRole : 'director';
  }
  if (d.includes('hr')) {
    return currentRank >= rankRole('hr') ? currentRole : 'hr';
  }
  if (d.includes('manager') || d.includes('lead')) {
    return currentRank >= rankRole('manager') ? currentRole : 'manager';
  }

  // Default to employee, but don't downgrade
  return currentRole;
}

/**
 * Core promotion application logic.
 * Applies designation/grade/department/CTC changes and, when appropriate,
 * upgrades the employee's app role (user_roles) in a single transaction.
 *
 * Idempotent with respect to the promotions.applied flag – callers should
 * ensure they only pass rows where applied = false.
 */
export async function applyPromotion(promotion, tenantId) {
  // Wrap everything in a transaction for safety
  await query('BEGIN');
  try {
    // Lock promotion row to avoid concurrent application
    const promoRes = await queryWithOrg(
      `SELECT * FROM promotions WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [promotion.id, tenantId],
      tenantId
    );
    if (promoRes.rows.length === 0) {
      throw new Error('Promotion not found for application');
    }
    const promoRow = promoRes.rows[0];
    if (promoRow.applied) {
      // Already applied – idempotent no-op
      await query('COMMIT');
      return;
    }

    // Fetch employee & current highest role
    const empRes = await queryWithOrg(
      `SELECT e.id, e.user_id, e.tenant_id, e.ctc, e.position, e.department
       FROM employees e
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [promoRow.employee_id, tenantId],
      tenantId
    );
    if (empRes.rows.length === 0) {
      throw new Error('Employee not found for promotion');
    }
    const employee = empRes.rows[0];

    const rolesRes = await query(
      `SELECT role FROM user_roles WHERE user_id = $1 AND tenant_id = $2`,
      [employee.user_id, tenantId]
    );
    const currentRoles = rolesRes.rows.map((r) => r.role);
    const currentPrimaryRole =
      currentRoles.sort((a, b) => rankRole(b) - rankRole(a))[0] || 'employee';

    // Build employee update
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (promoRow.new_designation) {
      updateFields.push(`position = $${paramIndex++}`);
      values.push(promoRow.new_designation);
      // Keep designation column in sync when present
      updateFields.push(`designation = $${paramIndex++}`);
      values.push(promoRow.new_designation);
    }

    if (promoRow.new_grade) {
      updateFields.push(`grade = $${paramIndex++}`);
      values.push(promoRow.new_grade);
    }

    if (promoRow.new_department_id) {
      // copy department name for quick lookup
      const deptResult = await queryWithOrg(
        'SELECT name FROM org_branches WHERE id = $1',
        [promoRow.new_department_id],
        tenantId
      );
      if (deptResult.rows.length > 0) {
        updateFields.push(`department = $${paramIndex++}`);
        values.push(deptResult.rows[0].name);
      }
    }

    // Update CTC if provided
    if (promoRow.new_ctc !== null && promoRow.new_ctc !== undefined) {
      updateFields.push(`ctc = $${paramIndex++}`);
      values.push(promoRow.new_ctc);
    }

    if (updateFields.length > 0) {
      values.push(promoRow.employee_id, tenantId);
      await queryWithOrg(
        `UPDATE employees 
         SET ${updateFields.join(', ')}, updated_at = now()
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}`,
        values,
        tenantId
      );
    }

    // Update user_roles (permissions) if designation implies a higher app role
    const targetRole = mapDesignationToAppRole(
      promoRow.new_designation,
      currentPrimaryRole
    );
    if (targetRole && targetRole !== currentPrimaryRole) {
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role) DO NOTHING`,
        [employee.user_id, targetRole, tenantId]
      );
    }

    // Create HIKE event if CTC changed
    if (
      promoRow.new_ctc !== null &&
      promoRow.new_ctc !== undefined &&
      promoRow.old_ctc !== null &&
      promoRow.old_ctc !== undefined &&
      promoRow.new_ctc !== promoRow.old_ctc
    ) {
      try {
        const { createHikeEvent } = await import('../utils/employee-events.js');
        await createHikeEvent(tenantId, promoRow.employee_id, {
          oldCTC: promoRow.old_ctc,
          newCTC: promoRow.new_ctc,
          effectiveDate: promoRow.effective_date,
          sourceTable: 'promotions',
          sourceId: promoRow.id,
        });
      } catch (eventError) {
        console.error('[PromotionService] Error creating hike event:', eventError);
        // Do not fail promotion application if event creation fails
      }
    }

    // Mark promotion as applied (idempotency guard)
    await queryWithOrg(
      `UPDATE promotions 
       SET applied = true, applied_at = now()
       WHERE id = $1 AND org_id = $2`,
      [promoRow.id, tenantId],
      tenantId
    );

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    console.error('[PromotionService] Error applying promotion:', error);
    throw error;
  }
}


