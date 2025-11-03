import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { query, withClient } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function getOrgId(userId) {
  const r = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return r.rows[0]?.tenant_id || null;
}

// List holiday lists for org
router.get('/v1/orgs/:org/holiday-lists', authenticateToken, async (req, res) => {
  try {
    const { org } = req.params;
    const { year } = req.query;
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId || tenantId !== org) {
      return res.status(403).json({ error: 'Unauthorized: organization mismatch' });
    }
    
    const r = await withClient(async (client) => {
      const yearParam = year ? parseInt(year) : null;
      return client.query(
        'SELECT * FROM holiday_lists WHERE org_id = $1 AND ($2::int IS NULL OR year = $2::int) ORDER BY created_at DESC',
        [org, yearParam]
      );
    }, tenantId);
    
    res.json(r.rows);
  } catch (error) {
    console.error('Error fetching holiday lists:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch holiday lists' });
  }
});

// Create holiday list
router.post('/v1/orgs/:org/holiday-lists', authenticateToken, async (req, res) => {
  try {
    const { org } = req.params;
    const { region, year, name, is_national } = req.body || {};
    
    if (!region || !year || !name) {
      return res.status(400).json({ error: 'region, year, name required' });
    }
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId || tenantId !== org) {
      return res.status(403).json({ error: 'Unauthorized: organization mismatch' });
    }
    
    // Check user has HR/CEO/Director role
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const role = roleRes.rows[0]?.role;
    if (!['hr', 'ceo', 'director'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized: HR/CEO/Director role required' });
    }
    
    const result = await withClient(async (client) => {
      // Insert holiday list
      const listRes = await client.query(
        'INSERT INTO holiday_lists (org_id, region, year, name, is_national, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [org, region, year, name, !!is_national, req.user.id]
      );
      
      // Insert audit log
      await client.query(
        'INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)',
        [org, req.user.id, 'create', JSON.stringify({ region, year, name })]
      );
      
      return listRes;
    }, tenantId);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating holiday list:', error);
    res.status(500).json({ error: error.message || 'Failed to create holiday list' });
  }
});

// Import holidays CSV/Excel to list (preview)
router.post('/v1/orgs/:org/holiday-lists/:id/import', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing file' });
    
    const { org, id } = req.params;
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId || tenantId !== org) {
      return res.status(403).json({ error: 'Unauthorized: organization mismatch' });
    }
    
    let rows = [];
    const fileName = req.file.originalname.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    if (isExcel) {
      // Parse Excel file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (rawRows.length < 2) {
        return res.status(400).json({ error: 'Excel file must have at least a header and one data row' });
      }
      
      // Get headers from first row
      const headers = rawRows[0].map((h) => String(h || '').trim().toLowerCase());
      
      // Convert to objects
      rows = rawRows.slice(1).map((row) => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] ? String(row[i]).trim() : '';
        });
        return obj;
      }).filter((r) => r.date || r.name); // Filter empty rows
    } else {
      // Parse CSV file
      rows = parse(req.file.buffer.toString('utf8'), { 
        columns: true, 
        skip_empty_lines: true 
      });
    }
    
    // Clean and normalize rows
    const cleaned = rows.map((r) => ({
      date: String(r.date || r.Date || '').trim(),
      name: String(r.name || r.Name || '').trim(),
      is_national: String(r.is_national || r['is_national'] || r.Is_National || 'false').toLowerCase() === 'true',
      notes: (r.notes || r.Notes || null) ? String(r.notes || r.Notes).trim() : null
    })).filter((r) => r.date && r.name); // Filter rows with missing date/name
    
    res.json({ preview: cleaned.slice(0, 50), total: cleaned.length });
  } catch (error) {
    console.error('Error parsing file:', error);
    return res.status(400).json({ error: `Invalid file format: ${error.message || 'Could not parse file'}` });
  }
});

