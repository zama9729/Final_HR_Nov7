import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pkg from 'pg';

const { Pool } = pkg;

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

if (!TEST_DB_URL) {
  console.warn('TEST_DATABASE_URL not set; skipping RLS tests');
}

describe.skipIf(!TEST_DB_URL)('RLS enforcement', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });

    // Setup fixtures
    await pool.query('BEGIN');
    await pool.query("INSERT INTO organizations (id, name) VALUES ($1, 'Org A') ON CONFLICT DO NOTHING", [ORG_A]);
    await pool.query("INSERT INTO organizations (id, name) VALUES ($1, 'Org B') ON CONFLICT DO NOTHING", [ORG_B]);

    await pool.query(
      `INSERT INTO profiles (id, email, tenant_id) VALUES ($1, 'a@example.com', $2)
       ON CONFLICT (id) DO NOTHING`,
      ['11111111-1111-1111-1111-111111111111', ORG_A]
    );
    await pool.query(
      `INSERT INTO profiles (id, email, tenant_id) VALUES ($1, 'b@example.com', $2)
       ON CONFLICT (id) DO NOTHING`,
      ['22222222-2222-2222-2222-222222222222', ORG_B]
    );
    await pool.query('COMMIT');
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('denies cross-org read', async () => {
    const client = await pool.connect();
    await client.query("SET LOCAL app.current_org = $1", [ORG_A]);
    const res = await client.query('SELECT email FROM profiles');
    await client.release();
    const emails = res.rows.map(r => r.email);
    expect(emails).not.toContain('b@example.com');
    expect(emails).toContain('a@example.com');
  });

  it('denies access when org is not set', async () => {
    const client = await pool.connect();
    const res = await client.query('SELECT email FROM profiles');
    await client.release();
    // Should return zero rows under strict RLS
    expect(res.rows.length).toBe(0);
  });
});

