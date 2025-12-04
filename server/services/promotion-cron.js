import cron from 'node-cron';
import { query } from '../db/pool.js';
import { applyPromotion } from './promotion-service.js';

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

export { applyPendingPromotions };

