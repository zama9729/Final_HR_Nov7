# Offboarding Module Implementation

## Overview

This document describes the comprehensive offboarding module implementation for the HR/Payroll application. The module includes policy management, masked verification, exit surveys, approval workflows, auto-approval, F&F settlement scheduling, PDF letter generation, and rehire functionality with data minimization.

## Architecture

### Database Schema

The offboarding module introduces the following new tables:

1. **offboarding_policies** - Configurable notice periods and auto-approval SLAs
2. **offboarding_requests** - Main offboarding request records
3. **offboarding_approvals** - Approval records (HR, Manager, CEO)
4. **offboarding_verifications** - Masked email/phone/address verification with OTP
5. **exit_checklists** - Tracks blockers (leaves, finances, assets, compliance)
6. **rehire_requests** - Rehire request records
7. **rehire_approvals** - Rehire approval records
8. **offboarded_identities** - Minimal retained data for rehire matching

### API Routes

#### Policy Management
- `GET /api/offboarding/policies` - List policies (HR/Admin)
- `POST /api/offboarding/policies` - Create policy (HR/Admin)
- `PATCH /api/offboarding/policies/:id` - Update policy (HR/Admin)
- `DELETE /api/offboarding/policies/:id` - Delete policy (Admin)

#### Verification
- `GET /api/offboarding/verify/masked` - Get masked contact info (Employee)
- `POST /api/offboarding/verify/send` - Send OTP to email/phone (Employee)
- `POST /api/offboarding/verify/confirm` - Verify OTP (Employee)
- `POST /api/offboarding/verify/address` - Confirm address (Employee)

#### Offboarding Request
- `POST /api/offboarding/survey` - Submit exit survey and reason (Employee)
- `GET /api/offboarding` - List requests (Role-gated)
- `GET /api/offboarding/:id` - Get request details (Role-gated)
- `POST /api/offboarding/:id/approve` - Approve request (Manager/HR/CEO)
- `POST /api/offboarding/:id/deny` - Deny request (Manager/HR/CEO)
- `POST /api/offboarding/:id/checklist` - Update checklist (HR/Finance/IT)

#### Rehire
- `POST /api/rehire/search` - Search offboarded identities (HR)
- `POST /api/rehire/request` - Create rehire request (HR)
- `GET /api/rehire` - List rehire requests (Role-gated)
- `GET /api/rehire/:id` - Get rehire request details
- `POST /api/rehire/:id/approve` - Approve rehire (HR/Manager)
- `POST /api/rehire/:id/deny` - Deny rehire (HR/Manager)

## Features

### 1. Policy Management

- HR/Admin can create/edit policies per org/location/department
- Core fields:
  - `notice_period_days` (default: 30)
  - `auto_approve_days` (default: 7)
  - `use_ceo_approval` (default: true)
- Policies can be department/location-specific or default
- Effective policy is determined at request time and snapshotted

### 2. Masked Verification

- Email masking: first + last char of local and domain shown, rest replaced with *
  - Example: `john.doe@example.com` → `j***e@e***e.com`
- Phone masking: reveal last 3 digits only
  - Example: `9876543210` → `*******210`
- OTP generation and verification (6-digit, 10-minute expiry)
- Address confirmation with OTP verification
- All verifications must be complete before proceeding

### 3. Exit Survey & Resignation

- Collect exit survey (Likert + free text):
  - Experience rating
  - Culture feedback
  - Manager feedback
  - Compensation feedback
  - Rehire willingness
- Reason for leaving (enum + free text)
- Creates offboarding request with status=PENDING
- Auto-creates approval records:
  - Manager (from employee.managerId)
  - HR (any HR in org)
  - CEO (if policy.useCEOApproval = true)

### 4. Approval Workflow

- Manager/HR/CEO can approve/deny with comments
- Status transitions:
  - PENDING → IN_REVIEW (after survey submission)
  - IN_REVIEW → APPROVED (all approvals complete)
  - IN_REVIEW → DENIED (any denial)
  - PENDING → AUTO_APPROVED (after autoApproveDays)

### 5. Auto-Approval

- Daily cron job runs at 00:30 Asia/Kolkata
- Scans requests where `now - requestedAt >= autoApproveDays`
- Auto-approves all pending approvals
- Sets status to AUTO_APPROVED
- Records audit log with system actor

### 6. Exit Checklist

- Calculates blockers:
  - `leaves_remaining` - from leave ledger
  - `financials_due` - pending reimbursements/dues (in minor currency units)
  - `assets_pending` - count of assets to return
  - `compliance_clear` - toggle by HR/Compliance
  - `finance_clear` - toggle by Finance
  - `it_clear` - toggle by IT
