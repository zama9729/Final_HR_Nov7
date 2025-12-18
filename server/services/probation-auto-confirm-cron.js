import cron from 'node-cron';
import { processAutoConfirmation } from './probation-auto-confirm.js';

/**
 * Schedule probation auto-confirmation job
 * Runs daily at 2:00 AM to process auto-confirmations
 */
export function scheduleProbationAutoConfirmation() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') {
    console.log('[Probation Auto-Confirm Cron] Cron jobs disabled, skipping auto-confirmation scheduler');
    return;
  }

  // Schedule to run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Probation Auto-Confirm Cron] Running scheduled auto-confirmation check...');
    await processAutoConfirmation();
  });

  console.log('[Probation Auto-Confirm Cron] Scheduled auto-confirmation job (daily at 2:00 AM)');

  // Run immediately on startup (for testing/debugging)
  if (process.env.RUN_PROBATION_AUTO_CONFIRM_ON_STARTUP === 'true') {
    console.log('[Probation Auto-Confirm Cron] Running auto-confirmation check on startup...');
    processAutoConfirmation();
  }
}

