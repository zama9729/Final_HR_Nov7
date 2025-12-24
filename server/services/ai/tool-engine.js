import { query } from '../../db/pool.js';
import { isAIEnabled, canAccessModule } from './permissions.js';

export const STATIC_FAILURE_MESSAGE = 'This function is not yet integrated';

const ALLOWED_ROLES = new Set(['hr', 'ceo']);

const INTENT_KEYWORDS = [
  { action: 'LeaveTool.getLeavesByDate', keywords: ['on leave today', 'leave today', 'who are on leave', 'out of office', 'ooo'] },
  { action: 'LeaveTool.getPendingLeaveApprovals', keywords: ['pending leave approval', 'pending leave approvals'] },
  { action: 'OnboardingTool.getNewJoineesByDate', keywords: ['new joinees', 'joined this week', 'joined today'] },
  { action: 'AnalyticsTool.getHeadcount', keywords: ['total headcount', 'headcount', 'employee count'] },
  { action: 'AnalyticsTool.getDepartmentMetrics', keywords: ['department metrics', 'department breakdown'] },
  { action: 'EmployeeDirectoryTool.getEmployeeDetails', keywords: ['employee details', 'employee info', 'employee information'] },
];

function normalize(text = '') {
  return text.toLowerCase().trim();
}

export function detectIntent(userQuery = '') {
  const q = normalize(userQuery);
  for (const mapping of INTENT_KEYWORDS) {
    if (mapping.keywords.some((kw) => q.includes(kw))) {
      return { toolAction: mapping.action };
    }
  }
  return null;
}

async function handleHeadcount({ role, tenantId }) {
  const totalRes = await query(
    `SELECT COUNT(*)::int AS count 
     FROM employees 
     WHERE tenant_id = $1 
       AND COALESCE(status, 'active') NOT IN ('terminated','on_hold','resigned')`,
    [tenantId]
  );

  const total = totalRes.rows[0]?.count ?? 0;

  if (role === 'ceo') {
    return { tool: 'AnalyticsTool.getHeadcount', scope: 'organization', total };
  }

  const deptRes = await query(
    `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*)::int AS count
     FROM employees e
     LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
     LEFT JOIN departments d ON d.id = ea.department_id
     WHERE e.tenant_id = $1
       AND COALESCE(e.status, 'active') NOT IN ('terminated','on_hold','resigned')
     GROUP BY d.name
     ORDER BY d.name`,
    [tenantId]
  );

  const regionRes = await query(
    `SELECT COALESCE(ob.region_code, 'unassigned') AS region, COUNT(*)::int AS count
     FROM employees e
     LEFT JOIN org_branches ob ON COALESCE(e.branch_id, e.work_location_branch_id) = ob.id
     WHERE e.tenant_id = $1
       AND COALESCE(e.status, 'active') NOT IN ('terminated','on_hold','resigned')
     GROUP BY ob.region_code
     ORDER BY region`,
    [tenantId]
  );

  return {
    tool: 'AnalyticsTool.getHeadcount',
    scope: 'department',
    total,
    departments: deptRes.rows,
    regions: regionRes.rows,
  };
}