// Confirm import (body.rows OR file upload for full import)
router.post('/v1/orgs/:org/holiday-lists/:id/import/confirm', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { org, id } = req.params;
    let rows = req.body?.rows;
    
    // If file is uploaded, parse it (for full import of all rows)
    if (req.file) {
      const fileName = req.file.originalname.toLowerCase();
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      
      let parsedRows = [];
      if (isExcel) {
        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawRows.length < 2) {
          return res.status(400).json({ error: 'Excel file must have at least a header and one data row' });
        }
        
        const headers = rawRows[0].map((h) => String(h || '').trim().toLowerCase());
        parsedRows = rawRows.slice(1).map((row) => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = row[i] ? String(row[i]).trim() : '';
          });
          return {
            date: String(obj.date || '').trim(),
            name: String(obj.name || '').trim(),
            is_national: String(obj.is_national || 'false').toLowerCase() === 'true',
            notes: obj.notes ? String(obj.notes).trim() : null
          };
        }).filter((r) => r.date && r.name);
      } else {
        // Parse CSV file
        const csvRows = parse(req.file.buffer.toString('utf8'), { 
          columns: true, 
          skip_empty_lines: true 
        });
        parsedRows = csvRows.map((r) => ({
          date: String(r.date || r.Date || '').trim(),
          name: String(r.name || r.Name || '').trim(),
          is_national: String(r.is_national || r['is_national'] || 'false').toLowerCase() === 'true',
          notes: (r.notes || r.Notes || null) ? String(r.notes || r.Notes).trim() : null
        })).filter((r) => r.date && r.name);
      }
      
      rows = parsedRows;
    }
    
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows required or file must be provided' });
    }
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId || tenantId !== org) {
      return res.status(403).json({ error: 'Unauthorized: organization mismatch' });
    }
    
    // Check user has HR/CEO/Director role
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const role = roleRes.rows[0]?.role;
    if (!['hr', 'ceo', 'director'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized: HR/CEO/Director role required' });
    }
    
    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        for (const r of rows) {
          await client.query(
            'INSERT INTO holidays (list_id, date, name, is_national, notes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (list_id,date) DO UPDATE SET name = EXCLUDED.name, is_national = EXCLUDED.is_national, notes = EXCLUDED.notes',
            [id, r.date, r.name, !!r.is_national, r.notes || null]
          );
        }
        await client.query(
          'INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)',
          [org, req.user.id, 'import', JSON.stringify({ list_id: id, count: rows.length })]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }, tenantId);
    
    res.json({ ok: true, imported: rows.length });
  } catch (error) {
    console.error('Error importing holidays:', error);
    res.status(500).json({ error: error.message || 'Failed to import holidays' });
  }
});

// Publish
router.post('/v1/orgs/:org/holiday-lists/:id/publish', authenticateToken, async (req, res) => {
  try {
    const { org, id } = req.params;
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId || tenantId !== org) {
      return res.status(403).json({ error: 'Unauthorized: organization mismatch' });
    }
    
    await withClient(async (client) => {
      await client.query('UPDATE holiday_lists SET published = true, published_at = now() WHERE id = $1', [id]);
      await client.query(
        'INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)',
        [org, req.user.id, 'publish', JSON.stringify({ list_id: id })]
      );
    }, tenantId);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Error publishing holiday list:', error);
    res.status(500).json({ error: error.message || 'Failed to publish list' });
  }
});

// Lock
router.post('/v1/orgs/:org/holiday-lists/:id/lock', authenticateToken, async (req, res) => {
  try {
    const { org, id } = req.params;
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId || tenantId !== org) {
      return res.status(403).json({ error: 'Unauthorized: organization mismatch' });
    }
    
    await withClient(async (client) => {
      await client.query('UPDATE holiday_lists SET locked = true, locked_at = now() WHERE id = $1', [id]);
      await client.query(
        'INSERT INTO holiday_audit_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)',
        [org, req.user.id, 'lock', JSON.stringify({ list_id: id })]
      );
    }, tenantId);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Error locking holiday list:', error);
    res.status(500).json({ error: error.message || 'Failed to lock list' });
  }
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

// Get holidays for a specific holiday list
router.get('/holidays/lists/:listId', authenticateToken, async (req, res) => {
  try {
    const { listId } = req.params;
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    const holidaysRes = await withClient(async (client) => {
      return client.query(
        'SELECT * FROM holidays WHERE list_id = $1 ORDER BY is_national DESC, date ASC',
        [listId]
      );
    }, tenantId);
    
    res.json(holidaysRes.rows);
  } catch (error) {
    console.error('Error fetching holidays for list:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch holidays' });
  }
});

