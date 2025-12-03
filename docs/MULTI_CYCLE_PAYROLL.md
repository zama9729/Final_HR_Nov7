# Multi-Cycle Payroll Feature Documentation

## Overview

The Multi-Cycle Payroll feature enables organizations to process multiple payroll runs within the same pay period. This supports scenarios such as:
- **Partial Payments**: Advance salary payments before the final settlement
- **Off-Cycle Payments**: Special payments outside the regular payroll cycle
- **Bi-weekly Payouts**: Multiple payroll runs in a single month

## Business Logic

### Run Types

The system supports two types of payroll runs:

1. **Regular Run (`regular`)**: Final settlement payroll run
   - Calculates full period's gross salary, deductions, and taxes
   - Automatically deducts any amounts already paid in `off_cycle` runs within the same period
   - Formula: `Final Net Pay = (Gross - Deductions) - Already Paid in this Period`

2. **Off-Cycle Run (`off_cycle`)**: Advance or partial payment
   - Processes advance payments or partial salary
   - These amounts are tracked and automatically deducted from the subsequent regular run
   - Does not check for previous payments (advances are independent)

### Automatic Deduction Logic

When processing a `regular` run, the system:

1. **Fetches Previous Payments**: Queries all `completed` `off_cycle` runs that fall within the current run's `pay_period_start` and `pay_period_end` for the same tenant.

2. **Aggregates by Employee**: Sums the total `net_pay_cents` paid to each employee in those previous runs.

3. **Deducts from Net Pay**: For each employee:
   - Calculates the full period's Gross, Tax, and Deductions as normal
   - Looks up the `previous_paid_amount` for the current employee
   - Deducts `previous_paid_amount` from the calculated Net Pay
   - Stores `previous_paid_amount` in the `already_paid_cents` column and `metadata` JSON

4. **Handles Edge Cases**:
   - If Net Pay becomes negative due to high advances, it's set to 0 and a warning is logged
   - The system ensures `paid_amount + deduction` does not exceed `total_amount`

## Database Schema Changes

### Migration: `enable_multi_run_payroll.sql`

#### 1. `payroll_runs` Table

Added column:
- **`run_type`** (TEXT, NOT NULL, DEFAULT 'regular')
  - CHECK constraint: `run_type IN ('regular', 'off_cycle')`
  - Index: `idx_payroll_runs_run_type`
  - Defaults to 'regular' for backward compatibility

#### 2. `payroll_run_employees` Table

Added column:
- **`already_paid_cents`** (BIGINT, NOT NULL, DEFAULT 0)
  - CHECK constraint: `already_paid_cents >= 0`
  - Index: `idx_payroll_run_employees_already_paid`
  - Stores the amount already paid to the employee in previous runs within the same pay period (in cents)
  - Used for audit trails and payslip display

#### 3. Metadata Storage

The `already_paid_cents` value is also stored in the `metadata` JSON field of `payroll_run_employees` for easy access in payslip generation:

```json
{
  "tds_cents": 5000,
  "pf_cents": 1800,
  "reimbursement_cents": 2000,
  "non_taxable_adjustments_cents": 0,
  "already_paid_cents": 15000
}
```

## API Endpoints

### POST `/api/payroll/runs`

Creates a new payroll run with optional `run_type`.

**Request Body:**
```json
{
  "pay_period_start": "2025-02-01",
  "pay_period_end": "2025-02-28",
  "pay_date": "2025-02-28",
  "run_type": "regular" | "off_cycle"  // Optional, defaults to "regular"
}
```

