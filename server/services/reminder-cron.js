import cron from 'node-cron';
import { query } from '../db/pool.js';

/**
 * Check for due reminders and create notifications
 * Runs every minute to check for reminders that need to be triggered
 */
async function checkDueReminders() {
  try {
    // Check if reminders table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'reminders'
      );
    `);
    
    if (!tableCheck.rows[0]?.exists) {
      // Table doesn't exist yet, skip silently (will be created when smart-memo is first used)
      return;
    }
    
    const now = new Date();
    
    // Find reminders that are due (remind_at <= now) and not yet processed
    const dueReminders = await query(`
      SELECT r.id, r.user_id, r.tenant_id, r.message, r.source_memo_text, r.remind_at
      FROM reminders r
      WHERE r.remind_at <= $1
        AND r.is_read = false
        AND r.is_dismissed = false
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = r.user_id
            AND n.message LIKE '%' || r.source_memo_text || '%'
            AND n.created_at > r.created_at
        )
      ORDER BY r.remind_at ASC
    `, [now.toISOString()]);
    
    if (dueReminders.rows.length === 0) {
      return;
    }
    
    console.log(`[Reminder Cron] Found ${dueReminders.rows.length} due reminder(s)`);
    
    for (const reminder of dueReminders.rows) {
      try {
        // Create notification
        await query(`
          INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
          VALUES ($1, $2, $3, $4, 'reminder', now())
        `, [
          reminder.tenant_id,
          reminder.user_id,
          'Reminder',
          reminder.message || `Reminder from memo: ${reminder.source_memo_text || 'N/A'}`
        ]);
        
        // Mark reminder as read (so it doesn't trigger again)
        await query(`
          UPDATE reminders
          SET is_read = true
          WHERE id = $1
        `, [reminder.id]);
        
        console.log(`[Reminder Cron] Created notification for reminder ${reminder.id}`);
      } catch (error) {
        console.error(`[Reminder Cron] Error processing reminder ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Reminder Cron] Error checking due reminders:', error);
  }
}

/**
 * Schedule the reminder checking cron job
 * Runs every minute to check for due reminders
 */
export function scheduleReminderChecks() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') {
    console.log('[Reminder Cron] Cron jobs disabled, skipping reminder scheduler');
    return;
  }
  
  // Run every minute
  cron.schedule('* * * * *', async () => {
    await checkDueReminders();
  });
  
  console.log('[Reminder Cron] Scheduled reminder checking job (every minute)');
  
  // Run immediately on startup
  checkDueReminders();
}

export { checkDueReminders };












