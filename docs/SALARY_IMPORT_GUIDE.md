# Salary Structure Bulk Import Guide

## Overview

The Bulk Salary Import feature allows HR administrators to update salary structures for multiple employees simultaneously by uploading a CSV or Excel file.

## Access

Navigate to: **Employees Page** → Click **"Import Salaries"** button

## File Format

### Supported Formats
- **CSV** (.csv)
- **Excel** (.xlsx, .xls)

### Required Column
- **Employee ID** (required) - Must match the employee code in the system

### Supported Salary Component Columns

The following columns are recognized (case-insensitive, spaces ignored):

| Column Name | Database Field | Description |
|------------|----------------|-------------|
| Basic, Basic Salary | `basic_salary` | Monthly basic salary (required) |
| HRA, House Rent Allowance | `hra` | Monthly HRA |
| Special Allowance | `special_allowance` | Monthly special allowance |
| DA, Dearness Allowance | `da` | Monthly DA |
| LTA, Leave Travel Allowance | `lta` | Monthly LTA |
| Bonus | `bonus` | Monthly bonus |
| **CCA, City Compensatory Allowance** | `cca` | Monthly CCA (new) |
| **Conveyance, Conveyance Allowance** | `conveyance` | Monthly conveyance (new) |
| **Medical Allowance, Medical** | `medical_allowance` | Monthly medical allowance (new) |
| PF, PF Contribution | `pf_contribution` | Monthly PF contribution |
| ESI, ESI Contribution | `esi_contribution` | Monthly ESI contribution |

### Example CSV Format

```csv
Employee ID,Basic,HRA,CCA,Conveyance,Medical Allowance,Special Allowance,DA,LTA,Bonus,PF,ESI
EMP001,50000,20000,5000,2000,3000,15000,0,0,0,6000,0
EMP002,60000,24000,6000,2500,3500,18000,0,0,0,7200,0
EMP003,45000,18000,4000,1500,2500,12000,0,0,0,5400,0
```

### Example Excel Format

| Employee ID | Basic | HRA | CCA | Conveyance | Medical Allowance | Special Allowance | DA | LTA | Bonus | PF | ESI |
|------------|-------|-----|-----|------------|-------------------|-------------------|----|----|----|----|-----|
| EMP001 | 50000 | 20000 | 5000 | 2000 | 3000 | 15000 | 0 | 0 | 0 | 6000 | 0 |
| EMP002 | 60000 | 24000 | 6000 | 2500 | 3500 | 18000 | 0 | 0 | 0 | 7200 | 0 |

## Dynamic Column Mapping

### How It Works

1. **Header Recognition**: The system reads the first row as column headers
2. **Normalization**: Headers are converted to lowercase and spaces are replaced with underscores
3. **Mapping**: Headers are matched against known component names
4. **Flexible Matching**: The system recognizes various column name formats:
   - "Basic" or "Basic Salary" → `basic_salary`
   - "CCA" or "City Compensatory Allowance" → `cca`
   - "Conveyance" or "Conveyance Allowance" → `conveyance`
   - "Medical Allowance" or "Medical" → `medical_allowance`

### Unrecognized Columns

If a column header doesn't match any known component:
- The column is **ignored** (no error)
- A warning may be logged
- Only recognized components are processed

## Import Process

### Step-by-Step

1. **Download Template** (optional)
   - Click "Download Template" to get a sample CSV file
   - Use this as a starting point for your import file

2. **Prepare Your File**
   - Ensure "Employee ID" column exists
   - Add salary component columns as needed
   - Fill in values (empty cells = 0)

3. **Upload File**
   - Click "Select File" and choose your CSV/Excel file
   - Maximum file size: 10MB
   - Click "Upload & Import"

4. **Review Results**
   - Success message shows number of employees updated
   - Error list shows any failures (if any)
   - First 50 errors are displayed

### Processing Logic

For each row in the file:

