import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { rebuildSegmentsForEmployee } from '../services/assignment-segmentation.js';
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

  const branchLookup = await query(
    'SELECT id, name, code FROM org_branches WHERE org_id = $1',
    [tenantId]
  );
  const departmentLookup = await query(
    'SELECT id, name, code, branch_id FROM departments WHERE org_id = $1',
    [tenantId]
  );
  const teamLookup = await query(
    'SELECT id, name, branch_id, department_id FROM teams WHERE org_id = $1',
    [tenantId]
  );

  const normalizeValue = (value) => (value ? String(value).trim().toLowerCase() : '');

  const findBranch = (rec) => {
    const branchCode = normalizeValue(rec.branchCode);
    const branchName = normalizeValue(rec.branchName || rec.workLocation);
    if (!branchCode && !branchName) return null;
    return branchLookup.rows.find((branch) => {
      const codeMatch = branchCode && normalizeValue(branch.code) === branchCode;
      const nameMatch = branchName && normalizeValue(branch.name) === branchName;
      return codeMatch || nameMatch;
    }) || null;
  };

  const findDepartment = (rec, branchId) => {
    const departmentName = normalizeValue(rec.department);
    const departmentCode = normalizeValue(rec.departmentCode);
    if (!departmentName && !departmentCode) return null;
    return departmentLookup.rows.find((dept) => {
      if (branchId && dept.branch_id && dept.branch_id !== branchId) return false;
      const codeMatch = departmentCode && normalizeValue(dept.code) === departmentCode;
      const nameMatch = departmentName && normalizeValue(dept.name) === departmentName;
      return codeMatch || nameMatch;
    }) || null;
  };

  const findTeam = (rec, branchId, departmentId) => {
    const teamName = normalizeValue(rec.teamName);
    if (!teamName) return null;
    return teamLookup.rows.find((team) => {
      if (branchId && team.branch_id && team.branch_id !== branchId) return false;
      if (departmentId && team.department_id && team.department_id !== departmentId) return false;
      return normalizeValue(team.name) === teamName;
    }) || null;
  };

