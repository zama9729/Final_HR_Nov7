import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createPool, query as dbQuery } from './db/pool.js';
import authRoutes from './routes/auth.js';
import employeesRoutes from './routes/employees.js';
import profilesRoutes from './routes/profiles.js';
import onboardingRoutes, { ensureDocumentInfra } from './routes/onboarding.js';
import onboardingTrackerRoutes from './routes/onboarding-tracker.js';
import organizationsRoutes from './routes/organizations.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';
import notificationsRoutes from './routes/notifications.js';
import timesheetsRoutes from './routes/timesheets.js';
import leavePoliciesRoutes from './routes/leave-policies.js';
import leaveRequestsRoutes from './routes/leave-requests.js';
import appraisalCycleRoutes from './routes/appraisal-cycles.js';
import performanceReviewRoutes from './routes/performance-reviews.js';
import promotionsRoutes from './routes/promotions.js';
import { authenticateToken } from './middleware/auth.js';
import shiftsRoutes from './routes/shifts.js';
import workflowsRoutes from './routes/workflows.js';
import skillsRoutes from './routes/skills.js';
import projectsRoutes from './routes/projects.js';
import employeeProjectsRoutes from './routes/employee-projects.js';
import teamsRoutes from './routes/teams.js';
import reportingLinesRoutes from './routes/reporting-lines.js';
import holidaysRoutes from './routes/holidays.js';
import calendarRoutes from './routes/calendar.js';
import analyticsRoutes from './routes/analytics.js';
import employeeStatsRoutes from './routes/employee-stats.js';
import migrationsRoutes from './routes/migrations.js';
import aiRoutes from './routes/ai.js';
import importsRoutes from './routes/imports.js';
import checkInOutRoutes from './routes/check-in-out.js';
import opalMiniAppsRoutes from './routes/opal-mini-apps.js';
import attendanceRoutes from './routes/attendance.js';
import attendanceSettingsRoutes from './routes/attendance-settings.js';
import biometricRoutes from './routes/biometric.js';
import payrollRoutes from './routes/payroll.js';
import backgroundChecksRoutes from './routes/background-checks.js';
import terminationsRoutes from './routes/terminations.js';
import documentsRoutes from './routes/documents.js';
import offboardingRoutes from './routes/offboarding.js';
import rehireRoutes from './routes/rehire.js';
import policiesRoutes from './routes/policies.js';
import policyPlatformRoutes from './routes/policy-platform.js';
import policyManagementRoutes from './routes/policy-management.js';
import unifiedPoliciesRoutes from './routes/unified-policies.js';
import usersRoutes from './routes/users.js';
import payrollSsoRoutes from './routes/payroll-sso.js';
import taxDeclarationsRoutes from './routes/tax-declarations.js';
import reimbursementRoutes from './routes/reimbursements.js';
import reportsRoutes from './routes/reports.js';
import announcementsRoutes from './routes/announcements.js';
import teamScheduleEventsRoutes from './routes/team-schedule-events.js';
import setupRoutes from './routes/setup.js';
import branchesRoutes from './routes/branches.js';
import designationsRoutes from './routes/designations.js';
import superRoutes from './routes/super.js';
import auditLogsRoutes from './routes/audit-logs.js';
import schedulingRoutes from './routes/scheduling.js';
import rosterRoutes from './routes/roster.js';
import probationRoutes from './routes/probation.js';
import probationPoliciesRoutes from './routes/probation-policies.js';
import documentUploadRoutes from './routes/document-upload.js';
import backgroundCheckRoutes from './routes/background-check.js';
import employeeHistoryRoutes from './routes/employee-history.js';
import { setTenantContext } from './middleware/tenant.js';
import { scheduleHolidayNotifications, scheduleNotificationRules, scheduleProbationJobs, scheduleTimesheetReminders } from './services/cron.js';
import { scheduleAssignmentSegmentation } from './services/assignment-segmentation.js';
import { scheduleOffboardingJobs } from './services/offboarding-cron.js';
import { scheduleAutoLogout } from './services/attendance-auto-logout.js';
import { schedulePromotionApplication } from './services/promotion-cron.js';
import { createAttendanceTables } from './utils/createAttendanceTables.js';
import { createSchedulingTables } from './utils/createSchedulingTables.js';
import { ensureAdminRole } from './utils/runMigration.js';
import { ensureOnboardingColumns } from './utils/ensureOnboardingColumns.js';
import { ensureManagerRoles } from './utils/ensureManagerRoles.js';
import { scheduleAnalyticsRefresh } from './services/analytics-refresh.js';

