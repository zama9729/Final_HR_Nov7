import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Create project
router.post('/', authenticateToken, async (req, res) => {
  const { name, start_date, end_date, required_skills, required_certifications, priority, expected_allocation_percent, location } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const t = await query('SELECT tenant_id FROM profiles WHERE id=$1', [req.user.id]);
  const org = t.rows[0]?.tenant_id; if (!org) return res.status(403).json({ error: 'No org' });
  const result = await query(
    `INSERT INTO projects (org_id, name, start_date, end_date, required_skills, required_certifications, priority, expected_allocation_percent, location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [org, name, start_date || null, end_date || null, required_skills || [], required_certifications || [], priority || 0, expected_allocation_percent || 50, location || null]
  );
  res.json(result.rows[0]);
});

// Suggest candidates (delegates to AI service)
router.post('/:id/suggest-candidates', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
  if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
  const project = projectRes.rows[0];
  const { suggestCandidates } = await import('../services/ai/suggester.js');
  const suggestions = await suggestCandidates(project, req.body || {});
  await query('INSERT INTO ai_suggestion_logs (project_id, request_payload, response_payload, computed_by) VALUES ($1,$2,$3,$4)', [id, req.body || {}, suggestions, 'ai-suggester-v1']);
  res.json({ candidates: suggestions });
});

// Assign candidate
router.post('/:id/assign', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { employee_id, allocation_percent, role, start_date, end_date, override, override_reason } = req.body || {};
  if (!employee_id || !allocation_percent) return res.status(400).json({ error: 'employee_id and allocation_percent required' });

  // Check utilization
  const utilRes = await query(
    `SELECT COALESCE(SUM(allocation_percent),0) AS alloc
     FROM assignments
     WHERE employee_id = $1 AND (end_date IS NULL OR end_date >= now()::date)`,
    [employee_id]
  );
  const currentAlloc = Number(utilRes.rows[0]?.alloc || 0);
  if (!override && currentAlloc + Number(allocation_percent) > 100) {
    return res.status(409).json({ error: 'Utilization would exceed 100%', currentAlloc });
  }

  const result = await query(
    `INSERT INTO assignments (project_id, employee_id, role, allocation_percent, start_date, end_date, assigned_by, override, override_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [id, employee_id, role || null, allocation_percent, start_date || null, end_date || null, req.user.id, !!override, override ? (override_reason || 'HR override') : null]
  );

  // Award benefit points (simple rule: 10 per month at creation time)
  await query('INSERT INTO benefit_points (employee_id, points, reason, project_id) VALUES ($1,$2,$3,$4)', [employee_id, 10, 'Project assignment', id]);

  res.json(result.rows[0]);
});

export default router;


