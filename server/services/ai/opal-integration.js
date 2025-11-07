import { query } from '../../db/pool.js';

/**
 * Get available Opal mini apps for organization
 */
export async function getAvailableMiniApps(tenantId, category = null) {
  try {
    let sql = `
      SELECT id, name, description, category, function_name, app_config
      FROM opal_mini_apps
      WHERE tenant_id = $1 AND enabled = true
    `;
    const params = [tenantId];

    if (category) {
      sql += ` AND category = $2`;
      params.push(category);
    }

    sql += ` ORDER BY category, name`;

    const result = await query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      function_name: row.function_name,
      app_config: typeof row.app_config === 'string' 
        ? JSON.parse(row.app_config) 
        : row.app_config,
    }));
  } catch (error) {
    console.error('Error getting mini apps:', error);
    return [];
  }
}

/**
 * Execute an Opal mini app
 */
export async function executeMiniApp(miniAppId, params, userId, tenantId) {
  try {
    // Get mini app
    const result = await query(
      `SELECT id, name, function_name, app_config, opal_app_url, opal_app_id
       FROM opal_mini_apps
       WHERE id = $1 AND tenant_id = $2 AND enabled = true`,
      [miniAppId, tenantId]
    );

    if (result.rows.length === 0) {
      return { error: 'Mini app not found or disabled' };
    }

    const miniApp = result.rows[0];
    const appConfig = typeof miniApp.app_config === 'string'
      ? JSON.parse(miniApp.app_config)
      : miniApp.app_config;

    // If Opal app URL is provided, execute via Opal API
    if (miniApp.opal_app_url || miniApp.opal_app_id) {
      // Execute via Opal API
      return await executeViaOpalAPI(miniApp, params, userId, tenantId);
    }

    // Otherwise, execute locally using function mapping
    return await executeLocalMiniApp(miniApp, params, userId, tenantId);
  } catch (error) {
    console.error('Error executing mini app:', error);
    return { error: error.message };
  }
}

/**
 * Execute mini app via Opal API
 */
async function executeViaOpalAPI(miniApp, params, userId, tenantId) {
  try {
    // If you have Opal API credentials, use them here
    const opalApiKey = process.env.OPAL_API_KEY;
    const opalApiUrl = process.env.OPAL_API_URL || 'https://api.opal.ai';

    if (!opalApiKey) {
      return { error: 'Opal API not configured' };
    }

    const response = await fetch(`${opalApiUrl}/apps/${miniApp.opal_app_id}/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        params: params,
        context: {
          user_id: userId,
          tenant_id: tenantId,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Opal API error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, result: data };
  } catch (error) {
    console.error('Error executing via Opal API:', error);
    return { error: error.message };
  }
}

/**
 * Execute mini app locally using function mapping
 */
async function executeLocalMiniApp(miniApp, params, userId, tenantId) {
  try {
    const { executeFunction } = await import('./functions.js');

    // Map function_name to actual function call
    // Mini apps can reference existing functions or new custom logic
    const functionMap = {
      'quick_apply_leave': async (args) => {
        // Create leave request directly using the create_leave_request function
        const { createLeaveRequest } = await import('./functions.js');
        return await createLeaveRequest(args, userId, tenantId);
      },
      'lookup_employee_info': async (args) => {
        if (args.employee_id) {
          return await executeFunction('get_employee_info', { employee_id: args.employee_id }, userId, tenantId);
        }
        return await executeFunction('list_employees', {}, userId, tenantId);
      },
      'check_timesheet_status': async (args) => {
        if (args.timesheet_id) {
          return await executeFunction('get_timesheet', { timesheet_id: args.timesheet_id }, userId, tenantId);
        }
        // Get user's timesheets
        const empResult = await query('SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
        if (empResult.rows.length === 0) {
          return { error: 'Employee record not found' };
        }
        return await executeFunction('get_my_leave_requests', {}, userId, tenantId); // Similar pattern
      },
      'view_pending_approvals': async (args) => {
        return await executeFunction('list_pending_leave_requests', {}, userId, tenantId);
      },
      'check_leave_balance': async (args) => {
        return await executeFunction('get_leave_policies', {}, userId, tenantId);
      },
      'view_team_calendar': async (args) => {
        // Return calendar data - would need to implement this
        return { success: true, message: 'Calendar view functionality', params: args };
      },
      'get_performance_summary': async (args) => {
        return { success: true, message: 'Performance summary functionality', params: args };
      },
      'track_workflow_status': async (args) => {
        if (args.workflow_id) {
          return await executeFunction('get_workflow', { workflow_id: args.workflow_id }, userId, tenantId);
        }
        return { error: 'workflow_id is required' };
      },
    };

    const handler = functionMap[miniApp.function_name];
    
    if (handler) {
      const result = await handler(params);
      return {
        success: true,
        mini_app_name: miniApp.name,
        result: result,
      };
    }

    // Fallback: try to execute as a direct function name
    const result = await executeFunction(miniApp.function_name, params, userId, tenantId);

    return {
      success: true,
      mini_app_name: miniApp.name,
      result: result,
    };
  } catch (error) {
    console.error('Error executing local mini app:', error);
    return { error: error.message };
  }
}

export default {
  getAvailableMiniApps,
  executeMiniApp,
};

