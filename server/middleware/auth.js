import jwt from 'jsonwebtoken';
import { query, withClient } from '../db/pool.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided', errors: [] });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    
    // If JWT has org_id, use it; otherwise fetch from database
    let orgId = decoded.org_id;
    if (!orgId) {
      const profileResult = await query(
        'SELECT tenant_id FROM profiles WHERE id = $1',
        [decoded.id]
      );
      orgId = profileResult.rows[0]?.tenant_id;
    }
    
    // Set org_id in request for use by other middleware and RLS
    req.orgId = orgId;
    
    // Set PostgreSQL session context for RLS (will be used by withClient wrapper)
    if (orgId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orgId)) {
        orgId = null;
      }
    }
    
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token', errors: [] });
  }
}

export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated', errors: [] });
    }

    // Platform admin allowlist via env (comma-separated emails)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.includes((req.user.email || '').toLowerCase())) {
      return next();
    }

    // Get user role from database
    const { rows } = await query(
      'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );

    const userRole = rows[0]?.role;
    
    // Normalize role names (case-insensitive comparison)
    const normalizedUserRole = userRole?.toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());
    
    if (!userRole || !normalizedAllowedRoles.includes(normalizedUserRole)) {
      return res.status(403).json({ error: 'Insufficient permissions', errors: [] });
    }

    req.userRole = userRole;
    next();
  };
}

export function requireSuperadmin(req, res, next) {
  const email = (req.user?.email || '').toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  if (email && adminEmails.includes(email)) {
    return next();
  }
  return res.status(403).json({ error: 'Superadmin only' });
}

