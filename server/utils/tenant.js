import { query } from '../db/pool.js';

/**
 * Resolve the tenant/organization id for a given user id.
 * Returns null if no tenant association is found.
 */
export async function getTenantIdForUser(userId) {
  if (!userId) return null;

  const result = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId]
  );

  return result.rows[0]?.tenant_id || null;
}

export default { getTenantIdForUser };