**Response:**
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "pay_period_start": "2025-02-01",
  "pay_period_end": "2025-02-28",
  "pay_date": "2025-02-28",
  "status": "draft",
  "run_type": "regular",
  "created_at": "2025-02-03T10:00:00Z"
}
```

### POST `/api/payroll/runs/:id/process`

Processes a payroll run. For `regular` runs, automatically deducts previous `off_cycle` payments.

**Processing Logic:**

1. **For Regular Runs:**
   - Fetches all completed `off_cycle` runs in the same pay period
   - Aggregates `net_pay_cents` per employee from previous runs
   - Deducts aggregated amount from each employee's net pay
   - Stores `already_paid_cents` in both column and metadata

2. **For Off-Cycle Runs:**
   - Processes normally without checking previous payments
   - No deduction logic applied

**Response:**
```json
{
  "success": true,
  "message": "Payroll run processed successfully"
}
```

## Frontend Implementation

### CreatePayrollDialog Component

Added a "Run Type" radio group selector:

- **Options:**
  - "Final Settlement (Regular)" - Default option
  - "Off-Cycle / Advance"

- **UI Features:**
  - Radio buttons for selection
  - Helpful description text explaining the difference
  - Passes `run_type` to the API when creating a cycle

### PayrollCycleList Component

Updated to display run type badge:

- Shows a badge next to the period indicating "Regular" or "Off-Cycle"
- Badge styling:
  - Regular: Secondary variant
  - Off-Cycle: Outline variant

## Workflow Example

### Scenario: Employee receives advance payment, then final settlement

1. **Step 1: Create Off-Cycle Run (Advance)**
   - Admin creates an `off_cycle` run for February 2025
   - Employee receives ₹15,000 advance
   - Run status: `completed`

2. **Step 2: Create Regular Run (Final Settlement)**
   - Admin creates a `regular` run for February 2025
   - System calculates:
     - Gross Salary: ₹50,000
     - Deductions: ₹5,000
     - Base Net Pay: ₹45,000
     - Already Paid (from off_cycle): ₹15,000
     - **Final Net Pay: ₹30,000** (₹45,000 - ₹15,000)

3. **Result:**
   - Employee received ₹15,000 advance + ₹30,000 final = ₹45,000 total
   - Payslip shows breakdown with "Already Paid" amount
   - Audit trail maintained in `already_paid_cents` column

## Constraints & Safety Measures

1. **Currency Handling:**
   - All amounts stored in cents (integer math)
   - Prevents floating-point precision issues

2. **Backward Compatibility:**
   - Existing payroll runs without `run_type` are treated as 'regular'
   - NULL `run_type` defaults to 'regular' in queries

3. **Negative Net Pay Handling:**
   - If deductions exceed gross pay, net pay is set to 0
   - Warning logged for audit purposes
   - Option to carry forward negative amount (future enhancement)

4. **Data Integrity:**
   - CHECK constraints ensure valid `run_type` values
   - CHECK constraints ensure `already_paid_cents >= 0`
   - Foreign key constraints maintain referential integrity

## Payslip Display

The `already_paid_cents` value is stored in the `metadata` JSON field, making it easy to display on payslips:

```typescript
// Example payslip display
const metadata = JSON.parse(payrollItem.metadata);
if (metadata.already_paid_cents > 0) {
  // Display: "Already Paid: ₹15,000"
  // Display: "Final Net Pay: ₹30,000"
}
```

## Migration Instructions

1. **Run the migration:**
   ```sql
   \i server/db/migrations/enable_multi_run_payroll.sql
   ```

2. **Verify schema:**
   ```sql
   -- Check run_type column exists
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'payroll_runs' AND column_name = 'run_type';
   
   -- Check already_paid_cents column exists
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'payroll_run_employees' AND column_name = 'already_paid_cents';
   ```

3. **Test the feature:**
   - Create an off-cycle run
   - Create a regular run for the same period
   - Verify deductions are applied correctly

## Future Enhancements

1. **Carry Forward Negative Balances**: Allow negative net pay to carry forward to next period
2. **Multiple Off-Cycle Runs**: Support multiple off-cycle runs per period with proper aggregation
3. **Run Type Validation**: Prevent creating multiple regular runs for the same period
4. **Reporting**: Add reports showing advance payments vs final settlements
5. **Notifications**: Alert when advance payments exceed expected final settlement

## Troubleshooting

### Issue: Deductions not applied in regular run

**Check:**
1. Verify off-cycle run status is `completed`
2. Verify off-cycle run `pay_period_start` and `pay_period_end` overlap with regular run
3. Check `already_paid_cents` column in `payroll_run_employees` table

### Issue: Negative net pay

**Solution:**
- System automatically sets to 0 and logs warning
- Review advance amounts vs expected final settlement
- Consider adjusting advance amounts or final settlement date

### Issue: Migration fails

**Solution:**
- Check if columns already exist (migration uses `IF NOT EXISTS`)
- Verify database user has ALTER TABLE permissions
- Check for existing CHECK constraints that might conflict

