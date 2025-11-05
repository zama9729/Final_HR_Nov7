# Payroll Integration Guide

This document describes the integration between the HR system and the Payroll application, enabling Single Sign-On (SSO) and data synchronization.

## Architecture Overview

```
HR System (Source of Truth)
    ↓
  JWT SSO Token
    ↓
Payroll Application
    ↓
Auto-provision User
    ↓
Role-based Access
```

## Components

### 1. HR Backend - SSO Endpoint

**Endpoint**: `GET /api/payroll/sso`

**Authentication**: Required (JWT token)

**Response**:
```json
{
  "success": true,
  "redirectUrl": "https://payroll.example.com/sso?token=...",
  "expiresIn": 300,
  "payrollRole": "payroll_admin"
}
```

**JWT Claims**:
```json
{
  "iss": "hr-app",
  "aud": "payroll-app",
  "sub": "<hr_user_id>",
  "org_id": "<org_uuid>",
  "email": "user@company.com",
  "name": "Full Name",
  "roles": ["CEO", "HR"],
  "payroll_role": "payroll_admin",
  "exp": <timestamp + 300>
}
```

### 2. Payroll Backend - SSO Handler

**Endpoint**: `GET /sso?token=<jwt>`

**Process**:
1. Verify JWT signature
2. Extract claims
3. Map HR roles → Payroll roles
4. Auto-provision user if missing
5. Redirect to appropriate dashboard

### 3. Role Mapping

| HR Role | Payroll Role |
|---------|--------------|
| CEO, Admin, HR | `payroll_admin` |
| Director, Manager, Employee | `payroll_employee` |

## Database Schema Changes

### Payroll Database Migrations

#### Migration 001: Add HR Integration Columns

```sql
-- Add HR user ID and org ID to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS hr_user_id UUID,
ADD COLUMN IF NOT EXISTS org_id UUID,
ADD COLUMN IF NOT EXISTS payroll_role VARCHAR(50);

-- Create extension table for Payroll-specific fields
CREATE TABLE IF NOT EXISTS payroll_user_ext (
  hr_user_id UUID PRIMARY KEY,
  bank_account VARCHAR(64),
  bank_name VARCHAR(255),
  bank_branch VARCHAR(255),
  ifsc_code VARCHAR(16),
  pan VARCHAR(16),
  aadhar VARCHAR(16),
  passport VARCHAR(32),
  tax_reg_no VARCHAR(32),
  esi_number VARCHAR(32),
  pf_number VARCHAR(32),
  uan VARCHAR(32),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create organizations mapping table
CREATE TABLE IF NOT EXISTS payroll_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_org_id UUID UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Migration 002: Add Org Scoping

Add `org_id` to all Payroll tables for multi-tenant isolation:

```sql
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE payroll_run_employees ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS org_id UUID;
-- ... (add to all relevant tables)
```

## Environment Variables

### HR System

```env
# Enable Payroll integration
PAYROLL_INTEGRATION_ENABLED=true

# Payroll application URL
PAYROLL_BASE_URL=https://payroll.example.com

# JWT secret for Payroll SSO (can be same as JWT_SECRET or separate)
PAYROLL_JWT_SECRET=your-shared-secret-key
```

### Payroll System

```env
# HR system URL (for verification)
HR_BASE_URL=https://hr.example.com

# JWT secret (must match HR's PAYROLL_JWT_SECRET)
HR_JWT_SECRET=your-shared-secret-key

# HR database connection (for ETL)
HR_DB_URL=postgresql://user:pass@host:5432/hr_db

