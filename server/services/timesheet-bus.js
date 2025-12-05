// Simple placeholder event bus for timesheet realtime updates.
// Currently logs to console. In future, wire this into your WebSocket/SSE layer.

export async function publishTimesheetEvent(employeeId, payload) {
  try {
    // eslint-disable-next-line no-console
    console.log('[TimesheetRealtime] event for employee', employeeId, JSON.stringify(payload));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[TimesheetRealtime] failed to log event', err);
  }
}




