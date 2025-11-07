/**
 * Example App Setup for Payroll Application
 * 
 * Demonstrates how to integrate SSO and RBAC into your Express app
 * 
 * Copy this to your main app file and adjust as needed
 */

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';

// Import SSO routes
import ssoRoutes from './routes/sso';

// Import protected routes (example)
import exampleProtectedRoutes from './routes/example-protected-routes';

// Import RBAC middleware
import { requireOrgContext } from './middleware/rbac';

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (adjust based on your session store)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// SSO routes (public - JWT is the auth)
app.use('/', ssoRoutes);

// Protected routes (require org context)
app.use('/admin', requireOrgContext, exampleProtectedRoutes);
app.use('/employee', requireOrgContext, exampleProtectedRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'payroll',
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ Payroll server running on port ${PORT}`);
  console.log(`✅ SSO endpoint: http://localhost:${PORT}/sso`);
  console.log(`✅ Admin dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log(`✅ Employee home: http://localhost:${PORT}/employee/home`);
});

export default app;




