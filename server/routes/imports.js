import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/v1/orgs/:orgId/employees/import
router.post('/v1/orgs/:orgId/employees/import', authenticateToken, requireRole('hr','director','ceo'), upload.any(), async (req, res) => {
  const orgId = req.params.orgId;
  const preview = String(req.body.preview || 'false') === 'true';
  const failOnError = String(req.body.fail_on_error || 'false') === 'true';
  let mapping = {};
  try { mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {}; } catch {}

  // Authorization: ensure user belongs to org
  const t = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
  if (!t.rows[0] || t.rows[0].tenant_id !== orgId) return res.status(403).json({ error: 'Forbidden' });

  const report = { imported_count: 0, failed_count: 0, errors: [], warnings: [] };

  let rows = [];
  const file = (req.files || []).find((f) => f.fieldname === 'csv' || f.fieldname === 'file');
  if (file) {
    // Parse CSV from buffer
    rows = await new Promise((resolve, reject) => {
      const out = [];
      const parser = parse({ columns: true, skip_empty_lines: true });
      parser.on('readable', () => {
        let r; while ((r = parser.read()) !== null) out.push(r);
      });
      parser.on('error', reject);
      parser.on('end', () => resolve(out));
      parser.write(file.buffer);
      parser.end();
    });
  } else if (req.body.rows) {
    rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  } else {
    return res.status(400).json({ error: 'Provide csv file or rows' });
  }

  // Auto-map if not provided
  if (!mapping || Object.keys(mapping).length === 0) {
    const headers = Object.keys(rows[0] || {});
    const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g,'').replace(/[^a-z_]/g,'');
    const nm = headers.reduce((acc, h) => { acc[normalize(h)] = h; return acc; }, {});
    mapping = {
      first_name: nm.firstname || nm.first_name || nm['first-name'],
      last_name: nm.lastname || nm.last_name || nm['last-name'],
      email: nm.email,
      employee_id: nm.employeeid || nm.employee_id,
      department: nm.department,
      role: nm.role,
      manager_email: nm.manageremail || nm.manager_email,
      join_date: nm.joindate || nm.join_date,
      work_location: nm.worklocation || nm.work_location,
      phone: nm.phone
    };
  }

  // Preview: return first 10 rows with mapping
  if (preview) {
    return res.json({ preview: rows.slice(0, 10), mapping });
  }

  // Process in batches of 100 with transaction per batch
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await query('BEGIN');
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowNum = i + j + 2; // account for header
        const rec = {
          firstName: row[mapping.first_name],
          lastName: row[mapping.last_name],
          email: row[mapping.email],
          employeeId: row[mapping.employee_id],
          department: row[mapping.department] || null,
          role: row[mapping.role] || 'employee',
          workLocation: row[mapping.work_location] || null,
          joinDate: row[mapping.join_date] || null,
          managerEmail: row[mapping.manager_email] || null
        };
        // Validate required fields
        const required = ['firstName','lastName','email','employeeId','role'];
        const missing = required.filter(k => !rec[k]);
        if (missing.length) {
          report.failed_count++; report.errors.push({ row: rowNum, error: `Missing: ${missing.join(',')}` });
          if (failOnError) throw new Error(`Row ${rowNum} missing required fields`);
          continue;
        }
        if (!/^([^@\s]+)@([^@\s]+)\.[^@\s]+$/.test(rec.email)) {
          report.failed_count++; report.errors.push({ row: rowNum, error: 'Invalid email' });
          if (failOnError) throw new Error(`Row ${rowNum} invalid email`);
          continue;
        }
        // Duplicates within org
        const exist = await query('SELECT 1 FROM profiles WHERE lower(email)=lower($1)', [rec.email]);
        if (exist.rows.length) {
          report.failed_count++; report.errors.push({ row: rowNum, error: `Email exists: ${rec.email}` });
          if (failOnError) throw new Error(`Row ${rowNum} duplicate`);
          continue;
        }
        // Resolve manager
        let reportingManagerId = null;
        if (rec.managerEmail) {
          const mgr = await query('SELECT e.id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE lower(p.email)=lower($1) AND e.tenant_id=$2', [rec.managerEmail, orgId]);
          if (mgr.rows.length) reportingManagerId = mgr.rows[0].id;
        }

        // Create user/profile/employee/role
        const userIdRes = await query('SELECT gen_random_uuid() id');
        const userId = userIdRes.rows[0].id;
        await query('INSERT INTO profiles (id, email, first_name, last_name, phone, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)', [userId, rec.email, rec.firstName, rec.lastName, null, orgId]);
        // auth is optional here; if required, create a random password hash outside of CSV scope
        await query(
          `INSERT INTO employees (user_id, employee_id, department, position, work_location, join_date, reporting_manager_id, tenant_id, must_change_password, onboarding_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'not_started')`,
          [userId, rec.employeeId, rec.department, null, rec.workLocation, rec.joinDate || null, reportingManagerId, orgId]
        );
        await query('INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1,$2,$3)', [userId, rec.role, orgId]);
        report.imported_count++;
      }
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      if (failOnError) return res.status(400).json({ ...report, error: e.message });
    }
  }

  res.json(report);
});

export default router;


