# Salary Components Update Documentation

## Overview

This document details the addition of three new salary allowance components to the compensation management system:
- **CCA (City Compensatory Allowance)**
- **Conveyance Allowance**
- **Medical Allowance**

## Database Changes

### Migration: `20250130_add_new_allowances.sql`

Added three new columns to the `compensation_structures` table:

```sql
ALTER TABLE public.compensation_structures
  ADD COLUMN IF NOT EXISTS cca DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conveyance DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_allowance DECIMAL(12,2) DEFAULT 0;
```

### Schema Updates

The `compensation_structures` table now includes:
- `cca` - City Compensatory Allowance (monthly amount)
- `conveyance` - Conveyance Allowance (monthly amount)
- `medical_allowance` - Medical Allowance (monthly amount)

All new fields default to `0` and are stored as `DECIMAL(12,2)`.

## API Changes

### Endpoint: `POST /api/employees/:employeeId/compensation`

**Request Body** (updated to include new fields):

```json
{
  "effective_from": "2025-01-01",
  "ctc": 1200000,
  "basic_salary": 50000,
  "hra": 20000,
  "special_allowance": 15000,
  "da": 5000,
  "lta": 3000,
  "bonus": 0,
  "cca": 5000,
  "conveyance": 2000,
  "medical_allowance": 3000,
  "pf_contribution": 6000,
  "esi_contribution": 0
}
```

**Response**:

```json
{
  "compensation": {
    "id": "uuid",
    "employee_id": "uuid",
    "effective_from": "2025-01-01",
    "ctc": 1200000,
    "basic_salary": 50000,
    "hra": 20000,
    "special_allowance": 15000,
    "da": 5000,
    "lta": 3000,
    "bonus": 0,
    "cca": 5000,
    "conveyance": 2000,
    "medical_allowance": 3000,
    "pf_contribution": 6000,
    "esi_contribution": 0,
    "created_at": "2025-01-30T10:00:00Z",
    "updated_at": "2025-01-30T10:00:00Z"
  }
}
```

### Endpoint: `GET /api/employees/:employeeId/compensation`

The response now includes the three new fields (`cca`, `conveyance`, `medical_allowance`).

## Frontend Changes

### ManageCompensationDialog Component

**New Input Fields Added**:
1. **CCA (City Compensatory Allowance)**
   - Input type: `number`
   - Placeholder: "Monthly CCA"
   - Default value: "0"

2. **Conveyance Allowance**
   - Input type: `number`
   - Placeholder: "Monthly conveyance"
   - Default value: "0"

3. **Medical Allowance**
   - Input type: `number`
   - Placeholder: "Monthly medical allowance"
   - Default value: "0"

**CTC Calculation**:
The CTC (Cost to Company) calculation now includes the new allowances:
```
Monthly CTC = Basic + HRA + Special Allowance + DA + LTA + Bonus + CCA + Conveyance + Medical Allowance
Annual CTC = Monthly CTC × 12
```

## Data Validation

- All new fields accept numeric values (integers or decimals)
- Empty or invalid values are treated as `0`
- Negative values are not allowed (enforced at database level with `CHECK (amount >= 0)`)
- Values are stored with 2 decimal places precision

## Backward Compatibility

- Existing compensation records will have `cca`, `conveyance`, and `medical_allowance` set to `0` by default
- The API accepts requests without these fields (they default to `0`)
- Frontend forms pre-populate with `"0"` if no existing data is found

## Migration Steps

1. **Run Database Migration**:
   ```bash
   # Apply the migration file
   psql -U postgres -d hr_suite < payroll-app/server/migrations/20250130_add_new_allowances.sql
   ```

2. **Update Application Code**:
   - Backend routes have been updated to handle new fields
   - Frontend components have been updated to display and edit new fields

3. **Seed Payroll Components (Optional)**:
   ```bash
   # For HR system integration (if using payroll_components table)
   node server/scripts/seed_new_allowances.js
   ```

## Testing

### Manual Entry Test
1. Open Manage Compensation dialog for an employee
2. Fill in CCA, Conveyance, and Medical Allowance fields
3. Verify CTC calculation includes these amounts
4. Save and verify data persists

### Bulk Import Test
1. Download salary import template
2. Add CCA, Conveyance, and Medical Allowance columns
3. Upload file and verify all employees are updated
4. Check that manually entered data is preserved

## Related Files

- `payroll-app/server/migrations/20250130_add_new_allowances.sql` - Database migration
- `payroll-app/server/src/routes/app.ts` - Backend API endpoint
- `payroll-app/src/components/employees/ManageCompensationDialog.tsx` - Frontend dialog
- `server/scripts/seed_new_allowances.js` - Seed script for payroll_components

