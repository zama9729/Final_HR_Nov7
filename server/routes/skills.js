import express from 'express';
import { query, withClient } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get skills for employee
router.get('/employees/:id/skills', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const t = await query('SELECT p.tenant_id AS tenant_id FROM profiles p JOIN employees e ON e.user_id = p.id WHERE e.id = $1', [id]);
  const tenant = t.rows[0]?.tenant_id;
  const result = await withClient(async (client) => {
    return client.query('SELECT * FROM skills WHERE employee_id = $1 AND tenant_id = current_tenant() ORDER BY name', [id]);
  }, tenant);
  res.json(result.rows);
});

// Upsert skill
router.post('/employees/:id/skills', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, level, years_experience, last_used_date } = req.body || {};
  if (!name || !level) return res.status(400).json({ error: 'name and level required' });
  const t = await query('SELECT tenant_id FROM profiles p JOIN employees e ON e.user_id = p.id WHERE e.id = $1', [id]);
  const tenant = t.rows[0]?.tenant_id;
  const result = await withClient(async (client) => {
    return client.query(
      `INSERT INTO skills (employee_id, name, level, years_experience, last_used_date, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (employee_id, lower(name)) DO UPDATE
         SET level = EXCLUDED.level,
             years_experience = COALESCE(EXCLUDED.years_experience, skills.years_experience),
             last_used_date = COALESCE(EXCLUDED.last_used_date, skills.last_used_date)
       RETURNING *`,
      [id, name, level, years_experience || 0, last_used_date || null, tenant]
    );
  }, tenant);
  res.json(result.rows[0] || {});
});

// Certifications
router.get('/employees/:id/certifications', authenticateToken, async (req, res) => {
  const t1 = await query('SELECT p.tenant_id AS tenant_id FROM profiles p JOIN employees e ON e.user_id = p.id WHERE e.id = $1', [req.params.id]);
  const tenant1 = t1.rows[0]?.tenant_id;
  const result = await withClient(async (client) => client.query('SELECT * FROM certifications WHERE employee_id = $1 AND tenant_id = current_tenant() ORDER BY issue_date DESC NULLS LAST', [req.params.id]), tenant1);
  res.json(result.rows);
});

router.post('/employees/:id/certifications', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, issuer, issue_date, expiry_date, file_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const t2 = await query('SELECT p.tenant_id AS tenant_id FROM profiles p JOIN employees e ON e.user_id = p.id WHERE e.id = $1', [id]);
  const tenant2 = t2.rows[0]?.tenant_id;
  const result = await withClient(async (client) => client.query(
    `INSERT INTO certifications (employee_id, name, issuer, issue_date, expiry_date, file_url, tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
    [id, name, issuer || null, issue_date || null, expiry_date || null, file_url || null, tenant2]
  ), tenant2);
  res.json(result.rows[0]);
});

export default router;


