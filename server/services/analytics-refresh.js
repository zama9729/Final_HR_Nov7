import { query } from '../db/pool.js';

export async function refreshAnalyticsViews() {
  try {
    await query('SELECT analytics.refresh_org_views()');
  } catch (error) {
    console.error('Failed to refresh analytics views', error);
    throw error;
  }
}

export async function scheduleAnalyticsRefresh() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (error) {
    console.warn('node-cron not available for analytics refresh');
    return;
  }
  cron.schedule('0 * * * *', async () => {
    try {
      await refreshAnalyticsViews();
    } catch (error) {
      console.error('Scheduled analytics refresh failed', error);
    }
  });
}


