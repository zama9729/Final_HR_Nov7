import express from 'express';
import { query } from '../db/pool.js';
import { requireSuperUser } from '../middleware/auth.js';
import { refreshAnalyticsViews } from '../services/analytics-refresh.js';

const router = express.Router();

function maskCount(value) {
  if (typeof value !== 'number') return value;
  return value >= 5 ? value : '<5';
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return isNaN(date.getTime()) ? fallback : date;
}

router.use(requireSuperUser);

router.get('/metrics', async (req, res) => {
  try {
    await refreshAnalyticsViews();
    const now = new Date();
    const start = parseDate(req.query.start, new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
    const end = parseDate(req.query.end, now);
    const plan = req.query.plan || null;
    const region = req.query.region || null;

    const orgStats = await query(`
      SELECT 
        COUNT(*) AS total_orgs,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new_last_7,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new_last_30
      FROM organizations
    `);

    const activeStats = await query(`
      SELECT 
        COUNT(DISTINCT tenant_id) FILTER (WHERE work_date >= now() - interval '30 days') AS active_30d,
        COUNT(DISTINCT tenant_id) FILTER (WHERE work_date >= now() - interval '90 days') AS active_90d,
        COUNT(DISTINCT tenant_id) FILTER (WHERE work_date >= now() - interval '365 days') AS active_365d
      FROM timesheet_entries
    `);

    const churnStats = await query(`
      SELECT COUNT(*) AS churned_90d
      FROM organizations o
      WHERE o.created_at < now() - interval '90 days'
        AND NOT EXISTS (
          SELECT 1 FROM timesheet_entries te
          WHERE te.tenant_id = o.id AND te.work_date >= now() - interval '90 days'
        )
    `);

    const signupSeries = await query(
      `
      SELECT date_trunc('day', created_at)::date AS date, COUNT(*) AS count
      FROM organizations
      WHERE created_at BETWEEN $1 AND $2
        ${plan ? 'AND plan_tier = $3' : ''}
        ${region ? plan ? 'AND geo_region = $4' : 'AND geo_region = $3' : ''}
      GROUP BY 1
      ORDER BY 1
    `,
      plan ? (region ? [start, end, plan, region] : [start, end, plan]) : region ? [start, end, region] : [start, end]
    );

    const sizeBuckets = await query(`
      WITH counts AS (
        SELECT tenant_id, COUNT(*) AS headcount
        FROM employees
        GROUP BY tenant_id
      )
      SELECT
        CASE
          WHEN headcount = 0 THEN '0'
          WHEN headcount BETWEEN 1 AND 10 THEN '1-10'
          WHEN headcount BETWEEN 11 AND 50 THEN '11-50'
          WHEN headcount BETWEEN 51 AND 200 THEN '51-200'
          WHEN headcount BETWEEN 201 AND 500 THEN '201-500'
          ELSE '500+'
        END AS bucket,
        COUNT(*) AS orgs
      FROM counts
      GROUP BY bucket
      ORDER BY bucket
    `);

    const attendanceAdoption = await query(`
      SELECT capture_method, COUNT(*) AS orgs
      FROM org_attendance_settings
      GROUP BY capture_method
    `);

    const branchUsage = await query(`
      SELECT COUNT(DISTINCT org_id) AS orgs_with_branches
      FROM org_branches
      WHERE is_active = true
    `);

    const payrollUsage = await query(`
      SELECT COUNT(DISTINCT tenant_id) AS payroll_enabled
      FROM payroll_runs
      WHERE status = 'completed'
    `);

    const cohorts = await query(`
      SELECT date_trunc('month', created_at)::date AS cohort, COUNT(*) AS orgs
      FROM organizations
      GROUP BY 1
      ORDER BY cohort DESC
      LIMIT 12
    `);

    const funnel = await query(`
      SELECT
        (SELECT COUNT(*) FROM organizations) AS signups,
        (SELECT COUNT(*) FROM org_setup_status WHERE is_completed = true) AS setup_completed,
        (SELECT COUNT(DISTINCT tenant_id) FROM employees) AS employees_added,
        (SELECT COUNT(DISTINCT tenant_id) FROM payroll_runs WHERE status = 'completed') AS payroll_runs
    `);

    const headcountLeaders = await query(`
      WITH counts AS (
        SELECT tenant_id, COUNT(*) AS headcount
        FROM employees
        GROUP BY tenant_id
      )
      SELECT headcount
      FROM counts
      ORDER BY headcount DESC
      LIMIT 5
    `);

    const signupStream = await query(`
      SELECT created_at::date AS date, plan_tier, company_size
      FROM organizations
      ORDER BY created_at DESC
      LIMIT 10
    `);

    await query(
      'INSERT INTO super_user_audit (super_user_id, action, metadata) VALUES ($1, $2, $3)',
      [req.user.id, 'metrics_view', JSON.stringify({ params: req.query })]
    );

    res.json({
      kpis: {
        totalOrgs: orgStats.rows[0]?.total_orgs || 0,
        active30d: activeStats.rows[0]?.active_30d || 0,
        newThisWeek: orgStats.rows[0]?.new_last_7 || 0,
        churned90d: churnStats.rows[0]?.churned_90d || 0,
      },
      signupSeries: signupSeries.rows,
      sizeBuckets: sizeBuckets.rows.map((row) => ({
        bucket: row.bucket,
        orgs: maskCount(Number(row.orgs)),
      })),
      featureAdoption: {
        attendance: attendanceAdoption.rows.reduce((acc, row) => {
          acc[row.capture_method] = maskCount(Number(row.orgs));
          return acc;
        }, {}),
        branches: maskCount(Number(branchUsage.rows[0]?.orgs_with_branches || 0)),
        payroll: maskCount(Number(payrollUsage.rows[0]?.payroll_enabled || 0)),
      },
      cohorts: cohorts.rows,
      funnel: {
        signups: maskCount(Number(funnel.rows[0]?.signups || 0)),
        setupCompleted: maskCount(Number(funnel.rows[0]?.setup_completed || 0)),
        employeesImported: maskCount(Number(funnel.rows[0]?.employees_added || 0)),
        firstPayroll: maskCount(Number(funnel.rows[0]?.payroll_runs || 0)),
      },
      topOrgs: headcountLeaders.rows.map((row, index) => ({
        label: `Org ${String.fromCharCode(65 + index)}`,
        headcount: maskCount(Number(row.headcount)),
      })),
      signupStream: signupStream.rows.map((row) => ({
        date: row.date,
        plan_tier: row.plan_tier || 'standard',
        company_size: row.company_size || 'unknown',
      })),
    });
  } catch (error) {
    console.error('Failed to fetch super metrics', error);
    res.status(500).json({ error: error.message || 'Unable to fetch metrics' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM analytics.org_signup_summary ORDER BY signup_date DESC LIMIT 180');
    await query(
      'INSERT INTO super_user_audit (super_user_id, action, metadata) VALUES ($1, $2, $3)',
      [req.user.id, 'metrics_export', JSON.stringify({ count: rows.length })]
    );
    res.json({ rows });
  } catch (error) {
    console.error('Failed to export super metrics', error);
    res.status(500).json({ error: error.message || 'Unable to export metrics' });
  }
});

export default router;

