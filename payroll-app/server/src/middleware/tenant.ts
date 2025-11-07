import { Request, Response, NextFunction } from 'express';
import { query } from '../db.js';

export async function tenantFromHost(req: Request, res: Response, next: NextFunction) {
  try {
    const host = (req.headers.host || '').toString();
    const parts = host.split(':')[0].split('.');
    if (parts.length < 3) return next(); // likely localhost
    const subdomain = parts[0];
    // Use payroll_organization_view for organization lookup (unified database)
    const result = await query(`SELECT org_id as id FROM payroll_organization_view WHERE subdomain = $1`, [subdomain]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unknown tenant' });
    }
    (req as any).tenant = { org_id: result.rows[0].id, subdomain };
    next();
  } catch (e) {
    next(e);
  }
}