# Payroll database connection
PAYROLL_DB_URL=postgresql://user:pass@host:5432/payroll_db
```

## Implementation Steps

### Step 1: HR Backend Setup

1. ✅ SSO endpoint created: `/api/payroll/sso`
2. ✅ Route registered in `server/index.js`
3. ✅ Feature flag support: `PAYROLL_INTEGRATION_ENABLED`

### Step 2: HR Frontend Setup

1. ✅ Payroll link added to sidebar
2. ✅ SSO API method added: `api.getPayrollSso()`
3. ✅ Feature flag check in sidebar

### Step 3: Payroll Backend Setup

1. Run migrations: `001_add_hr_integration.sql` and `002_add_org_scoping.sql`
2. Implement JWT verification middleware
3. Implement auto-provisioning logic
4. Implement RBAC guards

### Step 4: ETL Backfill

1. Run backup script: `./scripts/backup.sh`
2. Run ETL script: `ts-node scripts/etl_backfill.ts`
3. Verify integrity: `ts-node scripts/verify_integrity.ts`

### Step 5: Testing

1. Test SSO flow end-to-end
2. Test role mapping
3. Test auto-provisioning
4. Test org scoping

## Payroll Backend Implementation

### JWT Verification Middleware

```typescript
// payroll/src/middleware/sso.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export async function verifyHrSsoToken(req: Request, res: Response, next: NextFunction) {
  const token = req.query.token as string;
  
  if (!token) {
    return res.status(401).json({ error: 'SSO token required' });
  }

  try {
    const secret = process.env.HR_JWT_SECRET || 'your-shared-secret-key';
    const payload = jwt.verify(token, secret) as any;
    
    // Validate claims
    if (payload.iss !== 'hr-app' || payload.aud !== 'payroll-app') {
      return res.status(401).json({ error: 'Invalid token issuer/audience' });
    }
    
    // Attach to request
    req.hrUser = {
      hrUserId: payload.sub,
      orgId: payload.org_id,
      email: payload.email,
      name: payload.name,
      roles: payload.roles,
      payrollRole: payload.payroll_role
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

### Auto-Provisioning Handler

```typescript
// payroll/src/routes/sso.ts
import { Router } from 'express';
import { verifyHrSsoToken } from '../middleware/sso';
import { upsertPayrollUser } from '../services/user-service';

const router = Router();

router.get('/sso', verifyHrSsoToken, async (req, res) => {
  const hrUser = req.hrUser;
  
  // Auto-provision user
  const user = await upsertPayrollUser({
    hrUserId: hrUser.hrUserId,
    orgId: hrUser.orgId,
    email: hrUser.email,
    name: hrUser.name,
    payrollRole: hrUser.payrollRole
  });
  
  // Set session
  req.session.userId = user.id;
  req.session.payrollRole = user.payroll_role;
  req.session.orgId = user.org_id;
  
  // Redirect based on role
  const destination = hrUser.payrollRole === 'payroll_admin' 
    ? '/admin/dashboard' 
    : '/employee/home';
  
  res.redirect(destination);
});
```

### RBAC Guards

```typescript
// payroll/src/middleware/rbac.ts
export function requirePayrollAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.payrollRole !== 'payroll_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requirePayrollEmployee(req: Request, res: Response, next: NextFunction) {
  if (!['payroll_admin', 'payroll_employee'].includes(req.session.payrollRole)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}
```

## Data Flow

### SSO Flow

1. User clicks "Payroll" in HR sidebar
2. HR frontend calls `/api/payroll/sso`
3. HR backend generates JWT with user claims
4. HR frontend opens Payroll URL with JWT token
5. Payroll backend verifies JWT
6. Payroll backend auto-provisions user if missing
7. Payroll backend sets session and redirects

### ETL Flow

1. Run backup script
2. Run ETL script to match users by email
3. Backfill `hr_user_id`, `org_id`, and `payroll_role`
4. Backfill `payroll_user_ext` from HR `onboarding_data`
5. Verify integrity

## Security Considerations

1. **JWT Expiry**: Tokens expire in 5 minutes
2. **Shared Secret**: Use strong, shared secret between HR and Payroll
3. **HTTPS**: Always use HTTPS in production
4. **Org Isolation**: All Payroll queries must be scoped by `org_id`
5. **Audit Logging**: All SSO attempts are logged

## Rollback Plan

1. **Disable Feature**: Set `PAYROLL_INTEGRATION_ENABLED=false` in HR
2. **Revert Migrations**: Run rollback scripts (if created)
3. **Restore Backup**: Restore Payroll database from backup
4. **Remove Sidebar Link**: Feature flag hides link automatically

## Troubleshooting

### SSO Token Invalid

- Check JWT secret matches in both systems
- Verify token hasn't expired
- Check token format and claims

### User Not Auto-Provisioned

- Check Payroll database connection
- Verify migrations have been run
- Check error logs in Payroll backend

### Role Mapping Incorrect

- Verify HR roles are correctly assigned
- Check role mapping function logic
- Review Payroll user's `payroll_role` column

### Org Scoping Issues

- Ensure all queries include `org_id` filter
- Verify `org_id` is set correctly on all records
- Check composite indexes are created

## Testing Checklist

- [ ] SSO flow works end-to-end
- [ ] CEO/Admin/HR get `payroll_admin` role
- [ ] Others get `payroll_employee` role
- [ ] Auto-provisioning works for new users
- [ ] Existing users are linked correctly
- [ ] Org scoping prevents cross-org access
- [ ] Feature flag hides link when disabled
- [ ] ETL backfill completes successfully
- [ ] Integrity verification passes

## References

- [Schema Mapping](./schema-mapping.md)
- [JWT Specification](https://tools.ietf.org/html/rfc7519)
- [Multi-Tenant Implementation](../MULTI_TENANT_IMPLEMENTATION.md)

