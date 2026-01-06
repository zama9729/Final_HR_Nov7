# RAG Service AI Fix

## Problem
The RAG service was returning 500 errors when processing queries. The error was:
```
'ToolRegistry' object has no attribute 'get_leave_balance'
```

## Root Cause
The `ToolRegistry` class in `rag-service/app/tools.py` was missing several methods that were being registered with the LLM service. The `register_tools` function was trying to register methods that didn't exist in the class.

## Fix Applied

### Added Missing Methods to ToolRegistry Class

1. **`get_leave_balance`** - Get leave balance for an employee
2. **`list_recent_paystubs`** - List recent paystubs for an employee
3. **`create_leave_request`** - Create a new leave request
4. **`approve_leave`** - Approve a leave request (manager/HR/CEO only)
5. **`summarize_policy`** - Summarize a policy document
6. **`get_my_leave_requests`** - List status of recent leave requests
7. **`get_pending_approvals`** - Show leave requests waiting for approval
8. **`get_dashboard_summary`** - Fetch key HR metrics
9. **`list_employees`** - Search employees by department, status, or name
10. **`get_employee_profile`** - Look up a specific employee's profile

### Additional Fixes

- Added `or_` import from `sqlalchemy` for the `list_employees` method
- Fixed `approve_leave` to use `approver_id` instead of `approved_by` (matching the model)

## Files Modified
- `rag-service/app/tools.py`

## Testing

1. The RAG service should now start without errors
2. Try sending a query through the HR Assistant chatbox
3. Verify that tool calls work correctly (e.g., "Check my leave balance")
4. Check RAG service logs for any remaining errors

## Expected Behavior

After the fix, the RAG service should:
- Start successfully without missing method errors
- Process queries without 500 errors
- Execute tool calls correctly (leave balance, employee search, etc.)
- Return proper responses with tool call results

## Next Steps

1. Test the HR Assistant chatbox with various queries
2. Verify tool calls are working (e.g., "What's my leave balance?")
3. Check RAG service logs if any issues persist

