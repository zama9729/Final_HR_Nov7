# Feature Verification Report

Generated: 2024-12-19

## Overview

This document verifies the implementation status of each feature per role as specified in the requirements. Status indicators:
- ✅ **Implemented** - Feature exists and is functional
- 🟡 **Implemented but incomplete** - Feature exists but missing some capabilities or needs refinement
- ⛔ **Missing** - Feature does not exist

---

## Role: Employee

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Own profile (name, contact, job title, manager, location, timezone) | ✅ | `src/pages/MyProfile.tsx`, `/api/profiles/me` | Owner only | ⛔ | Profile page exists but may need location/timezone fields |
| Own pay periods & own timesheets (week view, status, totals) | ✅ | `src/pages/Timesheets.tsx`, `/api/timesheets` | Employee (own) | ⛔ | Week view exists, shows status and totals |
| Own leave balance & own leave requests | ✅ | `src/pages/LeaveRequests.tsx`, `/api/leave-requests`, `/api/stats/leave-balance` | Employee (own) | ⛔ | Leave balance and requests implemented |
| Company handbook, published policies, holiday calendar | 🟡 | `src/pages/LeavePolicies.tsx`, `src/pages/HolidayManagement.tsx`, `/api/leave-policies`, `/api/holidays` | Read-only for employees | ⛔ | Policies exist but no centralized "handbook" page |
| Assigned projects & allocations (read-only) | ✅ | `src/pages/ProjectCalendar.tsx`, `/api/v1/employees/:id/projects` | Employee (own) | ⛔ | Projects visible in calendar view |
| Notifications (approvals, rejections, reminders) | ✅ | `src/components/Notifications.tsx`, `/api/notifications` | All authenticated | ⛔ | Notification system exists |
| Document inbox (offers, policy acks, payslip if surfaced) | ⛔ | - | - | ⛔ | **MISSING** - No document inbox/vault |

---

## Role: Manager (includes Employee features, plus)

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Team directory (directs + optional 1 level down) | ✅ | `src/pages/Employees.tsx`, `/api/employees` | Manager (team filtering) | ⛔ | Manager sees direct reports |
| Team timesheets (detail + audit), attendance events, leave balances | ✅ | `src/pages/TimesheetApprovals.tsx`, `/api/timesheets/pending`, `/api/leave-requests` | Manager (team) | ⛔ | Can view and approve team timesheets/leave |
| Project allocations for their team (read) | ✅ | `src/pages/ProjectCalendar.tsx`, `/api/v1/employees/:id/projects` | Manager (team) | ⛔ | Can view team allocations |
| Holiday calendars for all team locations | ✅ | `/api/holidays`, `/api/holidays/employee/:employeeId` | Manager (team) | ⛔ | Holiday calendar accessible |
| Team reports: utilization, overtime, pending approvals | 🟡 | `src/pages/Analytics.tsx`, `/api/analytics` | Manager (team) | ⛔ | Analytics exists but may need team-specific filters |

---

## Role: HR

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Full employee directory & profiles (PII except payroll numbers) | ✅ | `src/pages/Employees.tsx`, `/api/employees` | HR/Director/CEO | ⛔ | Employee directory exists |
| Onboarding pipeline & background check status | 🟡 | `src/pages/OnboardingTracker.tsx`, `/api/onboarding-tracker/employees` | HR/Director/CEO | ⛔ | Onboarding tracker exists but **background check status missing** |
| Policies & holiday rules (all states + Remote) | ✅ | `src/pages/LeavePolicies.tsx`, `src/pages/HolidayManagement.tsx` | HR/Director/CEO | ⛔ | Policies and holidays can be created/edited |
| Leave types/balances; leave requests for all | ✅ | `src/pages/LeaveRequests.tsx`, `/api/leave-requests` | HR/Director/CEO | ⛔ | Can view all leave requests |
| Org-wide timesheet status dashboard (read; not edit entries) | ✅ | `src/pages/TimesheetApprovals.tsx`, `/api/timesheets` | HR/Director/CEO | ⛔ | Can view all timesheets |
| Documents (templates, e-sign packets), terminations/rehire | ⛔ | - | - | ⛔ | **MISSING** - No document vault, no termination/rehire functionality |
| Compliance center (posters, acknowledgements) | ⛔ | - | - | ⛔ | **MISSING** - No compliance center |
| Non-financial reports: headcount, tenure, attrition, leave usage, policy acks | 🟡 | `src/pages/Analytics.tsx`, `src/pages/EmployeeStats.tsx`, `/api/analytics`, `/api/employee-stats` | HR/Director/CEO | ⛔ | Analytics exist but may need more granular reports |

---

