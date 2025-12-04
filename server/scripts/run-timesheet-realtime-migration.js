import path from 'path';
import { fileURLToPath } from 'url';
import { createPool } from '../db/pool.js';
import { runMigration } from '../utils/runMigration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Ensure DB pool is initialised
  await createPool();

  const sqlPath = path.resolve(__dirname, '../db/migrations/20251205_timesheet_realtime.sql');
  const ok = await runMigration(sqlPath);

  if (!ok) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  process.exit(1);
});


