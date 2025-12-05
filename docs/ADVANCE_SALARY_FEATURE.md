# Advance Salary & EMI Module

## Overview

The Advance Salary & EMI Module allows HR administrators to grant salary advances to employees with automatic EMI (Equated Monthly Installment) deductions from future payrolls. The system supports 0% interest calculations and provides comprehensive tracking and reporting.

## Database Schema

### Table: `salary_advances`

```sql
CREATE TABLE salary_advances (
    id UUID PRIMARY KEY,
    employee_id UUID REFERENCES employees(id),
    tenant_id UUID REFERENCES organizations(id),
    total_amount NUMERIC(12,2) NOT NULL,
    tenure_months INTEGER NOT NULL,
    monthly_emi NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) DEFAULT 0,
    remaining_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
    status advance_status_enum NOT NULL DEFAULT 'active',
    start_month DATE NOT NULL,
    disbursement_date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Status Enum:**
- `active`: Repayment ongoing
- `completed`: Fully repaid
- `cancelled`: Cancelled before any repayment

**Key Constraints:**
- `paid_amount <= total_amount` (enforced by CHECK constraint)
- `tenure_months > 0`
- One active advance per employee (enforced by application logic)

## Business Logic

### 1. Granting Advance

**Option A: Fixed Amount**
- Admin enters a specific amount (e.g., ₹50,000)
- System uses this amount directly

**Option B: Multi-Month Salary**
- Admin selects number of months (e.g., "3 Months Salary")
- System fetches employee's current Net Pay from:
  1. Latest payroll item (if available)
  2. Compensation structure (fallback)
- Calculates: `total_amount = net_salary × num_months`

### 2. EMI Calculation

- **Formula:** `monthly_emi = total_amount / tenure_months`
- **Interest:** 0% (no interest charged)
- **Example:** ₹1,50,000 advance over 6 months = ₹25,000/month

### 3. Repayment Tracking

- EMI is automatically deducted from payroll during processing
- `paid_amount` is incremented after payroll completion
- Status changes to `completed` when `paid_amount >= total_amount`
- Last EMI is adjusted to handle rounding differences

### 4. Boundary Checks

- System ensures `paid_amount + emiAmount <= total_amount`
- Final EMI is adjusted if needed to prevent overpayment

## API Endpoints

### GET `/api/advance-salary`
List all advances (optionally filtered by status).

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `completed`, `cancelled`)

**Response:**
```json
[
  {
    "id": "uuid",
    "employee_id": "uuid",
    "employee_code": "EMP001",
    "employee_name": "John Doe",
    "total_amount": 150000.00,
    "tenure_months": 6,
    "monthly_emi": 25000.00,
    "paid_amount": 50000.00,
    "remaining_amount": 100000.00,
    "status": "active",
    "start_month": "2024-02-01",
    "disbursement_date": "2024-01-15",
    "notes": "Emergency advance",
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

### POST `/api/advance-salary`
Create a new advance salary.

**Request Body:**
```json
{
  "employee_id": "uuid",
  "amount_mode": "fixed" | "months",
  "value": 150000.00,  // Amount if fixed, or num_months if months
  "tenure_months": 6,
  "start_month": "2024-02-01",  // When EMI deductions begin
  "disbursement_date": "2024-01-15",  // When advance is disbursed
  "notes": "Optional notes"
}
```

**Response:**
```json
{
  "message": "Advance salary created successfully",
  "advance": { /* advance object */ }
}
```

### GET `/api/advance-salary/:id/slip`
Generate and download advance salary receipt PDF.

**Response:** PDF file stream

### POST `/api/advance-salary/:id/cancel`
Cancel an advance (only if no repayments made).

**Response:**
```json
{
  "message": "Advance cancelled successfully"
}
```

## Payroll Integration

### Automatic EMI Deduction

The payroll processing endpoint (`POST /api/payroll-cycles/:cycleId/process`) automatically:

1. **Fetches Active Advances:**
   ```sql
   SELECT * FROM salary_advances
   WHERE employee_id = $1
     AND tenant_id = $2
     AND status = 'active'
     AND start_month <= $3  -- Current payroll month
   ```

2. **Calculates EMI Deduction:**
   - Uses `monthly_emi` from advance record
   - Adjusts if `paid_amount + emiAmount > total_amount`

3. **Applies Deduction:**
   - Subtracts EMI from `net_salary`
   - Adds to `deductions` total
   - Stores in `metadata` JSON field for payslip display

4. **Updates Repayment:**
   - After payroll completion, increments `paid_amount`
   - Updates status to `completed` if fully repaid

### Metadata Storage

Advance deduction is stored in `payroll_items.metadata`:
```json
{
  "advance_deduction": 25000.00,
  "advance_id": "uuid"
}
```

This allows payslips to display the advance deduction separately.

## Frontend Implementation

### Page: `/advance-salary`

**Features:**
1. **List View:**
   - Table of all advances with status, progress bar
   - Filter by status (active/completed/cancelled)
   - Search by employee name/code

2. **Create Dialog:**
   - Employee searchable dropdown
   - Calculation mode: Radio buttons [Fixed Amount] / [Salary Multiplier]
   - Input field (amount or months)
   - Preview: Shows calculated advance amount and EMI
   - Tenure input (months)
   - Start month picker
   - Disbursement date picker
   - Notes field

3. **Actions:**
   - Download Receipt button (opens PDF)
   - Cancel button (if no repayments)

### UI Components

- **Progress Bar:** Shows `paid_amount / total_amount` visually
- **Status Badge:** Color-coded (active=blue, completed=green, cancelled=red)
- **EMI Preview:** Real-time calculation as user inputs

## Calculation Examples

### Example 1: Fixed Amount
- **Input:** ₹1,50,000 fixed, 6 months tenure
- **Calculation:** `monthly_emi = 150000 / 6 = ₹25,000`
- **Result:** Employee pays ₹25,000/month for 6 months

### Example 2: Multi-Month
- **Input:** 3 months salary, employee net = ₹50,000/month
- **Calculation:** `total_amount = 50000 × 3 = ₹1,50,000`
- **EMI:** `monthly_emi = 150000 / 6 = ₹25,000` (if 6 months tenure)

## Safety Features

1. **One Active Advance Per Employee:**
   - System prevents creating new advance if one is active
   - Error: "Employee already has an active advance"

2. **Boundary Protection:**
   - Ensures `paid_amount` never exceeds `total_amount`
   - Last EMI adjusted for rounding

3. **Cancellation Rules:**
   - Can only cancel if `paid_amount = 0`
   - Cannot cancel completed advances

4. **Date Validation:**
   - `start_month` must be valid date
   - `disbursement_date` must be valid date

## Migration

Run the migration file:
```bash
psql -U postgres -d hr_suite < server/db/migrations/20250202_add_advance_salary.sql
```

Or via Docker:
```bash
docker exec -i hr-suite-postgres psql -U postgres -d hr_suite < server/db/migrations/20250202_add_advance_salary.sql
```

## Testing Checklist

- [ ] Create advance with fixed amount
- [ ] Create advance with multi-month calculation
- [ ] Verify EMI appears in payroll preview
- [ ] Process payroll and verify deduction
- [ ] Verify `paid_amount` updates after payroll completion
- [ ] Verify status changes to `completed` when fully repaid
- [ ] Download advance receipt PDF
- [ ] Cancel advance (before any repayment)
- [ ] Verify cannot create second active advance for same employee
- [ ] Verify boundary checks (last EMI adjustment)

## Future Enhancements

1. **Partial Prepayment:** Allow employees to pay off advance early
2. **Interest Calculation:** Optional interest rate support
3. **Advance History:** Track all advances for an employee
4. **Notifications:** Email/SMS when advance is granted or completed
5. **Approval Workflow:** Multi-level approval for large advances
6. **Reports:** Advance summary reports by employee/department

