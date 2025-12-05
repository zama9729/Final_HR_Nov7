import { query } from '../db/pool.js';

export async function ensureManagerRoles() {
  try {
    // Promote employees who have direct reports to manager role when they only have employee role
    await query(`
      WITH mgrs AS (
        SELECT DISTINCT e.reporting_manager_id AS manager_id, e.tenant_id AS org_id
        FROM employees e
        WHERE e.reporting_manager_id IS NOT NULL
          AND e.tenant_id IS NOT NULL
      )
      UPDATE user_roles ur
      SET role = 'manager'
      FROM mgrs
      JOIN profiles p ON p.id = ur.user_id
      JOIN employees m ON m.user_id = p.id AND m.id = mgrs.manager_id
      WHERE ur.tenant_id = mgrs.org_id
        AND ur.role = 'employee';
    `);

    // Ensure any manager without a user_roles row gets one
    await query(`
      INSERT INTO user_roles (user_id, role, tenant_id)
      SELECT DISTINCT p.id, 'manager', e.tenant_id
      FROM employees e
      JOIN employees m ON m.id = e.reporting_manager_id
      JOIN profiles p ON p.id = m.user_id
      LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.tenant_id = e.tenant_id
      WHERE e.reporting_manager_id IS NOT NULL
        AND e.tenant_id IS NOT NULL
        AND ur.id IS NULL;
    `);

    console.log('✅ ensureManagerRoles: updated manager roles based on reporting lines');
  } catch (error) {
    console.error('ensureManagerRoles error:', error);
  }
}



