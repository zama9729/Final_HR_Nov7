# HR ↔ Payroll Schema Mapping

This document maps HR system tables to Payroll system tables for integration purposes.

## Overview

The HR system serves as the source of truth for users, roles, and organizations. The Payroll system references HR data via `hr_user_id` and `org_id` foreign keys.

## Table Mappings

### Users/Profiles

| HR Table | HR Column | Payroll Table | Payroll Column | Mapping Type | Notes |
|----------|-----------|---------------|----------------|--------------|-------|
| `profiles` | `id` | `users` | `hr_user_id` | 1:1 | Primary link via UUID |
| `profiles` | `email` | `users` | `email` | 1:1 | Used for matching during ETL |
| `profiles` | `first_name` | `users` | `first_name` | 1:1 | Direct copy |
| `profiles` | `last_name` | `users` | `last_name` | 1:1 | Direct copy |
| `profiles` | `phone` | `users` | `phone` | 1:1 | Direct copy |
| `profiles` | `tenant_id` | `users` | `org_id` | 1:1 | Organization mapping |

### Organizations

| HR Table | HR Column | Payroll Table | Payroll Column | Mapping Type | Notes |
|----------|-----------|---------------|----------------|--------------|-------|
| `organizations` | `id` | `organizations` | `hr_org_id` | 1:1 | Primary link |
| `organizations` | `name` | `organizations` | `name` | 1:1 | Direct copy |
| `organizations` | `domain` | `organizations` | `domain` | 1:1 | Direct copy |
| `organizations` | `timezone` | `organizations` | `timezone` | 1:1 | Direct copy |

### Employees

| HR Table | HR Column | Payroll Table | Payroll Column | Mapping Type | Notes |
|----------|-----------|---------------|----------------|--------------|-------|
| `employees` | `user_id` | `users` | `hr_user_id` | 1:1 | Via profiles.id |
| `employees` | `employee_id` | `users` | `employee_id` | 1:1 | Employee ID |
| `employees` | `department` | `users` | `department` | 1:1 | Direct copy |
| `employees` | `position` | `users` | `position` | 1:1 | Direct copy |
| `employees` | `join_date` | `users` | `join_date` | 1:1 | Direct copy |
| `employees` | `status` | `users` | `status` | 1:1 | Direct copy |

### Bank Details

| HR Table | HR Column | Payroll Table | Payroll Column | Mapping Type | Notes |
|----------|-----------|---------------|----------------|--------------|-------|
| `onboarding_data` | `bank_account_number` | `payroll_user_ext` | `bank_account` | 1:1 | Via hr_user_id |
| `onboarding_data` | `bank_name` | `payroll_user_ext` | `bank_name` | 1:1 | Via hr_user_id |
| `onboarding_data` | `bank_branch` | `payroll_user_ext` | `bank_branch` | 1:1 | Via hr_user_id |
| `onboarding_data` | `ifsc_code` | `payroll_user_ext` | `ifsc_code` | 1:1 | Via hr_user_id |

### Tax IDs

| HR Table | HR Column | Payroll Table | Payroll Column | Mapping Type | Notes |
|----------|-----------|---------------|----------------|--------------|-------|
| `onboarding_data` | `pan_number` | `payroll_user_ext` | `pan` | 1:1 | Via hr_user_id |
| `onboarding_data` | `aadhar_number` | `payroll_user_ext` | `aadhar` | 1:1 | Via hr_user_id |
| `onboarding_data` | `passport_number` | `payroll_user_ext` | `passport` | 1:1 | Via hr_user_id |

### Roles

| HR Table | HR Column | Payroll Table | Payroll Column | Mapping Type | Notes |
|----------|-----------|---------------|----------------|--------------|-------|
| `user_roles` | `role` | `users` | `payroll_role` | Many:1 | Map HR roles → Payroll roles |
| `user_roles` | `role` (CEO/Admin/HR) | `users` | `payroll_role` = 'payroll_admin' | Many:1 | Role mapping |
| `user_roles` | `role` (others) | `users` | `payroll_role` = 'payroll_employee' | Many:1 | Role mapping |

## Role Mapping Logic

```javascript
function mapHrToPayrollRole(hrRoles: string[]): 'payroll_admin' | 'payroll_employee' {
  const adminSet = new Set(['CEO', 'Admin', 'HR']);
  return hrRoles.some(r => adminSet.has(r)) ? 'payroll_admin' : 'payroll_employee';
}
```

## Extension Tables

### payroll_user_ext

Fields that exist only in Payroll or need to be extended:

- `tax_reg_no` - Tax registration number (Payroll-specific)
- `esi_number` - ESI number (Payroll-specific)
- `pf_number` - PF number (Payroll-specific)
- `uan` - Universal Account Number (Payroll-specific)

These are stored in `payroll_user_ext` table keyed by `hr_user_id`.

## Data Flow

1. **SSO Flow**: HR → JWT → Payroll → Auto-provision user
2. **ETL Flow**: HR → Payroll (backfill existing users)
3. **Sync Flow**: HR updates → Payroll (optional, via webhooks or scheduled jobs)

## Unmapped Fields

### HR-only (not needed in Payroll)
- `security_questions` - HR authentication only
- `onboarding_status` - HR workflow only
- `must_change_password` - HR authentication only

### Payroll-only (extension table)
- `tax_reg_no` - Payroll-specific
- `esi_number` - Payroll-specific
- `pf_number` - Payroll-specific
- `uan` - Payroll-specific
- `salary_components` - Payroll-specific
- `pay_cycles` - Payroll-specific

## Migration Strategy

1. **Phase 1**: Add `hr_user_id` and `org_id` columns to Payroll `users` table
2. **Phase 2**: Create `payroll_user_ext` extension table
3. **Phase 3**: Backfill existing Payroll users by email matching
4. **Phase 4**: Enable SSO and auto-provisioning
5. **Phase 5**: Migrate bank/tax data from HR onboarding_data

## Referential Integrity

- `users.hr_user_id` → `profiles.id` (soft link, no FK constraint)
- `users.org_id` → `organizations.id` (soft link, no FK constraint)
- `payroll_user_ext.hr_user_id` → `users.hr_user_id` (FK constraint)

## Indexes

```sql
-- Payroll indexes for performance
CREATE INDEX idx_users_hr_user_id ON users(hr_user_id);
CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_payroll_user_ext_hr_user_id ON payroll_user_ext(hr_user_id);
```

