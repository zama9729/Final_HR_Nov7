import { createPool, getPool, query } from '../db/pool.js';

const args = process.argv.slice(2);

const getArgValue = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  return fallback;
};

const tenantId =
  getArgValue('tenant') ||
  process.env.SCHEDULING_TENANT_ID ||
  process.env.DEFAULT_TENANT_ID;

if (!tenantId) {
  console.error(
    '❌ Please pass a tenant id via --tenant=<uuid> or set SCHEDULING_TENANT_ID.'
  );
  process.exit(1);
}

const requiredCount = parseInt(getArgValue('count', '2'), 10);
const daysArg = getArgValue('days', '1,2,3,4,5'); // default Mon-Fri

const days =
  daysArg === 'all'
    ? [0, 1, 2, 3, 4, 5, 6]
    : daysArg
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6);

if (days.length === 0) {
  console.error('❌ No valid days were provided.');
  process.exit(1);
}

const main = async () => {
  await createPool();
  console.log(
    `🌱 Seeding shift demand for tenant ${tenantId} on days [${days.join(
      ', '
    )}] with required_count=${requiredCount}`
  );

  const templatesRes = await query(
    `SELECT id, name FROM shift_templates WHERE tenant_id = $1 ORDER BY name`,
    [tenantId]
  );

  if (templatesRes.rows.length === 0) {
    console.error('⚠️  No shift templates found for this tenant.');
    return;
  }

  let inserted = 0;
  let updated = 0;

  for (const template of templatesRes.rows) {
    for (const day of days) {
      const existing = await query(
        `SELECT id, required_count
         FROM shift_demand_requirements
         WHERE tenant_id = $1
           AND shift_template_id = $2
           AND day_of_week = $3
           AND branch_id IS NULL
           AND team_id IS NULL
           AND effective_from IS NULL`,
        [tenantId, template.id, day]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.required_count !== requiredCount) {
          await query(
            `UPDATE shift_demand_requirements
             SET required_count = $1, updated_at = now()
             WHERE id = $2`,
            [requiredCount, row.id]
          );
          updated++;
        }
      } else {
        await query(
          `INSERT INTO shift_demand_requirements (
             tenant_id,
             shift_template_id,
             day_of_week,
             required_count,
             required_roles,
             branch_id,
             team_id,
             effective_from,
             effective_to
           ) VALUES ($1,$2,$3,$4,NULL,NULL,NULL,NULL,NULL)`,
          [tenantId, template.id, day, requiredCount]
        );
        inserted++;
      }
    }
  }

  console.log(
    `✅ Demand seeding complete. Inserted ${inserted} new rows, updated ${updated} existing rows.`
  );
};

main()
  .catch((err) => {
    console.error('❌ Failed to seed demand requirements:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = getPool();
    await pool.end();
  });