// Get holidays for employee (with state filter)
router.get('/holidays/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year, state } = req.query;
    
    const currentYear = year || new Date().getFullYear();
    
    // Get employee info
    const empRes = await query('SELECT e.id, e.tenant_id, e.state, e.work_mode, e.holiday_override FROM employees e WHERE e.id = $1', [employeeId]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employee = empRes.rows[0];
    const orgId = employee.tenant_id;
    const empState = state || employee.state || 'remote';
    
    // Get published holiday list for the state
    const listRes = await query(
      'SELECT * FROM holiday_lists WHERE org_id = $1 AND region = $2 AND year = $3 AND published = true ORDER BY created_at DESC LIMIT 1',
      [orgId, empState, currentYear]
    );
    
    if (listRes.rows.length === 0) {
      return res.json({ holidays: [], state: empState, year: currentYear });
    }
    
    const list = listRes.rows[0];
    
    // Get all holidays for the list (no limit - show all published holidays)
    const holidaysRes = await query(
      'SELECT * FROM holidays WHERE list_id = $1 ORDER BY is_national DESC, date ASC',
      [list.id]
    );
    
    res.json({
      holidays: holidaysRes.rows,
      state: empState,
      year: currentYear,
      listName: list.name
    });
  } catch (error) {
    console.error('Error fetching employee holidays:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch holidays' });
  }
});

// Get upcoming holidays
router.get('/holidays', authenticateToken, async (req, res) => {
  try {
    const { upcoming } = req.query;
    
    // Get user's tenant_id
    const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = profileRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    const currentYear = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];
    
    let holidaysQuery = `
      SELECT h.*, hl.name as list_name, hl.region
      FROM holidays h
      JOIN holiday_lists hl ON hl.id = h.list_id
      WHERE hl.org_id = $1 
        AND hl.year = $2 
        AND hl.published = true
        AND h.date >= $3
      ORDER BY h.date ASC
      LIMIT 5
    `;
    
    const holidaysRes = await query(holidaysQuery, [tenantId, currentYear, today]);
    
    res.json(holidaysRes.rows);
  } catch (error) {
    console.error('Error fetching upcoming holidays:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch holidays' });
  }
});

// Get holidays with state filter (for calendar view)
router.get('/holidays/calendar', authenticateToken, async (req, res) => {
  try {
    const { year, state, org_id } = req.query;
    
    const currentYear = year || new Date().getFullYear();
    
    // Get user's tenant_id
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = org_id || tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Get all published holiday lists for the year
    let listsQuery = `SELECT * FROM holiday_lists WHERE org_id = $1 AND year = $2 AND published = true`;
    let params = [tenantId, currentYear];
    
    if (state) {
      listsQuery += ` AND region = $3`;
      params.push(state);
    }
    
    listsQuery += ` ORDER BY region, created_at DESC`;
    
    const listsRes = await query(listsQuery, params);
    
    // Get holidays for each list
    const holidaysByState = {};
    
    for (const list of listsRes.rows) {
      const holidaysRes = await query(
        'SELECT * FROM holidays WHERE list_id = $1 ORDER BY is_national DESC, date ASC',
        [list.id]
      );
      
      if (!holidaysByState[list.region]) {
        holidaysByState[list.region] = [];
      }
      holidaysByState[list.region].push(...holidaysRes.rows);
    }
    
    // Get list of all states with holiday lists
    const statesRes = await query(
      `SELECT DISTINCT region FROM holiday_lists WHERE org_id = $1 AND year = $2 AND published = true ORDER BY region`,
      [tenantId, currentYear]
    );
    
    res.json({
      holidaysByState,
      states: statesRes.rows.map(r => r.region),
      year: currentYear
    });
  } catch (error) {
    console.error('Error fetching holiday calendar:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch holiday calendar' });
  }
});

export default router;