async function handleLeavesByDate({ role, tenantId, params }) {
  const date = params?.date || params?.on || params?.for || new Date().toISOString().slice(0, 10);

  const totalRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     WHERE lr.tenant_id = $1
       AND e.tenant_id = $1
       AND lr.status = 'approved'
       AND $2::date BETWEEN lr.start_date AND lr.end_date`,
    [tenantId, date]
  );

  const total = totalRes.rows[0]?.count ?? 0;

  if (role === 'ceo') {
    return { tool: 'LeaveTool.getLeavesByDate', date, total_on_leave: total };
  }

  const deptRes = await query(
    `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*)::int AS count
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
     LEFT JOIN departments d ON d.id = ea.department_id
     WHERE lr.tenant_id = $1
       AND e.tenant_id = $1
       AND lr.status = 'approved'
       AND $2::date BETWEEN lr.start_date AND lr.end_date
     GROUP BY d.name
     ORDER BY d.name`,
    [tenantId, date]
  );

  const regionRes = await query(
    `SELECT COALESCE(ob.region_code, 'unassigned') AS region, COUNT(*)::int AS count
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN org_branches ob ON COALESCE(e.branch_id, e.work_location_branch_id) = ob.id
     WHERE lr.tenant_id = $1
       AND e.tenant_id = $1
       AND lr.status = 'approved'
       AND $2::date BETWEEN lr.start_date AND lr.end_date
     GROUP BY ob.region_code
     ORDER BY region`,
    [tenantId, date]
  );

  return {
    tool: 'LeaveTool.getLeavesByDate',
    date,
    total_on_leave: total,
    departments: deptRes.rows,
    regions: regionRes.rows,
  };
}

async function handlePendingLeaveApprovals({ role, tenantId }) {
  const totalRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     WHERE lr.tenant_id = $1
       AND e.tenant_id = $1
       AND lr.status = 'pending'`,
    [tenantId]
  );

  const total = totalRes.rows[0]?.count ?? 0;

  if (role === 'ceo') {
    return { tool: 'LeaveTool.getPendingLeaveApprovals', pending: total };
  }

  const deptRes = await query(
    `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*)::int AS count
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
     LEFT JOIN departments d ON d.id = ea.department_id
     WHERE lr.tenant_id = $1
       AND e.tenant_id = $1
       AND lr.status = 'pending'
     GROUP BY d.name
     ORDER BY d.name`,
    [tenantId]
  );

  const regionRes = await query(
    `SELECT COALESCE(ob.region_code, 'unassigned') AS region, COUNT(*)::int AS count
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN org_branches ob ON COALESCE(e.branch_id, e.work_location_branch_id) = ob.id
     WHERE lr.tenant_id = $1
       AND e.tenant_id = $1
       AND lr.status = 'pending'
     GROUP BY ob.region_code
     ORDER BY region`,
    [tenantId]
  );

  return {
    tool: 'LeaveTool.getPendingLeaveApprovals',
    pending: total,
    departments: deptRes.rows,
    regions: regionRes.rows,
  };
}

