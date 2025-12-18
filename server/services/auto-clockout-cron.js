import cron from 'node-cron';
import { checkAndAutoClockOut } from './auto-clockout.js';

/**
 * Schedule the auto clock-out checking cron job
 * Runs every 15 minutes to check for employees who need auto clock-out
 */
export function scheduleAutoClockOutChecks() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') {
    console.log('[Auto Clock-Out Cron] Cron jobs disabled, skipping auto clock-out scheduler');
    return;
  }

  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Auto Clock-Out Cron] Running auto clock-out check...');
    const result = await checkAndAutoClockOut();
    console.log(`[Auto Clock-Out Cron] Processed: ${result.processed}, Skipped: ${result.skipped}, Total: ${result.total || 0}`);
  });

  console.log('[Auto Clock-Out Cron] Scheduled auto clock-out checking job (every 15 minutes)');

  // Also run at midnight (00:00) to handle previous day's sessions
  cron.schedule('0 0 * * *', async () => {
    console.log('[Auto Clock-Out Cron] Running midnight auto clock-out check for previous day...');
    const result = await checkAndAutoClockOut();
    console.log(`[Auto Clock-Out Cron] Midnight check - Processed: ${result.processed}, Skipped: ${result.skipped}`);
  });

  console.log('[Auto Clock-Out Cron] Scheduled midnight auto clock-out check (00:00 daily)');

  // Run immediately on startup
  checkAndAutoClockOut().then(result => {
    console.log(`[Auto Clock-Out Cron] Initial check - Processed: ${result.processed}, Skipped: ${result.skipped}`);
  });
}

