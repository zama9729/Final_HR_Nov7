import { query } from '../../db/pool.js';
import { authenticateToken } from '../../middleware/auth.js';

/**
 * HR System Functions for Opal/OpenAI Function Calling
 * These functions allow the AI to interact with the HR system
 */

/**
 * Get employee information
 */
export async function getEmployeeInfo(employeeId, userId, tenantId) {
  try {
    const result = await query(
      `SELECT 
        e.id, e.employee_id, e.department, e.position,
        e.status, e.work_location, e.join_date,
        p.first_name, p.last_name, p.email, p.phone
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [employeeId, tenantId]
    );

    if (result.rows.length === 0) {
      return { error: 'Employee not found' };
    }

    const employee = result.rows[0];
    return {
      success: true,
      employee: {
        id: employee.id,
        employee_id: employee.employee_id,
        name: `${employee.first_name} ${employee.last_name}`,
        email: employee.email,
        phone: employee.phone,
        department: employee.department,
        position: employee.position,
        status: employee.status,
        work_location: employee.work_location,
        join_date: employee.join_date,
      }
    };
  } catch (error) {
    console.error('Error in getEmployeeInfo:', error);
    return { error: error.message };
  }
}

/**
 * List employees with filters
 */
export async function listEmployees(filters, userId, tenantId) {
  try {
    let queryStr = `
      SELECT 
        e.id, e.employee_id, e.department, e.position,
        e.status, e.work_location, e.join_date,
        p.first_name, p.last_name, p.email, p.phone
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (filters.department) {
      queryStr += ` AND e.department = $${paramIndex}`;
      params.push(filters.department);
      paramIndex++;
    }

    if (filters.status) {
      queryStr += ` AND e.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.search) {
      queryStr += ` AND (p.first_name ILIKE $${paramIndex} OR p.last_name ILIKE $${paramIndex} OR p.email ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    queryStr += ` ORDER BY p.first_name, p.last_name LIMIT ${Math.min(filters.limit || 50, 100)}`;

    const result = await query(queryStr, params);

    return {
      success: true,
      employees: result.rows.map(row => ({
        id: row.id,
        employee_id: row.employee_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        department: row.department,
        position: row.position,
        status: row.status,
      })),
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error in listEmployees:', error);
    return { error: error.message };
  }
}

/**
 * Get current user's leave requests
 */
export async function getMyLeaveRequests(userId, tenantId) {
  try {
    // Get employee ID for current user
    const empResult = await query('SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    if (empResult.rows.length === 0) {
      return { error: 'Employee record not found for user' };
    }
    const employeeId = empResult.rows[0].id;

    const result = await query(
      `SELECT 
        lr.id, lr.start_date, lr.end_date, lr.total_days,
        lr.reason, lr.status, lr.submitted_at,
        lp.name as leave_type
       FROM leave_requests lr
       LEFT JOIN leave_policies lp ON lp.id = lr.leave_type_id
       WHERE lr.employee_id = $1 AND lr.tenant_id = $2
       ORDER BY lr.submitted_at DESC
       LIMIT 50`,
      [employeeId, tenantId]
    );

    return {
      success: true,
      leave_requests: result.rows.map(row => ({
        id: row.id,
        leave_type: row.leave_type,
        start_date: row.start_date,
        end_date: row.end_date,
        total_days: row.total_days,
        reason: row.reason,
        status: row.status,
        submitted_at: row.submitted_at,
      })),
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error in getMyLeaveRequests:', error);
    return { error: error.message };
  }
}

/**
 * Get leave request information
 */
export async function getLeaveRequest(leaveRequestId, userId, tenantId) {
  try {
    const result = await query(
      `SELECT 
        lr.id, lr.start_date, lr.end_date, lr.total_days,
        lr.reason, lr.status, lr.submitted_at,
        lp.name as leave_type,
        e.employee_id,
        p.first_name, p.last_name, p.email
       FROM leave_requests lr
       LEFT JOIN leave_policies lp ON lp.id = lr.leave_type_id
       JOIN employees e ON e.id = lr.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE lr.id = $1 AND lr.tenant_id = $2`,
      [leaveRequestId, tenantId]
    );

    if (result.rows.length === 0) {
      return { error: 'Leave request not found' };
    }

    const leave = result.rows[0];
    return {
      success: true,
      leave_request: {
        id: leave.id,
        employee: {
          employee_id: leave.employee_id,
          name: `${leave.first_name} ${leave.last_name}`,
          email: leave.email,
        },
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
        total_days: leave.total_days,
        reason: leave.reason,
        status: leave.status,
        submitted_at: leave.submitted_at,
      }
    };
  } catch (error) {
    console.error('Error in getLeaveRequest:', error);
    return { error: error.message };
  }
}

/**
 * List pending leave requests
 */
export async function listPendingLeaveRequests(userId, tenantId) {
  try {
    // Check if user is manager or HR
    const roleResult = await query(
      `SELECT role FROM user_roles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['manager', 'hr', 'director', 'ceo'].includes(userRole)) {
      return { error: 'Insufficient permissions' };
    }

    let queryStr = `
      SELECT 
        lr.id, lr.start_date, lr.end_date, lr.total_days,
        lr.reason, lr.status, lr.submitted_at,
        lp.name as leave_type,
        e.employee_id,
        p.first_name, p.last_name, p.email
       FROM leave_requests lr
       LEFT JOIN leave_policies lp ON lp.id = lr.leave_type_id
       JOIN employees e ON e.id = lr.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE lr.tenant_id = $1 AND lr.status = 'pending'
    `;

    const params = [tenantId];

    // If manager, only show their team
    if (userRole === 'manager') {
      const empResult = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
      if (empResult.rows.length > 0) {
        queryStr += ` AND e.reporting_manager_id = $2`;
        params.push(empResult.rows[0].id);
      }
    }

    queryStr += ` ORDER BY lr.submitted_at DESC LIMIT 20`;

    const result = await query(queryStr, params);

    return {
      success: true,
      leave_requests: result.rows.map(row => ({
        id: row.id,
        employee: {
          employee_id: row.employee_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
        },
        leave_type: row.leave_type,
        start_date: row.start_date,
        end_date: row.end_date,
        total_days: row.total_days,
        reason: row.reason,
        status: row.status,
        submitted_at: row.submitted_at,
      })),
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error in listPendingLeaveRequests:', error);
    return { error: error.message };
  }
}

/**
 * Get timesheet information
 */
export async function getTimesheet(timesheetId, userId, tenantId) {
  try {
    const result = await query(
      `SELECT 
        t.id, t.week_start_date, t.week_end_date,
        t.total_hours, t.status, t.submitted_at,
        e.employee_id,
        p.first_name, p.last_name
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [timesheetId, tenantId]
    );

    if (result.rows.length === 0) {
      return { error: 'Timesheet not found' };
    }

    const timesheet = result.rows[0];

    // Get entries
    const entriesResult = await query(
      'SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
      [timesheetId]
    );

    return {
      success: true,
      timesheet: {
        id: timesheet.id,
        employee: {
          employee_id: timesheet.employee_id,
          name: `${timesheet.first_name} ${timesheet.last_name}`,
        },
        week_start_date: timesheet.week_start_date,
        week_end_date: timesheet.week_end_date,
        total_hours: timesheet.total_hours,
        status: timesheet.status,
        submitted_at: timesheet.submitted_at,
        entries: entriesResult.rows,
      }
    };
  } catch (error) {
    console.error('Error in getTimesheet:', error);
    return { error: error.message };
  }
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(userId, tenantId) {
  try {
    const [employees, leaveRequests, timesheets] = await Promise.all([
      query('SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND status = $2', [tenantId, 'active']),
      query(`SELECT COUNT(*) as count FROM leave_requests WHERE tenant_id = $1 AND status = $2`, [tenantId, 'pending']),
      query(`SELECT COUNT(*) as count FROM timesheets WHERE tenant_id = $1 AND status = $2`, [tenantId, 'pending']),
    ]);

    return {
      success: true,
      stats: {
        total_employees: parseInt(employees.rows[0].count),
        pending_leave_requests: parseInt(leaveRequests.rows[0].count),
        pending_timesheets: parseInt(timesheets.rows[0].count),
      }
    };
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    return { error: error.message };
  }
}

/**
 * Get leave policies
 */
export async function getLeavePolicies(tenantId) {
  try {
    const result = await query(
      `SELECT id, name, leave_type, annual_entitlement, 
       probation_entitlement, carry_forward_allowed, 
       max_carry_forward, is_active
       FROM leave_policies 
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY name`,
      [tenantId]
    );

    return {
      success: true,
      policies: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        leave_type: row.leave_type,
        annual_entitlement: row.annual_entitlement,
        probation_entitlement: row.probation_entitlement,
        carry_forward_allowed: row.carry_forward_allowed,
        max_carry_forward: row.max_carry_forward,
      })),
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error in getLeavePolicies:', error);
    return { error: error.message };
  }
}

/**
 * Function executor - routes function calls to appropriate handlers
 */
export async function executeFunction(functionName, args, userId, tenantId) {
  try {
    switch (functionName) {
      case 'get_employee_info':
        return await getEmployeeInfo(args.employee_id, userId, tenantId);
      
      case 'list_employees':
        return await listEmployees(args, userId, tenantId);
      
      case 'get_leave_request':
        return await getLeaveRequest(args.leave_request_id, userId, tenantId);
      
      case 'list_pending_leave_requests':
        return await listPendingLeaveRequests(userId, tenantId);
      
      case 'get_timesheet':
        return await getTimesheet(args.timesheet_id, userId, tenantId);
      
      case 'get_dashboard_stats':
        return await getDashboardStats(userId, tenantId);
      
      case 'get_leave_policies':
        return await getLeavePolicies(tenantId);
      
      case 'get_my_leave_requests':
        return await getMyLeaveRequests(userId, tenantId);
      
      case 'create_leave_request':
        return await createLeaveRequest(args, userId, tenantId);
      
      case 'list_workflows':
        return await listWorkflows(userId, tenantId);
      
      case 'get_workflow':
        return await getWorkflow(args.workflow_id, userId, tenantId);
      
      case 'create_workflow_from_natural_language':
        return await createWorkflowFromNaturalLanguage(args.description, args.name, userId, tenantId);
      
      case 'start_workflow':
        return await startWorkflowInstance(args.workflow_id, args.name, args.trigger_payload, userId, tenantId);
      
      case 'list_mini_apps':
        return await listMiniApps(userId, tenantId);
      
      case 'get_mini_app':
        return await getMiniApp(args.mini_app_id, userId, tenantId);
      
      case 'execute_mini_app':
        return await executeMiniAppFunction(args.mini_app_id, args.params || {}, userId, tenantId);
      
      default:
        // Check if it's a mini app function
        return await checkAndExecuteMiniApp(functionName, args, userId, tenantId);
    }
  } catch (error) {
    console.error(`Error executing function ${functionName}:`, error);
    return { error: error.message };
  }
}

/**
 * List workflows for organization
 */
export async function listWorkflows(userId, tenantId) {
  try {
    const result = await query(
      `SELECT id, name, description, status, created_at, updated_at
       FROM workflows
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId]
    );

    return {
      success: true,
      workflows: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error in listWorkflows:', error);
    return { error: error.message };
  }
}

/**
 * Get workflow details
 */
export async function getWorkflow(workflowId, userId, tenantId) {
  try {
    const result = await query(
      `SELECT id, name, description, workflow_json, status, created_at, updated_at
       FROM workflows
       WHERE id = $1 AND tenant_id = $2`,
      [workflowId, tenantId]
    );

    if (result.rows.length === 0) {
      return { error: 'Workflow not found' };
    }

    const workflow = result.rows[0];
    return {
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        workflow_json: typeof workflow.workflow_json === 'string' 
          ? JSON.parse(workflow.workflow_json) 
          : workflow.workflow_json,
        status: workflow.status,
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
      }
    };
  } catch (error) {
    console.error('Error in getWorkflow:', error);
    return { error: error.message };
  }
}

/**
 * Create workflow from natural language
 */
export async function createWorkflowFromNaturalLanguage(description, name, userId, tenantId) {
  try {
    const { generateWorkflowFromNaturalLanguage, validateWorkflow } = await import('../ai/workflow-generator.js');
    
    const workflowData = await generateWorkflowFromNaturalLanguage(description, tenantId);
    const validation = validateWorkflow(workflowData.workflow_json);
    
    if (!validation.valid) {
      return { error: validation.error };
    }

    const result = await query(
      `INSERT INTO workflows (tenant_id, name, description, workflow_json, status, created_by)
       VALUES ($1, $2, $3, $4::jsonb, 'draft', $5)
       RETURNING id, name, description, status`,
      [
        tenantId,
        name || workflowData.name,
        workflowData.description,
        JSON.stringify(workflowData.workflow_json),
        userId
      ]
    );

    return {
      success: true,
      workflow: result.rows[0],
      message: 'Workflow created successfully from natural language description'
    };
  } catch (error) {
    console.error('Error in createWorkflowFromNaturalLanguage:', error);
    return { error: error.message };
  }
}

/**
 * Start workflow instance
 */
export async function startWorkflowInstance(workflowId, name, triggerPayload, userId, tenantId) {
  try {
    const workflowRes = await query(
      'SELECT * FROM workflows WHERE id = $1 AND tenant_id = $2',
      [workflowId, tenantId]
    );

    if (workflowRes.rows.length === 0) {
      return { error: 'Workflow not found' };
    }

    const workflow = workflowRes.rows[0];
    const { startInstance } = await import('../../services/workflows.js');
    
    const instanceId = await startInstance({
      tenantId,
      userId,
      workflow: {
        ...workflow,
        workflow_json: typeof workflow.workflow_json === 'string' 
          ? JSON.parse(workflow.workflow_json) 
          : workflow.workflow_json
      },
      name,
      triggerPayload: triggerPayload || {}
    });

    return {
      success: true,
      instance_id: instanceId,
      message: 'Workflow instance started successfully'
    };
  } catch (error) {
    console.error('Error in startWorkflowInstance:', error);
    return { error: error.message };
  }
}

/**
 * Create leave request
 */
export async function createLeaveRequest(args, userId, tenantId) {
  try {
    const { leave_type, start_date, end_date, reason } = args;

    if (!leave_type || !start_date || !end_date) {
      return { error: 'leave_type, start_date, and end_date are required' };
    }

    // Get employee ID for current user
    const empResult = await query('SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    if (empResult.rows.length === 0) {
      return { error: 'Employee record not found for user' };
    }
    const employeeId = empResult.rows[0].id;

    // Find leave policy by name or type
    const leaveTypeMap = {
      'annual': 'Annual Leave',
      'sick': 'Sick Leave',
      'casual': 'Casual Leave',
      'maternity': 'Maternity Leave',
      'paternity': 'Paternity Leave',
      'bereavement': 'Bereavement Leave',
    };

    const leaveTypeName = leaveTypeMap[leave_type.toLowerCase()] || leave_type;
    
    const policyResult = await query(
      `SELECT id FROM leave_policies 
       WHERE tenant_id = $1 AND LOWER(name) LIKE LOWER($2) AND is_active = true
       LIMIT 1`,
      [tenantId, `%${leaveTypeName}%`]
    );

    if (policyResult.rows.length === 0) {
      return { error: `Leave policy not found for type: ${leave_type}` };
    }

    const leaveTypeId = policyResult.rows[0].id;

    // Calculate total days
    const start = new Date(start_date);
    const end = new Date(end_date);
    const timeDiff = end.getTime() - start.getTime();
    const totalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;

    if (totalDays <= 0) {
      return { error: 'End date must be after start date' };
    }

    // Create leave request
    const result = await query(
      `INSERT INTO leave_requests 
       (tenant_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, start_date, end_date, total_days, status, submitted_at`,
      [tenantId, employeeId, leaveTypeId, start_date, end_date, totalDays, reason || null]
    );

    const leaveRequest = result.rows[0];

    // Create approval workflow if needed
    try {
      const { create_approval } = await import('../../approval_flow.js');
      await create_approval('leave', leaveRequest.total_days, userId, leaveRequest.id);
    } catch (approvalError) {
      console.warn('Could not create approval workflow:', approvalError.message);
      // Continue even if approval creation fails
    }

    return {
      success: true,
      leave_request: {
        id: leaveRequest.id,
        leave_type: leave_type,
        start_date: leaveRequest.start_date,
        end_date: leaveRequest.end_date,
        total_days: leaveRequest.total_days,
        reason: reason || null,
        status: leaveRequest.status,
        submitted_at: leaveRequest.submitted_at,
      },
      message: 'Leave request created successfully and pending approval'
    };
  } catch (error) {
    console.error('Error in createLeaveRequest:', error);
    return { error: error.message };
  }
}

/**
 * List available mini apps
 */
export async function listMiniApps(userId, tenantId) {
  try {
    const { getAvailableMiniApps } = await import('./opal-integration.js');
    const miniApps = await getAvailableMiniApps(tenantId);

    return {
      success: true,
      mini_apps: miniApps,
      count: miniApps.length
    };
  } catch (error) {
    console.error('Error in listMiniApps:', error);
    return { error: error.message };
  }
}

/**
 * Get mini app details
 */
export async function getMiniApp(miniAppId, userId, tenantId) {
  try {
    const result = await query(
      `SELECT id, name, description, category, function_name, app_config, enabled
       FROM opal_mini_apps
       WHERE id = $1 AND tenant_id = $2 AND enabled = true`,
      [miniAppId, tenantId]
    );

    if (result.rows.length === 0) {
      return { error: 'Mini app not found' };
    }

    const miniApp = result.rows[0];
    return {
      success: true,
      mini_app: {
        id: miniApp.id,
        name: miniApp.name,
        description: miniApp.description,
        category: miniApp.category,
        function_name: miniApp.function_name,
        app_config: typeof miniApp.app_config === 'string'
          ? JSON.parse(miniApp.app_config)
          : miniApp.app_config,
      }
    };
  } catch (error) {
    console.error('Error in getMiniApp:', error);
    return { error: error.message };
  }
}

/**
 * Execute mini app
 */
export async function executeMiniAppFunction(miniAppId, params, userId, tenantId) {
  try {
    const { executeMiniApp } = await import('./opal-integration.js');
    return await executeMiniApp(miniAppId, params, userId, tenantId);
  } catch (error) {
    console.error('Error in executeMiniAppFunction:', error);
    return { error: error.message };
  }
}

/**
 * Check if function name matches a mini app and execute it
 */
export async function checkAndExecuteMiniApp(functionName, args, userId, tenantId) {
  try {
    // Check if there's a mini app with this function name
    const result = await query(
      `SELECT id FROM opal_mini_apps
       WHERE tenant_id = $1 AND function_name = $2 AND enabled = true
       LIMIT 1`,
      [tenantId, functionName]
    );

    if (result.rows.length > 0) {
      const { executeMiniApp } = await import('./opal-integration.js');
      return await executeMiniApp(result.rows[0].id, args, userId, tenantId);
    }

    return { error: `Unknown function: ${functionName}` };
  } catch (error) {
    console.error('Error checking mini app:', error);
    return { error: error.message };
  }
}

export default {
  getEmployeeInfo,
  listEmployees,
  getLeaveRequest,
  listPendingLeaveRequests,
  getTimesheet,
  getDashboardStats,
  getLeavePolicies,
  getMyLeaveRequests,
  listWorkflows,
  getWorkflow,
  createWorkflowFromNaturalLanguage,
  startWorkflowInstance,
  listMiniApps,
  getMiniApp,
  executeMiniAppFunction,
  executeFunction,
};