async function handleNewJoineesByDate({ role, tenantId, params }) {
  const end = params?.end_date || params?.to || new Date().toISOString().slice(0, 10);
  const start =
    params?.start_date ||
    params?.from ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const totalRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM employees
     WHERE tenant_id = $1
       AND COALESCE(status, 'active') NOT IN ('terminated','on_hold','resigned')
       AND DATE(created_at) BETWEEN $2::date AND $3::date`,
    [tenantId, start, end]
  );

  const total = totalRes.rows[0]?.count ?? 0;

  if (role === 'ceo') {
    return { tool: 'OnboardingTool.getNewJoineesByDate', start_date: start, end_date: end, total };
  }

  const deptRes = await query(
    `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*)::int AS count
     FROM employees e
     LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
     LEFT JOIN departments d ON d.id = ea.department_id
     WHERE e.tenant_id = $1
       AND COALESCE(e.status, 'active') NOT IN ('terminated','on_hold','resigned')
       AND DATE(e.created_at) BETWEEN $2::date AND $3::date
     GROUP BY d.name
     ORDER BY d.name`,
    [tenantId, start, end]
  );

  const regionRes = await query(
    `SELECT COALESCE(ob.region_code, 'unassigned') AS region, COUNT(*)::int AS count
     FROM employees e
     LEFT JOIN org_branches ob ON COALESCE(e.branch_id, e.work_location_branch_id) = ob.id
     WHERE e.tenant_id = $1
       AND COALESCE(e.status, 'active') NOT IN ('terminated','on_hold','resigned')
       AND DATE(e.created_at) BETWEEN $2::date AND $3::date
     GROUP BY ob.region_code
     ORDER BY region`,
    [tenantId, start, end]
  );

  return {
    tool: 'OnboardingTool.getNewJoineesByDate',
    start_date: start,
    end_date: end,
    total,
    departments: deptRes.rows,
    regions: regionRes.rows,
  };
}

async function handleDepartmentMetrics({ tenantId }) {
  const deptRes = await query(
    `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*)::int AS count
     FROM employees e
     LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
     LEFT JOIN departments d ON d.id = ea.department_id
     WHERE e.tenant_id = $1
       AND COALESCE(e.status, 'active') NOT IN ('terminated','on_hold','resigned')
     GROUP BY d.name
     ORDER BY d.name`,
    [tenantId]
  );

  return { tool: 'AnalyticsTool.getDepartmentMetrics', departments: deptRes.rows };
}

async function handleEmployeeDetails({ tenantId, params }) {
  const identifier = params?.employee_id || params?.email;
  if (!identifier) {
    return { error: STATIC_FAILURE_MESSAGE };
  }

  const result = await query(
    `SELECT 
        e.id,
        e.employee_id,
        e.status,
        p.first_name,
        p.last_name,
        p.email,
        COALESCE(d.name, 'Unassigned') AS department,
        COALESCE(ob.region_code, 'unassigned') AS region
     FROM employees e
     LEFT JOIN profiles p ON p.id = e.user_id
     LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
     LEFT JOIN departments d ON d.id = ea.department_id
     LEFT JOIN org_branches ob ON COALESCE(e.branch_id, e.work_location_branch_id) = ob.id
     WHERE e.tenant_id = $1
       AND (e.employee_id = $2 OR LOWER(p.email) = LOWER($2))
     LIMIT 1`,
    [tenantId, identifier]
  );

  if (result.rows.length === 0) {
    return { error: STATIC_FAILURE_MESSAGE };
  }

  return { tool: 'EmployeeDirectoryTool.getEmployeeDetails', employee: result.rows[0] };
}

const TOOL_HANDLERS = {
  'AnalyticsTool.getHeadcount': handleHeadcount,
  'LeaveTool.getLeavesByDate': handleLeavesByDate,
  'LeaveTool.getPendingLeaveApprovals': handlePendingLeaveApprovals,
  'OnboardingTool.getNewJoineesByDate': handleNewJoineesByDate,
  'AnalyticsTool.getDepartmentMetrics': handleDepartmentMetrics,
  'EmployeeDirectoryTool.getEmployeeDetails': handleEmployeeDetails,
};

export async function runToolEngine({ userQuery, params = {}, role, tenantId }) {
  if (!ALLOWED_ROLES.has(role)) {
    return { error: STATIC_FAILURE_MESSAGE };
  }

  // Check if AI is enabled
  const aiEnabled = await isAIEnabled(tenantId);
  if (!aiEnabled) {
    return { error: 'AI Assistant is disabled for your organization. Please contact your administrator.' };
  }

  const intent = detectIntent(userQuery);
  if (!intent) {
    return { error: STATIC_FAILURE_MESSAGE };
  }

  // Check module permissions based on tool action
  const toolAction = intent.toolAction;
  let moduleName = null;
  if (toolAction.includes('LeaveTool')) {
    moduleName = 'leaves';
  } else if (toolAction.includes('AttendanceTool')) {
    moduleName = 'attendance';
  } else if (toolAction.includes('ExpenseTool')) {
    moduleName = 'expenses';
  } else if (toolAction.includes('OnboardingTool')) {
    moduleName = 'onboarding';
  } else if (toolAction.includes('PayrollTool')) {
    moduleName = 'payroll';
  } else if (toolAction.includes('AnalyticsTool')) {
    moduleName = 'analytics';
  } else if (toolAction.includes('EmployeeDirectoryTool')) {
    moduleName = 'employee_directory';
  } else if (toolAction.includes('NotificationTool')) {
    moduleName = 'notifications';
  }

  if (moduleName) {
    const hasAccess = await canAccessModule(tenantId, moduleName);
    if (!hasAccess) {
      return { error: `Access to ${moduleName.replace('_', ' ')} is disabled in AI configuration.` };
    }
  }

  const handler = TOOL_HANDLERS[toolAction];
  if (!handler) {
    return { error: STATIC_FAILURE_MESSAGE };
  }

  try {
    const mergedParams = { ...params, ...(intent.params || {}) };
    const result = await handler({ role, tenantId, params: mergedParams });
    return result || { error: STATIC_FAILURE_MESSAGE };
  } catch (error) {
    console.error('[ToolEngine] Handler error:', error);
    return { error: STATIC_FAILURE_MESSAGE };
  }
}

export default {
  detectIntent,
  runToolEngine,
};


