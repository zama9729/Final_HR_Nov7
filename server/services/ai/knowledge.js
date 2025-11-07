/**
 * HR System Knowledge Base
 * This file contains training data and context for the AI assistant
 */

export const HR_SYSTEM_CONTEXT = `
# Petal HR Suite - System Knowledge Base

## System Overview
Petal HR Suite is a comprehensive Human Resources Management System that handles:
- Employee Management
- Leave Management
- Timesheet Tracking
- Performance Reviews
- Shift Management
- Project Management
- Skills Management
- Workflow Automation

## User Roles & Permissions

### Role Hierarchy
1. **CEO** - Full access to all features
2. **Director** - Full access to all features
3. **HR** - Full access to HR operations, can create/manage employees
4. **Manager** - Can manage team, approve leaves/timesheets, conduct reviews
5. **Employee** - Can view own data, submit leaves/timesheets, view reviews

### Role Capabilities

**Employee:**
- View own profile and dashboard
- Submit leave requests
- Create and submit timesheets
- View own performance reviews
- View organization chart
- Access AI assistant

**Manager:**
- All employee capabilities
- View team members
- Approve/reject leave requests (team)
- Approve/reject timesheets (team)
- Conduct performance reviews for team
- View team analytics

**HR/CEO/Director:**
- All manager capabilities
- Create/manage employees
- Manage leave policies
- Manage holidays
- Create projects
- Manage shifts
- View analytics and reports
- Access admin features

## Leave Management

### Leave Request Flow
1. Employee submits leave request
2. System checks leave balance
3. If days > 10: Requires Manager → HR approval
4. If days ≤ 10: Requires only Manager approval
5. Employee receives notification

### Leave Types
- Annual Leave
- Sick Leave
- Casual Leave
- Maternity Leave
- Paternity Leave
- Bereavement Leave

### Leave Approval Thresholds
- Default threshold: 10 days
- Leaves > 10 days: Two-stage approval (Manager + HR)
- Leaves ≤ 10 days: Single-stage approval (Manager only)
- Thresholds configurable per tenant

## Timesheet Management

### Timesheet Submission Flow
1. Employee enters hours for the week
2. Employee submits timesheet
3. Manager reviews and approves/rejects
4. Employee receives notification

### Timesheet Features
- Weekly timesheet entry
- Holiday integration (auto-populated)
- Approval workflow
- Hours tracking per day

## Performance Management

### Appraisal Process
1. HR creates appraisal cycle
2. Manager conducts performance review
3. Employee acknowledges review
4. Review stored for future reference

### Review Components
- Rating (1-5 scale)
- Performance Score (0-5 scale)
- Strengths
- Areas for Improvement
- Goals
- Comments

## Employee Management

### Employee Creation (HR Only)
1. Enter employee details:
   - Email, Name, Employee ID
   - Department, Position
   - Reporting Manager
   - Work Location
2. System generates temporary password
3. Employee receives email for first-time login
4. Employee completes onboarding

### Onboarding Process
1. First-time login
2. Password setup
3. Multi-step onboarding form:
   - Step 1: Emergency contact information
   - Step 2: Address and bank details
   - Step 3: PAN and Aadhar details
4. Onboarding completion
5. Access to full system

## Shift Management

### Shift Creation (HR/Manager)
- Select employee
- Choose date and time
- Set shift type (morning/afternoon/night/regular)
- Add notes
- Notify employee

### Roster Generation
- AI-powered roster generation available
- Considers employee availability
- Fair distribution of shifts
- Work-life balance considerations

## Project Management

### Project Features
- Create projects with required skills
- AI-powered candidate suggestions
- Employee assignment
- Calendar view
- Skills matching

## Common Tasks & Queries

### Employees Often Ask:
- "How do I request leave?"
- "What's my leave balance?"
- "How do I submit a timesheet?"
- "Who is my manager?"
- "When is my next review?"
- "What holidays are coming up?"

### Managers Often Ask:
- "Show me pending leave requests"
- "Who is on my team?"
- "What are my team's timesheets?"
- "How do I approve a leave request?"

### HR Often Asks:
- "Show me all employees"
- "Create a new employee"
- "What are the pending approvals?"
- "Show me analytics"
- "Generate a roster"

## Natural Language Commands

The AI assistant understands natural language commands like:
- "Show me all employees"
- "List pending leave requests"
- "What's my leave balance?"
- "Approve leave request #123"
- "Create a shift for John on Monday"
- "Who's on my team?"
- "Show me dashboard statistics"

## System Limitations & Notes

- All actions require appropriate role permissions
- Data is tenant-isolated (multi-tenant system)
- Leave approvals follow configured thresholds
- Timesheets are weekly-based
- Performance reviews are cycle-based

## Error Handling

Common errors:
- "Employee not found" - Check employee ID
- "Insufficient permissions" - Check user role
- "Leave balance insufficient" - Check leave policy
- "Invalid dates" - Ensure valid date range
- "Already approved" - Request already processed

## API Endpoints Reference

Key endpoints:
- GET /api/employees - List employees
- POST /api/leave-requests - Create leave request
- GET /api/leave-requests - List leave requests
- POST /api/timesheets - Create timesheet
- GET /api/timesheets - List timesheets
- GET /api/stats - Dashboard statistics

## Best Practices

1. Always verify user permissions before actions
2. Check leave balance before approving
3. Validate date ranges for leaves/timesheets
4. Provide clear error messages
5. Log important actions for audit
6. Maintain data privacy and security
`;

/**
 * Get system context for AI training
 */
export function getSystemContext() {
  return HR_SYSTEM_CONTEXT;
}

/**
 * Get role-specific context
 */
export function getRoleContext(role) {
  // Add leave application instructions for all roles
  const roleContexts = {
    employee: `
You are helping an employee. They can:
- View their own data
- Submit leave requests
- Create timesheets
- View their performance reviews

Common employee questions:
- Leave requests and balances
- Timesheet submission
- Personal information
- Upcoming reviews
`,
    manager: `
You are helping a manager. They can:
- All employee capabilities
- View and manage their team
- Approve/reject leave requests for team
- Approve/reject timesheets for team
- Conduct performance reviews

Common manager tasks:
- Team management
- Approval workflows
- Performance reviews
- Team analytics
`,
    hr: `
You are helping an HR professional. They have full access to:
- Employee management
- Leave policies
- Shift management
- Project management
- Analytics and reporting

Common HR tasks:
- Employee creation and management
- Policy management
- Approval oversight
- System administration
`,
  };

  return roleContexts[role] || roleContexts.employee;
}

export default {
  getSystemContext,
  getRoleContext,
};

