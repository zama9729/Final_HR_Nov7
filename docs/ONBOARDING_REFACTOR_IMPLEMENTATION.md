# Onboarding Form Refactor & Background Check Implementation

## Overview

This document describes the comprehensive refactoring of the onboarding system to support extended candidate datasets, MinIO (S3a) document storage, and a complete background check workflow.

## Implementation Status

### ✅ Completed

1. **Database Migration** (`server/db/migrations/20251128_extended_onboarding_and_bg_check.sql`)
   - Extended `onboarding_data` table with all required fields:
     - Personal info: `full_legal_name`, `date_of_birth`, `gender`, `nationality`
     - Contact: `personal_phone`, `personal_email`
     - Government IDs: `government_ids` (JSONB for multiple IDs)
     - Tax: `tax_details` (JSONB), `tax_regime`
     - Dependents: `dependents` (JSONB array)
     - References: `references` (JSONB array)
     - Biometric: `biometric_registration_status`
   - Enhanced `onboarding_documents` table:
     - Added `s3_bucket`, `s3_key` for MinIO storage
     - Added `is_required`, `is_validated` flags
     - Added `document_category` enum
   - Created `onboarding_steps_history` table for audit trail
   - Created `background_checks` table for workflow tracking
   - Created `background_check_documents` table for document mapping
   - Added triggers for auto-creating background checks on document upload

2. **MinIO Service Enhancement** (`server/services/storage.js`)
   - Fixed and standardized MinIO client configuration
   - Support for new env vars:
     - `MINIO_ENDPOINT`
     - `MINIO_PORT`
     - `MINIO_ACCESS_KEY`
     - `MINIO_SECRET_KEY`
     - `MINIO_BUCKET_ONBOARDING`
     - `MINIO_REGION`
     - `MINIO_USE_SSL`
   - Automatic bucket creation if not exists
   - Enhanced error handling and fallback to local storage
   - Helper functions: `getOnboardingBucket()`, `isS3Available()`

3. **Background Check API** (`server/routes/background-check.js`)
   - `GET /api/onboarding/:candidateId/background-check` - Get BG check status and documents
   - `POST /api/onboarding/:candidateId/background-check/documents/:docId/approve` - Approve document
   - `POST /api/onboarding/:candidateId/background-check/documents/:docId/hold` - Put document on hold
   - `POST /api/onboarding/:candidateId/background-check/complete` - Complete BG check (prior check scenario)
   - Auto-linking documents to background checks
   - Status tracking and transitions
   - HR-only access controls

### 🚧 In Progress / Pending

4. **Onboarding Submit Endpoint Update** (`server/routes/onboarding.js`)
   - Update `/api/onboarding/submit` to handle all new fields
   - Support for government_ids JSONB
   - Support for dependents JSONB array
   - Support for references JSONB array
   - Update onboarding status tracking

5. **Onboarding Form Refactor** (`src/pages/Onboarding.tsx`)
   - Multi-step wizard with stepper UI:
     - Step 1: Personal & Contact Info
     - Step 2: IDs & Addresses
     - Step 3: Education & Experience (with document uploads)
     - Step 4: Banking & Tax
     - Step 5: Dependents & Final Review
   - Field-level validation
   - Autosave functionality
   - Required vs optional field indicators

6. **Document Upload Component** (`src/components/onboarding/OnboardingDocsUploader.tsx`)
   - MinIO integration with presigned URLs
   - Multiple file upload support
   - Document type selection
   - Upload progress tracking
   - Required document indicators

7. **Background Check UI** (HR-facing)
   - Component for employee profile: `src/components/hr/BackgroundCheckPanel.tsx`
   - Document list with status
   - Approve/Hold actions
   - Comments and notes
   - Status filters

8. **Onboarding Progress Display**
   - Progress bar in My Profile
   - Step completion indicators
   - Background check status display

## Database Schema

### New Fields in `onboarding_data`

