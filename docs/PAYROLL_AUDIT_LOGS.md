# Payroll Audit Logs

## Overview

The Payroll Audit Logs feature provides a comprehensive audit trail of all payroll-related activities in the system. This feature ensures transparency, accountability, and compliance by tracking every significant action performed on payroll data.

## Access Control

### Authorized Roles

The Audit Logs tab is **ONLY** visible to users with the following roles:

- **CEO** - Full access to all audit logs
- **HR** - Full access to all audit logs
- **Accountant** - Full access to all audit logs

Users with other roles (e.g., `payroll_employee`, `manager`) will not see the Audit Logs tab in the Payroll page.

### Role Verification

The system checks both:
- `hr_role` - Role from the HR system
- `payroll_role` - Role from the Payroll system

If either role matches one of the authorized roles, access is granted.

## Tracked Events

The following payroll-related events are captured in the audit logs:

### Payroll Runs
- **`payroll_run_created`** - When a new payroll run is created
- **`payroll_run_processed`** - When a payroll run is processed/completed

### Payroll Adjustments
- **`payroll_run_adjustment_created`** - When an adjustment is added to a payroll run
- **`payroll_run_adjustment_updated`** - When an existing adjustment is modified
- **`payroll_run_adjustment_deleted`** - When an adjustment is removed from a payroll run

### Payroll Cycles
- **`payroll_cycle_created`** - When a new payroll cycle is created
- **`payroll_cycle_processed`** - When a payroll cycle is processed

### Reimbursement Runs
- **`reimbursement_run_created`** - When a new reimbursement run is created
- **`reimbursement_run_processed`** - When a reimbursement run is processed

## Audit Log Structure

Each audit log entry contains the following information:

### Core Fields
- **ID** - Unique identifier for the log entry
- **Date/Time** - Timestamp when the action occurred (formatted as `DD MMM YYYY HH:mm`)
- **Actor** - The user who performed the action
  - Name (first name + last name, or email if name not available)
  - Role badge (CEO, HR, ACCOUNTANT, etc.)
- **Action** - The type of action performed (e.g., "Created Run", "Modified Adjustment")
- **Entity Type** - The type of entity affected (e.g., `payroll_run`, `payroll_run_adjustment`)
- **Entity ID** - The unique identifier of the affected entity

### Additional Fields
- **Reason** - Optional reason provided for the action (required for certain override actions)
- **Details** - Additional context about the action (JSON object)
- **Diff** - Before/After values showing what changed (JSON object)
- **Scope** - The scope of the action (e.g., 'org', 'dept', 'team')

## Reading JSON Diffs

### Viewing Details

Click the **"View Details"** button in any audit log row to see the complete information, including:

1. **Action** - The formatted action name
2. **Actor** - Full name and role of the person who performed the action
3. **Entity Type** - The type of entity that was affected
4. **Reason** - Any reason provided for the action
5. **Details / Diff** - The complete JSON showing:
   - **Before values** - The state before the change
   - **After values** - The state after the change
   - **Additional metadata** - Any other relevant information

### Understanding Diff Structure

The `diff` field contains a JSON object with the following structure:

```json
{
  "before": {
    "field1": "old_value",
    "field2": 100
  },
  "after": {
    "field1": "new_value",
    "field2": 200
  }
}
```

**Example: Payroll Adjustment Update**

```json
{
  "before": {
    "amount_cents": 50000,
    "description": "Bonus",
    "is_taxable": true
  },
  "after": {
    "amount_cents": 75000,
    "description": "Performance Bonus",
    "is_taxable": true
  }
}
```

This shows that:
- The adjustment amount was increased from ₹500.00 to ₹750.00
- The description was updated from "Bonus" to "Performance Bonus"
- The taxable status remained unchanged

### Pretty-Printed JSON

The JSON in the "View Details" popover is automatically formatted (pretty-printed) for readability:
- Proper indentation
- Syntax highlighting
- Scrollable view for long JSON objects

## API Endpoints

### Backend Endpoint

**GET** `/api/audit-logs`

**Query Parameters:**
- `entity_type` - Filter by entity type(s). Supports comma-separated values (e.g., `payroll_run,payroll_run_adjustment`)
- `limit` - Maximum number of results (default: 100, max: 500)
- `action` - Filter by specific action
- `from` - Start date (ISO format)
- `to` - End date (ISO format)
- `actor_id` - Filter by actor ID
- `entity_id` - Filter by entity ID

**Example Request:**
```
GET /api/audit-logs?entity_type=payroll_run,payroll_run_adjustment&limit=50
```

**Response:**
```json
[
  {
    "id": "uuid",
    "actor": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    "actor_role": "hr",
    "action": "payroll_run_adjustment_created",
    "entity_type": "payroll_run_adjustment",
    "entity_id": "uuid",
    "reason": null,
    "details": {},
    "diff": {
      "before": {},
      "after": { "amount_cents": 50000 }
    },
    "scope": null,
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

## Frontend Implementation

### Component Location

`payroll-app/src/components/payroll/PayrollAuditLogs.tsx`

### Features

1. **Table View** - Dense, scrollable table showing all audit logs
2. **Real-time Updates** - Uses React Query for automatic data fetching and caching
3. **Details Popover** - Click "View Details" to see full JSON diff
4. **Role Badges** - Visual indicators for actor roles
5. **Formatted Dates** - Human-readable date/time format
6. **Action Formatting** - Converts technical action names to readable text

### Integration

The Audit Logs tab is integrated into the Payroll page (`payroll-app/src/pages/Payroll.tsx`) and is conditionally rendered based on user role.

## Security Considerations

1. **Role-Based Access** - Only authorized roles can view audit logs
2. **Backend Validation** - The backend endpoint (`/api/audit-logs`) also enforces role-based access using `requireRole('ceo', 'hr', 'admin', 'accountant')`
3. **Tenant Isolation** - Audit logs are automatically filtered by tenant ID to ensure data isolation
4. **Immutable Logs** - Audit logs are never modified or deleted, ensuring a complete audit trail

## Best Practices

1. **Regular Review** - Review audit logs regularly to detect unauthorized activities
2. **Monitor Adjustments** - Pay special attention to payroll adjustments, as these directly affect employee pay
3. **Check Reasons** - For actions that require a reason, verify that appropriate justifications are provided
4. **Investigate Anomalies** - Investigate any unusual patterns or high-frequency changes
5. **Export for Compliance** - Consider exporting audit logs for compliance and record-keeping purposes

## Troubleshooting

### Audit Logs Not Showing

1. **Check Role** - Verify that your user has one of the authorized roles (CEO, HR, or Accountant)
2. **Check Backend** - Ensure the backend endpoint is accessible and returning data
3. **Check Filters** - Verify that the entity type filter includes the events you're looking for
4. **Check Date Range** - Ensure the date range includes the time period you're interested in

### Missing Events

If certain events are not appearing in the audit logs:

1. **Verify Event Logging** - Ensure that the action is being logged using the `audit()` function from `server/utils/auditLog.js`
2. **Check Entity Types** - Verify that the entity type matches the filter criteria
3. **Check Tenant** - Ensure you're viewing logs for the correct tenant

## Future Enhancements

Potential improvements for the audit logs feature:

1. **Advanced Filtering** - Add more filter options (date range picker, actor filter, etc.)
2. **Export Functionality** - Allow exporting audit logs to CSV or PDF
3. **Search** - Add full-text search across audit log entries
4. **Pagination** - Implement pagination for large result sets
5. **Real-time Updates** - Add WebSocket support for real-time audit log updates
6. **Alerts** - Configure alerts for specific high-risk actions

