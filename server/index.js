import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createPool } from './db/pool.js';
import authRoutes from './routes/auth.js';
import employeesRoutes from './routes/employees.js';
import profilesRoutes from './routes/profiles.js';
import onboardingRoutes from './routes/onboarding.js';
import onboardingTrackerRoutes from './routes/onboarding-tracker.js';
import organizationsRoutes from './routes/organizations.js';
import statsRoutes from './routes/stats.js';
import notificationsRoutes from './routes/notifications.js';
import timesheetsRoutes from './routes/timesheets.js';
import { authenticateToken } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

// Onboarding routes (no auth required for some endpoints)
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/onboarding-tracker', onboardingTrackerRoutes);

// Initialize database pool
createPool().then(() => {
  console.log('✅ Database connection pool created');
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('❌ Failed to initialize database:', error);
  process.exit(1);
});

export default app;

