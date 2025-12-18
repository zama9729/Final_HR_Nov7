import { query } from '../db/pool.js';
import { createEmployeeEvent } from '../utils/employee-events.js';

/**
 * Calculate years of service from join date
 */
function calculateYearsOfService(joinDate) {
  const join = new Date(joinDate);
  const today = new Date();
  
  let years = today.getFullYear() - join.getFullYear();
  const monthDiff = today.getMonth() - join.getMonth();
  const dayDiff = today.getDate() - join.getDate();
  
  // Adjust if anniversary hasn't occurred this year yet
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years--;
  }
  
  return years;
}

/**
 * Check if today is an employee's work anniversary
 */
function isAnniversaryToday(joinDate) {
  if (!joinDate) return false;
  
  const join = new Date(joinDate);
  const today = new Date();
  
  // Check if month and day match (ignore year)
  return join.getMonth() === today.getMonth() && join.getDate() === today.getDate();
}

/**
 * Create or update anniversary events for employees
 * This function checks all active employees and creates anniversary events for today's anniversaries
 */
export async function processAnniversaryEvents() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`[Anniversary Events] Processing anniversary events for ${todayStr}`);
    
    // Find all active employees with join_date
    const employeesResult = await query(
      `SELECT 
         e.id as employee_id,
         e.tenant_id as org_id,
         e.join_date,
         e.status,
         p.first_name,
         p.last_name
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.join_date IS NOT NULL
         AND COALESCE(e.status, 'active') NOT IN ('terminated', 'on_hold', 'resigned')
       ORDER BY e.join_date ASC`
    );
    
    let processed = 0;
    let skipped = 0;
    const errors = [];
    
    for (const emp of employeesResult.rows) {
      try {
        if (!isAnniversaryToday(emp.join_date)) {
          continue; // Not today's anniversary
        }
        
        const yearsOfService = calculateYearsOfService(emp.join_date);
        
        if (yearsOfService < 1) {
          continue; // Less than 1 year, skip
        }
        
        // Check if anniversary event already exists for this year
        const existingEvent = await query(
          `SELECT id FROM employee_events
           WHERE org_id = $1 
             AND employee_id = $2 
             AND event_type = 'ANNIVERSARY'
             AND EXTRACT(YEAR FROM event_date) = $3
           LIMIT 1`,
          [emp.org_id, emp.employee_id, today.getFullYear()]
        );
        
        if (existingEvent.rows.length > 0) {
          console.log(`[Anniversary Events] Anniversary event already exists for employee ${emp.employee_id} for year ${today.getFullYear()}`);
          skipped++;
          continue;
        }
        
        // Create anniversary event
        const employeeName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Employee';
        const anniversaryTitle = yearsOfService === 1 
          ? '1 Year Work Anniversary' 
          : `${yearsOfService} Year Work Anniversary`;
        
        await createEmployeeEvent({
          orgId: emp.org_id,
          employeeId: emp.employee_id,
          eventType: 'ANNIVERSARY',
          eventDate: todayStr,
          title: anniversaryTitle,
          description: `${employeeName} completed ${yearsOfService} year${yearsOfService > 1 ? 's' : ''} of service`,
          metadata: {
            yearsOfService,
            joinDate: emp.join_date,
            anniversaryDate: todayStr,
          },
          sourceTable: 'employees',
          sourceId: emp.employee_id,
        });
        
        processed++;
        console.log(`[Anniversary Events] Created ${yearsOfService}-year anniversary event for employee ${emp.employee_id}`);
      } catch (error) {
        console.error(`[Anniversary Events] Error processing employee ${emp.employee_id}:`, error);
        errors.push({ employee_id: emp.employee_id, error: error.message });
        skipped++;
      }
    }
    
    console.log(`[Anniversary Events] Completed: ${processed} processed, ${skipped} skipped`);
    
    return { processed, skipped, errors: errors.length > 0 ? errors : undefined };
  } catch (error) {
    console.error('[Anniversary Events] Error processing anniversary events:', error);
    return { processed: 0, skipped: 0, error: error.message };
  }
}

/**
 * Backfill anniversary events for all employees
 * Creates anniversary events for past years based on join_date
 */
export async function backfillAnniversaryEvents() {
  try {
    console.log('[Anniversary Events] Starting backfill of anniversary events');
    
    // Find all active employees with join_date
    const employeesResult = await query(
      `SELECT 
         e.id as employee_id,
         e.tenant_id as org_id,
         e.join_date,
         e.status,
         p.first_name,
         p.last_name
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.join_date IS NOT NULL
         AND COALESCE(e.status, 'active') NOT IN ('terminated', 'on_hold', 'resigned')
       ORDER BY e.join_date ASC`
    );
    
    let processed = 0;
    let skipped = 0;
    const errors = [];
    
    for (const emp of employeesResult.rows) {
      try {
        const joinDate = new Date(emp.join_date);
        const today = new Date();
        const yearsOfService = calculateYearsOfService(emp.join_date);
        
        if (yearsOfService < 1) {
          continue; // Less than 1 year, skip
        }
        
        const employeeName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Employee';
        
        // Create anniversary events for each year from join date to current year
        for (let year = 1; year <= yearsOfService; year++) {
          const anniversaryDate = new Date(joinDate);
          anniversaryDate.setFullYear(joinDate.getFullYear() + year);
          const anniversaryDateStr = anniversaryDate.toISOString().split('T')[0];
          
          // Skip if anniversary date is in the future
          if (anniversaryDate > today) {
            continue;
          }
          
          // Check if event already exists for this year
          const existingEvent = await query(
            `SELECT id FROM employee_events
             WHERE org_id = $1 
               AND employee_id = $2 
               AND event_type = 'ANNIVERSARY'
               AND EXTRACT(YEAR FROM event_date) = $3
             LIMIT 1`,
            [emp.org_id, emp.employee_id, anniversaryDate.getFullYear()]
          );
          
          if (existingEvent.rows.length > 0) {
            continue; // Already exists
          }
          
          // Create anniversary event
          const anniversaryTitle = year === 1 
            ? '1 Year Work Anniversary' 
            : `${year} Year Work Anniversary`;
          
          await createEmployeeEvent({
            orgId: emp.org_id,
            employeeId: emp.employee_id,
            eventType: 'ANNIVERSARY',
            eventDate: anniversaryDateStr,
            title: anniversaryTitle,
            description: `${employeeName} completed ${year} year${year > 1 ? 's' : ''} of service`,
            metadata: {
              yearsOfService: year,
              joinDate: emp.join_date,
              anniversaryDate: anniversaryDateStr,
              backfilled: true,
            },
            sourceTable: 'employees',
            sourceId: emp.employee_id,
          });
          
          processed++;
        }
        
        console.log(`[Anniversary Events] Backfilled ${yearsOfService} anniversary events for employee ${emp.employee_id}`);
      } catch (error) {
        console.error(`[Anniversary Events] Error backfilling employee ${emp.employee_id}:`, error);
        errors.push({ employee_id: emp.employee_id, error: error.message });
        skipped++;
      }
    }
    
    console.log(`[Anniversary Events] Backfill completed: ${processed} processed, ${skipped} skipped`);
    
    return { processed, skipped, errors: errors.length > 0 ? errors : undefined };
  } catch (error) {
    console.error('[Anniversary Events] Error backfilling anniversary events:', error);
    return { processed: 0, skipped: 0, error: error.message };
  }
}

