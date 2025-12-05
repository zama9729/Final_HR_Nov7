import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export function createPool() {
  if (pool) {
    return Promise.resolve(pool);
  }

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hr_suite',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    // Allow a bit more time for connections in dev/docker to avoid transient timeouts
    connectionTimeoutMillis: 10000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  // Test connection
  return pool.query('SELECT NOW()')
    .then(() => {
      console.log('✅ Connected to PostgreSQL');
      return pool;
    })
    .catch((err) => {
      console.error('❌ Database connection error:', err);
      throw err;
    });
}

export function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createPool() first.');
  }
  return pool;
}

export async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

export async function withClient(fn, orgId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // When using orgId, we need a transaction so SET LOCAL works without warnings
    if (orgId) {
      await client.query('BEGIN');
    }

    if (orgId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orgId)) {
        throw new Error(`Invalid org ID format: ${orgId}`);
      }
      const escapedOrgId = orgId.replace(/'/g, "''");
      await client.query(`SET LOCAL app.org_id = '${escapedOrgId}'`);
      await client.query(`SET LOCAL app.current_tenant = '${escapedOrgId}'`);
      await client.query(`SET LOCAL app.current_org_id = '${escapedOrgId}'`);
    }
    const result = await fn(client);

    if (orgId) {
      await client.query('COMMIT');
    }

    return result;
  } catch (err) {
    if (orgId) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore rollback errors
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a query with org context (for RLS)
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @param {string} orgId - Organization ID for RLS context
 */
export async function queryWithOrg(text, params, orgId) {
  if (!orgId) {
    return query(text, params);
  }
  
  return withClient(async (client) => {
    return client.query(text, params);
  }, orgId);
}

