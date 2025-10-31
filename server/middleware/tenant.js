import { query } from '../db/pool.js';

export async function setTenantContext(req, res, next) {
  try {
    if (!req.user?.id) return next();
    const r = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = r.rows[0]?.tenant_id;
    if (tenantId) {
      // Set a session variable for this connection
      await query('SET SESSION app.current_tenant = $1', [tenantId]);
    }
  } catch (e) {
    console.error('Failed to set tenant context', e?.message || e);
  }
  next();
}

export default { setTenantContext };


