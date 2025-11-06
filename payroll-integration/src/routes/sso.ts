/**
 * SSO Routes for Payroll Application
 * 
 * Handles Single Sign-On from HR system
 * 
 * Usage:
 *   import ssoRoutes from './routes/sso';
 *   app.use('/', ssoRoutes);
 */

import { Router, Request, Response } from 'express';
import { verifyHrSsoToken } from '../middleware/sso';
import { upsertPayrollUser } from '../services/user-service';

const router = Router();

/**
 * GET /sso?token=<jwt>
 * 
 * SSO endpoint that:
 * 1. Verifies JWT token from HR system
 * 2. Auto-provisions Payroll user if missing
 * 3. Sets session with user data
 * 4. Redirects to appropriate dashboard based on role
 */
router.get('/sso', verifyHrSsoToken, async (req: Request, res: Response) => {
  try {
    const hrUser = req.hrUser!;
    
    if (!hrUser) {
      return res.status(401).json({ 
        error: 'SSO user not found',
        message: 'Failed to extract user from SSO token'
      });
    }

    // Auto-provision user (create or update)
    let user;
    try {
      user = await upsertPayrollUser(hrUser);
    } catch (error: any) {
      console.error('Error upserting Payroll user:', error);
      return res.status(500).json({ 
        error: 'Failed to provision user',
        message: error.message || 'Internal server error during user provisioning'
      });
    }

    // Set session (adjust based on your session management)
    // Example using express-session:
    if (req.session) {
      (req.session as any).userId = user.id;
      (req.session as any).payrollRole = user.payroll_role;
      (req.session as any).orgId = user.org_id;
      (req.session as any).hrUserId = user.hr_user_id;
      (req.session as any).email = user.email;
    }

    // Alternative: Set in request for stateless auth (JWT-based)
    (req as any).user = {
      id: user.id,
      email: user.email,
      hr_user_id: user.hr_user_id,
      org_id: user.org_id,
      payroll_role: user.payroll_role
    };

    // Log SSO success
    console.log(`✅ SSO successful: ${user.email} (${user.payroll_role}) from org ${user.org_id}`);

    // Redirect based on role
    const destination = hrUser.payrollRole === 'payroll_admin' 
      ? '/admin/dashboard' 
      : '/employee/home';

    // Optional: Add query params for first-time users
    const isNewUser = !req.session || !(req.session as any).userId;
    const redirectUrl = isNewUser 
      ? `${destination}?welcome=true`
      : destination;

    res.redirect(redirectUrl);
  } catch (error: any) {
    console.error('SSO error:', error);
    res.status(500).json({ 
      error: 'SSO processing failed',
      message: error.message || 'Internal server error during SSO processing'
    });
  }
});

/**
 * GET /sso/verify
 * 
 * Verify SSO token (for testing/debugging)
 */
router.get('/sso/verify', verifyHrSsoToken, (req: Request, res: Response) => {
  const hrUser = req.hrUser!;
  
  res.json({
    success: true,
    message: 'SSO token is valid',
    user: {
      hrUserId: hrUser.hrUserId,
      orgId: hrUser.orgId,
      email: hrUser.email,
      name: hrUser.name,
      roles: hrUser.roles,
      payrollRole: hrUser.payrollRole
    }
  });
});

/**
 * POST /sso/logout
 * 
 * Logout from Payroll (clear session)
 */
router.post('/sso/logout', (req: Request, res: Response) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      
      res.json({ 
        success: true, 
        message: 'Logged out successfully' 
      });
    });
  } else {
    res.json({ 
      success: true, 
      message: 'Already logged out' 
    });
  }
});

export default router;


