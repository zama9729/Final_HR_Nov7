import { query, pool } from '../db/pool.js';
import { RuleEngine } from '../services/scheduling/rule-engine.js';
import { getScheduler } from '../services/scheduling/scheduler.js';

const orgId = '38171e00-dff3-44fc-9604-bccc7c775ed1';
const weekStart = '2025-11-24';
const weekEnd = '2025-11-30';

const ruleSetRes = await query(
  'SELECT * FROM scheduling_rule_sets WHERE tenant_id = $1 LIMIT 1',
  [orgId]
);
if (ruleSetRes.rows.length === 0) {
  console.error('No rule set found');
  process.exit(1);
}
const ruleSet = ruleSetRes.rows[0];

const templates = (
  await query('SELECT * FROM shift_templates WHERE tenant_id = $1', [orgId])
).rows;

const employees = (
  await query(
    `SELECT e.*, p.first_name, p.last_name, p.email
     FROM employees e
     INNER JOIN profiles p ON p.id = e.user_id
     WHERE e.tenant_id = $1 AND e.status = 'active'`,
    [orgId]
  )
).rows;

const demandRes = (
  await query('SELECT * FROM shift_demand_requirements WHERE tenant_id = $1', [
    orgId,
  ])
).rows;

let demand = demandRes;
if (demand.length === 0) {
  demand = templates.flatMap((template) =>
    [1, 2, 3, 4, 5].map((day_of_week) => ({
      shift_template_id: template.id,
      day_of_week,
      required_count: 1,
      required_roles: null,
    }))
  );
}

const availability = (
  await query(
    `SELECT * FROM employee_availability
     WHERE tenant_id = $1 AND date >= $2 AND date <= $3`,
    [orgId, weekStart, weekEnd]
  )
).rows;

const ruleEngine = new RuleEngine(ruleSet.rules || []);

const constraintScheduler = getScheduler('constraint', ruleEngine, {
  priorNightCounts: {},
});
const constraintResult = await constraintScheduler.generateSchedule({
  weekStart,
  weekEnd,
  employees,
  templates,
  demand,
  availability,
  exceptions: [],
  ruleSet,
});

console.log('Constraint assignments:', constraintResult.assignments.length);
console.log(constraintResult.assignments);

const saScheduler = getScheduler('simulated_annealing', ruleEngine, {
  priorNightCounts: {},
});
const saResult = await saScheduler.generateSchedule({
  weekStart,
  weekEnd,
  employees,
  templates,
  demand,
  availability,
  exceptions: [],
  ruleSet,
});

console.log('Simulated annealing assignments:', saResult.assignments.length);
console.log(saResult.assignments);

await pool.end();

