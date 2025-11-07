import { query } from '../../db/pool.js';

/**
 * Get user context (employee info, role, etc.) for AI assistant
 * This ensures AI knows who the user is without asking
 */
export async function getUserContext(userId, tenantId) {
  try {
    // Get user profile and employee info
    const userResult = await query(
      `SELECT 
        p.id, p.email, p.first_name, p.last_name, p.phone,
        e.id as employee_id, e.employee_id as employee_code,
        e.department, e.position, e.status, e.work_location, e.join_date,
        ur.role
       FROM profiles p
       LEFT JOIN employees e ON e.user_id = p.id
       LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = $2
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [userId, tenantId]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const user = userResult.rows[0];
    
    // Get reporting manager info if employee
    let managerInfo = null;
    if (user.employee_id) {
      const managerResult = await query(
        `SELECT 
          e.id, e.employee_id, 
          p.first_name, p.last_name, p.email
         FROM employees e
         JOIN profiles p ON p.id = e.user_id
         WHERE e.id = $1`,
        [user.reporting_manager_id]
      );
      
      if (managerResult.rows.length > 0) {
        managerInfo = {
          name: `${managerResult.rows[0].first_name} ${managerResult.rows[0].last_name}`,
          email: managerResult.rows[0].email,
          employee_id: managerResult.rows[0].employee_id,
        };
      }
    }

    return {
      user_id: user.id,
      email: user.email,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role || 'employee',
      employee_id: user.employee_code || null,
      employee_uuid: user.employee_id || null,
      department: user.department || null,
      position: user.position || null,
      status: user.status || null,
      work_location: user.work_location || null,
      join_date: user.join_date || null,
      manager: managerInfo,
      is_employee: !!user.employee_id,
    };
  } catch (error) {
    console.error('Error getting user context:', error);
    return null;
  }
}

/**
 * Build user context message for AI
 */
export function buildUserContextMessage(userContext) {
  if (!userContext) return '';

  let context = `\n## Current User Context:\n`;
  context += `You are talking to: ${userContext.name} (${userContext.email})\n`;
  context += `Role: ${userContext.role}\n`;
  
  if (userContext.is_employee) {
    context += `Employee ID: ${userContext.employee_id}\n`;
    if (userContext.department) context += `Department: ${userContext.department}\n`;
    if (userContext.position) context += `Position: ${userContext.position}\n`;
    if (userContext.manager) {
      context += `Reporting Manager: ${userContext.manager.name} (${userContext.manager.email})\n`;
    }
  }
  
  context += `\nIMPORTANT RULES:\n`;
  context += `- NEVER ask for the user's name, email, or employee ID - you already know it\n`;
  context += `- When user says "my" or "I want to", they are referring to themselves (${userContext.name})\n`;
  context += `- When creating leave requests, use employee ID: ${userContext.employee_id || 'N/A'}\n`;
  context += `- When querying their own data, use employee UUID: ${userContext.employee_uuid || 'N/A'}\n`;
  context += `- All data is automatically scoped to their organization (tenant_id)\n`;
  context += `- Respect their role permissions (${userContext.role})\n`;
  
  return context;
}

export default {
  getUserContext,
  buildUserContextMessage,
};








