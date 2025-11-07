import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/v1/orgs/:orgId/employees/import
router.post('/v1/orgs/:orgId/employees/import', authenticateToken, requireRole('hr','director','ceo','admin'), upload.any(), async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const preview = String(req.body.preview || 'false') === 'true';
    const failOnError = String(req.body.fail_on_error || 'false') === 'true';
    let mapping = {};
    try { mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {}; } catch {}

    // Authorization: ensure user belongs to org (RLS enforcement)
    const t = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    if (!t.rows[0] || !t.rows[0].tenant_id) {
      console.error('User has no tenant_id:', req.user.id);
      return res.status(403).json({ error: 'User has no organization assigned' });
    }
    
    const userTenantId = String(t.rows[0].tenant_id); // User's actual tenant_id (organization)
    const orgIdStr = String(orgId); // Requested orgId from route parameter
    
    // CRITICAL: Enforce RLS - user can only import to their own organization
    if (userTenantId !== orgIdStr) {
      console.error(`❌ Tenant mismatch (RLS violation): user tenant=${userTenantId}, requested orgId=${orgIdStr}`);
      return res.status(403).json({ 
        error: 'Organization mismatch. You can only import employees for your own organization.',
        details: { userTenantId, requestedOrgId: orgIdStr }
      });
    }
    
    // Use user's tenant_id for all operations (RLS enforcement)
    const tenantId = userTenantId; // Always use authenticated user's tenant_id
    console.log(`✅ RLS: Importing employees for organization ${tenantId} (verified for user ${req.user.id})`);

  const report = { imported_count: 0, failed_count: 0, errors: [], warnings: [] };

  console.log('Import request received:', {
    orgId,
    tenantId, // Using verified tenant_id
    userRole: req.user?.role,
    preview,
    hasFiles: !!(req.files && req.files.length > 0),
    fileCount: req.files?.length || 0,
    fileNames: req.files?.map(f => f.fieldname) || []
  });
  
  let rows = [];
  const file = (req.files || []).find((f) => f.fieldname === 'csv' || f.fieldname === 'file');
  
  if (file) {
    console.log('CSV file found:', { fieldname: file.fieldname, size: file.size, mimetype: file.mimetype });
    // Parse CSV from buffer
    try {
      rows = await new Promise((resolve, reject) => {
        const out = [];
        const parser = parse({ 
          columns: true, 
          skip_empty_lines: true,
          trim: true,
          bom: true // Handle UTF-8 BOM
        });
        parser.on('readable', () => {
          let r; while ((r = parser.read()) !== null) out.push(r);
        });
        parser.on('error', reject);
        parser.on('end', () => {
          console.log(`Parsed ${out.length} rows from CSV`);
          if (out.length > 0) {
            console.log('First row sample:', JSON.stringify(out[0], null, 2));
            console.log('Available columns:', Object.keys(out[0]));
          }
          resolve(out);
        });
        parser.write(file.buffer.toString('utf8'));
        parser.end();
      });
    } catch (e) {
      console.error('CSV parsing error:', e);
      return res.status(400).json({ 
        error: 'Invalid CSV file: ' + e.message,
        imported_count: 0,
        failed_count: 0,
        errors: ['Failed to parse CSV: ' + e.message]
      });
    }
  } else if (req.body.rows) {
    rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  } else {
    console.error('No file or rows provided');
    return res.status(400).json({ 
      error: 'Provide csv file or rows',
      imported_count: 0,
      failed_count: 0,
      errors: ['No CSV file uploaded']
    });
  }
  
  if (rows.length === 0) {
    console.error('No rows found in CSV');
    return res.status(400).json({ 
      error: 'CSV file appears to be empty or has no valid rows',
      imported_count: 0,
      failed_count: 0,
      errors: ['No rows found in CSV file']
    });
  }
  
  console.log(`Processing ${rows.length} rows for import`);

  // Auto-map if not provided
  if (!mapping || Object.keys(mapping).length === 0) {
    const headers = Object.keys(rows[0] || {});
    console.log('Auto-mapping columns. Available headers:', headers);
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
    console.log('Auto-mapped columns:', mapping);
  }

  // Preview: return first 10 rows with mapping
  if (preview) {
    return res.json({ preview: rows.slice(0, 10), mapping });
  }

  // Process in batches of 100 with transaction per batch
  const batchSize = 100;
  console.log(`Starting import process with ${rows.length} rows in batches of ${batchSize}`);
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}: rows ${i + 2} to ${i + batch.length + 1}`);
    
    try {
      await query('BEGIN');
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowNum = i + j + 2; // account for header
        
        try {
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
          
          console.log(`Processing row ${rowNum}:`, { firstName: rec.firstName, lastName: rec.lastName, email: rec.email, employeeId: rec.employeeId });
        // Validate required fields (role is optional, defaults to 'employee')
        const required = ['firstName','lastName','email','employeeId'];
        const missing = required.filter(k => !rec[k] || String(rec[k]).trim() === '');
        if (missing.length) {
          const errorMsg = `Row ${rowNum}: Missing required fields: ${missing.join(', ')}. Found: firstName="${rec.firstName}", lastName="${rec.lastName}", email="${rec.email}", employeeId="${rec.employeeId}"`;
          report.failed_count++; 
          report.errors.push({ row: rowNum, error: errorMsg });
          console.log(errorMsg);
          if (failOnError) throw new Error(`Row ${rowNum} missing required fields`);
          continue;
        }
        
        // Normalize role (case-insensitive, default to 'employee')
        if (!rec.role || String(rec.role).trim() === '') {
          rec.role = 'employee';
        }
        const roleValue = String(rec.role).trim().toLowerCase();
        const roleMapping = {
          'employee': 'employee',
          'hr': 'hr',
          'ceo': 'ceo',
          'director': 'director',
          'manager': 'manager',
          'admin': 'admin'
        };
        rec.role = roleMapping[roleValue] || 'employee';
        if (roleValue && !roleMapping[roleValue]) {
          console.log(`Row ${rowNum}: Invalid role '${rec.role}', defaulting to 'employee'`);
        }
        
        if (!/^([^@\s]+)@([^@\s]+)\.[^@\s]+$/.test(rec.email)) {
          const errorMsg = `Row ${rowNum}: Invalid email format: "${rec.email}"`;
          report.failed_count++; 
          report.errors.push({ row: rowNum, error: errorMsg });
          console.log(errorMsg);
          if (failOnError) throw new Error(`Row ${rowNum} invalid email`);
          continue;
        }
        // Check for duplicate employeeId in same CSV (before database check)
        const duplicateEmployeeId = batch.slice(0, j).some(b => {
          const otherId = b[mapping.employee_id];
          return otherId && String(otherId).trim().toLowerCase() === String(rec.employeeId).trim().toLowerCase();
        });
        if (duplicateEmployeeId) {
          const errorMsg = `Row ${rowNum}: Duplicate employeeId "${rec.employeeId}" found in CSV file`;
          report.failed_count++;
          report.errors.push({ row: rowNum, error: errorMsg });
          console.log(`❌ ${errorMsg}`);
          if (failOnError) throw new Error(`Row ${rowNum} duplicate employeeId`);
          continue;
        }
        
        // Check for duplicate email in database (RLS: check tenant_id)
        const existEmail = await query('SELECT 1 FROM profiles WHERE lower(email)=lower($1) AND tenant_id=$2', [rec.email, tenantId]);
        if (existEmail.rows.length) {
          const errorMsg = `Row ${rowNum}: Email ${rec.email} already exists in database`;
          report.failed_count++; 
          report.errors.push({ row: rowNum, error: errorMsg });
          console.log(`❌ ${errorMsg}`);
          if (failOnError) throw new Error(`Row ${rowNum} duplicate email`);
          continue;
        }
        
        // Check for duplicate employeeId in database (RLS: check tenant_id)
        const existEmployeeId = await query('SELECT 1 FROM employees WHERE employee_id=$1 AND tenant_id=$2', [rec.employeeId, tenantId]);
        if (existEmployeeId.rows.length) {
          const errorMsg = `Row ${rowNum}: Employee ID "${rec.employeeId}" already exists in database`;
          report.failed_count++;
          report.errors.push({ row: rowNum, error: errorMsg });
          console.log(`❌ ${errorMsg}`);
          if (failOnError) throw new Error(`Row ${rowNum} duplicate employeeId in database`);
          continue;
        }
        // Resolve manager (RLS: only within same tenant)
        let reportingManagerId = null;
        if (rec.managerEmail) {
          const mgr = await query('SELECT e.id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE lower(p.email)=lower($1) AND e.tenant_id=$2', [rec.managerEmail, tenantId]);
          if (mgr.rows.length) {
            reportingManagerId = mgr.rows[0].id;
            console.log(`Row ${rowNum}: Found manager ${rec.managerEmail} (ID: ${reportingManagerId}) in same organization`);
          } else {
            console.log(`Row ${rowNum}: Manager ${rec.managerEmail} not found in organization ${tenantId} (will be set to null)`);
          }
        }

        // Create user/profile/employee/role (RLS: all assigned to tenant_id)
        const userIdRes = await query('SELECT gen_random_uuid() id');
        const userId = userIdRes.rows[0].id;
        console.log(`Row ${rowNum}: Creating employee ${rec.email} for organization ${tenantId}`);
        await query('INSERT INTO profiles (id, email, first_name, last_name, phone, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)', [userId, rec.email, rec.firstName, rec.lastName, null, tenantId]);
        
        // Create auth record with temporary password (user must change on first login)
        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        await query('INSERT INTO user_auth (user_id, password_hash) VALUES ($1,$2)', [userId, hashedPassword]);
        
        // Parse and normalize date format
        let normalizedJoinDate = null;
        if (rec.joinDate) {
          try {
            const dateParts = String(rec.joinDate).split(/[-\/]/);
            if (dateParts.length === 3) {
              let year, month, day;
              if (dateParts[0].length === 4) {
                year = dateParts[0];
                month = dateParts[1].padStart(2, '0');
                day = dateParts[2].padStart(2, '0');
              } else {
                day = dateParts[0].padStart(2, '0');
                month = dateParts[1].padStart(2, '0');
                year = dateParts[2];
              }
              const yearNum = parseInt(year);
              if (yearNum >= 1900 && yearNum <= 2100) {
                normalizedJoinDate = `${year}-${month}-${day}`;
                const testDate = new Date(normalizedJoinDate);
                if (isNaN(testDate.getTime())) {
                  normalizedJoinDate = null;
                }
              }
            }
          } catch (e) {
            console.log(`Row ${rowNum}: Error parsing date '${rec.joinDate}'`);
          }
        }
        
          await query(
            `INSERT INTO employees (user_id, employee_id, department, position, work_location, join_date, reporting_manager_id, tenant_id, must_change_password, onboarding_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'not_started')`,
            [userId, rec.employeeId, rec.department, null, rec.workLocation, normalizedJoinDate, reportingManagerId, tenantId]
          );
          await query('INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1,$2,$3)', [userId, rec.role, tenantId]);
          console.log(`✅ Row ${rowNum}: Employee ${rec.employeeId} assigned to organization ${tenantId}`);
          report.imported_count++;
          console.log(`✅ Row ${rowNum}: Successfully imported ${rec.email} (employee_id: ${rec.employeeId}, role: ${rec.role})`);
        } catch (rowError) {
          // Catch individual row errors
          const errorMsg = `Row ${rowNum}: Error - ${rowError.message || 'Unknown error'}`;
          console.error(`❌ ${errorMsg}`);
          console.error('Row error details:', rowError);
          report.failed_count++;
          report.errors.push({ row: rowNum, error: errorMsg });
          if (failOnError) {
            await query('ROLLBACK');
            return res.status(400).json({ ...report, error: errorMsg });
          }
          // Continue with next row
        }
      }
      
      await query('COMMIT');
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} committed successfully. Imported so far: ${report.imported_count}, Failed: ${report.failed_count}`);
    } catch (batchError) {
      await query('ROLLBACK');
      const errorMsg = `Batch ${Math.floor(i/batchSize) + 1} failed: ${batchError.message || 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      console.error('Batch error details:', batchError);
      if (failOnError) {
        return res.status(400).json({ ...report, error: errorMsg });
      }
      // Continue with next batch
    }
  }
  
  console.log(`📊 Import complete. Total: ${report.imported_count} imported, ${report.failed_count} failed`);

    res.json(report);
  } catch (error) {
    console.error('Error in employee import:', error);
    res.status(500).json({ error: error.message || 'Import failed' });
  }
});

export default router;


