# MinIO Document Storage Setup

This document describes the MinIO-based document storage system for onboarding documents.

## Overview

The HR platform now uses MinIO (S3-compatible object storage) for secure document storage during onboarding. Documents are uploaded directly to MinIO using presigned URLs, with metadata stored in PostgreSQL.

## Architecture

1. **Frontend** requests presigned upload URL from backend
2. **Frontend** uploads file directly to MinIO using presigned URL
3. **Frontend** calls completion endpoint with checksum and metadata
4. **Backend** validates, scans (stub), and saves metadata to PostgreSQL
5. **HR users** can review, approve/deny documents via API

## Prerequisites

- Docker and Docker Compose
- PostgreSQL (already running)
- Node.js 20+ (for backend)

## Quick Start

### 1. Start Services

```bash
docker compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MinIO (ports 9000 API, 9001 Console)
- API server (port 3001)

### 2. Create MinIO Bucket

Access MinIO Console at http://localhost:9001

- Username: `minioadmin` (default)
- Password: `minioadmin123` (default)

Or use MinIO client (mc):

```bash
# Install mc: https://min.io/docs/minio/linux/reference/minio-mc.html

# Set alias
mc alias set local http://localhost:9000 minioadmin minioadmin123

# Create bucket
mc mb local/hr-docs

# Set bucket policy (optional - for public access)
mc anonymous set download local/hr-docs
```

### 3. Run Database Migration

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U postgres -d hr_suite

# Run migration
\i server/db/migrations/20250125_minio_document_storage.sql
```

Or use the migration runner if available:

```bash
npm run migrate
```

### 4. Configure Environment Variables

Create or update `.env`:

```bash
# MinIO Configuration
MINIO_ENABLED=true
MINIO_ENDPOINT=http://minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET=hr-docs

# Storage Driver
DOCS_STORAGE_DRIVER=s3
DOCS_STORAGE_BUCKET=hr-docs
AWS_S3_ENDPOINT=http://minio:9000
AWS_S3_FORCE_PATH_STYLE=true
AWS_REGION=us-east-1
```

### 5. Restart API Service

```bash
docker compose restart api
```

## API Endpoints

### Employee Endpoints

#### POST `/api/onboarding/docs/presign`
Get presigned URL for upload.

**Request:**
```json
{
  "filename": "resume.pdf",
  "contentType": "application/pdf"
}
```

**Response:**
```json
{
  "url": "http://minio:9000/hr-docs/employees/.../resume.pdf?X-Amz-Algorithm=...",
  "key": "employees/tenant123/user456/1234567890_abc123.pdf",
  "expiresIn": 300
}
```

#### POST `/api/onboarding/docs/complete`
Complete upload after file is uploaded to MinIO.

**Request:**
```json
{
  "key": "employees/tenant123/user456/1234567890_abc123.pdf",
  "filename": "resume.pdf",
  "size": 102400,
  "checksum": "sha256:abc123...",
  "docType": "EDUCATION_CERT",
  "consent": true,
  "notes": ""
}
```

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "object_key": "employees/...",
    "filename": "resume.pdf",
    "size_bytes": 102400,
    "verification_status": "pending",
    "uploaded_at": "2025-01-25T10:00:00Z"
  }
}
```

#### GET `/api/onboarding/docs/:docId/download`
Get presigned download URL.

**Response:**
```json
{
  "success": true,
  "url": "http://minio:9000/hr-docs/...?X-Amz-Algorithm=...",
  "expiresIn": 900
}
```

### HR Endpoints

#### GET `/api/onboarding/docs/hr/employees/:id/documents`
List all documents for an employee (HR only).

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": "uuid",
      "object_key": "employees/...",
      "filename": "resume.pdf",
      "content_type": "application/pdf",
      "size_bytes": 102400,
      "verification_status": "pending",
      "uploaded_at": "2025-01-25T10:00:00Z"
    }
  ]
}
```

#### POST `/api/onboarding/docs/hr/documents/:docId/verify`
Approve or deny a document (HR only).

**Request:**
```json
{
  "action": "approve",  // or "deny"
  "note": "Document verified"
}
```

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "verification_status": "approved",
    "verified": true
  }
}
```

## Frontend Usage

### Upload Flow

```typescript
// 1. Get presigned URL
const { url, key } = await api.getPresignedUploadUrl(file.name, file.type);

// 2. Upload directly to MinIO
await fetch(url, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
});

// 3. Calculate checksum
const arrayBuffer = await file.arrayBuffer();
const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

// 4. Complete upload
await api.completeDocumentUpload({
  key,
  filename: file.name,
  size: file.size,
  checksum,
  docType: 'EDUCATION_CERT',
  consent: true,
});
```

## Security

### Presigned URLs
- Upload URLs expire in 5 minutes
- Download URLs expire in 15 minutes
- URLs are single-use for uploads

### Access Control
- Employees can only download their own documents
- HR users can view/download all documents
- Verification actions are logged in audit tables

### Malware Scanning
Currently a stub that always returns `clean: true`. To implement:

1. **ClamAV Integration:**
   ```javascript
   // In server/routes/document-upload.js
   async function scanFile(objectKey) {
     // Download file from MinIO
     // Run through ClamAV
     // Return { clean: boolean, threat: string | null }
   }
   ```

2. **Cloud Function:**
   ```javascript
   async function scanFile(objectKey) {
     const response = await fetch('https://your-scan-function.com/scan', {
       method: 'POST',
       body: JSON.stringify({ objectKey }),
     });
     return response.json();
   }
   ```

## Data Persistence

### MinIO Data
MinIO data is stored in Docker volume `minio_data`:
- Location: `./minio/data` (if using bind mount)
- Or Docker volume: `final_hr_nov7_minio_data`

### PostgreSQL Metadata
Document metadata is stored in:
- `hr_documents` - Main document table
- `onboarding_documents` - Legacy compatibility table
- `hr_document_audit_logs` - Audit trail

## Troubleshooting

### MinIO Not Starting
```bash
# Check logs
docker compose logs minio

# Verify volumes
docker volume ls | grep minio
```

### Upload Fails
1. Check MinIO is healthy: `docker compose ps minio`
2. Verify bucket exists: `mc ls local/hr-docs`
3. Check API logs: `docker compose logs api`
4. Verify environment variables are set

### Download URL Expired
Presigned URLs expire after 15 minutes. Request a new one via the API.

## Production Considerations

1. **Change Default Credentials:**
   ```bash
   MINIO_ROOT_USER=your-secure-username
   MINIO_ROOT_PASSWORD=your-secure-password
   ```

2. **Enable SSL/TLS:**
   - Use reverse proxy (nginx/traefik) with SSL
   - Or configure MinIO with certificates

3. **Backup Strategy:**
   - Backup MinIO data volume regularly
   - Backup PostgreSQL metadata
   - Consider MinIO replication for HA

4. **Monitoring:**
   - Monitor MinIO disk usage
   - Set up alerts for failed uploads
   - Track document verification metrics

5. **Compliance:**
   - Implement document retention policies
   - Enable audit logging (already implemented)
   - Consider encryption at rest

## Testing

See `server/tests/document-upload.test.js` for integration tests.

Run tests:
```bash
npm test
```

## Migration from Local Storage

If migrating from local file storage:

1. Export existing documents
2. Upload to MinIO using migration script
3. Update `storage_key` in database
4. Set `DOCS_STORAGE_DRIVER=s3` in environment

## Support

For issues or questions:
- Check logs: `docker compose logs api minio`
- Review audit logs in `hr_document_audit_logs` table
- Verify MinIO console: http://localhost:9001