dotenv.config();

// Ensure payroll integration is enabled in local/dev environments unless explicitly disabled at runtime
if (process.env.PAYROLL_INTEGRATION_ENABLED === 'false') {
  console.warn('[PAYROLL] PAYROLL_INTEGRATION_ENABLED was false, enabling for local environment.');
}
process.env.PAYROLL_INTEGRATION_ENABLED = 'true';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins in dev; restrict via FRONTEND_URL in production as needed
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'content-type', 'authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const proofsDirectory =
  process.env.TAX_PROOFS_DIR || path.resolve(process.cwd(), 'uploads', 'tax-proofs');
fs.mkdirSync(proofsDirectory, { recursive: true });
app.use('/tax-proofs', express.static(proofsDirectory));

const receiptsDirectory =
  process.env.REIMBURSEMENTS_RECEIPT_DIR || path.resolve(process.cwd(), 'uploads', 'receipts');
fs.mkdirSync(receiptsDirectory, { recursive: true });

const deriveReceiptsMountPath = () => {
  const base = process.env.REIMBURSEMENTS_RECEIPT_BASE_URL || '/receipts';
  if (base.startsWith('http')) {
    try {
      const parsed = new URL(base);
      return parsed.pathname || '/receipts';
    } catch (err) {
      console.warn('Invalid REIMBURSEMENTS_RECEIPT_BASE_URL, defaulting to /receipts:', err);
      return '/receipts';
    }
  }
  return base.startsWith('/') ? base : `/${base}`;
};

const receiptsMountPath = deriveReceiptsMountPath();
app.use(receiptsMountPath, express.static(receiptsDirectory));

ensureDocumentInfra()
  .then(() => console.log('✅ Onboarding document infrastructure ready'))
  .catch((error) => console.error('Failed to ensure onboarding document infrastructure:', error));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', authenticateToken, employeesRoutes);
