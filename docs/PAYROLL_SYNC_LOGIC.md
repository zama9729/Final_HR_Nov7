# Payroll Synchronization Logic Documentation

## Overview

This document explains the "Live Recalculation" system that ensures payroll data remains synchronized across all views (Review Dialog, Bank Export, Payment History) immediately after adjustments are made.

## Problem Statement

Previously, when adjustments were added/edited/deleted in the Payroll Review Dialog, the changes would not immediately reflect in:
- Export Bank File
- Payment History totals
- Dashboard summaries

This required a full re-process to see updated amounts, causing data inconsistency and user confusion.

## Solution: Live Recalculation

The system now implements **instant recalculation** after every adjustment operation, ensuring that:
1. **Database values are always up-to-date** - `payroll_run_employees.net_pay_cents` and `payroll_runs.total_amount_cents` are immediately updated
2. **All views show matching data** - Review Dialog, Bank Export, and Payment History all read from the same updated database values
3. **No re-processing required** - Changes are reflected instantly without manual intervention

## Architecture

### Phase 1: Backend - Live Recalculation

#### Helper Function: `recalculateEmployeePay(runId, employeeId)`

**Location:** `server/routes/payroll.js`

**Purpose:** Recalculates an employee's net pay and updates the payroll run total after adjustments are made.

**Algorithm:**
1. **Fetch Base Values:**
   - Retrieves current `gross_pay_cents`, `deductions_cents`, and `net_pay_cents` from `payroll_run_employees`
   - These are the base values calculated during initial payroll processing

2. **Fetch All Adjustments:**
   - Queries `payroll_run_adjustments` for all adjustments for this employee and run
   - Separates adjustments into:
     - **Taxable adjustments**: Affect gross pay (e.g., bonuses, overtime)
     - **Non-taxable adjustments**: Added directly to net pay (e.g., reimbursements, allowances)

3. **Calculate New Net Pay:**
   ```
   Adjusted Gross = Base Gross + Sum(Taxable Adjustments)
   New Net Pay = Adjusted Gross - Base Deductions + Sum(Non-Taxable Adjustments)
   ```

4. **Update Employee Record:**
   - Updates `payroll_run_employees.net_pay_cents` with the new calculated value
   - Ensures net pay is never negative (safety check: `Math.max(0, newNetPayCents)`)

5. **Update Run Total:**
   - Sums all `net_pay_cents` from all employees in the run (excluding excluded employees)
   - Updates `payroll_runs.total_amount_cents` with the new total

**Key Features:**
- **Atomic Updates**: Both employee and run totals are updated in the same transaction
- **Safety Checks**: Prevents negative net pay values
- **Logging**: Logs recalculation details for debugging and audit

#### Integration Points

The `recalculateEmployeePay` function is called immediately after:

1. **POST `/runs/:id/adjustments`** (Create Adjustment)
   - After successful insertion
   - Before returning response to client

2. **PUT `/adjustments/:id`** (Update Adjustment)
   - After successful update
   - Before returning response to client

3. **DELETE `/adjustments/:id`** (Delete Adjustment)
   - After successful deletion
   - Before returning response to client

**Critical:** The recalculation happens **synchronously** (using `await`), ensuring the database is updated before the API response is sent. This guarantees that the very next API call will receive fresh, accurate data.

### Phase 2: Backend - Export Consistency

#### Bank Export Endpoint

**Location:** `payroll-app/server/src/routes/app.ts` (for `payroll_cycles` system)
**Alternative:** `server/routes/payroll.js` (for `payroll_runs` system)

**Constraint:** The export endpoint **MUST NOT** perform its own calculations. It must strictly read stored values from the database.

**Implementation:**
```sql
SELECT 
  net_pay_cents  -- Directly from payroll_run_employees table
FROM payroll_run_employees
WHERE payroll_run_id = $1
```

**Why This Works:**
- Since `recalculateEmployeePay` updates `net_pay_cents` immediately after adjustments
- The export endpoint reads the already-updated value
- No calculation needed = No "off-by-one" errors
- Guaranteed consistency with Review Dialog