## Role: Director (department head)

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Department directory & org chart slice | ✅ | `src/pages/Employees.tsx`, `src/pages/OrgChart.tsx`, `/api/employees` | Director (dept filtering) | ⛔ | Org chart exists, needs dept filtering |
| Department projects & allocations | ✅ | `src/pages/ProjectCalendar.tsx`, `/api/v1/projects` | Director (dept) | ⛔ | Projects visible |
| Dept-wide timesheet status & summarized hours (no edit) | ✅ | `src/pages/TimesheetApprovals.tsx`, `/api/timesheets` | Director (dept) | ⛔ | Can view dept timesheets |
| Dept leave balances & trends | ✅ | `src/pages/LeaveRequests.tsx`, `/api/leave-requests` | Director (dept) | ⛔ | Can view dept leave |
| High-level onboarding view (their dept) | ✅ | `src/pages/OnboardingTracker.tsx` | Director (dept) | ⛔ | Onboarding tracker exists |
| Budget-adjacent views (hours vs. plan) — no comp by default | 🟡 | `src/pages/Analytics.tsx`, `/api/analytics` | Director (dept) | ⛔ | Analytics exist but may need budget-specific views |

---

## Role: Accountant / Payroll

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Payroll calendar, pay runs, off-cycle runs | ⛔ | - | - | ⛔ | **MISSING** - No payroll functionality |
| Approved timesheet export, exceptions, manual checks | ⛔ | - | - | ⛔ | **MISSING** - No payroll export |
| Tax forms status, earnings records, GL mapping & cost center rollups | ⛔ | - | - | ⛔ | **MISSING** - No tax/GL functionality |
| Attendance import results summary (for payroll impact) | 🟡 | `src/pages/AttendanceUploadHistory.tsx`, `/api/v1/attendance/uploads` | HR/Director/CEO/Admin | ⛔ | Attendance upload exists but **accountant role missing** |
| Compensation fields necessary for pay (rates, allowances) only | ⛔ | - | - | ⛔ | **MISSING** - No compensation fields visible |

**Note**: The `accountant` role is not defined in the `app_role` enum. Only: `employee`, `manager`, `hr`, `director`, `ceo`, `admin`.

---

## Role: Admin (system)

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Tenant/org settings, SSO, roles & permissions, audit logs, API keys, data retention | 🟡 | `src/pages/AdminDashboard.tsx`, `/api/admin` | Superadmin only | ⛔ | Admin dashboard exists but **SSO, API keys, data retention missing** |
| No salary by default; gate by FEATURE_PAYROLL | ⛔ | - | - | ⛔ | **MISSING** - No FEATURE_PAYROLL flag |

---

## Role: CEO

| Feature | Status | Files/Routes | Permission | Tests | Notes |
|---------|--------|--------------|------------|-------|-------|
| Org-wide dashboards (headcount, utilization, PTO liability, hiring funnel, payroll totals) | 🟡 | `src/pages/CEODashboard.tsx`, `src/pages/Analytics.tsx` | CEO | ⛔ | CEO dashboard exists but **payroll totals missing** (no payroll system) |
| High-risk change audit logs (read) | ⛔ | - | - | ⛔ | **MISSING** - No centralized audit log viewer |
| Read-only access to policies/holidays | ✅ | `src/pages/LeavePolicies.tsx`, `src/pages/HolidayManagement.tsx` | CEO | ⛔ | Can read policies/holidays |

---

## Actions/Approvals Matrix

| Action | Role | Status | Files/Routes | Permission | Tests |
|--------|------|--------|--------------|------------|-------|
| Timesheet – submit | Employee (own) | ✅ | `/api/timesheets` POST | Employee (own) | ⛔ |
| Timesheet – approve/deny | Manager (team), HR (override), Director (dept), CEO (exception) | ✅ | `/api/timesheets/:id/approve` | Manager/HR/Director/CEO | ⛔ | **Missing override reason + audit for HR/Director/CEO** |
| Leave – request | Employee (own) | ✅ | `/api/leave-requests` POST | Employee (own) | ⛔ |
| Leave – approve/deny | Manager (team), HR (policy exceptions), Director (dept escalations) | ✅ | `/api/leave-requests/:id/approve`, `/api/leave-requests/:id/reject` | Manager/HR/Director/CEO | ⛔ | **Missing escalation handling** |
| Onboarding – create/advance | HR (all steps), Director (dept), Manager (suggest only) | ✅ | `/api/onboarding/submit`, `/api/onboarding-tracker/employees` | HR/Director/CEO | ⛔ | **Manager can only suggest** |
| Background check – trigger/view status | HR (trigger), Directors view own dept | ⛔ | - | - | ⛔ | **MISSING** |
| Terminate/Rehire | HR (execute), Director (approve for dept), Manager (recommend) | ⛔ | - | - | ⛔ | **MISSING** |
| Project allocations | HR (org-wide), Director (dept), Manager (propose) | ✅ | `/api/v1/projects/:id/assign` | HR/Director/CEO | ⛔ | **Manager can propose via suggest** |
| Policies & Holidays | HR (create/edit), others read; CEO read | ✅ | `/api/leave-policies`, `/api/holidays` | HR/Director/CEO create, all read | ⛔ |
| Attendance CSV upload | HR, Accountant | ✅ | `/api/v1/attendance/upload` | HR/Director/CEO/Admin | ⛔ | **Accountant role missing** |
| Payroll run / manual checks | Accountant (run/rollback), CEO read totals | ⛔ | - | - | ⛔ | **MISSING** |
| User/Role admin | Admin | ✅ | `/api/admin` | Superadmin | ⛔ |
| Override approvals (break-glass) | HR/Director/CEO with reason → AuditLog + notify | 🟡 | `/api/timesheets/:id/approve`, `/api/leave-requests/:id/approve` | HR/Director/CEO | ⛔ | **Missing mandatory reason, audit log, notification** |

