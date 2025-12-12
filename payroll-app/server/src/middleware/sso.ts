/**
 * SSO Middleware for Payroll Application
 * 
 * Verifies JWT tokens from HR system for Single Sign-On
 * 
 * Usage:
 *   import { verifyHrSsoToken } from './middleware/sso';
 *   router.get('/sso', verifyHrSsoToken, handler);
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface HrUser {
  hrUserId: string;
  orgId: string;
  email: string;
  firstName?: string;
  lastName?: string;
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

/**
 * Map HR roles to Payroll role
 */
function mapHrToPayrollRole(hrRoles: string[]): 'payroll_admin' | 'payroll_employee' {
  const adminSet = new Set(['CEO', 'Admin', 'HR', 'ceo', 'admin', 'hr']);
  return hrRoles.some(r => adminSet.has(r)) ? 'payroll_admin' : 'payroll_employee';
}

/**
 * Verify HR SSO JWT token
 * 
 * Extracts and validates JWT token from query parameter or Authorization header
 * Attaches hrUser to request object
 */
export async function verifyHrSsoToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get token from query parameter or Authorization header
    const token = (req.query.token as string) || 
                  (req.headers.authorization?.replace('Bearer ', ''));

    if (!token) {
      console.error('❌ SSO token missing');
      return res.status(401).json({ 
        error: 'SSO token required',
        message: 'Please provide a valid SSO token from HR system'
      });
    }

    console.log(`🔍 Received SSO token, length: ${token.length}`);

    // Get JWT verification material. Prefer RS256 public key, fallback to shared secret.
    const publicKey = (process.env.HR_PAYROLL_JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    const sharedSecret = process.env.HR_JWT_SECRET || process.env.PAYROLL_JWT_SECRET || process.env.JWT_SECRET || process.env.DEV_PAYROLL_SSO_SECRET;
    const devMode = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';

    // Decode token without verification to check algorithm
    let decodedToken: any;
    try {
      decodedToken = jwt.decode(token, { complete: true }) as any;
    } catch (decodeError) {
      return res.status(401).json({ 
        error: 'Invalid token format',
        message: 'Token could not be decoded'
      });
    }

    const tokenAlgorithm = decodedToken?.header?.alg;
    console.log(`🔍 Token algorithm: ${tokenAlgorithm}`);

    let verificationKey: string | undefined;
    let algorithms: jwt.Algorithm[];

    let payload: any;
    
    if (tokenAlgorithm === 'RS256') {
      // RS256 requires public key
      if (publicKey && publicKey.trim() !== '' && publicKey.includes('BEGIN PUBLIC KEY')) {
        verificationKey = publicKey;
        algorithms = ['RS256'];
        console.log('✅ Using RS256 with public key');
      } else {
        // In development, allow skipping verification if explicitly enabled or if no key is configured
        if (devMode && (process.env.ALLOW_UNVERIFIED_SSO === 'true' || !publicKey)) {
          console.warn('⚠️  DEVELOPMENT MODE: Allowing unverified RS256 token (no public key configured)');
          console.warn('⚠️  This is UNSAFE for production. Set HR_PAYROLL_JWT_PUBLIC_KEY for proper verification.');
          // Decode without verification
          try {
            payload = decodedToken.payload;
            console.log('✅ Token decoded (unverified) in development mode');
          } catch (decodeError: any) {
            console.error('❌ Failed to decode token even without verification:', decodeError);
            return res.status(401).json({ 
              error: 'Invalid token',
              message: 'Token could not be decoded'
            });
          }
        } else {
          console.error('❌ RS256 token requires HR_PAYROLL_JWT_PUBLIC_KEY but it is not configured.');
          console.error('❌ Set ALLOW_UNVERIFIED_SSO=true in development or configure HR_PAYROLL_JWT_PUBLIC_KEY');
          return res.status(500).json({ 
            error: 'SSO configuration error',
            message: 'RS256 token requires HR_PAYROLL_JWT_PUBLIC_KEY environment variable. Please configure it or set ALLOW_UNVERIFIED_SSO=true in development.',
            hint: 'Add HR_PAYROLL_JWT_PUBLIC_KEY to your environment or docker-compose.yml'
          });
        }
      }
    } else if (tokenAlgorithm === 'HS256') {
      // HS256 can use shared secret
      if (sharedSecret && sharedSecret.trim() !== '') {
        verificationKey = sharedSecret;
        algorithms = ['HS256'];
        console.log('✅ Using HS256 with shared secret');
      } else {
        console.error('❌ HS256 token requires shared secret but it is not configured.');
        return res.status(500).json({ 
          error: 'SSO configuration error',
          message: 'HS256 token requires HR_JWT_SECRET or JWT_SECRET environment variable'
        });
      }
    } else {
      return res.status(401).json({ 
        error: 'Unsupported token algorithm',
        message: `Token uses unsupported algorithm: ${tokenAlgorithm}. Only RS256 and HS256 are supported.`
      });
    }

    // Verify JWT token (skip if already decoded in dev mode)
    if (verificationKey && !payload) {
      try {
        payload = jwt.verify(token, verificationKey, { algorithms }) as any;
        console.log(`✅ Token verified successfully with ${algorithms[0]}`);
      } catch (jwtError: any) {
        console.error('❌ JWT verification failed:', {
          name: jwtError.name,
          message: jwtError.message,
          algorithm: algorithms[0],
          hasPublicKey: !!publicKey && publicKey.includes('BEGIN PUBLIC KEY'),
          hasSharedSecret: !!sharedSecret
        });
        
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            error: 'Token expired',
            message: 'SSO token has expired. Please try again from HR system.'
          });
        } else if (jwtError.name === 'JsonWebTokenError') {
          // If RS256 failed and we have a shared secret, try HS256 as fallback
          if (algorithms[0] === 'RS256' && sharedSecret && sharedSecret.trim() !== '') {
            console.log('⚠️  RS256 verification failed, trying HS256 with shared secret...');
            try {
              payload = jwt.verify(token, sharedSecret, { algorithms: ['HS256'] }) as any;
              console.log('✅ Token verified with HS256 fallback');
            } catch (hs256Error: any) {
              return res.status(401).json({ 
                error: 'Invalid token',
                message: `SSO token verification failed: ${hs256Error.message}`
              });
            }
          } else {
            return res.status(401).json({ 
              error: 'Invalid token',
              message: `SSO token verification failed: ${jwtError.message}`
            });
          }
        } else {
          throw jwtError;
        }
      }
    }
    
    if (!payload) {
      return res.status(401).json({ 
        error: 'Token verification failed',
        message: 'Unable to verify or decode token'
      });
    }

    // Validate claims (allow both 'hr-app' and 'hr-system' as issuer for compatibility)
    const validIssuers = ['hr-app', 'hr-system'];
    if (!validIssuers.includes(payload.iss)) {
      console.warn(`⚠️  Token issuer mismatch: expected one of ${validIssuers.join(', ')}, got '${payload.iss}'`);
      // Don't fail - allow for flexibility during migration
    }

    const validAudiences = ['payroll-app', 'payroll-system'];
    if (payload.aud && !validAudiences.includes(payload.aud)) {
      console.warn(`⚠️  Token audience mismatch: expected one of ${validAudiences.join(', ')}, got '${payload.aud}'`);
      // Don't fail - allow for flexibility during migration
    }

    // Check expiry (jwt.verify already checks this, but double-check)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'SSO token has expired'
      });
    }

    // Extract required fields
    const hrUserId = payload.sub;
    const orgId = payload.org_id;
    const email = payload.email;
    const firstName = payload.first_name || '';
    const lastName = payload.last_name || '';
    const name = payload.name || `${firstName} ${lastName}`.trim() || email;
    const roles = payload.roles || [];
    const payrollRole = payload.payroll_role || mapHrToPayrollRole(roles);

    if (!hrUserId || !orgId || !email) {
      return res.status(401).json({ 
        error: 'Invalid token claims',
        message: 'Token missing required claims: sub, org_id, or email'
      });
    }

    // Attach to request
    req.hrUser = {
      hrUserId: hrUserId.toString(),
      orgId: orgId.toString(),
      email: email.toLowerCase().trim(),
      firstName: firstName,
      lastName: lastName,
      name: name,
      roles: roles,
      payrollRole: payrollRole
    };

    // Log successful verification (for debugging)
    console.log(`✅ SSO token verified: ${email} (${payrollRole}) from org ${orgId}`);

    next();
  } catch (error: any) {
    console.error('SSO verification error:', error);
    return res.status(500).json({ 
      error: 'SSO verification failed',
      message: error.message || 'Internal server error during SSO verification'
    });
  }
}

/**
 * Optional: Verify token from Authorization header (for API calls)
 */
export async function verifyHrSsoTokenFromHeader(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Authorization header required',
      message: 'Please provide a Bearer token in Authorization header'
    });
  }

  // Temporarily set token in query for verifyHrSsoToken
  req.query.token = authHeader.replace('Bearer ', '');
  
  return verifyHrSsoToken(req, res, next);
}