1. **Employee Lookup**: Find employee by `employee_id` (employee code)
2. **Data Extraction**: Extract all recognized salary components
3. **CTC Calculation**: If CTC not provided, calculate as:
   ```
   Monthly Total = Basic + HRA + Special Allowance + DA + LTA + Bonus + CCA + Conveyance + Medical Allowance
   Annual CTC = Monthly Total × 12
   ```
4. **Effective Date**: Uses current date as `effective_from`
5. **Database Update**:
   - Deletes existing compensation structure for the employee and effective date
   - Inserts new structure with imported values

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "CSV must contain 'Employee ID' column" | Missing required column | Add "Employee ID" column to your file |
| "Employee ID 'EMP001' not found" | Employee doesn't exist | Verify employee code matches system records |
| "Unsupported file format" | Wrong file type | Use CSV, XLSX, or XLS format |
| "File is empty" | No data rows | Ensure file has at least one data row after header |

### Error Reporting

- Errors are collected per row
- First 50 errors are shown in the response
- Each error includes row number and description
- Failed rows don't prevent successful rows from being processed

## Data Validation

### Input Validation

- **Numeric Values**: All salary components must be numeric
- **Empty Values**: Treated as `0`
- **Invalid Numbers**: Treated as `0` (no error thrown)
- **Negative Values**: Allowed in input, but database enforces `>= 0`

### Business Rules

- **Basic Salary**: Required (defaults to 0 if missing)
- **CTC**: Calculated automatically if not provided
- **Effective Date**: Set to current date for all imports
- **Existing Data**: Replaced (not merged) for the same effective date

## Integration with Manual Entry

### Data Consistency

- Data imported via bulk import is **visible** in the Manage Compensation dialog
- Data entered manually is **preserved** unless overwritten by a new import
- Both methods update the same `compensation_structures` table
- Latest `effective_from` date takes precedence when viewing

### Viewing Imported Data

1. Open employee detail page
2. Click "Manage Compensation"
3. All imported fields (including CCA, Conveyance, Medical) are displayed
4. Can be edited manually if needed

## Best Practices

### File Preparation

1. **Use Template**: Start with the downloaded template
2. **Verify Employee IDs**: Ensure all employee codes exist in the system
3. **Check Values**: Review numeric values before importing
4. **Backup**: Keep a copy of your import file

### Import Strategy

1. **Test with Small File**: Import a few employees first
2. **Verify Results**: Check a few employees after import
3. **Bulk Import**: Once verified, import remaining employees
4. **Review Errors**: Address any errors before re-importing

### Data Maintenance

1. **Regular Updates**: Use bulk import for periodic salary updates
2. **Effective Dates**: System uses current date; plan imports accordingly
3. **Manual Overrides**: Use manual entry for individual adjustments
4. **Audit Trail**: All imports are logged with `created_by` user ID

## API Endpoint

### POST `/api/imports/bulk-salary-structure`

**Authentication**: Required (HR/Admin role)

**Request**:
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form data with `file` field

**Response**:
```json
{
  "success": true,
  "message": "Bulk import completed. Updated 50 employee(s).",
  "report": {
    "total": 50,
    "updated": 48,
    "failed": 2,
    "errors": [
      "Row 3: Employee ID 'EMP999' not found",
      "Row 15: Missing Employee ID"
    ]
  }
}
```

## Troubleshooting

### Import Fails Completely

- Check file format (must be CSV or Excel)
- Verify file size (< 10MB)
- Ensure "Employee ID" column exists
- Check user permissions (must be HR/Admin)

### Some Rows Fail

- Review error messages in response
- Verify employee IDs exist in system
- Check for data type issues (non-numeric values)
- Ensure required columns are present

### Data Not Appearing

- Check effective date (imports use current date)
- Verify employee lookup (by employee code, not ID)
- Review import report for errors
- Check database directly if needed

## Related Documentation

- [Salary Components Update](./SALARY_COMPONENTS_UPDATE.md) - Details on new allowance fields
- [Employee Management](./EMPLOYEE_MANAGEMENT.md) - General employee management guide