---

## Left-Rail Menus Verification

| Role | Menu Items | Status | Implementation |
|------|-----------|--------|----------------|
| Employee | Home \| My Timesheet \| My Leave \| Projects (read) \| Holiday Calendar \| Documents \| Notifications \| Profile & Settings | 🟡 | `src/components/layout/AppSidebar.tsx` - **Documents missing** |
| Manager | Home (To-do) \| Approvals (Timesheets, Leave) \| Team → Directory/Utilization/Attendance \| My Timesheet \| My Leave \| Projects (team read) \| Reports → Team Summary \| Notifications | 🟡 | Menu exists but **Team → Utilization/Attendance, Reports → Team Summary may be incomplete** |
| HR | Home (policy recs) \| Hire & Onboard (pipeline, bg checks, docs) \| People \| Benefits & Leave \| Policies & Holidays \| HR Reports \| Terminate & Rehire \| Doc Vault | 🟡 | Menu exists but **bg checks, Terminate & Rehire, Doc Vault missing** |
| Director | Home \| Department → People/Projects/Allocations \| Approvals (escalations) \| Reports → Dept Utilization/Leave/Hiring Funnel \| Policies/Holidays (read-only) | 🟡 | Menu exists but **escalations, dept-specific reports may be incomplete** |
| Accountant | Home → Payroll widgets \| Payroll (runs/off-cycle/manual checks) \| Reports (summary/details, GL export, tax forms) \| Attendance Import (summary) \| Earnings Records / Delivery Tracking | ⛔ | **MISSING** - Accountant role not in enum, no payroll menu |
| Admin | Home \| Settings (org, SSO, roles & permissions, data retention) \| API & Integrations \| Audit Logs \| Feature Flags / Tenancy | 🟡 | Admin menu exists but **SSO, API & Integrations, Audit Logs viewer, Feature Flags missing** |
| CEO | Home → Executive Dashboard \| Org Reports → Utilization/Payroll totals/PTO liability/Headcount \| Audit (read) \| Policies (read) | 🟡 | CEO dashboard exists but **Payroll totals, Audit viewer missing** |

---

## Holiday & Policy Logic

| Feature | Status | Files/Routes | Notes |
|---------|--------|--------------|-------|
| Employee belongs to State calendar OR Remote calendar (fixed 10 holidays) | 🟡 | `server/routes/holidays.js`, `server/services/holidays.js` | Holiday lists exist but **state/remote assignment logic unclear** |
| 10 national holidays seeded by state; remote uses fixed 10 | 🟡 | - | **Seeding logic may need verification** |
| Holiday calendar visible beneath timesheet (static, no inline editing) | ✅ | `src/pages/Timesheets.tsx`, `/api/holidays` | Holidays visible |
| Manager notified on 1st of month (09:00 local) with upcoming holidays | ⛔ | `server/services/cron.js` | **MISSING** - Notification rule not implemented |

---

## Notification Rules

| Rule | Status | Implementation | Notes |
|------|--------|----------------|-------|
| Employee: submission receipts; approval/denial outcomes; holiday changes; Fri day-end reminder if draft hours exist | 🟡 | `/api/notifications` | Notification system exists but **specific rules may not be wired** |
| Manager: on direct report submit (timesheet/leave); monthly summary on 1st 09:00 local for pending items | 🟡 | - | **Monthly summary missing** |
| HR: onboarding blockers; policy acknowledgment gaps; failed background checks | ⛔ | - | **MISSING** - Background checks don't exist |
| Accountant: payroll-blocking items (missing approvals), CSV import errors | ⛔ | - | **MISSING** - No payroll, accountant role missing |
| Director: weekly dept snapshot; escalations > 3 days | ⛔ | - | **MISSING** |
| CEO: monthly executive digest; critical audit alerts only | ⛔ | - | **MISSING** |