- All must be clear before F&F scheduling

### 7. F&F Settlement Scheduling

- Daily cron job runs at 01:00 Asia/Kolkata
- Calculates F&F date when:
  - All approvals are APPROVED/AUTO_APPROVED
  - Checklist is clear (financeClear, complianceClear, itClear, assetsPending=0)
  - Within last week of notice period or past it
- Sets `fnf_pay_date` = 15th of month AFTER lastWorkingDay
- Handles year rollover (December → January next year)
- All calculations respect Asia/Kolkata timezone

### 8. PDF Letter Generation

- HR action: "Generate Experience Letter (PDF)"
- Available when:
  - Status is APPROVED/AUTO_APPROVED
  - lastWorkingDay reached
- Uses HTML template with parameterized fields:
  - Company address, website, reference number
  - Employee name, code, location
  - Date of joining, relieving date
  - Designation, local grade
  - Support email
- Generates PDF using server-side HTML→PDF (e.g., Puppeteer)
- Stores in object storage, saves URL in `offboarding_requests.letter_url`
- HR can view/download

### 9. Data Minimization

- On finalization (after lastWorkingDay + letter generation + checklist clear):
  - Soft-delete Employee (`isSoftDeleted=true`, `status=OFFBOARDED`)
  - Move minimal fields to `offboarded_identities`:
    - former_emp_id, emp_code, full_name
    - email_hash (SHA-256 hash, never plaintext)
    - last_working_day, designation, grade, reason, letter_url
  - Null or purge non-essential PII from Employee record
  - Keep payroll/accounting references by foreign key

### 10. Rehire Flow

- HR searches by email hash or emp_code
- Creates rehire request
- Requires approvals: HR and Manager
- On both APPROVED:
  - Creates/restores Employee record
  - Sets status to REHIRED or ACTIVE
  - Re-assigns manager, applies current policy
  - Migrates minimal retained info back
  - Does NOT restore full historical PII

## Security & Privacy

- Mask display by default
- Do not log raw OTPs or PII
- Hash emails for retention (SHA-256)
- Soft-delete for employee records
- Purge non-essential fields on finalize
- Access checks everywhere (RBAC)
- Return 403 for unauthorized views

## Cron Jobs

1. **Auto-approve** - Daily at 00:30 Asia/Kolkata
   - Scans pending requests older than autoApproveDays
   - Auto-approves and sets status to AUTO_APPROVED

2. **F&F Date Calculation** - Daily at 01:00 Asia/Kolkata
   - Recomputes fnf_pay_date for eligible requests
   - Notifies stakeholders

## Notifications

- In-app + email for:
  - Request submitted
  - Approvals requested
  - Approval outcomes
  - Auto-approval
  - Blockers identified
  - F&F date set
  - Letter generated
  - Finalization complete
  - Rehire approval outcomes

## Testing

### Unit Tests
- Masking utilities
- F&F scheduler date math (edge cases: month/year rollovers)
- Auto-approve logic
- RBAC checks

### Integration Tests
- Full happy-path offboarding
- Auto-approve path
- Denied path
- Rehire path

### E2E Tests
- Employee → request → verifications → survey → approvals → checklist → F&F scheduled → letter → finalize → rehire

## Usage

### Seed Default Policy

```sql
INSERT INTO offboarding_policies (
  org_id, name, notice_period_days, auto_approve_days, use_ceo_approval, is_default
)
VALUES (
  '<org_id>',
  'Default India HQ Policy',
  30,
  7,
  true,
  true
);
```

### Feature Flag

The module is feature-flagged as `OFFBOARDING_V1`. Enable in environment:

```env
FEATURE_OFFBOARDING_V1=true
```

## Files Created

### Backend
- `server/db/migrations/20250105_offboarding_module.sql` - Database schema
- `server/utils/masking.js` - Masking utilities
- `server/utils/date-helpers.js` - Date calculation helpers
- `server/services/offboarding-cron.js` - Cron jobs
- `server/routes/offboarding.js` - Offboarding API routes
- `server/routes/rehire.js` - Rehire API routes

### Frontend (To Be Implemented)
- `src/pages/OffboardingNew.tsx` - Employee resignation flow
- `src/pages/OffboardingDetail.tsx` - Request details page
- `src/pages/OffboardingPolicies.tsx` - Policy management
- `src/pages/OffboardingQueue.tsx` - HR queue
- `src/pages/RehireSearch.tsx` - Rehire search and management

## Next Steps

1. Implement PDF letter generation (Puppeteer/Playwright)
2. Add UI pages for employee and HR views
3. Integrate notification system
4. Add comprehensive tests
5. Add seed scripts for demo data

