import { query } from '../db/pool.js';
import { createEmployeeEvent } from '../utils/employee-events.js';

/**
 * Get next working day (excluding weekends)
 */
function getNextWorkingDay(date) {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  
  // Skip weekends (Saturday = 6, Sunday = 0)
  while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  
  return nextDay;
}

/**
 * Check if date is a working day (not weekend)
 */
function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday or Saturday
}

/**
 * Send probation notification
 */
async function sendProbationNotification(tenantId, employeeId, recipientId, eventType, probationId) {
  try {
    const messages = {
      probation_start: 'Your probation period has started.',
      probation_completion: 'Your probation period has been completed.',
      auto_confirmation: 'Your probation has been automatically confirmed.',
      probation_extension: 'Your probation period has been extended.',
    };

    await query(
      `INSERT INTO probation_event_notifications 
       (tenant_id, employee_id, probation_id, event_type, notification_type, recipient_id, status)
       VALUES ($1, $2, $3, $4, 
         CASE 
           WHEN $5 = (SELECT user_id FROM employees WHERE id = $2) THEN 'employee'
           WHEN $5 = (SELECT reporting_manager_id FROM employees WHERE id = $2) THEN 'manager'
           ELSE 'hr'
         END,
         $5, 'pending')`,
      [tenantId, employeeId, probationId, eventType, recipientId]
    );

    // Also create a notification in the notifications table
    await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, 'probation', now())`,
      [
        tenantId,
        recipientId,
        `Probation ${eventType.replace('_', ' ')}`,
        messages[eventType] || `Probation event: ${eventType}`,
      ]
    );
  } catch (error) {
    console.error(`[Probation Auto-Confirm] Failed to send notification:`, error);
  }
}

/**
 * Process auto-confirmation for employees whose probation has ended
 */
export async function processAutoConfirmation() {
  try {
    console.log('[Probation Auto-Confirm] Starting auto-confirmation check...');

    // Find all active probation policies with auto-confirmation enabled
    const policiesResult = await query(
      `SELECT DISTINCT pp.*, o.timezone
       FROM probation_policies pp
       JOIN organizations o ON o.id = pp.tenant_id
       WHERE pp.status = 'published' 
         AND pp.is_active = true 
         AND pp.auto_confirm_at_end = true`
    );

    if (policiesResult.rows.length === 0) {
      console.log('[Probation Auto-Confirm] No active policies with auto-confirmation enabled');
      return { processed: 0, skipped: 0 };
    }

    let totalProcessed = 0;
    let totalSkipped = 0;

    for (const policy of policiesResult.rows) {
      const tenantId = policy.tenant_id;
      const timezone = policy.timezone || 'UTC';

      // Get current date in organization timezone
      const now = new Date();
      const today = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      today.setHours(0, 0, 0, 0);

      // Find probations that ended today or earlier
      const probationsResult = await query(
        `SELECT 
           p.*,
           e.id as employee_id,
           e.user_id,
           e.reporting_manager_id,
           e.status as employee_status,
           e.tenant_id
         FROM probations p
         JOIN employees e ON e.id = p.employee_id
         WHERE p.tenant_id = $1
           AND p.status = 'in_probation'
           AND p.auto_confirm_at_end = true
           AND DATE(p.probation_end) <= $2
           AND e.status NOT IN ('terminated', 'on_hold', 'resigned')`,
        [tenantId, today]
      );

      for (const probation of probationsResult.rows) {
        try {
          // Determine confirmation date based on policy rule
          let confirmationDate = new Date(probation.probation_end);
          
          if (policy.confirmation_effective_rule === 'next_working_day') {
            if (!isWorkingDay(confirmationDate)) {
              confirmationDate = getNextWorkingDay(confirmationDate);
            } else {
              // If probation ended today and it's a working day, confirm today
              // Otherwise, confirm on next working day
              if (confirmationDate < today) {
                confirmationDate = getNextWorkingDay(today);
              }
            }
          }

          // Only process if confirmation date is today or in the past
          if (confirmationDate > today) {
            continue;
          }

          // Check if probation extension is active
          const extensionCheck = await query(
            `SELECT id FROM probations 
             WHERE employee_id = $1 
               AND status = 'extended' 
               AND probation_end > $2
             LIMIT 1`,
            [probation.employee_id, today]
          );

          if (extensionCheck.rows.length > 0) {
            console.log(`[Probation Auto-Confirm] Skipping ${probation.employee_id}: Active extension exists`);
            totalSkipped++;
            continue;
          }

          // Update probation status
          await query(
            `UPDATE probations 
             SET status = 'completed',
                 completed_at = $1,
                 updated_at = now()
             WHERE id = $2`,
            [confirmationDate, probation.id]
          );

          // Update employee status
          await query(
            `UPDATE employees 
             SET status = 'confirmed',
                 probation_status = 'completed',
                 updated_at = now()
             WHERE id = $1`,
            [probation.employee_id]
          );

          // Create employee event (check if it doesn't already exist)
          try {
            const existingEvent = await query(
              `SELECT id FROM employee_events
               WHERE org_id = $1 AND employee_id = $2 
                 AND event_type = 'PROBATION_END'
                 AND event_date = $3
               LIMIT 1`,
              [tenantId, probation.employee_id, confirmationDate.toISOString().split('T')[0]]
            );

            if (existingEvent.rows.length === 0) {
              await createEmployeeEvent({
                orgId: tenantId,
                employeeId: probation.employee_id,
                eventType: 'PROBATION_END',
                eventDate: confirmationDate.toISOString().split('T')[0],
                title: 'Probation Completed',
                description: 'Employee probation period completed and automatically confirmed',
                metadata: {
                  probationId: probation.id,
                  probationStart: probation.probation_start,
                  probationEnd: probation.probation_end,
                  autoConfirmed: true,
                  confirmationDate: confirmationDate.toISOString().split('T')[0],
                },
                sourceTable: 'probations',
                sourceId: probation.id,
              });
            }
          } catch (eventError) {
            console.error(`[Probation Auto-Confirm] Failed to create event:`, eventError);
          }

          // Send notifications based on policy settings
          const notifications = [];
          
          if (policy.notify_employee && probation.user_id) {
            notifications.push({
              recipientId: probation.user_id,
              type: 'employee',
            });
          }
          
          if (policy.notify_manager && probation.reporting_manager_id) {
            const managerResult = await query(
              'SELECT user_id FROM employees WHERE id = $1',
              [probation.reporting_manager_id]
            );
            if (managerResult.rows.length > 0) {
              notifications.push({
                recipientId: managerResult.rows[0].user_id,
                type: 'manager',
              });
            }
          }
          
          if (policy.notify_hr) {
            const hrResult = await query(
              `SELECT p.id 
               FROM profiles p
               JOIN user_roles ur ON ur.user_id = p.id
               WHERE p.tenant_id = $1 AND ur.role IN ('hr', 'ceo', 'admin')
               LIMIT 1`,
              [tenantId]
            );
            if (hrResult.rows.length > 0) {
              notifications.push({
                recipientId: hrResult.rows[0].id,
                type: 'hr',
              });
            }
          }

          // Send all notifications
          for (const notif of notifications) {
            await sendProbationNotification(
              tenantId,
              probation.employee_id,
              notif.recipientId,
              'auto_confirmation',
              probation.id
            );
          }

          console.log(`[Probation Auto-Confirm] Auto-confirmed employee ${probation.employee_id} on ${confirmationDate.toISOString().split('T')[0]}`);
          totalProcessed++;
        } catch (error) {
          console.error(`[Probation Auto-Confirm] Error processing probation ${probation.id}:`, error);
          totalSkipped++;
        }
      }
    }

    console.log(`[Probation Auto-Confirm] Completed: ${totalProcessed} processed, ${totalSkipped} skipped`);
    return { processed: totalProcessed, skipped: totalSkipped };
  } catch (error) {
    console.error('[Probation Auto-Confirm] Error in auto-confirmation process:', error);
    return { processed: 0, skipped: 0, error: error.message };
  }
}