| Field | Type | Required | Filled By | Description |
|-------|------|----------|-----------|-------------|
| `full_legal_name` | TEXT | Yes | Candidate | Full legal name as per government ID |
| `date_of_birth` | DATE | Yes | Candidate | Date of birth |
| `gender` | TEXT | Optional | Candidate | Gender (male/female/other/prefer_not_to_say) |
| `nationality` | TEXT | Yes | Candidate | Nationality/Citizenship status |
| `personal_phone` | TEXT | Yes | Candidate | Personal phone number |
| `personal_email` | TEXT | Yes | Candidate | Personal email address |
| `government_ids` | JSONB | Yes | Candidate | Multiple IDs: {aadhaar, pan, passport} |
| `tax_details` | JSONB | Optional | Candidate | Tax information |
| `tax_regime` | TEXT | Optional | Candidate | Tax regime (old/new) |
| `dependents` | JSONB | Optional | Candidate | Array of dependents |
| `references` | JSONB | Optional | Candidate | Reference details |
| `biometric_registration_status` | TEXT | - | Candidate/Employer | PENDING/COMPLETED/NOT_REQUIRED |
| `hr_notes` | TEXT | - | Employer | Internal HR notes |

### New Tables

1. **`onboarding_steps_history`** - Audit trail of onboarding steps
2. **`background_checks`** - Background check workflow tracking
3. **`background_check_documents`** - Links documents to background checks

## Environment Variables

### MinIO Configuration

```bash
# MinIO Configuration
MINIO_ENABLED=true
MINIO_ENDPOINT=localhost  # or minio (for Docker)
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET_ONBOARDING=hr-onboarding-docs
MINIO_REGION=us-east-1
MINIO_USE_SSL=false
MINIO_PUBLIC_URL=http://localhost:9000  # For browser access
```

## API Endpoints

### Background Check

- `GET /api/onboarding/:candidateId/background-check` - Get BG check status
- `POST /api/onboarding/:candidateId/background-check/documents/:docId/approve` - Approve document
- `POST /api/onboarding/:candidateId/background-check/documents/:docId/hold` - Put on hold
- `POST /api/onboarding/:candidateId/background-check/complete` - Complete BG check

### Onboarding (to be updated)

- `POST /api/onboarding/submit` - Submit onboarding data (needs update for new fields)
- `GET /api/onboarding/me/progress` - Get onboarding progress (to be created)

## Document Types

Supported document types for background check:
- `ID_PROOF` - Government ID proof
- `PAN` - PAN card
- `AADHAAR` / `AADHAR` - Aadhaar card
- `PASSPORT` - Passport
- `EDUCATION_CERT` - Education certificates
- `EXPERIENCE_LETTER` - Experience/relieving letters
- `BG_CHECK_DOC` - Other background check documents
- `SIGNED_CONTRACT` - Signed employment contract

## Onboarding Status Flow

1. `STARTED` - Onboarding initiated
2. `PASSWORD_SETUP` - Password setup completed
3. `DOCUMENTS_UPLOADED` - Required documents uploaded
4. `FIRST_LOGIN` - First login completed
5. `BG_CHECK_PENDING` - Background check pending
6. `BG_CHECK_HOLD` - Background check on hold (needs clarification)
7. `BG_CHECK_COMPLETED` - Background check completed
8. `ONBOARDING_COMPLETED` - All steps completed

## Background Check Workflow

1. **Document Upload**: Candidate uploads required documents
2. **Auto-Creation**: Background check record is automatically created
3. **HR Review**: HR reviews each document
4. **Actions**:
   - **Approve**: Document is approved, moves to next
   - **Hold**: Document needs clarification, candidate notified
5. **Completion**: When all required documents are approved, BG check is marked complete
6. **Prior Check**: If candidate has prior background check, HR can mark as verified to skip individual reviews

## Next Steps

1. Update onboarding submit endpoint to handle all new fields
2. Refactor onboarding form UI with multi-step wizard
3. Create document upload component with MinIO integration
4. Create background check UI component for HR
5. Add onboarding progress display in My Profile
6. Add tests for new functionality
7. Update documentation

## Migration Instructions

1. Run the migration:
   ```bash
   psql -U postgres -d hr_suite -f server/db/migrations/20251128_extended_onboarding_and_bg_check.sql
   ```

2. Configure MinIO environment variables

3. Ensure MinIO bucket exists (auto-created on first use)

4. Restart server to load new routes

## Backward Compatibility

- All new columns are nullable
- Existing records are migrated with default values
- Old onboarding_status enum is preserved
- New onboarding_status_extended is populated from old status

