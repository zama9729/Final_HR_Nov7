# Payroll Side Implementation Guide

This guide provides the implementation steps for the Payroll application to integrate with the HR system via SSO.

## Prerequisites

1. Payroll application is running (Node.js/Express or similar)
2. PostgreSQL database for Payroll
3. Access to HR system's JWT secret (shared secret)

## Step 1: Run Database Migrations

Run the migrations in order:

```bash
# 1. Backup database first
./scripts/backup.sh

# 2. Run migrations
psql $PAYROLL_DB_URL -f migrations/001_add_hr_integration.sql
psql $PAYROLL_DB_URL -f migrations/002_add_org_scoping.sql
```

## Step 2: Install Dependencies

```bash
npm install jsonwebtoken @types/jsonwebtoken
```

## Step 3: Implement JWT Verification Middleware

Create `src/middleware/sso.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface HrUser {
  hrUserId: string;
  orgId: string;
  email: string;
  name: string;
  roles: string[];
  payrollRole: 'payroll_admin' | 'payroll_employee';
}

declare global {
  namespace Express {
    interface Request {
      hrUser?: HrUser;
    }
  }
}

export async function verifyHrSsoToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.query.token as string;

  if (!token) {
    return res.status(401).json({ error: 'SSO token required' });
  }

  try {
    const secret = process.env.HR_JWT_SECRET || process.env.JWT_SECRET || 'your-shared-secret-key';
    const payload = jwt.verify(token, secret) as any;

    // Validate claims
    if (payload.iss !== 'hr-app' || payload.aud !== 'payroll-app') {
      return res.status(401).json({ error: 'Invalid token issuer/audience' });
    }

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Attach to request
    req.hrUser = {
      hrUserId: payload.sub,
      orgId: payload.org_id,
      email: payload.email,
      name: payload.name,
      roles: payload.roles || [],
      payrollRole: payload.payroll_role || 'payroll_employee'
    };

    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

## Step 4: Implement User Service

Create `src/services/user-service.ts`:

```typescript
import { Pool } from 'pg';
import { HrUser } from '../middleware/sso';

const pool = new Pool({
  connectionString: process.env.PAYROLL_DB_URL || process.env.DATABASE_URL,
});

export interface PayrollUser {
  id: string;
  email: string;
  hr_user_id: string;
  org_id: string;
  payroll_role: 'payroll_admin' | 'payroll_employee';
  first_name?: string;
  last_name?: string;
}

/**
 * Upsert Payroll user from HR SSO data
 */
export async function upsertPayrollUser(hrUser: HrUser): Promise<PayrollUser> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if user exists by hr_user_id
    let userResult = await client.query(
      `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
       FROM users
       WHERE hr_user_id = $1`,
      [hrUser.hrUserId]
    );
    
    let user: PayrollUser;
    
    if (userResult.rows.length > 0) {
      // Update existing user
      user = userResult.rows[0];
      
      await client.query(
        `UPDATE users
         SET 
           email = $1,
           org_id = $2,
           payroll_role = $3,
           first_name = COALESCE($4, first_name),
           last_name = COALESCE($5, last_name),
           updated_at = now()
         WHERE hr_user_id = $6`,
        [
          hrUser.email,
          hrUser.orgId,
          hrUser.payrollRole,
          hrUser.name.split(' ')[0],
          hrUser.name.split(' ').slice(1).join(' '),
          hrUser.hrUserId
        ]
      );
    } else {
      // Check if user exists by email (for linking existing users)
      const emailResult = await client.query(
        `SELECT id, email FROM users WHERE email = $1`,
        [hrUser.email]
      );
      
      if (emailResult.rows.length > 0) {
        // Link existing user by email
        await client.query(
          `UPDATE users
           SET 
             hr_user_id = $1,
             org_id = $2,
             payroll_role = $3,
             updated_at = now()
           WHERE email = $4`,
          [hrUser.hrUserId, hrUser.orgId, hrUser.payrollRole, hrUser.email]
        );
        
        user = {
          id: emailResult.rows[0].id,
          email: hrUser.email,
          hr_user_id: hrUser.hrUserId,
          org_id: hrUser.orgId,
          payroll_role: hrUser.payrollRole
        };
      } else {
        // Create new user
        const insertResult = await client.query(
          `INSERT INTO users (
            hr_user_id, email, org_id, payroll_role, first_name, last_name
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, hr_user_id, org_id, payroll_role, first_name, last_name`,
          [
            hrUser.hrUserId,
            hrUser.email,
            hrUser.orgId,
            hrUser.payrollRole,
            hrUser.name.split(' ')[0],
            hrUser.name.split(' ').slice(1).join(' ')
          ]
        );
        
        user = insertResult.rows[0];
      }
    }
    
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get Payroll user by hr_user_id
 */
export async function getPayrollUserByHrId(hrUserId: string): Promise<PayrollUser | null> {
  const result = await pool.query(
    `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
     FROM users
     WHERE hr_user_id = $1`,
    [hrUserId]
  );
  
  return result.rows[0] || null;
}
```

## Step 5: Implement SSO Route

Create `src/routes/sso.ts`:

```typescript
import { Router } from 'express';
import { verifyHrSsoToken } from '../middleware/sso';
import { upsertPayrollUser } from '../services/user-service';

