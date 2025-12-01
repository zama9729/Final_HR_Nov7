# Bank Transfer File Export Feature

## Overview

The Bank Transfer File Export feature allows HR and Payroll administrators to generate Excel (.xlsx) files containing salary disbursement details for a specific payroll cycle. These files can be directly sent to banks for bulk salary transfers.

## Table of Contents

1. [Schema Changes](#schema-changes)
2. [API Contract](#api-contract)
3. [Excel Format](#excel-format)
4. [Usage Guide](#usage-guide)
5. [Error Handling](#error-handling)

---

## Schema Changes

### Migration File

**File:** `server/db/migrations/20250201_add_bank_details.sql`

The following columns were added to the `employees` table:

```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT;
```

### Column Descriptions

| Column Name | Type | Description |
|------------|------|-------------|
| `bank_account_number` | TEXT | Employee bank account number for salary transfer |
| `bank_ifsc_code` | TEXT | Bank IFSC code for salary transfer |
| `bank_name` | TEXT | Bank name for salary transfer |

### Notes

- All columns are nullable to handle cases where employees haven't provided bank details
- Missing bank details are displayed as "N/A" in the exported file
- These columns should be populated during employee onboarding or profile updates

---

## API Contract

### Endpoint

```
GET /api/payroll-cycles/:cycleId/export/bank-transfer
```

### Authentication

- **Required:** Yes
- **Method:** Cookie-based authentication (via `requireAuth` middleware)
- **Permissions:** User must be authenticated and have access to the tenant

### Request Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `cycleId` | UUID | Path | Yes | The ID of the payroll cycle to export |

### Query Parameters

None

### Request Body

None

### Response

#### Success Response (200 OK)

- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="Salary_Payout_{Month}_{Year}_{CycleId}.xlsx"`
- **Body:** Excel file binary stream

#### Error Responses

| Status Code | Error | Description |
|------------|-------|-------------|
| 400 | Bad Request | Payroll cycle status is not 'processing' or 'completed' |
| 403 | Forbidden | User tenant not found or unauthorized access |
| 404 | Not Found | Payroll cycle not found or no payroll items found |
| 500 | Internal Server Error | Server error during file generation |

### Example Request

```bash
curl -X GET \
  "http://localhost:4000/api/payroll-cycles/123e4567-e89b-12d3-a456-426614174000/export/bank-transfer" \
  -H "Cookie: session=your-session-cookie" \
  --output salary_payout.xlsx
```

### Example Error Response

```json
{
  "error": "Cannot export bank transfer file. Current status is 'draft'. Only 'processing' or 'completed' payroll cycles can be exported."
}
```

---

## Excel Format

### File Structure

The exported Excel file contains a single worksheet named "Bank Transfer" with the following columns:

| Column Name | Data Type | Width | Description | Example |
|------------|-----------|-------|-------------|---------|
| Employee Code | Text | 15 | Unique employee identifier | EMP001 |
| Employee Name | Text | 30 | Full name of the employee | John Doe |
| Bank Account Number | Text | 20 | Employee's bank account number | 1234567890 |
| IFSC Code | Text | 15 | Bank IFSC code | HDFC0001234 |
| Net Salary | Currency | 15 | Net salary amount (formatted as currency) | 45,000.00 |
| Payment Date | Date | 15 | Payment date (DD/MM/YYYY format) | 31/01/2024 |

### Formatting Details

1. **Header Row:**
   - Bold font
   - Gray background color (#E0E0E0)
   - All columns aligned to left (except Net Salary)

2. **Net Salary Column:**
   - Number format: `#,##0.00` (thousands separator with 2 decimal places)
   - Right-aligned
   - Example: `45,000.00`

3. **Payment Date:**
   - Format: DD/MM/YYYY (Indian date format)
   - Derived from `payroll_cycles.payday` if available, otherwise calculated as last day of the payroll month

4. **Missing Data Handling:**
   - Missing bank account numbers: Displayed as "N/A"
   - Missing IFSC codes: Displayed as "N/A"
   - Missing bank names: Displayed as "N/A"
   - Missing employee codes: Displayed as "N/A"
   - Missing employee names: Displayed as "N/A"

### Data Filtering

- Only employees with `net_salary > 0` are included in the export
- Employees are sorted by `employee_id` in ascending order
- Only payroll items with status `processed` or `completed` are included

### File Naming Convention

The exported file follows this naming pattern:

```
Salary_Payout_{Month}_{Year}_{CycleId}.xlsx
```

**Example:**
```
Salary_Payout_Jan_2024_123e4567.xlsx
```

Where:
- `{Month}`: Short month name (Jan, Feb, Mar, etc.)
- `{Year}`: 4-digit year
- `{CycleId}`: First 8 characters of the payroll cycle UUID

---

## Usage Guide

### Frontend Integration

The feature is integrated into the Payroll Cycle List component. Users can export bank transfer files by:

1. Navigate to the Payroll Cycles page
2. Locate a payroll cycle with status "processing" or "completed"
3. Click the "Export Bank File" button in the Actions column
4. The Excel file will automatically download

### Backend Integration

To use the API programmatically:

```typescript
// Example: Using the API client
import { api } from '@/lib/api';

try {
  await api.payroll.downloadBankTransferFile(cycleId);
  console.log('Bank transfer file downloaded successfully');
} catch (error) {
  console.error('Failed to download:', error);
}
```

### Data Requirements

Before exporting, ensure:

1. **Payroll Cycle Status:** Must be `processing` or `completed`
2. **Employee Bank Details:** Should be populated in the `employees` table:
   - `bank_account_number`
   - `bank_ifsc_code`
   - `bank_name`
3. **Payroll Items:** Must exist for the cycle with `net_salary > 0`

---

## Error Handling

### Common Error Scenarios

#### 1. Cycle Status Not Eligible

**Error:** `Cannot export bank transfer file. Current status is 'draft'. Only 'processing' or 'completed' payroll cycles can be exported.`

**Solution:** Process or complete the payroll cycle before exporting.

#### 2. No Payroll Items Found

**Error:** `No payroll items found for this cycle`

**Solution:** Ensure payroll has been processed and contains employee payroll items.

#### 3. Missing Bank Details

**Behavior:** Missing bank details are displayed as "N/A" in the exported file. The export will still succeed, but the file may need manual correction before sending to the bank.

**Solution:** Update employee profiles with complete bank details.

#### 4. Authentication Errors

**Error:** `User tenant not found` or `403 Forbidden`

**Solution:** Ensure the user is properly authenticated and has access to the tenant.

### Best Practices

1. **Data Validation:** Verify all employee bank details are complete before processing payroll
2. **File Review:** Always review the exported file for accuracy before sending to the bank
3. **Backup:** Keep a copy of exported files for audit purposes
4. **Security:** Ensure bank transfer files are stored securely and access is restricted

---

## Technical Implementation Details

### Dependencies

- **Backend:** `exceljs` (v4.x) - Excel file generation
- **Frontend:** Native `fetch` API for file downloads

### Database Queries

The export endpoint performs the following query:

```sql
SELECT 
  e.employee_id as employee_code,
  COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, 'N/A') as employee_name,
  COALESCE(e.bank_account_number, 'N/A') as bank_account_number,
  COALESCE(e.bank_ifsc_code, 'N/A') as bank_ifsc_code,
  COALESCE(e.bank_name, 'N/A') as bank_name,
  pi.net_salary,
  pc.payday
FROM payroll_items pi
JOIN employees e ON e.id = pi.employee_id
JOIN profiles p ON p.id = e.user_id
JOIN payroll_cycles pc ON pi.payroll_cycle_id = pc.id
WHERE pi.payroll_cycle_id = $1 
  AND pi.tenant_id = $2
  AND pi.net_salary > 0
ORDER BY e.employee_id ASC
```

### Performance Considerations

- The export processes all payroll items for a cycle in a single query
- For large payroll cycles (1000+ employees), the export may take a few seconds
- The file is streamed directly to the response to minimize memory usage

---

## Future Enhancements

Potential improvements for future versions:

1. **Custom Column Selection:** Allow users to select which columns to include
2. **Multiple Bank Formats:** Support different bank-specific file formats (CSV, TXT)
3. **Batch Export:** Export multiple cycles at once
4. **Email Integration:** Automatically email the file to designated recipients
5. **Validation Rules:** Pre-export validation to check for missing or invalid bank details
6. **Template Customization:** Allow organizations to customize the Excel template

---

## Support

For issues or questions regarding the Bank Transfer Export feature:

1. Check the error message in the browser console
2. Verify payroll cycle status and employee bank details
3. Review server logs for detailed error information
4. Contact the development team with cycle ID and error details

---

**Last Updated:** February 2024  
**Version:** 1.0.0

