import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { appRouter } from "./routes/app.js";
import ssoRouter from "./routes/sso.js";
import provisionRouter from "./routes/provision.js";
import { query } from "./db.js";
import fs from "fs";
import path from "path";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const proofsDirectory =
  process.env.PAYROLL_PROOFS_DIR || path.resolve(process.cwd(), "uploads", "tax-proofs");
fs.mkdirSync(proofsDirectory, { recursive: true });
app.use("/tax-proofs", express.static(proofsDirectory));

const receiptsDirectory =
  process.env.REIMBURSEMENTS_RECEIPT_DIR || path.resolve(process.cwd(), "uploads", "receipts");
fs.mkdirSync(receiptsDirectory, { recursive: true });
app.use("/receipts", express.static(receiptsDirectory));

// Ensure required tables exist on startup
async function ensureRequiredTables() {
  try {
    // Ensure pgcrypto extension exists for gen_random_uuid()
    await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    
    // Check if employees table exists
    const employeesCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employees'
      );
    `);
    
    if (!employeesCheck.rows[0]?.exists) {
      console.log('⚠️  Employees table does not exist, creating...');
      
      // Create employees table
      await query(`
        CREATE TABLE IF NOT EXISTS public.employees (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          employee_code TEXT NOT NULL,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          date_of_joining DATE NOT NULL,
          date_of_birth DATE,
          department TEXT,
          designation TEXT,
          status TEXT DEFAULT 'active',
          pan_number TEXT,
          aadhaar_number TEXT,
          bank_account_number TEXT,
          bank_ifsc TEXT,
          bank_name TEXT,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(tenant_id, employee_code)
        );
      `);
      
      // Ensure unique constraint on (tenant_id, email) exists
      try {
        await query(`
          CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_email_unique 
          ON public.employees(tenant_id, email);
        `);
      } catch (constraintError: any) {
        // Constraint might already exist, ignore error
        console.log('Unique constraint check:', constraintError.message);
      }
      
      console.log('✅ Employees table created');
    } else {
      console.log('✅ Employees table exists');

      // Self-heal legacy schemas: ensure employee_code column exists even if table was created earlier
      try {
        await query(`
          ALTER TABLE public.employees
          ADD COLUMN IF NOT EXISTS employee_code TEXT;
        `);
        console.log('✅ Ensured employees.employee_code column exists');
      } catch (err: any) {
        console.error('⚠️ Failed to ensure employees.employee_code column:', err.message);
      }
    }

    // Check if compensation_structures table exists
    const compCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'compensation_structures'
      );
    `);
    
    if (!compCheck.rows[0]?.exists) {
      console.log('⚠️  Compensation structures table does not exist, creating...');
      
      // Create compensation_structures table (no FK on created_by to avoid cross-system issues)
      await query(`
        CREATE TABLE IF NOT EXISTS public.compensation_structures (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          employee_id UUID NOT NULL,
          effective_from DATE NOT NULL,
          ctc DECIMAL(12,2) NOT NULL,
          basic_salary DECIMAL(12,2) NOT NULL,
          hra DECIMAL(12,2) DEFAULT 0,
          special_allowance DECIMAL(12,2) DEFAULT 0,
          da DECIMAL(12,2) DEFAULT 0,
          lta DECIMAL(12,2) DEFAULT 0,
          bonus DECIMAL(12,2) DEFAULT 0,
          cca DECIMAL(12,2) DEFAULT 0,
          conveyance DECIMAL(12,2) DEFAULT 0,
          medical_allowance DECIMAL(12,2) DEFAULT 0,
          pf_contribution DECIMAL(12,2) DEFAULT 0,
          esi_contribution DECIMAL(12,2) DEFAULT 0,
          created_by UUID,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      
      // Add new columns if they don't exist (for existing tables)
      await query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'compensation_structures' AND column_name = 'cca') THEN
            ALTER TABLE public.compensation_structures ADD COLUMN cca DECIMAL(12,2) DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'compensation_structures' AND column_name = 'conveyance') THEN
            ALTER TABLE public.compensation_structures ADD COLUMN conveyance DECIMAL(12,2) DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'compensation_structures' AND column_name = 'medical_allowance') THEN
            ALTER TABLE public.compensation_structures ADD COLUMN medical_allowance DECIMAL(12,2) DEFAULT 0;
          END IF;
        END $$;
      `);
      
      console.log('✅ Compensation structures table created');
    } else {
      console.log('✅ Compensation structures table exists');

      // Self-heal legacy schemas: drop FK on created_by if present to allow null/HR IDs
      try {
        await query(`
          DO $$
          DECLARE
            fk_name text;
          BEGIN
            SELECT tc.constraint_name
            INTO fk_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'compensation_structures'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'created_by'
            LIMIT 1;

            IF fk_name IS NOT NULL THEN
              EXECUTE format('ALTER TABLE public.compensation_structures DROP CONSTRAINT %I', fk_name);
            END IF;
          END $$;
        `);
        console.log('✅ Ensured compensation_structures.created_by has no foreign key constraint');
      } catch (err: any) {
        console.error('⚠️ Failed to relax compensation_structures.created_by FK:', err.message);
      }
    }

    // Check if organizations table exists
    const orgCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'organizations'
      );
    `);
    
    if (!orgCheck.rows[0]?.exists) {
      console.log('⚠️  Organizations table does not exist, creating...');
      
      // Create organizations table with all required columns
      await query(`
        CREATE TABLE IF NOT EXISTS public.organizations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID UNIQUE NOT NULL,
          org_name TEXT,
          subdomain TEXT,
          company_name TEXT,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      
      console.log('✅ Organizations table created');
    } else {
      console.log('✅ Organizations table exists');
      
      // Ensure all required columns exist (add if missing)
      await query(`
        ALTER TABLE public.organizations 
        ADD COLUMN IF NOT EXISTS company_name TEXT,
        ADD COLUMN IF NOT EXISTS org_name TEXT,
        ADD COLUMN IF NOT EXISTS subdomain TEXT,
        ADD COLUMN IF NOT EXISTS org_id UUID;
      `);
      
      // Ensure unique constraint on org_id exists
      await query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'organizations_org_id_key'
          ) THEN
            ALTER TABLE public.organizations 
            ADD CONSTRAINT organizations_org_id_key UNIQUE (org_id);
          END IF;
        END $$;
      `);
    }

    // Check if employee_reimbursements table exists
    const reimbursementsCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employee_reimbursements'
      );
    `);
    
    if (!reimbursementsCheck.rows[0]?.exists) {
      console.log('⚠️  employee_reimbursements table does not exist, creating...');
      
      // Create reimbursement_status enum if it doesn't exist
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reimbursement_status') THEN
            CREATE TYPE reimbursement_status AS ENUM (
              'pending',
              'approved',
              'rejected',
              'paid'
            );
          END IF;
        END
        $$;
      `);
      
      // Check if referenced tables exist
      const profilesCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'profiles'
        );
      `);
      const payrollRunsCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'payroll_runs'
        );
      `);
      
      const hasProfiles = profilesCheck.rows[0]?.exists;
      const hasPayrollRuns = payrollRunsCheck.rows[0]?.exists;
      
      // Build foreign key constraints conditionally
      let reviewedByFk = '';
      if (hasProfiles) {
        reviewedByFk = 'reviewed_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,';
      } else {
        reviewedByFk = 'reviewed_by_user_id UUID,';
      }
      
      let payrollRunFk = '';
      if (hasPayrollRuns) {
        payrollRunFk = 'payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,';
      } else {
        payrollRunFk = 'payroll_run_id UUID,';
      }
      
      // Create employee_reimbursements table
      await query(`
        CREATE TABLE IF NOT EXISTS public.employee_reimbursements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          amount NUMERIC(10, 2) NOT NULL,
          description TEXT,
          receipt_url TEXT,
          status reimbursement_status NOT NULL DEFAULT 'pending',
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ${reviewedByFk}
          reviewed_at TIMESTAMPTZ,
          ${payrollRunFk}
          CONSTRAINT chk_amount_positive CHECK (amount > 0)
        );
      `);
      
      // Create indexes
      await query(`
        CREATE INDEX IF NOT EXISTS idx_reimbursements_employee_id
          ON employee_reimbursements(employee_id);
      `);
      
      await query(`
        CREATE INDEX IF NOT EXISTS idx_reimbursements_status
          ON employee_reimbursements(status);
      `);
      
      console.log('✅ employee_reimbursements table created');
    } else {
      console.log('✅ employee_reimbursements table exists');
    }

    // Check if reimbursement_runs table exists
    const reimbursementRunsCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'reimbursement_runs'
      );
    `);
    
    if (!reimbursementRunsCheck.rows[0]?.exists) {
      console.log('⚠️  reimbursement_runs table does not exist, creating...');
      
      // Create reimbursement_run_status enum if it doesn't exist
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reimbursement_run_status') THEN
            CREATE TYPE reimbursement_run_status AS ENUM (
              'draft',
              'paid'
            );
          END IF;
        END
        $$;
      `);
      
      // Create reimbursement_runs table
      await query(`
        CREATE TABLE IF NOT EXISTS public.reimbursement_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          run_date DATE NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          total_claims INTEGER NOT NULL DEFAULT 0,
          reference_note TEXT,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      
      // Add foreign key to organizations if it exists
      try {
        await query(`
          ALTER TABLE reimbursement_runs
          ADD CONSTRAINT fk_reimbursement_runs_tenant
          FOREIGN KEY (tenant_id) REFERENCES organizations(id) ON DELETE CASCADE;
        `);
      } catch (fkError: any) {
        // Foreign key might already exist or organizations table might not exist
        console.log('Note: Could not add foreign key constraint:', fkError.message);
      }
      
      // Create indexes
      await query(`
        CREATE INDEX IF NOT EXISTS idx_reimbursement_runs_tenant_id
          ON reimbursement_runs(tenant_id);
      `);
      
      await query(`
        CREATE INDEX IF NOT EXISTS idx_reimbursement_runs_status
          ON reimbursement_runs(status);
      `);
      
      await query(`
        CREATE INDEX IF NOT EXISTS idx_reimbursement_runs_run_date
          ON reimbursement_runs(run_date);
      `);
      
      console.log('✅ reimbursement_runs table created');
    } else {
      console.log('✅ reimbursement_runs table exists');
    }

    // Add reimbursement_run_id column to employee_reimbursements if it doesn't exist
    try {
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employee_reimbursements' 
        AND column_name = 'reimbursement_run_id'
      `);
      
      if (columnCheck.rows.length === 0) {
        console.log('⚠️  Adding reimbursement_run_id column to employee_reimbursements...');
        await query(`
          ALTER TABLE employee_reimbursements
          ADD COLUMN reimbursement_run_id UUID;
        `);
        
        // Add foreign key if reimbursement_runs table exists
        try {
          await query(`
            ALTER TABLE employee_reimbursements
            ADD CONSTRAINT fk_reimbursements_run
            FOREIGN KEY (reimbursement_run_id) REFERENCES reimbursement_runs(id) ON DELETE SET NULL;
          `);
        } catch (fkError: any) {
          console.log('Note: Could not add foreign key constraint for reimbursement_run_id:', fkError.message);
        }
        
        await query(`
          CREATE INDEX IF NOT EXISTS idx_reimbursements_run_id
            ON employee_reimbursements(reimbursement_run_id);
        `);
        
        console.log('✅ Added reimbursement_run_id column to employee_reimbursements');
      }
    } catch (colError: any) {
      console.log('Note: Error checking/adding reimbursement_run_id column:', colError.message);
    }
  } catch (error: any) {
    console.error('⚠️  Error ensuring tables:', error.message);
    // Don't fail startup - continue anyway
  }
}

// Run on startup
ensureRequiredTables().catch(console.error);

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path}${req.query.token ? ' (with SSO token)' : ''}`);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/", ssoRouter); // SSO routes (public, JWT is the auth)
app.use("/", provisionRouter); // Tenant provisioning (bearer token)
app.use("/auth", authRouter);
app.use("/api", appRouter);

// Log all registered routes (for debugging)
console.log("[SERVER] Routes registered:");
console.log("[SERVER] - POST /api/employees");
console.log("[SERVER] - GET /api/employees");

// 404 handler - log unmatched routes
app.use((req, res, next) => {
  console.log(`[404] ${req.method} ${req.path} - Route not found`);
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Unhandled error:', err);
  console.error('Error stack:', err.stack);
  
  // Ensure we always send a response
  if (!res.headersSent) {
    res.status(500).json({ 
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred"
    });
  }
});

app.listen(port, () => {
  console.log(`API listening on :${port}`);
});