**Column Headers:**
The export file column headers remain unchanged:
- Employee Code
- Employee Name
- Bank Account Number
- IFSC Code
- Bank Name
- Net Salary (from `net_pay_cents` / 100)
- Payment Date

### Phase 3: Frontend - Reactive Updates

#### PayrollReviewDialog Component

**Location:** `payroll-app/src/components/payroll/PayrollReviewDialog.tsx`

**Query Invalidation Strategy:**

After any mutation that affects payroll amounts (incentive, save changes, process), the component invalidates two query keys:

1. **`['payroll-preview', cycleId]`**
   - Updates the Review Dialog totals immediately
   - Refreshes the employee list with new net pay values
   - Ensures UI matches database state

2. **`['payroll-cycles']`**
   - Updates the Payment History list in the background
   - Refreshes the total amount displayed in PayrollCycleList
   - Ensures dashboard summaries are accurate

**Implementation:**
```typescript
// After successful mutation
await queryClient.invalidateQueries({ queryKey: ["payroll-preview", cycleId] });
await queryClient.invalidateQueries({ queryKey: ["payroll-cycles"] });
await refetch(); // Optional: immediate refetch for current view
```

**Operations That Trigger Invalidation:**
- Saving incentive amounts
- Saving payroll changes
- Processing payroll

#### PayrollCycleList Component

**Location:** `payroll-app/src/components/payroll/PayrollCycleList.tsx`

**Display Logic:**
- Displays `cycle.total_amount` directly from API response
- No client-side calculations
- Value is automatically updated when `['payroll-cycles']` query is invalidated

**Format:**
```typescript
₹{(cycle.total_amount || 0).toLocaleString('en-IN', { 
  minimumFractionDigits: 2, 
  maximumFractionDigits: 2 
})}
```

## Data Flow

### Scenario: User Adds an Adjustment

1. **User Action:** Admin adds a ₹5,000 bonus adjustment for Employee A
2. **Frontend:** Sends `POST /runs/:id/adjustments` with adjustment data
3. **Backend:**
   - Inserts adjustment into `payroll_run_adjustments` table
   - Calls `recalculateEmployeePay(runId, employeeId)`
   - Updates `payroll_run_employees.net_pay_cents` (e.g., 45,000 → 50,000)
   - Updates `payroll_runs.total_amount_cents` (e.g., 500,000 → 505,000)
   - Returns success response
4. **Frontend:**
   - Receives success response
   - Invalidates `['payroll-preview', cycleId]` query
   - Invalidates `['payroll-cycles']` query
   - UI automatically refreshes with new values
5. **Result:**
   - Review Dialog shows updated net pay: ₹50,000
   - Bank Export shows updated net pay: ₹50,000
   - Payment History shows updated total: ₹505,000
   - **All values match perfectly**

## Formula Details

### Adjustment Calculation

**Taxable Adjustments:**
- Added to gross pay before deductions
- Example: ₹5,000 bonus → Gross increases by ₹5,000 → Net increases by ₹5,000 (assuming no tax impact)

**Non-Taxable Adjustments:**
- Added directly to net pay after deductions
- Example: ₹2,000 reimbursement → Net increases by ₹2,000

**Combined Formula:**
```
Base Gross Pay = (from payroll_run_employees.gross_pay_cents)
Base Deductions = (from payroll_run_employees.deductions_cents)

Taxable Adjustments = Sum(adjustments where is_taxable = true)
Non-Taxable Adjustments = Sum(adjustments where is_taxable = false)

Adjusted Gross = Base Gross + Taxable Adjustments
New Net Pay = Adjusted Gross - Base Deductions + Non-Taxable Adjustments
```

### Run Total Calculation

```
Run Total = Sum(net_pay_cents) for all employees in run
WHERE status != 'excluded'
```

## Safety Measures

1. **Negative Net Pay Prevention:**
   - If calculated net pay is negative, it's set to 0
   - Warning is logged for audit purposes
   - Prevents invalid database values

