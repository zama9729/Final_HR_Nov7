import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createPool, query as dbQuery } from './db/pool.js';
import authRoutes from './routes/auth.js';
import employeesRoutes from './routes/employees.js';
import profilesRoutes from './routes/profiles.js';
import onboardingRoutes from './routes/onboarding.js';
import onboardingTrackerRoutes from './routes/onboarding-tracker.js';
import organizationsRoutes from './routes/organizations.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';
import notificationsRoutes from './routes/notifications.js';
import timesheetsRoutes from './routes/timesheets.js';
import appraisalCycleRoutes from './routes/appraisal-cycles.js';
import performanceReviewRoutes from './routes/performance-reviews.js';
import { authenticateToken } from './middleware/auth.js';
import shiftsRoutes from './routes/shifts.js';
import workflowsRoutes from './routes/workflows.js';
import skillsRoutes from './routes/skills.js';
import projectsRoutes from './routes/projects.js';
import employeeProjectsRoutes from './routes/employee-projects.js';
import holidaysRoutes from './routes/holidays.js';
import calendarRoutes from './routes/calendar.js';
import analyticsRoutes from './routes/analytics.js';
import aiRoutes from './routes/ai.js';
import importsRoutes from './routes/imports.js';
import { setTenantContext } from './middleware/tenant.js';
import { scheduleHolidayNotifications } from './services/cron.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:8080',
    'http://localhost:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/admin', adminRoutes);
app.use('/api/shifts', authenticateToken, shiftsRoutes);
// Mount core workflow routes with auth and tenant context
app.use('/api/workflows', authenticateToken, setTenantContext, workflowsRoutes);

// Onboarding routes (no auth required for some endpoints)
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/onboarding-tracker', onboardingTrackerRoutes);
app.use('/api/appraisal-cycles', appraisalCycleRoutes);
app.use('/api/performance-reviews', performanceReviewRoutes);
// Additional feature routes
app.use('/api/ai', aiRoutes);
app.use('/api', importsRoutes);
app.use('/api/v1', authenticateToken, setTenantContext, skillsRoutes);
app.use('/api/v1/projects', authenticateToken, setTenantContext, projectsRoutes);
app.use('/api/v1', authenticateToken, setTenantContext, employeeProjectsRoutes);
app.use('/api', authenticateToken, setTenantContext, holidaysRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);

// Public discovery endpoint for AI tools (requires API key in header)
app.get('/discovery', (req, res, next) => {
  req.url = '/api/ai/discovery';
  return aiRoutes.handle(req, res, next);
});

// Initialize database pool
createPool().then(async () => {
  console.log('✅ Database connection pool created');
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
  `);
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('❌ Failed to initialize database:', error);
  process.exit(1);
});

export default app;

