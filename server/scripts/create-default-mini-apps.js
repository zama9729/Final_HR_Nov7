/**
 * Script to create default Opal mini apps based on HR system functionalities
 * Run this to populate initial mini apps
 */

import { query } from '../db/pool.js';
import { createPool } from '../db/pool.js';

const DEFAULT_MINI_APPS = [
  {
    name: 'Quick Leave Application',
    description: 'Apply for leave quickly using natural language',
    category: 'leave',
    function_name: 'quick_apply_leave',
    app_config: {
      parameters: {
        leave_type: { type: 'string', description: 'Type of leave (annual, sick, casual)' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        reason: { type: 'string', description: 'Reason for leave' },
      },
      required: ['leave_type', 'start_date', 'end_date'],
    },
  },
  {
    name: 'Employee Information Lookup',
    description: 'Get employee information by name or ID',
    category: 'employee',
    function_name: 'lookup_employee_info',
    app_config: {
      parameters: {
        employee_id: { type: 'string', description: 'Employee ID or name to search' },
      },
      required: ['employee_id'],
    },
  },
  {
    name: 'Timesheet Status Check',
    description: 'Check timesheet status and details',
    category: 'timesheet',
    function_name: 'check_timesheet_status',
    app_config: {
      parameters: {
        timesheet_id: { type: 'string', description: 'Timesheet ID (optional, defaults to current user)' },
        date: { type: 'string', description: 'Date to check (YYYY-MM-DD, optional)' },
      },
      required: [],
    },
  },
  {
    name: 'Pending Approvals Dashboard',
    description: 'View all pending approvals for manager/HR',
    category: 'approval',
    function_name: 'view_pending_approvals',
    app_config: {
      parameters: {
        type: { type: 'string', description: 'Filter by type (leave, timesheet, expense)' },
      },
      required: [],
    },
  },
  {
    name: 'Leave Balance Checker',
    description: 'Check available leave balance',
    category: 'leave',
    function_name: 'check_leave_balance',
    app_config: {
      parameters: {
        leave_type: { type: 'string', description: 'Type of leave to check (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'Team Calendar View',
    description: 'View team calendar and upcoming events',
    category: 'calendar',
    function_name: 'view_team_calendar',
    app_config: {
      parameters: {
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD, optional)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD, optional)' },
      },
      required: [],
    },
  },
  {
    name: 'Employee Performance Summary',
    description: 'Get performance review summary for an employee',
    category: 'performance',
    function_name: 'get_performance_summary',
    app_config: {
      parameters: {
        employee_id: { type: 'string', description: 'Employee ID (optional, defaults to current user)' },
      },
      required: [],
    },
  },
  {
    name: 'Workflow Status Tracker',
    description: 'Track workflow instance status',
    category: 'workflow',
    function_name: 'track_workflow_status',
    app_config: {
      parameters: {
        workflow_id: { type: 'string', description: 'Workflow ID' },
        instance_id: { type: 'string', description: 'Workflow instance ID (optional)' },
      },
      required: ['workflow_id'],
    },
  },
];

async function createDefaultMiniApps(tenantId, userId) {
  console.log(`Creating default mini apps for tenant: ${tenantId}`);

  for (const app of DEFAULT_MINI_APPS) {
    try {
      const result = await query(
        `INSERT INTO opal_mini_apps 
         (tenant_id, name, description, category, function_name, app_config, enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, $7)
         ON CONFLICT DO NOTHING
         RETURNING id, name`,
        [
          tenantId,
          app.name,
          app.description,
          app.category,
          app.function_name,
          JSON.stringify(app.app_config),
          userId
        ]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Created mini app: ${result.rows[0].name}`);
      } else {
        console.log(`⏭️  Mini app already exists: ${app.name}`);
      }
    } catch (error) {
      console.error(`❌ Error creating mini app ${app.name}:`, error.message);
    }
  }
}

// Run for all organizations
async function main() {
  await createPool();
  console.log('✅ Database connection established');

  // Get all organizations
  const orgsResult = await query('SELECT id FROM organizations');
  const adminUserResult = await query('SELECT id FROM profiles ORDER BY created_at LIMIT 1');

  if (adminUserResult.rows.length === 0) {
    console.log('⚠️  No users found. Please create a user first.');
    process.exit(1);
  }

  const userId = adminUserResult.rows[0].id;

  if (orgsResult.rows.length === 0) {
    console.log('⚠️  No organizations found.');
    process.exit(1);
  }

  for (const org of orgsResult.rows) {
    await createDefaultMiniApps(org.id, userId);
  }

  console.log('✅ Default mini apps creation complete!');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});








