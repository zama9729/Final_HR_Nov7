import cron from 'node-cron';
import { processAnniversaryEvents, backfillAnniversaryEvents } from './anniversary-events.js';

/**
 * Schedule the anniversary events cron job
 * Runs daily at 2:00 AM to check for employees with anniversaries today
 */
export function scheduleAnniversaryEvents() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') {
    console.log('[Anniversary Events Cron] Cron jobs disabled, skipping anniversary events scheduler');
    return;
  }

  // Run daily at 2:00 AM to process anniversaries for the day
  cron.schedule('0 2 * * *', async () => {
    console.log('[Anniversary Events Cron] Running daily anniversary events check...');
    const result = await processAnniversaryEvents();
    console.log(`[Anniversary Events Cron] Processed: ${result.processed}, Skipped: ${result.skipped}`);
  });

  console.log('[Anniversary Events Cron] Scheduled anniversary events job (daily at 2:00 AM)');

  // Run immediately on startup to catch any missed anniversaries
  processAnniversaryEvents().then(result => {
    console.log(`[Anniversary Events Cron] Initial check - Processed: ${result.processed}, Skipped: ${result.skipped}`);
  });
}

