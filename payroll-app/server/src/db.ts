import pg from "pg";
const { Pool } = pg;

// Unified database: Payroll now uses the same database as HR (hr_suite)
// In Docker: postgres://postgres:postgres@postgres:5432/hr_suite
// Local: postgres://postgres:postgres@localhost:5432/hr_suite
const databaseUrl = process.env.DATABASE_URL || 
  (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD
    ? `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`
    : "postgres://postgres:postgres@localhost:5432/hr_suite");

export const pool = new Pool({ connectionString: databaseUrl });

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  return pool.query<T>(text, params);
}

