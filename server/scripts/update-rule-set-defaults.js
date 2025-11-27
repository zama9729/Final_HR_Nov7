import { createPool, getPool, query } from '../db/pool.js';

const TARGET_MAX_NIGHT_SHIFTS = parseInt(
  process.env.SCHEDULING_DEFAULT_MAX_NIGHTS || '2',
  10
);
const TARGET_MIN_REST_HOURS = parseInt(
  process.env.SCHEDULING_DEFAULT_MIN_REST_HOURS || '12',
  10
);

const updateRules = (rulesArray = []) => {
  let changed = false;
  const rules = Array.isArray(rulesArray)
    ? rulesArray
    : JSON.parse(rulesArray || '[]');

  for (const rule of rules) {
    if (!rule.params) {
      rule.params = {};
    }

    if (rule.id === 'max_night_shifts_per_week') {
      if (rule.params.max_shifts !== TARGET_MAX_NIGHT_SHIFTS) {
        rule.params.max_shifts = TARGET_MAX_NIGHT_SHIFTS;
        changed = true;
      }
    }

    if (rule.id === 'min_rest_hours_between_shifts') {
      if (rule.params.min_hours !== TARGET_MIN_REST_HOURS) {
        rule.params.min_hours = TARGET_MIN_REST_HOURS;
        changed = true;
      }
    }
  }

  return { changed, rules };
};

const main = async () => {
  await createPool();
  const { rows } = await query(
    'SELECT id, tenant_id, name, rules FROM scheduling_rule_sets'
  );

  if (rows.length === 0) {
    console.log('ℹ️  No scheduling_rule_sets found.');
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const { changed, rules } = updateRules(row.rules);
    if (changed) {
      await query(
        'UPDATE scheduling_rule_sets SET rules = $1, updated_at = now() WHERE id = $2',
        [JSON.stringify(rules), row.id]
      );
      updated++;
      console.log(
        `✅ Updated rule set "${row.name}" (${row.id}) for tenant ${row.tenant_id}`
      );
    }
  }

  if (updated === 0) {
    console.log('ℹ️  Rule sets already using desired defaults.');
  } else {
    console.log(`🎯 Updated ${updated} rule set(s).`);
  }
};

main()
  .catch((err) => {
    console.error('❌ Failed to update rule sets:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = getPool();
    await pool.end();
  });