app.use('/api/profiles', authenticateToken, profilesRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/timesheets', timesheetsRoutes);
app.use('/api/leave-policies', authenticateToken, setTenantContext, leavePoliciesRoutes);
app.use('/api/leave-requests', authenticateToken, leaveRequestsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shifts', authenticateToken, shiftsRoutes);
app.use('/api/scheduling', authenticateToken, schedulingRoutes);
app.use('/api/roster', authenticateToken, setTenantContext, rosterRoutes);
// Mount core workflow routes with auth and tenant context
app.use('/api/workflows', authenticateToken, setTenantContext, workflowsRoutes);

// Onboarding routes (no auth required for some endpoints)
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/onboarding', backgroundCheckRoutes); // Background check routes under onboarding
app.use('/api/onboarding/docs', documentUploadRoutes);
app.use('/api/onboarding-tracker', onboardingTrackerRoutes);
app.use('/api/appraisal-cycles', appraisalCycleRoutes);
app.use('/api/performance-reviews', performanceReviewRoutes);
app.use('/api/promotions', promotionsRoutes);
// Additional feature routes
app.use('/api/ai', aiRoutes);
app.use('/api', importsRoutes);
app.use('/api/v1', authenticateToken, setTenantContext, skillsRoutes);
app.use('/api/v1/projects', authenticateToken, setTenantContext, projectsRoutes);
app.use('/api/v1', authenticateToken, setTenantContext, employeeProjectsRoutes);
app.use('/api/teams', authenticateToken, setTenantContext, teamsRoutes);
app.use('/api/reporting-lines', authenticateToken, setTenantContext, reportingLinesRoutes);
app.use('/api', authenticateToken, setTenantContext, holidaysRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/employee-stats', authenticateToken, employeeStatsRoutes);
app.use('/api/migrations', migrationsRoutes);
app.use('/api/check-in-out', checkInOutRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/attendance', attendanceRoutes); // Also mount at /api/attendance for compatibility
app.use('/api/attendance-settings', attendanceSettingsRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/opal-mini-apps', authenticateToken, setTenantContext, opalMiniAppsRoutes);
app.use('/api/payroll', authenticateToken, payrollRoutes);
app.use('/api/background-checks', authenticateToken, backgroundChecksRoutes);
app.use('/api/terminations', authenticateToken, terminationsRoutes);
app.use('/api/documents', authenticateToken, documentsRoutes);
app.use('/api/offboarding', authenticateToken, offboardingRoutes);
app.use('/api/rehire', authenticateToken, rehireRoutes);
app.use('/api/audit-logs', authenticateToken, setTenantContext, auditLogsRoutes);
app.use('/api/probation', authenticateToken, probationRoutes);
app.use('/api/probation-policies', authenticateToken, setTenantContext, probationPoliciesRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/super', superRoutes);
// Multi-tenant routes
app.use('/api/orgs', organizationsRoutes);
app.use('/api/policies', authenticateToken, setTenantContext, policiesRoutes);
app.use('/api/policy-platform', policyPlatformRoutes);
app.use('/api/policy-management', authenticateToken, setTenantContext, policyManagementRoutes);
app.use('/api/unified-policies', unifiedPoliciesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/promotion', authenticateToken, setTenantContext, promotionsRoutes);
app.use('/api', authenticateToken, setTenantContext, employeeHistoryRoutes);
// Payroll SSO integration (separate from payroll routes)
app.use('/api/payroll/sso', payrollSsoRoutes);
app.use('/api/tax/declarations', taxDeclarationsRoutes);
app.use('/api/v1/reimbursements', reimbursementRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/announcements', authenticateToken, announcementsRoutes);
app.use('/api/team-schedule/events', teamScheduleEventsRoutes);
app.use('/api/designations', authenticateToken, setTenantContext, designationsRoutes);

// Tenant info endpoint for payroll service compatibility
app.get('/api/tenant', authenticateToken, async (req, res) => {
  try {
    const profileResult = await dbQuery(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const tenantId = profileResult.rows[0].tenant_id;

    let orgQuery = `
      SELECT id, name, domain, logo_url, company_size, industry, timezone
      FROM organizations
      WHERE id = $1
    `;

    // Attempt to include slug and subdomain if columns exist
    try {
      const columnCheck = await dbQuery(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'organizations'
          AND column_name IN ('slug', 'subdomain')
      `);

      const columns = columnCheck.rows.map(row => row.column_name);

      if (columns.includes('slug') || columns.includes('subdomain')) {
        const extraColumns = [
          columns.includes('slug') ? 'slug' : null,
          columns.includes('subdomain') ? 'subdomain' : null,
        ].filter(Boolean).join(', ');

        if (extraColumns) {
          orgQuery = `
            SELECT id, name, domain, logo_url, company_size, industry, timezone, ${extraColumns}
            FROM organizations
            WHERE id = $1
          `;
        }
      }
    } catch (error) {
      // Ignore column detection errors and fall back to base columns
    }

    const orgResult = await dbQuery(orgQuery, [tenantId]);

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(orgResult.rows[0]);
  } catch (error) {
    console.error('Error fetching tenant info:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch tenant info' });
  }
});

// Public discovery endpoint for AI tools (requires API key in header)
app.get('/discovery', (req, res, next) => {
  req.url = '/api/ai/discovery';
  return aiRoutes.handle(req, res, next);
});

// Initialize database pool
createPool().then(async () => {
  console.log('✅ Database connection pool created');

  // Ensure admin role exists in app_role enum
  try {
    await ensureAdminRole();
  } catch (error) {
    console.error('Error ensuring admin role:', error);
    console.warn('⚠️  Please manually run: ALTER TYPE app_role ADD VALUE IF NOT EXISTS \'admin\';');
  }

  // Ensure onboarding_data table has all required columns
  try {
    await ensureOnboardingColumns();
  } catch (error) {
    console.error('Error ensuring onboarding columns:', error);
    console.warn('⚠️  Please manually run the migration to add onboarding columns');
  }

  // Ensure anyone with direct reports is at least a manager
  try {
    await ensureManagerRoles();
  } catch (error) {
    console.error('Error ensuring manager roles:', error);
  }

  // Initialize MinIO buckets
  try {
    const { ensureBucketExists, getStorageProvider, getOnboardingBucket, isS3Available } = await import('./services/storage.js');
    const storageProvider = getStorageProvider();

    if (storageProvider === 's3' && isS3Available()) {
      const bucketName = getOnboardingBucket();
      console.log(`\n[MinIO] Initializing bucket: ${bucketName}`);
      console.log(`[MinIO] Endpoint: ${process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || 'not set'}`);
      await ensureBucketExists(bucketName);
      console.log(`✅ MinIO bucket '${bucketName}' is ready\n`);
    } else {
      console.log('\n⚠️  MinIO/S3 storage is not configured. Document uploads will use local storage.');
      console.log('   To enable MinIO, ensure these environment variables are set:');
      console.log('   - MINIO_ENABLED=true');
      console.log('   - MINIO_ENDPOINT=localhost (or minio for Docker)');
      console.log('   - MINIO_ACCESS_KEY=minioadmin');
      console.log('   - MINIO_SECRET_KEY=minioadmin123');
      console.log('   - MINIO_BUCKET_ONBOARDING=hr-onboarding-docs\n');
    }
  } catch (error) {
    console.error('\n⚠️  Error initializing MinIO buckets:', error.message);
    console.error('   Document uploads may not work until MinIO is properly configured');
    console.error('   Run: node server/scripts/init-minio.js to diagnose the issue\n');
  }

  // Ensure attendance tables exist
  try {
    const tableCheck = await dbQuery(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'attendance_events'
      );
    `);

    if (!tableCheck.rows[0]?.exists) {
      console.log('⚠️  Attendance tables not found. Creating tables...');
      await createAttendanceTables();
      console.log('✅ Attendance tables created');
    } else {
      console.log('✅ Attendance tables found');
    }
  } catch (error) {
    console.error('Error checking/creating attendance tables:', error);
    console.warn('⚠️  Please manually run the migration: server/db/migrations/20251103_add_attendance_system.sql');
  }

  // Ensure scheduling tables exist
  try {
    // Check if all required tables exist
    const tableCheck = await dbQuery(`
      SELECT 
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shift_templates')) as has_templates,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduling_rule_sets')) as has_rule_sets,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'generated_schedules')) as has_schedules;
    `);

    const { has_templates, has_rule_sets, has_schedules } = tableCheck.rows[0];

    if (!has_templates || !has_rule_sets || !has_schedules) {
      console.log('⚠️  Scheduling tables missing. Creating tables...');
      await createSchedulingTables();
      console.log('✅ Scheduling tables created successfully');
    } else {
      console.log('✅ Scheduling tables found');
      // Always ensure new columns exist, even if tables already exist
      console.log('🔄 Ensuring team scheduling columns exist...');
      try {
        await createSchedulingTables();
        console.log('✅ Team scheduling columns verified');
      } catch (colError) {
        console.warn('⚠️  Could not verify team scheduling columns:', colError.message);
      }
    }
  } catch (error) {
    console.error('Error checking/creating scheduling tables:', error);
    console.error('Error details:', error.message);
    // Try to create tables anyway
    try {
      console.log('Attempting to create tables despite error...');
      await createSchedulingTables();
      console.log('✅ Scheduling tables created after retry');
    } catch (retryError) {
      console.error('Failed to create scheduling tables:', retryError);
      console.warn('⚠️  Please manually run the migration: server/db/migrations/20250121_shift_scheduling_module.sql');
    }
  }

  // Ensure payments/subscriptions tables exist
  await dbQuery(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      plan TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'active',
      period TEXT NOT NULL DEFAULT 'monthly',
      current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
      current_period_end TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status payment_status NOT NULL DEFAULT 'paid',
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
    
    -- Workflow execution tables
    CREATE TABLE IF NOT EXISTS workflow_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id UUID,
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'running', -- running | completed | rejected | error
      current_node_ids TEXT[] DEFAULT '{}',
      trigger_payload JSONB,
      resource_type TEXT, -- 'leave', 'expense', etc.
      resource_id UUID, -- ID of the resource (leave_request.id, etc.)
      created_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS workflow_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      instance_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
      tenant_id UUID,
      node_id TEXT NOT NULL,
      node_type TEXT NOT NULL,
      label TEXT,
      assignee_role TEXT, -- manager | hr | finance
      assignee_user_id UUID, -- optional direct assignment later
      status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
      decision_reason TEXT,
      decided_by UUID REFERENCES profiles(id),
      decided_at TIMESTAMPTZ,
      resource_type TEXT, -- 'leave', 'expense', etc.
      resource_id UUID, -- ID of the resource (leave_request.id, etc.)
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    -- Add resource linking columns if they don't exist (for existing databases)
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_instances' AND column_name = 'resource_type') THEN
        ALTER TABLE workflow_instances ADD COLUMN resource_type TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_instances' AND column_name = 'resource_id') THEN
        ALTER TABLE workflow_instances ADD COLUMN resource_id UUID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_actions' AND column_name = 'resource_type') THEN
        ALTER TABLE workflow_actions ADD COLUMN resource_type TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_actions' AND column_name = 'resource_id') THEN
        ALTER TABLE workflow_actions ADD COLUMN resource_id UUID;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_workflow_actions_tenant_pending ON workflow_actions(tenant_id) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS workflow_logs (
      id BIGSERIAL PRIMARY KEY,
      instance_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      data JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Error handling middleware (should be last)
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  // Schedule cron jobs
  scheduleHolidayNotifications();
  scheduleNotificationRules();
  scheduleAnalyticsRefresh();
  scheduleAssignmentSegmentation();
  await scheduleOffboardingJobs();
  await scheduleAutoLogout();
  await scheduleProbationJobs();
  await scheduleTimesheetReminders();
  schedulePromotionApplication();
  console.log('✅ Cron jobs scheduled');

  // SSL/HTTPS Configuration
  const SSL_ENABLED = process.env.SSL_ENABLED === 'true' || process.env.HTTPS_ENABLED === 'true';

  if (SSL_ENABLED) {
    try {
      const { createHTTPSServer } = await import('./utils/ssl-config.js');
      const httpsServer = createHTTPSServer(app, PORT);

      if (!httpsServer) {
        // Fallback to HTTP if SSL setup fails
        console.warn('[SSL] Falling back to HTTP server');
        app.listen(PORT, '0.0.0.0', () => {
          console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
          console.log(`🌐 Accessible on your network at: http://192.168.0.121:${PORT}`);
        });
      }
    } catch (error) {
      console.warn('[SSL] SSL configuration error, using HTTP:', error.message);
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
        console.log(`🌐 Accessible on your network at: http://192.168.0.121:${PORT}`);
      });
    }
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
      console.log(`🌐 Accessible on your network at: http://192.168.0.121:${PORT}`);
    });
  }
}).catch((error) => {
  console.error('❌ Failed to initialize database:', error);
  process.exit(1);
});

export default app;