---

## Quick Policy Decisions

| Policy | Status | Implementation | Notes |
|--------|--------|---------------|-------|
| Max backdating for timesheets = 2 past pay periods | ⛔ | - | **MISSING** - No validation |
| Editing submitted timesheets: employee requests change; manager reopens | 🟡 | `/api/timesheets` | **Reopen flow unclear** |
| Leave rounding: 0.5 day or 0.25 hour (use 0.5 day default; make configurable) | ⛔ | - | **MISSING** - No rounding logic |
| Directors cannot see compensation by default | ✅ | - | Compensation fields not exposed |
| HR owns holiday calendars (configurable owner) | ✅ | `/api/holidays` | HR can create/edit holidays |

---

## RBAC / Capability System

| Component | Status | Files/Routes | Notes |
|-----------|--------|--------------|-------|
| Centralized capability system | ⛔ | - | **MISSING** - Only role-based checks exist |
| `server/policy/authorize.ts` with `requireCapability(capability, {scope?})` | ⛔ | - | **MISSING** |
| UI helper `useCan(capability[, scope])` | ⛔ | - | **MISSING** |
| Capability definitions (TIMESHEET_SUBMIT_OWN, etc.) | ⛔ | - | **MISSING** |

---

## Audit Logging

| Feature | Status | Files/Routes | Notes |
|---------|--------|--------------|-------|
| AuditLog helper: `audit(actor, action, entity, entityId, reason?, diff?)` | ⛔ | - | **MISSING** - Centralized helper |
| Audit events for overrides/terminations/payroll actions | 🟡 | `server/routes/holidays.js` (holiday_audit_logs), `server/db/migrations/20251030_add_approvals.sql` (approval_audit), `server/utils/createAttendanceTables.js` (attendance_audit_logs) | **Partial** - Some audit logs exist but not centralized |
| Audit log viewer | ⛔ | - | **MISSING** |

---

## Tests

| Test Type | Status | Files | Notes |
|-----------|--------|-------|-------|
| Permission tests (positive + negative) | ⛔ | - | **MISSING** |
| Route guards and menu visibility per role | ⛔ | - | **MISSING** |
| Notification scheduling and content templates | ⛔ | - | **MISSING** |
| Audit events emitted for overrides/terminations/payroll | ⛔ | - | **MISSING** |
| Holiday calendar selection logic by state/remote | ⛔ | - | **MISSING** |
| Timesheet backdating rule and reopen flow | ⛔ | - | **MISSING** |

---

## Seed Data

| Requirement | Status | Files | Notes |
|-------------|--------|-------|-------|
| Seed script: 1 tenant, 7 users (one per role) + 6 employees | ⛔ | - | **MISSING** |
| 2 projects + allocations; 3 weeks of timesheets | ⛔ | - | **MISSING** |
| Policies, state+remote calendars (10 holidays each) | ⛔ | - | **MISSING** |
| 1 payroll run (dummy), 1 termination + 1 rehire record | ⛔ | - | **MISSING** |

---

## Summary

### ✅ Fully Implemented
- Employee profile management
- Timesheet submission and approval
- Leave request management
- Project allocations
- Holiday management (basic)
- Onboarding tracker
- Notifications (basic)

### 🟡 Partially Implemented
- Role-based access control (no capabilities)
- Audit logging (scattered, no centralized helper)
- Notification rules (system exists but specific rules not wired)
- CEO dashboard (missing payroll totals)
- Analytics and reports (may need more granularity)

### ⛔ Missing
- **Accountant role** (not in enum)
- **Payroll functionality** (pay runs, payroll calendar, exports)
- **Background check** functionality
- **Termination/rehire** functionality
- **Document vault/inbox**
- **Compliance center**
- **Centralized RBAC capability system**
- **Centralized AuditLog helper**
- **Notification rules** (cron/queue integration)
- **Test suite**
- **Seed data script**
- **FEATURE_PAYROLL flag**
- **Compensation fields** (for payroll)
- **Break-glass override** with mandatory reason + audit

---

## Next Steps

1. Add `accountant` role to `app_role` enum
2. Create centralized RBAC capability system (`server/policy/authorize.ts`)
3. Create `useCan` hook for frontend
4. Implement payroll functionality (routes, models, UI)
5. Implement background check functionality
6. Implement termination/rehire functionality
7. Create document vault/inbox
8. Create centralized AuditLog helper
9. Wire notification rules via cron
10. Create test suite
11. Create seed data script

