# Unified Policy Management System

## Overview

This document describes the unified policy management system that supports multi-org policies with categories (LEAVE, OFFBOARDING, GENERAL), versioning, PDF generation, and RAG integration.

## Features

1. **Unified Policy Model**: Single schema supporting all policy types
2. **Multi-tenant Isolation**: Strong RLS (Row-Level Security) at organization level
3. **Versioning**: Immutable snapshots for each published version
4. **PDF Generation**: Automatic PDF generation on publish with MinIO/S3 storage
5. **RAG Integration**: Policies automatically available for semantic search (with setup)
6. **Employee Access**: Browse, search, read, and download published policies

## Database Schema

### Tables

#### `unified_policies`
- Core policy table with categories, status, versioning
- Fields: id, org_id, category, code, title, content_html, status, version, etc.
- Status: DRAFT, PENDING_REVIEW, PUBLISHED, ARCHIVED

#### `unified_policy_versions`
- Immutable snapshots of published versions
- Stores: snapshot_html, snapshot_markdown, file_storage_key (PDF location)
- Used for PDF generation and employee viewing

### RLS Policies

Both tables have RLS enabled with policies:
- `org_isolation_unified_policies`: Users can only see policies from their org
- `org_isolation_unified_policy_versions`: Version snapshots are org-scoped

## API Endpoints

### HR/Admin Endpoints

- `GET /api/unified-policies` - List policies with filters
- `GET /api/unified-policies/:id` - Get policy details with version history
- `POST /api/unified-policies` - Create new policy (DRAFT)
- `PATCH /api/unified-policies/:id` - Update policy
- `POST /api/unified-policies/:id/publish` - Publish policy (creates version, generates PDF)
- `POST /api/unified-policies/:id/archive` - Archive policy
- `GET /api/unified-policies/:id/versions` - Get version history
- `GET /api/unified-policies/:id/versions/:version` - Get specific version
- `GET /api/unified-policies/:id/versions/:version/download` - Download PDF
- `POST /api/unified-policies/:id/rag/ingest` - Ingest policy into RAG
- `POST /api/unified-policies/rag/reindex` - Re-index all policies for RAG

### Employee Endpoints

- `GET /api/unified-policies/me/policies` - List published policies
- `GET /api/unified-policies/me/policies/:id` - Get published policy detail
- `GET /api/unified-policies/:id/versions/:version/download` - Download PDF

## Frontend Pages

### HR Policy Management
- **Route**: `/policies/unified`
- **Page**: `src/pages/UnifiedPolicyManagement.tsx`
- **Features**:
  - Create/edit policies with rich text content
  - Filter by category and status
  - Search policies
  - Publish with changelog
  - View version history
  - Download PDFs
  - Archive policies

### Employee Policy Library
- **Route**: `/policies/library`
- **Page**: `src/pages/PolicyLibrary.tsx`
- **Features**:
  - Browse published policies
  - Filter by category
  - Search policies
  - View policy content
  - Download PDFs
  - "New" badge for recently published policies

## Policy Lifecycle

1. **DRAFT**: Created by HR, can be edited
2. **PENDING_REVIEW** (optional): Sent for review/approval
3. **PUBLISHED**: 
   - Visible to employees
   - Version snapshot created
   - PDF generated and stored
   - RAG ingestion triggered (if configured)
4. **ARCHIVED**: No longer shown to employees, retained for history

## PDF Generation

- Automatically generated on publish
- Stored in MinIO/S3 at: `${org_id}/policies/${policy_id}/v${version}.pdf`
- Storage key saved in `unified_policy_versions.file_storage_key`
- Supports presigned URLs for S3 or direct streaming for local storage

## RAG Integration

### Setup

1. **Install dependencies** (optional, for automatic ingestion):
   ```bash
   npm install form-data node-fetch@2
   ```

2. **Configure RAG service URL**:
   ```env
   RAG_SERVICE_URL=http://localhost:8000
   ```

### Manual Ingestion

Use the `/rag/ingest` endpoint to manually ingest a policy:
```bash
POST /api/unified-policies/:id/rag/ingest
```

### Automatic Ingestion

Currently, policies are logged for ingestion on publish. To enable automatic ingestion:

1. Install `form-data` and `node-fetch@2` packages
2. Update the publish endpoint to use the full RAG ingestion code (currently commented)
3. Or set up a background job (Celery/Redis) to ingest policies asynchronously

### RAG Metadata

Policies are ingested with metadata:
- `org_id`: Organization ID for tenant isolation
- `policy_id`: Policy ID
- `policy_version`: Version number
- `category`: LEAVE, OFFBOARDING, or GENERAL
- `title`: Policy title
- `effective_from`: Effective date

## Migration

Run the migration to create the unified policy tables:

```sql
\i server/db/migrations/20250130_unified_policy_management.sql
```

Or the tables will be auto-created on first API call (with basic structure).

## Usage Examples

### Create a Policy

```typescript
await api.createUnifiedPolicy({
  category: 'LEAVE',
  title: 'Annual Leave Policy',
  short_description: 'Policy for annual leave entitlements',
  content_html: '<h1>Annual Leave Policy</h1><p>Content here...</p>',
  effective_from: '2025-01-01',
});
```

### Publish a Policy

```typescript
await api.publishUnifiedPolicy(policyId, 'Initial version');
```

### Employee Views Policy

```typescript
const policies = await api.getMyPolicies({ category: 'LEAVE' });
const policy = await api.getMyPolicy(policyId);
```

## Future Enhancements

1. **Rich Text Editor**: Integrate TipTap or Quill for WYSIWYG editing
2. **Approval Workflow**: Implement PENDING_REVIEW status with approver roles
3. **Policy Templates**: Pre-built templates for common policies
4. **Notifications**: Notify employees when new policies are published
5. **Analytics**: Track policy views and downloads
6. **Tags**: Add tagging system for better organization
7. **Branch-level Policies**: Extend to support branch-specific policies

## Notes

- Policy codes are auto-generated: `LEAVE-001`, `OFFB-001`, `POL-001`
- Versions are auto-incremented on publish
- Published policies cannot be edited directly (must archive and create new version)
- All queries are scoped by `org_id` via RLS
- PDFs are generated on-the-fly if not stored (fallback)