2. **Transaction Safety:**
   - Employee and run updates happen in sequence
   - If recalculation fails, adjustment operation is rolled back
   - Ensures data consistency

3. **Error Handling:**
   - Recalculation errors are logged
   - API returns error response
   - Frontend shows error message to user
   - Database remains in consistent state

## Performance Considerations

1. **Efficient Queries:**
   - Single query to fetch all adjustments for an employee
   - Single query to sum all employee net pays
   - Minimal database round trips

2. **Index Usage:**
   - `payroll_run_adjustments` has indexes on `payroll_run_id` and `employee_id`
   - `payroll_run_employees` has indexes on `payroll_run_id` and `employee_id`
   - Queries are optimized for fast lookups

3. **Caching:**
   - Frontend uses React Query for intelligent caching
   - Invalidations trigger refetches only when needed
   - Reduces unnecessary API calls

## Testing Scenarios

### Test Case 1: Add Taxable Adjustment
1. Employee has base net pay: ₹45,000
2. Add taxable bonus: ₹5,000
3. Expected: Net pay becomes ₹50,000
4. Verify: Review Dialog, Export, History all show ₹50,000

### Test Case 2: Add Non-Taxable Adjustment
1. Employee has base net pay: ₹45,000
2. Add non-taxable reimbursement: ₹2,000
3. Expected: Net pay becomes ₹47,000
4. Verify: All views show ₹47,000

### Test Case 3: Edit Adjustment
1. Employee has adjustment: ₹5,000 bonus
2. Edit to: ₹7,000 bonus
3. Expected: Net pay increases by ₹2,000
4. Verify: All views reflect new amount

### Test Case 4: Delete Adjustment
1. Employee has adjustment: ₹5,000 bonus
2. Delete adjustment
3. Expected: Net pay decreases by ₹5,000
4. Verify: All views reflect original amount

### Test Case 5: Multiple Adjustments
1. Employee has: ₹5,000 taxable + ₹2,000 non-taxable
2. Expected: Net pay = Base + ₹5,000 + ₹2,000
3. Verify: All views show correct total

## Troubleshooting

### Issue: Export shows different amount than Review Dialog

**Possible Causes:**
1. Export endpoint is calculating instead of reading stored values
2. Recalculation didn't run after adjustment
3. Query cache not invalidated

**Solution:**
1. Verify export endpoint reads `net_pay_cents` directly
2. Check backend logs for recalculation execution
3. Clear React Query cache and refresh

### Issue: Total amount doesn't update in Payment History

**Possible Causes:**
1. Query invalidation not triggered
2. API response doesn't include updated `total_amount_cents`
3. Frontend not reading correct field

**Solution:**
1. Check browser console for query invalidation logs
2. Verify API response includes `total_amount_cents`
3. Ensure PayrollCycleList reads `cycle.total_amount` (or `cycle.total_amount_cents / 100`)

### Issue: Negative net pay after adjustment

**Possible Causes:**
1. Large deduction adjustment exceeds gross pay
2. Recalculation logic error

**Solution:**
1. System automatically sets to 0 (safety check)
2. Review adjustment amounts
3. Check backend logs for warning messages

## Future Enhancements

1. **Real-time Updates:** WebSocket support for instant UI updates without query invalidation
2. **Adjustment History:** Track all adjustment changes with timestamps
3. **Bulk Adjustments:** Support adding adjustments for multiple employees at once
4. **Adjustment Templates:** Pre-defined adjustment types (bonus, deduction, etc.)
5. **Audit Trail:** Detailed log of all recalculation operations

## Conclusion

The Live Recalculation system ensures that payroll data remains synchronized across all views instantly after adjustments are made. By updating database values immediately and invalidating frontend queries, the system guarantees that:

- ✅ Review Dialog shows accurate totals
- ✅ Bank Export file matches Review Dialog exactly
- ✅ Payment History displays correct run totals
- ✅ No manual re-processing required
- ✅ No "off-by-one" calculation errors

This creates a seamless, reliable payroll management experience for administrators.