const departmentCache = new Map();
const teamCache = new Map();

  // Auto-map if not provided
  if (!mapping || Object.keys(mapping).length === 0) {
    const headers = Object.keys(rows[0] || {});
    console.log('Auto-mapping columns. Available headers:', headers);
    const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g,'').replace(/[^a-z_]/g,'');
    const nm = headers.reduce((acc, h) => { 
      const norm = normalize(h);
      // Handle duplicate columns (parser may append _1, _2, etc.)
      if (acc[norm]) {
        // If we already have this normalized key, check if it's a duplicate
        const existing = acc[norm];
        if (Array.isArray(existing)) {
          existing.push(h);
        } else {
          acc[norm] = [existing, h];
        }
      } else {
        acc[norm] = h;
      }
      return acc;
    }, {});
    
    // Helper to get first match or handle arrays
    const getCol = (keys) => {
      for (const key of keys) {
        const val = nm[key];
        if (val) {
          if (Array.isArray(val)) return val[0]; // Use first occurrence for name
          return val;
        }
      }
      return null;
    };
    
    // Helper to get second match for duplicate columns (e.g., second 'departme' for code)
    const getColSecond = (keys) => {
      for (const key of keys) {
        const val = nm[key];
        if (val && Array.isArray(val) && val.length > 1) {
          return val[1]; // Use second occurrence for code
        }
      }
      return null;
    };
    
    mapping = {
      first_name: getCol(['firstname', 'first_name', 'first-name']),
      last_name: getCol(['lastname', 'last_name', 'last-name']),
      email: getCol(['email']),
      employee_id: getCol(['employee', 'employeeid', 'employee_id']), // Support 'employee' column
      department: getCol(['departme', 'department']), // Support 'departme' column (first occurrence)
      role: getCol(['role']),
      designation: getCol(['designation', 'position']),
      grade: getCol(['grade']), // Grade/level (A4, A5, B1, etc.)
      manager_email: getCol(['manager', 'manageremail', 'manager_email']), // Support 'manager' column
      join_date: getCol(['joindate', 'join_date']),
      work_location: getCol(['work_loca', 'worklocation', 'work_location']), // Support 'work_loca' column
      phone: getCol(['phone']),
      branch_name: getCol(['branch_na', 'branch', 'branchname', 'site']), // Support 'branch_na' column
      branch_code: getCol(['branch_co', 'branchcode', 'branch_code']), // Support 'branch_co' column
      department_code: getColSecond(['departme']) || getCol(['departmentcode', 'department_code']), // Use second 'departme' if duplicate, else look for explicit code column
      team_name: getCol(['team_nam', 'team', 'teamname']) // Support 'team_nam' column
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
    
    // Track manager references within this batch (by lowercase email)
    const managerRefs = new Set();
    batch.forEach((row) => {
      const m = mapping.manager_email && row[mapping.manager_email];
      if (m) managerRefs.add(String(m).trim().toLowerCase());
    });

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
          department: row[mapping.department] ? String(row[mapping.department]).trim() : null,
          role: row[mapping.role] || 'employee',
          designation: row[mapping.designation] ? String(row[mapping.designation]).trim() : null,
          grade: row[mapping.grade] ? String(row[mapping.grade]).trim() : null,
          workLocation: row[mapping.work_location] || null,
          joinDate: row[mapping.join_date] || null,
          managerEmail: row[mapping.manager_email] || null,
          branchName: row[mapping.branch_name] || null,
          branchCode: row[mapping.branch_code] || null,
          departmentCode: row[mapping.department_code] ? String(row[mapping.department_code]).trim() : null,
          teamName: row[mapping.team_name] ? String(row[mapping.team_name]).trim() : null,
          phone: row[mapping.phone] ? String(row[mapping.phone]).trim() : null
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
        
        // Normalize role: keep canonical profiles (employee/manager/hr/admin/ceo/director)
        const permittedRoles = new Set(['employee','manager','hr','admin','ceo','director']);
        const roleValue = String(rec.role || '').trim().toLowerCase();
        rec.role = permittedRoles.has(roleValue) ? roleValue : 'employee';
        
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
        let managerUserIdForPromotion = null;
        if (rec.managerEmail) {
          const mgr = await query('SELECT e.id, e.user_id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE lower(p.email)=lower($1) AND e.tenant_id=$2', [rec.managerEmail, tenantId]);
          if (mgr.rows.length) {
            reportingManagerId = mgr.rows[0].id;
            managerUserIdForPromotion = mgr.rows[0].user_id;
            console.log(`Row ${rowNum}: Found manager ${rec.managerEmail} (ID: ${reportingManagerId}) in same organization`);
          } else {
            console.log(`Row ${rowNum}: Manager ${rec.managerEmail} not found in organization ${tenantId} (will be set to null)`);
          }
        }

        // Create user/profile/employee/role (RLS: all assigned to tenant_id)
        const userIdRes = await query('SELECT gen_random_uuid() id');
        const userId = userIdRes.rows[0].id;
        console.log(`Row ${rowNum}: Creating employee ${rec.email} for organization ${tenantId}`);
        await query('INSERT INTO profiles (id, email, first_name, last_name, phone, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)', [userId, rec.email, rec.firstName, rec.lastName, rec.phone || null, tenantId]);
        
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
        
          const positionValue = rec.designation || rec.grade || rec.role || null;
          const employeeInsert = await query(
            `INSERT INTO employees (user_id, employee_id, department, position, work_location, join_date, reporting_manager_id, tenant_id, must_change_password, onboarding_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'not_started')
             RETURNING id`,
            [userId, rec.employeeId, rec.department, positionValue, rec.workLocation, normalizedJoinDate, reportingManagerId, tenantId]
          );
          const employeeDbId = employeeInsert.rows[0]?.id;
          await query('INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1,$2,$3)', [userId, rec.role, tenantId]);

          // If this employee is referenced as a manager by others in this batch or existing data, promote to manager profile
          if (managerUserIdForPromotion) {
            await query(
              `UPDATE user_roles SET role = 'manager'
               WHERE user_id = $1 AND tenant_id = $2 AND role = 'employee'`,
              [managerUserIdForPromotion, tenantId]
            );
          }

          // If this newly created employee is referenced as manager within this batch, promote
          const lowerEmail = String(rec.email || '').trim().toLowerCase();
          if (managerRefs.has(lowerEmail)) {
            await query(
              `UPDATE user_roles SET role = 'manager'
               WHERE user_id = $1 AND tenant_id = $2 AND role = 'employee'`,
              [userId, tenantId]
            );
          }

          const branchMatch = findBranch(rec);
          let departmentMatch = findDepartment(rec, branchMatch?.id || null);
          if (!departmentMatch && rec.department) {
            const normalizedDept = rec.department.trim();
            const deptCode = rec.departmentCode || null;
            const cacheKey = `${branchMatch?.id || 'none'}::${normalizedDept.toLowerCase()}`;
            if (!departmentCache.has(cacheKey)) {
              try {
                const inserted = await query(
                  `INSERT INTO departments (org_id, branch_id, name, code)
                   VALUES ($1,$2,$3,$4)
                   RETURNING id, name, code, branch_id`,
                  [tenantId, branchMatch?.id || null, normalizedDept, deptCode]
                );
                departmentMatch = inserted.rows[0];
                departmentLookup.rows.push(departmentMatch);
                departmentCache.set(cacheKey, departmentMatch);
                console.log(`Row ${rowNum}: Created department "${normalizedDept}" under branch ${branchMatch?.id || 'none'}`);
              } catch (deptErr) {
                if (deptErr.code === '23505') {
                  departmentMatch = findDepartment(rec, branchMatch?.id || null);
                  if (!departmentMatch) {
                    const fetched = await query(
                      `SELECT id, name, code, branch_id FROM departments
                       WHERE org_id=$1 AND LOWER(name)=LOWER($2) AND ((branch_id IS NULL AND $3 IS NULL) OR branch_id=$3)
                       LIMIT 1`,
                      [tenantId, normalizedDept, branchMatch?.id || null]
                    );
                    departmentMatch = fetched.rows[0] || null;
                    if (departmentMatch) {
                      departmentLookup.rows.push(departmentMatch);
                    }
                  }
                } else {
                  throw deptErr;
                }
              }
            } else {
              departmentMatch = departmentCache.get(cacheKey);
            }
          }

          let teamMatch = findTeam(rec, branchMatch?.id || null, departmentMatch?.id || null);
          if (!teamMatch && rec.teamName) {
            const normalizedTeam = rec.teamName.trim();
            const cacheKey = `${branchMatch?.id || 'none'}::${normalizedTeam.toLowerCase()}`;
            if (!teamCache.has(cacheKey)) {
              try {
                const insertedTeam = await query(
                  `INSERT INTO teams (org_id, branch_id, department_id, name, host_branch_id, metadata)
                   VALUES ($1,$2,$3,$4,$5,'{}'::jsonb)
                   RETURNING id, name, branch_id, department_id`,
                  [tenantId, branchMatch?.id || null, departmentMatch?.id || null, normalizedTeam, branchMatch?.id || null]
                );
                teamMatch = insertedTeam.rows[0];
                teamLookup.rows.push(teamMatch);
                teamCache.set(cacheKey, teamMatch);
                console.log(`Row ${rowNum}: Created team "${normalizedTeam}" under branch ${branchMatch?.id || 'none'}`);
              } catch (teamErr) {
                if (teamErr.code === '23505') {
                  teamMatch = findTeam(rec, branchMatch?.id || null, departmentMatch?.id || null);
                  if (!teamMatch) {
                    const fetchedTeam = await query(
                      `SELECT id, name, branch_id, department_id FROM teams
                       WHERE org_id=$1 AND LOWER(name)=LOWER($2)
                         AND ((branch_id IS NULL AND $3 IS NULL) OR branch_id=$3)
                       LIMIT 1`,
                      [tenantId, normalizedTeam, branchMatch?.id || null]
                    );
                    teamMatch = fetchedTeam.rows[0] || null;
                    if (teamMatch) {
                      teamLookup.rows.push(teamMatch);
                    }
                  }
                } else {
                  throw teamErr;
                }
              }
            } else {
              teamMatch = teamCache.get(cacheKey);
            }
          }
          if (employeeDbId && (branchMatch || departmentMatch || teamMatch)) {
            await query(
              `INSERT INTO employee_assignments (
                org_id, user_id, employee_id, branch_id, department_id, team_id,
                role, fte, start_date, is_home, metadata
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,1.0,COALESCE($8::date, now()::date),true,'{}'::jsonb)`,
              [
                tenantId,
                userId,
                employeeDbId,
                branchMatch?.id || null,
                departmentMatch?.id || null,
                teamMatch?.id || null,
                rec.role || 'employee',
                normalizedJoinDate,
              ]
            );
            await rebuildSegmentsForEmployee(tenantId, employeeDbId);
          }
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


