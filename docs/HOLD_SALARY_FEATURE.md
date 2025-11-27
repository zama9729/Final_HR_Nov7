# Hold Salary Feature Implementation

## Overview

The "Hold Salary" feature allows payroll administrators to exclude specific employees from a payroll cycle run. When creating a new payroll cycle, users can now deselect employees to hold their salary, effectively excluding them from the payroll processing.

## Implementation Summary

This feature implements an exclusion-based approach where:
- **Default Behavior**: All eligible employees are selected by default
- **Hold Salary**: Unchecking an employee excludes them from the payroll run
- **Dynamic Calculations**: Employee count and total compensation update in real-time based on selected employees

---

## API Changes

### 1. GET `/api/payroll/new-cycle-data`

**Updated Response Format:**

Previously returned only aggregate data:
```json
{
  "employeeCount": 10,
  "totalCompensation": 500000
}
```

Now returns detailed employee list:
```json
{
  "employeeCount": 10,
  "totalCompensation": 500000,
  "employees": [
    {
      "id": "uuid",
      "first_name": "John",
      "last_name": "Doe",
      "employee_id": "EMP001",
      "gross_pay": 50000
    },
    ...
  ]
}
```

**Employee Object Fields:**
- `id` (string): Employee UUID
- `first_name` (string): Employee's first name
- `last_name` (string): Employee's last name
- `employee_id` (string): Employee code/ID
- `gross_pay` (number): Monthly gross pay (CTC / 12)

**Implementation Details:**
- Uses `payroll_employee_view` when available, falls back to `employees` table with `profiles` join
- Calculates gross pay from compensation structures (CTC / 12)
- Filters employees by:
  - Active status
  - Employment date (must be employed by payroll month end)
  - Tenant/organization

---

### 2. POST `/api/payroll-cycles`

**Updated Request Body:**

New optional field added:
```json
{
  "month": 12,
  "year": 2024,
  "payday": "2024-12-31",
  "employeeCount": 8,
  "totalCompensation": 400000,
  "included_employee_ids": ["uuid1", "uuid2", "uuid3", ...]
}
```

**Field Description:**
- `included_employee_ids` (array of strings, optional): Array of employee UUIDs to include in the payroll run
  - If not provided or empty, all eligible employees are included (backward compatible)
  - If provided, only employees with IDs in this array are processed

**Backend Processing:**
- When `included_employee_ids` is provided, the employee query is filtered using PostgreSQL's `ANY()` operator
- Only employees whose IDs are in the provided array are included in payroll processing
- Payroll items are created only for included employees

**Query Filter Implementation:**
```sql
SELECT e.id
FROM employees e
WHERE e.tenant_id = $1
  AND e.status = 'active'
  AND (e.date_of_joining IS NULL OR e.date_of_joining <= $2)
  AND e.id = ANY($3)  -- Only when included_employee_ids is provided
```

---

## Frontend Changes

### Component: `CreatePayrollDialog.tsx`

#### State Management

**New State Variables:**
```typescript
const [employees, setEmployees] = useState<Employee[]>([]);
const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
const [searchQuery, setSearchQuery] = useState("");
```

**Computed Values:**
- `employeeCount`: Dynamically calculated from `selectedEmployeeIds.size`
- `totalCompensation`: Sum of `gross_pay` for selected employees only

#### UI Components Added

1. **Search Bar**
   - Located below date selection fields
   - Filters employees by:
     - First name (case-insensitive)
     - Last name (case-insensitive)
     - Employee ID (case-insensitive)
   - Uses Shadcn UI `Input` component with search icon

2. **Employee Selection List**
   - Scrollable area (max-height: 300px) using `ScrollArea` component
   - Each employee displayed with:
     - Checkbox for selection
     - Full name (first_name + last_name)
     - Employee ID in parentheses
     - Gross pay amount
   - "Select All" / "Deselect All" toggle button
   - Empty state message when no employees match search

3. **Updated Summary**
   - Dialog description now shows: "Processing salary for X of Y employees"
   - Estimated total updates dynamically as employees are selected/deselected

#### User Flow

