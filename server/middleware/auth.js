import jwt from 'jsonwebtoken';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided', errors: [] });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token', errors: [] });
    }
    req.user = user;
    next();
  });
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
    const { query } = await import('../db/pool.js');
    const { rows } = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );

    const userRole = rows[0]?.role;
    
    if (!userRole || !allowedRoles.includes(userRole)) {
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

