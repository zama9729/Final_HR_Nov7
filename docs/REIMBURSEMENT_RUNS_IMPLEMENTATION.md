# Reimbursement Runs Implementation

## Overview

This document describes the refactoring of the Reimbursement Module to operate independently of monthly Payroll. Previously, reimbursements were automatically included in payroll runs. Now, they are processed in separate `reimbursement_runs`.

## Business Rationale

**Before:** Reimbursements were automatically added to monthly payroll, making it difficult to:
- Process expense reimbursements on different schedules
- Track expense payouts separately from salary
- Handle urgent expense reimbursements without waiting for payroll cycle

**After:** Reimbursements are processed in dedicated batches, allowing:
- Independent processing schedule
- Better financial tracking and reporting
- Faster turnaround for expense claims
- Clear separation between salary and expense payments

## Architecture Changes

### Phase 1: Database Schema

#### New Table: `reimbursement_runs`

Stores separate runs for processing employee expense reimbursements.

**Schema:**
```sql
CREATE TABLE reimbursement_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  run_date DATE NOT NULL,
  status reimbursement_run_status NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_claims INTEGER NOT NULL DEFAULT 0,
  reference_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by UUID
);
```

**Status Enum:**
- `draft`: Run created but not yet processed
- `processing`: Run is being processed
- `paid`: Run has been processed and reimbursements marked as paid

#### Updated Table: `employee_reimbursements`

**New Column:**
- `reimbursement_run_id UUID`: Links reimbursement to a reimbursement run (new system)

**Preserved Column:**
- `payroll_run_id UUID`: Kept for historical data compatibility

**Migration Strategy:**
- Existing reimbursements linked to `payroll_run_id` remain unchanged
- New reimbursements use `reimbursement_run_id`
- Both columns can coexist for data migration period

### Phase 2: Backend Logic

#### Removed from Payroll Processing

**File:** `server/routes/payroll.js`

**Changes:**
1. Removed reimbursement fetching logic from `POST /runs/:id/process`
2. Removed reimbursement amount from net pay calculation
3. Removed reimbursement status update to 'paid'
4. Removed `reimbursement_cents` from metadata

**Before:**
```javascript
// Reimbursements were added to net pay
let baseNetPayCents = grossPayCents - totalDeductionsCents + nonTaxableAdjustmentCents + reimbursementCents;
```

**After:**
```javascript
// Reimbursements are no longer included
let baseNetPayCents = grossPayCents - totalDeductionsCents + nonTaxableAdjustmentCents;
```

#### New Reimbursement Runs API

**File:** `server/routes/reimbursement-runs.js`

**Endpoints:**

1. **POST `/api/v1/reimbursement-runs`**
   - Creates a new draft reimbursement run
   - Auto-fetches ALL approved reimbursements with `reimbursement_run_id IS NULL`
   - Links them to the new run
   - Returns run details with summary

2. **GET `/api/v1/reimbursement-runs`**
   - Lists all reimbursement runs for the tenant
   - Ordered by run_date DESC

3. **GET `/api/v1/reimbursement-runs/:id`**
   - Fetches run details
   - Includes all linked claims with employee bank details
   - Joins `employees`, `profiles`, and `onboarding_data` tables

4. **POST `/api/v1/reimbursement-runs/:id/process`**
   - Updates run status to 'paid'
   - Updates all linked reimbursements status to 'paid'
   - Creates audit log entry

5. **GET `/api/v1/reimbursement-runs/:id/export/bank-file`**
   - Generates Excel file for bank transfer
   - Columns: Employee ID, Name, Bank Name, Account No, IFSC, Amount, Expense Reference
   - Handles missing bank details gracefully (shows 'N/A')

### Phase 3: Frontend Implementation

#### New Components

1. **`ReimbursementRunList.tsx`**
   - Displays table of reimbursement runs
   - Shows status, total claims, total amount
   - Actions: Process (for draft runs), Export Bank File (for paid runs)

2. **`CreateReimbursementRunDialog.tsx`**
   - Dialog to create new reimbursement batch
   - Shows summary of approved claims
   - Allows setting run date and reference note

#### Updated Components

**`Payroll.tsx`**
- Added Tabs component
- Two tabs: "Payroll Cycles" and "Expense Payouts"
- Expense Payouts tab renders `ReimbursementRunList`

## Workflow

### New Reimbursement Processing Workflow

1. **Employee Submits Expense Claim**
   - Employee submits reimbursement request via employee portal
   - Status: `pending`

2. **HR/Admin Approves Claim**
   - HR reviews and approves the claim
   - Status: `approved`
   - `reimbursement_run_id`: `NULL` (not yet assigned to a run)

3. **Create Reimbursement Run**
   - HR/Admin clicks "Process New Reimbursement Batch"
   - System auto-fetches all approved claims with `reimbursement_run_id IS NULL`
   - Creates draft run and links claims
   - Status: `draft`

