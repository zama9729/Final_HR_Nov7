/**
 * Seed a sample organization and user for RLS testing.
 * Usage: node server/scripts/seed-sample-org.js
 * Requires env: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

import { createPool, query } from '../db/pool.js';
import crypto from 'crypto';

async function main() {
  await createPool();
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  await query('BEGIN');
  try {
    await query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Sample Org', 'sample-org') ON CONFLICT DO NOTHING`,
      [orgId]
    );

    await query(
      `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
       VALUES ($1, 'sample.admin@example.com', 'Sample', 'Admin', $2)
       ON CONFLICT (id) DO NOTHING`,
      [userId, orgId]
    );

    await query(
      `INSERT INTO user_roles (id, user_id, role, tenant_id)
       VALUES ($1, $2, 'admin', $3) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), userId, orgId]
    );

    await query('COMMIT');
    console.log('✅ Seeded sample org and admin user');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

main().then(() => process.exit(0));

