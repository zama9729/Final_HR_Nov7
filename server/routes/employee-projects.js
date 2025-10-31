import express from 'express';
import { query, withClient } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/employees/:id/projects', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const t1 = await query('SELECT p.tenant_id AS tenant_id FROM profiles p JOIN employees e ON e.user_id = p.id WHERE e.id = $1', [id]);
  const tenant1 = t1.rows[0]?.tenant_id;
  const result = await withClient(async (client) => client.query('SELECT * FROM employee_projects WHERE employee_id = $1 AND tenant_id = current_tenant() ORDER BY start_date DESC NULLS LAST', [id]), tenant1);
  res.json(result.rows);
});

router.post('/employees/:id/projects', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { project_name, role, start_date, end_date, technologies, description } = req.body || {};
  if (!project_name) return res.status(400).json({ error: 'project_name required' });
  const t2 = await query('SELECT p.tenant_id AS tenant_id FROM profiles p JOIN employees e ON e.user_id = p.id WHERE e.id = $1', [id]);
  const tenant2 = t2.rows[0]?.tenant_id;
  const result = await withClient(async (client) => client.query(
    `INSERT INTO employee_projects (employee_id, project_name, role, start_date, end_date, technologies, description, tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
    [id, project_name, role || null, start_date || null, end_date || null, Array.isArray(technologies) ? technologies : [], description || null, tenant2]
  ), tenant2);
  res.json(result.rows[0]);
});

export default router;


