import cron from 'node-cron';
import { query, queryWithOrg } from '../db/pool.js';

/**
 * Apply approved promotions that have reached their effective date
 */
async function applyPendingPromotions() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find all approved promotions that should be applied today
    const promotions = await query(`
      SELECT p.*, e.tenant_id
      FROM promotions p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.status = 'APPROVED'
        AND p.applied = false
        AND p.effective_date <= $1
      ORDER BY p.effective_date ASC
    `, [today]);
    
    console.log(`[Promotion Cron] Found ${promotions.rows.length} promotions to apply`);
    
    for (const promotion of promotions.rows) {
      try {
        await applyPromotion(promotion, promotion.tenant_id);
        console.log(`[Promotion Cron] Applied promotion ${promotion.id} for employee ${promotion.employee_id}`);
      } catch (error) {
        console.error(`[Promotion Cron] Error applying promotion ${promotion.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Promotion Cron] Error in applyPendingPromotions:', error);
  }
}

/**
 * Apply a promotion to employee profile
 */
async function applyPromotion(promotion, tenantId) {
  try {
    // Update employee profile
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    if (promotion.new_designation) {
      updateFields.push(`position = $${paramIndex++}`);
      values.push(promotion.new_designation);
      updateFields.push(`designation = $${paramIndex++}`);
      values.push(promotion.new_designation);
    }
    
    if (promotion.new_grade) {
      updateFields.push(`grade = $${paramIndex++}`);
      values.push(promotion.new_grade);
    }
    
    if (promotion.new_department_id) {
      // Get department name
      const deptResult = await query(
        'SELECT name FROM org_branches WHERE id = $1',
        [promotion.new_department_id]
      );
      if (deptResult.rows.length > 0) {
        updateFields.push(`department = $${paramIndex++}`);
        values.push(deptResult.rows[0].name);
      }
    }
    
    // Update CTC if provided
    if (promotion.new_ctc !== null && promotion.new_ctc !== undefined) {
      updateFields.push(`ctc = $${paramIndex++}`);
      values.push(promotion.new_ctc);
    }
    
    if (updateFields.length > 0) {
      values.push(promotion.employee_id, tenantId);
      await queryWithOrg(
        `UPDATE employees 
         SET ${updateFields.join(', ')}, updated_at = now()
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}`,
        values,
        tenantId
      );
    }
    
    // Create HIKE event if CTC changed
    if (promotion.new_ctc && promotion.old_ctc && promotion.new_ctc !== promotion.old_ctc) {
      try {
        const { createHikeEvent } = await import('../utils/employee-events.js');
        await createHikeEvent(tenantId, promotion.employee_id, {
          oldCTC: promotion.old_ctc,
          newCTC: promotion.new_ctc,
          effectiveDate: promotion.effective_date,
          sourceTable: 'promotions',
          sourceId: promotion.id,
        });
      } catch (eventError) {
        console.error('[Promotion Cron] Error creating hike event:', eventError);
        // Don't fail promotion application if event creation fails
      }
    }
    
    // Mark promotion as applied
    await queryWithOrg(
      `UPDATE promotions 
       SET applied = true, applied_at = now()
       WHERE id = $1 AND org_id = $2`,
      [promotion.id, tenantId],
      tenantId
    );
    
    console.log(`[Promotion Cron] Promotion ${promotion.id} applied successfully`);
  } catch (error) {
    console.error('[Promotion Cron] Error in applyPromotion:', error);
    throw error;
  }
}

/**
 * Schedule the promotion application cron job
 * Runs daily at 2 AM
 */
export function schedulePromotionApplication() {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Promotion Cron] Running daily promotion application job...');
    await applyPendingPromotions();
  }, {
    timezone: 'Asia/Kolkata'
  });
  
  console.log('[Promotion Cron] Scheduled daily promotion application job (2:00 AM IST)');
}

export { applyPendingPromotions, applyPromotion };