const router = Router();

router.get('/sso', verifyHrSsoToken, async (req, res) => {
  try {
    const hrUser = req.hrUser!;
    
    // Auto-provision user
    const user = await upsertPayrollUser(hrUser);
    
    // Set session (adjust based on your session management)
    req.session.userId = user.id;
    req.session.payrollRole = user.payroll_role;
    req.session.orgId = user.org_id;
    req.session.hrUserId = user.hr_user_id;
    
    // Log SSO success
    console.log(`SSO successful: ${user.email} (${user.payroll_role})`);
    
    // Redirect based on role
    const destination = hrUser.payrollRole === 'payroll_admin' 
      ? '/admin/dashboard' 
      : '/employee/home';
    
    res.redirect(destination);
  } catch (error) {
    console.error('SSO error:', error);
    res.status(500).json({ 
      error: 'Failed to process SSO',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
```

## Step 6: Implement RBAC Guards

Create `src/middleware/rbac.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

export function requirePayrollAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.session.payrollRole !== 'payroll_admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      required: 'payroll_admin',
      current: req.session.payrollRole
    });
  }
  next();
}

export function requirePayrollEmployee(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!['payroll_admin', 'payroll_employee'].includes(req.session.payrollRole)) {
    return res.status(403).json({ 
      error: 'Access denied',
      required: ['payroll_admin', 'payroll_employee'],
      current: req.session.payrollRole
    });
  }
  next();
}

/**
 * Middleware to ensure all queries are scoped by org_id
 */
export function requireOrgContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.session.orgId) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  next();
}
```

## Step 7: Apply Org Scoping to Routes

Update all Payroll routes to include org scoping:

```typescript
// Example: Get payroll runs
router.get('/admin/payroll-runs', 
  requirePayrollAdmin,
  requireOrgContext,
  async (req, res) => {
    const orgId = req.session.orgId;
    
    const result = await pool.query(
      `SELECT * FROM payroll_runs 
       WHERE org_id = $1 
       ORDER BY created_at DESC`,
      [orgId]
    );
    
    res.json(result.rows);
  }
);

// Example: Get employee payslips
router.get('/employee/payslips',
  requirePayrollEmployee,
  requireOrgContext,
  async (req, res) => {
    const userId = req.session.userId;
    const orgId = req.session.orgId;
    
    const result = await pool.query(
      `SELECT * FROM payslips 
       WHERE user_id = $1 AND org_id = $2
       ORDER BY pay_period_end DESC`,
      [userId, orgId]
    );
    
    res.json(result.rows);
  }
);
```

## Step 8: Register Routes

In your main app file (e.g., `src/app.ts`):

```typescript
import ssoRoutes from './routes/sso';
import { requireOrgContext } from './middleware/rbac';

// SSO route (public, no auth required - JWT is the auth)
app.use('/', ssoRoutes);

// All other routes should include org context
app.use('/admin', requireOrgContext, adminRoutes);
app.use('/employee', requireOrgContext, employeeRoutes);
```

## Step 9: Environment Variables

Add to `.env`:

```env
# HR JWT secret (must match HR system's PAYROLL_JWT_SECRET)
HR_JWT_SECRET=your-shared-secret-key

# Payroll database
PAYROLL_DB_URL=postgresql://user:pass@host:5432/payroll_db

# HR database (for ETL)
HR_DB_URL=postgresql://user:pass@host:5432/hr_db
```

## Step 10: Run ETL Backfill

After implementing the backend:

```bash
# 1. Install TypeScript dependencies
npm install -D typescript @types/node ts-node

# 2. Run ETL backfill
ts-node payroll-integration/scripts/etl_backfill.ts

# 3. Verify integrity
ts-node payroll-integration/scripts/verify_integrity.ts
```

## Testing

1. **Test SSO Flow**:
   - Login to HR system
   - Click "Payroll" in sidebar
   - Should redirect to Payroll with correct role

2. **Test Role Mapping**:
   - CEO/Admin/HR → Should land on `/admin/dashboard`
   - Others → Should land on `/employee/home`

3. **Test Auto-Provisioning**:
   - First-time user should be created automatically
   - Existing user should be linked by email

4. **Test Org Scoping**:
   - User from Org A should not see Org B's data
   - All queries should include `org_id` filter

## Troubleshooting

### JWT Verification Fails

- Check `HR_JWT_SECRET` matches HR system's `PAYROLL_JWT_SECRET`
- Verify token hasn't expired (5 minute expiry)
- Check token format in browser network tab

### User Not Created

- Check database connection
- Verify migrations have been run
- Check error logs for SQL errors

### Wrong Role Assigned

- Verify HR roles are correct
- Check role mapping logic
- Review `payroll_role` column in database

### Org Scoping Not Working

- Ensure all queries include `org_id` filter
- Verify `org_id` is set on all records
- Check session has `orgId` set

## Next Steps

1. Implement Payroll-specific features using `hr_user_id` and `org_id`
2. Sync additional data from HR as needed
3. Set up scheduled jobs for data sync (optional)
4. Add monitoring and alerting for SSO failures

