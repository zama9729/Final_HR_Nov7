import { query } from '../../db/pool.js';

/**
 * Get AI configuration for a tenant
 */
export async function getAIConfiguration(tenantId) {
  try {
    const result = await query(
      `SELECT * FROM ai_configuration WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      // Return default configuration (all enabled)
      return {
        enabled: true,
        can_access_projects: true,
        can_access_timesheets: true,
        can_access_leaves: true,
        can_access_attendance: true,
        can_access_expenses: true,
        can_access_onboarding: true,
        can_access_payroll: true,
        can_access_analytics: true,
        can_access_employee_directory: true,
        can_access_notifications: true,
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error('[AI Permissions] Error fetching configuration:', error);
    // Return default configuration on error
    return {
      enabled: true,
      can_access_projects: true,
      can_access_timesheets: true,
      can_access_leaves: true,
      can_access_attendance: true,
      can_access_expenses: true,
      can_access_onboarding: true,
      can_access_payroll: true,
      can_access_analytics: true,
      can_access_employee_directory: true,
      can_access_notifications: true,
    };
  }
}

/**
 * Check if AI is enabled for tenant
 */
export async function isAIEnabled(tenantId) {
  const config = await getAIConfiguration(tenantId);
  return config.enabled === true;
}

/**
 * Check if a specific module is accessible
 */
export async function canAccessModule(tenantId, moduleName) {
  const config = await getAIConfiguration(tenantId);
  
  if (!config.enabled) {
    return false;
  }

  const permissionKey = `can_access_${moduleName}`;
  return config[permissionKey] === true;
}

/**
 * Map function names to module names for permission checking
 */
const FUNCTION_TO_MODULE_MAP = {
  // Leave functions
  'get_leave_request': 'leaves',
  'list_pending_leave_requests': 'leaves',
  'get_leave_policies': 'leaves',
  'get_my_leave_requests': 'leaves',
  'create_leave_request': 'leaves',
  
  // Timesheet functions
  'get_timesheet': 'timesheets',
  'get_dashboard_stats': 'timesheets', // Dashboard includes timesheet stats
  
  // Project functions
  'list_projects': 'projects',
  'get_project': 'projects',
  
  // Attendance functions
  'get_attendance_summary': 'attendance',
  'get_late_employees': 'attendance',
  'get_absent_employees': 'attendance',
  
  // Expense functions
  'get_pending_expenses': 'expenses',
  'get_expense_summary': 'expenses',
  
  // Onboarding functions
  'get_new_joinees': 'onboarding',
  'get_onboarding_status': 'onboarding',
  
  // Payroll functions
  'get_payslip_status': 'payroll',
  'get_payroll_summary': 'payroll',
  
  // Analytics functions
  'get_headcount': 'analytics',
  'get_attrition_metrics': 'analytics',
  'get_department_metrics': 'analytics',
  'get_hr_kpis': 'analytics',
  
  // Employee directory functions
  'get_employee_info': 'employee_directory',
  'list_employees': 'employee_directory',
  'get_employee_details': 'employee_directory',
  
  // Notification functions
  'send_alert': 'notifications',
  'send_report': 'notifications',
  'schedule_report': 'notifications',
};

/**
 * Check if a function is allowed based on AI configuration
 */
export async function isFunctionAllowed(tenantId, functionName) {
  const config = await getAIConfiguration(tenantId);
  
  if (!config.enabled) {
    return false;
  }

  const moduleName = FUNCTION_TO_MODULE_MAP[functionName];
  if (!moduleName) {
    // If function is not mapped, allow it (for backward compatibility)
    return true;
  }

  const permissionKey = `can_access_${moduleName}`;
  return config[permissionKey] === true;
}









