# Onboarding Document Upload - Implementation Summary

## Overview

This implementation fixes the redirect bug in the onboarding document upload flow and adds MinIO (S3-compatible) storage for secure document management.

## Changes Made

### 1. Bug Fix: Redirect Issue ✅

**Problem:** Onboarding page redirected to dashboard prematurely during document upload.

**Solution:**
- Added `isUploading` state to prevent status checks during upload
- Modified `fetchEmployeeId` to skip redirect when upload is in progress
- Upload flow now stays on page until completion

**Files Changed:**
- `src/pages/Onboarding.tsx` - Added upload state guard

### 2. MinIO Integration ✅

**Added:**
- MinIO service in `docker-compose.yml`
- Presigned URL upload flow (direct to MinIO)
- Database schema for `hr_documents` table
- Backend endpoints for presign, complete, download, verify

**Files Changed:**
- `docker-compose.yml` - Added MinIO service
- `server/db/migrations/20250125_minio_document_storage.sql` - New migration
- `server/services/storage.js` - Added presigned URL functions
- `server/routes/document-upload.js` - New route handlers
- `server/index.js` - Registered new routes
- `server/package.json` - Added `@aws-sdk/s3-request-presigner`

### 3. Frontend Updates ✅

**Updated:**
- `Onboarding.tsx` - Uses presigned URL flow
- `OnboardingDocsUploader.tsx` - Direct upload to MinIO with progress tracking
- `src/lib/api.ts` - Added new API methods

**Files Changed:**
- `src/pages/Onboarding.tsx`
- `src/components/onboarding/OnboardingDocsUploader.tsx`
- `src/lib/api.ts`

### 4. Documentation & Tests ✅

**Added:**
- `docs/MINIO_DOCUMENT_STORAGE.md` - Comprehensive setup guide
- `server/tests/document-upload.test.js` - Integration tests

## Quick Start

### 1. Start Services

```bash
docker compose up -d
```

### 2. Create MinIO Bucket

Access MinIO Console: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin123`

Or use CLI:
```bash
mc alias set local http://localhost:9000 minioadmin minioadmin123
mc mb local/hr-docs
```

### 3. Run Migration

```bash
docker compose exec postgres psql -U postgres -d hr_suite -f /docker-entrypoint-initdb.d/20250125_minio_document_storage.sql
```

Or manually:
```bash
docker compose exec postgres psql -U postgres -d hr_suite
\i server/db/migrations/20250125_minio_document_storage.sql
```

### 4. Configure Environment

Add to `.env`:
```bash
MINIO_ENABLED=true
MINIO_ENDPOINT=http://minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET=hr-docs
DOCS_STORAGE_DRIVER=s3
```

### 5. Restart API

```bash
docker compose restart api
```

## API Endpoints

### Employee
- `POST /api/onboarding/docs/presign` - Get presigned upload URL
- `POST /api/onboarding/docs/complete` - Complete upload after file is in MinIO
- `GET /api/onboarding/docs/:docId/download` - Get presigned download URL

### HR
- `GET /api/onboarding/docs/hr/employees/:id/documents` - List employee documents
- `POST /api/onboarding/docs/hr/documents/:docId/verify` - Approve/deny document

## Testing

Run integration tests:
```bash
npm test
```

Or manually:
```bash
node server/tests/document-upload.test.js
```

## File Structure

```
server/
  db/migrations/
    20250125_minio_document_storage.sql    # New migration
  routes/
    document-upload.js                      # New route handlers
  services/
    storage.js                              # Updated with presigned URLs
  tests/
    document-upload.test.js                 # New tests

src/
  pages/
    Onboarding.tsx                          # Fixed redirect bug
  components/onboarding/
    OnboardingDocsUploader.tsx              # Updated upload flow
  lib/
    api.ts                                  # New API methods

docs/
  MINIO_DOCUMENT_STORAGE.md                # Setup guide

docker-compose.yml                          # Added MinIO service
```

## Security Features

1. **Presigned URLs** - Short-lived (5 min upload, 15 min download)
2. **Checksum Validation** - SHA-256 verification
3. **Malware Scan Stub** - Ready for ClamAV/cloud integration
4. **Audit Logging** - All actions logged in `hr_document_audit_logs`
5. **Access Control** - Employees see own docs, HR sees all

## Next Steps

1. **Implement Malware Scanning:**
   - Replace stub in `server/routes/document-upload.js`
   - Options: ClamAV, AWS Lambda, cloud scanner

2. **Production Hardening:**
   - Change MinIO default credentials
   - Enable SSL/TLS
   - Set up backups
   - Configure retention policies

3. **Monitoring:**
   - Track upload success rates
   - Monitor MinIO disk usage
   - Alert on failed scans

## Troubleshooting

### MinIO Not Starting
```bash
docker compose logs minio
docker compose ps minio
```

### Upload Fails
1. Check MinIO health: `docker compose ps minio`
2. Verify bucket exists: `mc ls local/hr-docs`
3. Check API logs: `docker compose logs api`
4. Verify env vars: `docker compose exec api env | grep MINIO`

### Migration Issues
```bash
# Check if tables exist
docker compose exec postgres psql -U postgres -d hr_suite -c "\dt hr_documents"

# Re-run migration if needed
docker compose exec postgres psql -U postgres -d hr_suite -f /path/to/migration.sql
```

## Commit Messages

Suggested commits:
```
fix(onboarding): prevent premature redirect during document upload

feat(storage): add MinIO docker-compose and S3 client config

feat(docs): add hr_documents migration and presigned URL support

feat(api): implement presign, complete, download, verify endpoints

test: add integration tests for document upload flow

docs: add MinIO setup and API documentation
```

## Support

For detailed setup instructions, see `docs/MINIO_DOCUMENT_STORAGE.md`.

For issues:
1. Check logs: `docker compose logs api minio`
2. Review audit logs in database
3. Verify MinIO console: http://localhost:9001

