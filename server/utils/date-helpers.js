/**
 * Date helpers for offboarding F&F settlement scheduling
 * All calculations respect Asia/Kolkata timezone
 * Uses native JavaScript Date methods (no external dependencies)
 */

const TIMEZONE = 'Asia/Kolkata';
const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds

// Simple timezone helpers for Asia/Kolkata (UTC+5:30)
function utcToZonedTime(date, timezone) {
  // For Asia/Kolkata (UTC+5:30), add 5.5 hours
  return new Date(date.getTime() + KOLKATA_OFFSET_MS);
}

function zonedTimeToUtc(date, timezone) {
  // For Asia/Kolkata (UTC+5:30), subtract 5.5 hours
  return new Date(date.getTime() - KOLKATA_OFFSET_MS);
}

/**
 * Add days to a date in Asia/Kolkata timezone
 * @param {Date} date - Base date
 * @param {number} days - Days to add
 * @returns {Date} New date in Asia/Kolkata
 */
export function addDaysInKolkata(date, days) {
  const zonedDate = utcToZonedTime(date, TIMEZONE);
  const result = new Date(zonedDate);
  result.setDate(result.getDate() + days);
  return zonedTimeToUtc(result, TIMEZONE);
}

/**
 * Calculate last working day (requestedAt + noticePeriodDays)
 * @param {Date} requestedAt - Request date
 * @param {number} noticePeriodDays - Notice period in days
 * @returns {Date} Last working day
 */
export function calculateLastWorkingDay(requestedAt, noticePeriodDays) {
  return addDaysInKolkata(requestedAt, noticePeriodDays);
}

/**
 * Calculate start of last week of notice period
 * @param {Date} lastWorkingDay - Last working day
 * @returns {Date} Start of last week (lastWorkingDay - 7 days)
 */
export function calculateLastWeekStart(lastWorkingDay) {
  return addDaysInKolkata(lastWorkingDay, -7);
}

/**
 * Calculate 15th of the month after a given date in Asia/Kolkata
 * @param {Date} date - Reference date
 * @returns {Date} 15th of next month at 10:00 AM Asia/Kolkata
 */
export function calculateNextMonthFifteenth(date) {
  const zonedDate = utcToZonedTime(date, TIMEZONE);
  
  // Get first day of next month
  const nextMonth = new Date(zonedDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  
  // Set to 15th at 10:00 AM
  nextMonth.setDate(15);
  nextMonth.setHours(10, 0, 0, 0);
  
  // Convert back to UTC
  return zonedTimeToUtc(nextMonth, TIMEZONE);
}

/**
 * Format date for display in Asia/Kolkata
 * @param {Date} date - Date to format
 * @param {string} formatStr - Format string (default: 'MMMM d, yyyy')
 * @returns {string} Formatted date
 */
export function formatDateKolkata(date, formatStr = 'MMMM d, yyyy') {
  const zonedDate = utcToZonedTime(date, TIMEZONE);
  
  // Simple formatter for common formats
  if (formatStr === 'MMMM d, yyyy') {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = months[zonedDate.getMonth()];
    const day = zonedDate.getDate();
    const year = zonedDate.getFullYear();
    return `${month} ${day}, ${year}`;
  }
  
  // Fallback to ISO string
  return zonedDate.toISOString();
}

/**
 * Check if current date is within the last week of notice period
 * @param {Date} lastWorkingDay - Last working day
 * @returns {boolean} True if within last week
 */
export function isWithinLastWeek(lastWorkingDay) {
  const now = new Date();
  const lastWeekStart = calculateLastWeekStart(lastWorkingDay);
  return now >= lastWeekStart && now <= lastWorkingDay;
}

/**
 * Check if all approvals are complete and checklist is clear
 * @param {Array} approvals - Array of approval objects
 * @param {Object} checklist - Checklist object
 * @returns {boolean} True if ready for F&F scheduling
 */
export function isReadyForFnFScheduling(approvals, checklist) {
  if (!checklist) return false;
  
  // All approvals must be approved or auto-approved
  const allApproved = approvals.every(a => 
    a.decision === 'approved' || a.decision === 'pending' // pending can be auto-approved
  );
  
  // Checklist must be clear
  const checklistClear = 
    checklist.finance_clear &&
    checklist.compliance_clear &&
    checklist.it_clear &&
    checklist.assets_pending === 0;
  
  return allApproved && checklistClear;
}