1. User selects month and year
2. System fetches eligible employees for that period
3. All employees are selected by default
4. User can:
   - Search for specific employees
   - Toggle individual employee selection
   - Use "Select All" / "Deselect All" for filtered results
5. Summary updates in real-time showing:
   - Count of selected employees
   - Total compensation for selected employees
6. On submit, only selected employee IDs are sent to the API

---

## How Hold Salary Works

### Exclusion-Based Logic

The feature uses an **exclusion-based** approach:

1. **Default State**: All eligible employees are included (checked)
2. **Hold Salary**: Unchecking an employee excludes them from the payroll run
3. **Backend Filtering**: Only employees in `included_employee_ids` array are processed
4. **No Payroll Items**: Excluded employees do not have payroll items created for them

### Example Scenario

**Scenario**: 10 eligible employees, need to hold salary for 2 employees

1. System fetches 10 employees
2. All 10 are selected by default
3. User unchecks 2 employees (Employee A and Employee B)
4. Summary shows: "Processing salary for 8 of 10 employees"
5. On submit, `included_employee_ids` contains 8 employee IDs
6. Backend processes only those 8 employees
7. Employee A and Employee B have no payroll items created (salary held)

---

## Modified Files

### Backend

1. **`payroll-app/server/src/routes/app.ts`**
   - Updated `GET /payroll/new-cycle-data` endpoint (lines ~2230-2395)
     - Added employee list query with compensation data
     - Returns employees array with id, first_name, last_name, employee_id, gross_pay
   - Updated `POST /payroll-cycles` endpoint (lines ~2397-2680)
     - Added `included_employee_ids` parameter validation
     - Added employee filtering logic using PostgreSQL `ANY()` operator

### Frontend

2. **`payroll-app/src/components/payroll/CreatePayrollDialog.tsx`**
   - Added state management for employees, selectedEmployeeIds, searchQuery
   - Added Employee interface type definition
   - Updated API response type to include employees array
   - Added search functionality with case-insensitive filtering
   - Added employee selection UI with Checkbox and ScrollArea components
   - Added "Select All" / "Deselect All" functionality
   - Updated handleSubmit to send included_employee_ids array
   - Updated dialog description to show selected vs total employees
   - Added computed values for dynamic employee count and total compensation

---

## Type Safety

All changes maintain strict TypeScript type safety:

- **Employee Interface**: Defined with all required fields
- **API Response Types**: Updated to include employees array
- **State Management**: Uses Set<string> for selectedEmployeeIds for efficient lookups
- **Computed Values**: Uses useMemo for performance optimization

---

## Search Functionality

The search feature is case-insensitive and searches across:
- First name
- Last name
- Employee ID

**Implementation:**
```typescript
const filteredEmployees = useMemo(() => {
  if (!searchQuery.trim()) return employees;
  const query = searchQuery.toLowerCase();
  return employees.filter(emp => 
    emp.first_name.toLowerCase().includes(query) ||
    emp.last_name.toLowerCase().includes(query) ||
    emp.employee_id.toLowerCase().includes(query)
  );
}, [employees, searchQuery]);
```

---

## Backward Compatibility

The implementation maintains backward compatibility:

1. **API**: `included_employee_ids` is optional - if not provided, all eligible employees are included
2. **Frontend**: Existing behavior preserved when all employees are selected
3. **Database**: No schema changes required

---

## Testing Recommendations

1. **Test Scenarios:**
   - Create payroll cycle with all employees selected
   - Create payroll cycle with some employees deselected
   - Search functionality with various queries
   - Select All / Deselect All with filtered results
   - Verify excluded employees have no payroll items created

2. **Edge Cases:**
   - Empty employee list
   - No employees matching search query
   - Very large employee lists (performance)
   - Rapid selection/deselection (UI responsiveness)

---

## Future Enhancements

Potential improvements:
1. Bulk selection by department/designation
2. Save selection templates
3. Export selected employee list
4. Visual indicators for employees with missing compensation data
5. Filter by compensation range

---

## Notes

- The feature uses PostgreSQL's `ANY()` operator for efficient array filtering
- Employee selection state is managed using a `Set` for O(1) lookup performance
- The UI uses Shadcn UI components for consistency with the existing design system
- All calculations are performed client-side for immediate feedback