4. **Review Run**
   - HR/Admin can view run details
   - See all claims with employee bank details
   - Verify amounts and bank information

5. **Process Run**
   - HR/Admin clicks "Process" button
   - Run status changes to `paid`
   - All linked reimbursements status changes to `paid`
   - Audit log entry created

6. **Export Bank File**
   - HR/Admin exports Excel file for bank transfer
   - File includes all employee bank details
   - Ready for bulk transfer processing

### Separation from Payroll

**Key Differences:**

| Aspect | Payroll | Reimbursements |
|--------|---------|----------------|
| **Schedule** | Monthly (fixed) | On-demand (flexible) |
| **Processing** | Automatic with payroll cycle | Manual batch creation |
| **Bank File** | Salary payments | Expense payments |
| **Tracking** | `payroll_runs` | `reimbursement_runs` |
| **Amount Type** | Net salary (after deductions) | Gross expense amount |

## Data Migration

### Historical Data

- Existing reimbursements linked to `payroll_run_id` remain unchanged
- No data loss or modification required
- Both `payroll_run_id` and `reimbursement_run_id` can coexist

### Migration Steps

1. Run migration: `server/db/migrations/separate_reimbursement_runs.sql`
2. Deploy updated backend code
3. Deploy updated frontend code
4. Existing payroll runs continue to work normally
5. New reimbursements use the new system

## Bank Details Handling

### Data Source

Bank details are fetched from `onboarding_data` table:
- `bank_account_number`
- `bank_name`
- `ifsc_code`

### Fallback Logic

If bank details are missing:
- Export shows 'N/A' for missing fields
- System does not crash or skip employees
- HR can manually update bank details before processing

### Query Structure

```sql
SELECT 
  er.*,
  COALESCE(od.bank_account_number, 'N/A') as bank_account_number,
  COALESCE(od.ifsc_code, 'N/A') as bank_ifsc_code,
  COALESCE(od.bank_name, 'N/A') as bank_name
FROM employee_reimbursements er
JOIN employees e ON e.id = er.employee_id
LEFT JOIN profiles p ON p.id = e.user_id
LEFT JOIN onboarding_data od ON od.employee_id = e.id
WHERE er.reimbursement_run_id = $1
```

## API Examples

### Create Reimbursement Run

```javascript
POST /api/v1/reimbursement-runs
{
  "run_date": "2024-01-15",
  "reference_note": "January expense batch"
}

Response:
{
  "run": {
    "id": "uuid",
    "run_date": "2024-01-15",
    "status": "draft",
    "total_amount": 45000.00,
    "total_claims": 15
  },
  "claims": [...],
  "summary": {
    "total_claims": 15,
    "total_amount": 45000.00
  }
}
```

### Process Run

```javascript
POST /api/v1/reimbursement-runs/:id/process

Response:
{
  "message": "Reimbursement run processed successfully",
  "run": {
    "status": "paid",
    ...
  }
}
```

## Testing Scenarios

1. **Create Run with Approved Claims**
   - Verify all approved claims are included
   - Verify totals are calculated correctly

2. **Process Run**
   - Verify run status changes to 'paid'
   - Verify all linked reimbursements status changes to 'paid'

3. **Export Bank File**
   - Verify Excel file is generated
   - Verify all columns are present
   - Verify missing bank details show 'N/A'

4. **Missing Bank Details**
   - Create run for employee without bank details
   - Verify export shows 'N/A' without crashing

5. **Empty Run**
   - Try to create run when no approved claims exist
   - Verify run is created with 0 claims and 0 amount

## Security & Permissions

### Required Capabilities

- **Create/Process Runs:** `PAYROLL_RUN`
- **View Runs:** `PAYROLL_READ`
- **Export Bank Files:** `PAYROLL_READ`

### Audit Logging

All actions are logged:
- `reimbursement_run_created`
- `reimbursement_run_processed`

## Future Enhancements

1. **Automated Scheduling**
   - Schedule recurring reimbursement runs
   - Auto-process on specific dates

2. **Partial Runs**
   - Allow selecting specific claims for a run
   - Filter by date range, category, etc.

3. **Approval Workflow**
   - Multi-level approval for large amounts
   - Require additional approvals for runs above threshold

4. **Integration**
   - Direct bank API integration
   - Automatic payment processing

## Troubleshooting

### Issue: No approved claims found

**Solution:** Ensure reimbursements are approved and not already linked to a run.

### Issue: Bank details missing in export

**Solution:** Update employee bank details in onboarding_data table.

### Issue: Run status not updating

**Solution:** Check database constraints and ensure all linked reimbursements are in 'approved' status.

## Conclusion

This refactoring successfully separates reimbursement processing from payroll, providing:
- ✅ Independent processing schedule
- ✅ Better financial tracking
- ✅ Improved flexibility
- ✅ Backward compatibility with historical data
- ✅ Clear separation of concerns

The system now supports both monthly salary payroll and on-demand expense reimbursements as separate, independent processes.

