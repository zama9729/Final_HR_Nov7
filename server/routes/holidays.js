import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function getOrgId(userId) {
  const r = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return r.rows[0]?.tenant_id || null;
}

// List holiday lists for org
router.get('/v1/orgs/:org/holiday-lists', authenticateToken, async (req, res) => {
  const { org } = req.params; const { year } = req.query;
  const r = await query('SELECT * FROM holiday_lists WHERE org_id = $1 AND ($2::int IS NULL OR year = $2::int) ORDER BY created_at DESC', [org, year || null]);
  res.json(r.rows);
});

// Create holiday list
router.post('/v1/orgs/:org/holiday-lists', authenticateToken, async (req, res) => {
  const { org } = req.params; const { region, year, name, is_national } = req.body || {};
  if (!region || !year || !name) return res.status(400).json({ error: 'region, year, name required' });
  const r = await query('INSERT INTO holiday_lists (org_id, region, year, name, is_national, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [org, region, year, name, !!is_national, req.user.id]);
  await query('INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)', [org, req.user.id, 'create', { region, year, name }]);
  res.json(r.rows[0]);
});

// Import holidays CSV to list (preview)
router.post('/v1/orgs/:org/holiday-lists/:id/import', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  let rows;
  try { rows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true }); } catch { return res.status(400).json({ error: 'Invalid CSV' }); }
  const cleaned = rows.map((r) => ({ date: r.date, name: r.name, is_national: String(r.is_national||'').toLowerCase() === 'true', notes: r.notes || null }));
  res.json({ preview: cleaned.slice(0, 50), total: cleaned.length });
});

// Confirm import (body.rows)
router.post('/v1/orgs/:org/holiday-lists/:id/import/confirm', authenticateToken, async (req, res) => {
  const { org, id } = req.params; const { rows } = req.body || {};
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows required' });
  await query('BEGIN');
  try {
    for (const r of rows) {
      await query('INSERT INTO holidays (list_id, date, name, is_national, notes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (list_id,date) DO UPDATE SET name = EXCLUDED.name, is_national = EXCLUDED.is_national, notes = EXCLUDED.notes', [id, r.date, r.name, !!r.is_national, r.notes || null]);
    }
    await query('INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)', [org, req.user.id, 'import', { list_id: id, count: rows.length }]);
    await query('COMMIT');
    res.json({ ok: true, imported: rows.length });
  } catch (e) {
    await query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// Publish
router.post('/v1/orgs/:org/holiday-lists/:id/publish', authenticateToken, async (req, res) => {
  const { org, id } = req.params; await query('UPDATE holiday_lists SET published = true, published_at = now() WHERE id = $1', [id]);
  await query('INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)', [org, req.user.id, 'publish', { list_id: id }]);
  res.json({ ok: true });
});

// Lock
router.post('/v1/orgs/:org/holiday-lists/:id/lock', authenticateToken, async (req, res) => {
  const { org, id } = req.params; await query('UPDATE holiday_lists SET locked = true, locked_at = now() WHERE id = $1', [id]);
  await query('INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)', [org, req.user.id, 'lock', { list_id: id }]);
  res.json({ ok: true });
});

// Override per-employee
router.post('/v1/orgs/:org/employees/:emp/holiday-override', authenticateToken, async (req, res) => {
  const { emp } = req.params; const { dates, month, reason } = req.body || {};
  if (!Array.isArray(dates) || !month) return res.status(400).json({ error: 'dates[] and month required' });
  const r = await query('SELECT holiday_override FROM employees WHERE id = $1', [emp]);
  const current = r.rows[0]?.holiday_override || {};
  current[month] = dates;
  await query('UPDATE employees SET holiday_override = $1 WHERE id = $2', [current, emp]);
  await query('INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ((SELECT tenant_id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE e.id = $1 LIMIT 1), $2, $3, $4)', [emp, req.user.id, 'override', { month, dates, reason }]);
  res.json({ ok: true });
});

export default router;


