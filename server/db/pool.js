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
    connectionTimeoutMillis: 2000,
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

