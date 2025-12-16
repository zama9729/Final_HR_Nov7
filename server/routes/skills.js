import express from 'express';
import { query, withClient } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Cache for column existence checks
let hasTenantIdColumn = null;

async function checkTenantIdColumn(client) {
  if (hasTenantIdColumn !== null) {
    return hasTenantIdColumn;
  }
  const result = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'certifications' AND column_name = 'tenant_id'
  `);
  hasTenantIdColumn = result.rows.length > 0;
  return hasTenantIdColumn;
}

// Get skills for employee (CEO/HR can view any employee in same tenant, employee can view own)
router.get('/employees/:id/skills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Get tenant_id and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: empTenant, user_id: empUserId } = empRes.rows[0];
    if (!empTenant) {
      return res.status(400).json({ error: 'Employee has no tenant assigned' });
    }
    
    // Check requester's tenant and role
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== empTenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    // Check if requester is CEO/HR OR viewing their own skills
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: only CEO/HR or employee can view skills' });
    }
    
    const result = await withClient(async (client) => {
      return client.query('SELECT * FROM skills WHERE employee_id = $1 AND tenant_id = $2 ORDER BY name', [id, empTenant]);
    }, empTenant);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch skills' });
  }
});

// Upsert skill (employees can edit own, HR/CEO can edit any)
router.post('/employees/:id/skills', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, level, years_experience, last_used_date } = req.body || {};
    if (!name || !level) {
      return res.status(400).json({ error: 'name and level required' });
    }
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    if (!tenant) {
      return res.status(400).json({ error: 'Employee has no tenant assigned' });
    }
    
    // Check permissions: HR/CEO/Director can edit any, employee can edit own
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only edit own skills' });
    }
    
    const result = await withClient(async (client) => {
      // Always insert tenant_id; use unique index on (employee_id, lower(name))
        return client.query(
          `INSERT INTO skills (employee_id, name, level, years_experience, last_used_date, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (employee_id, lower(name)) DO UPDATE
             SET level = EXCLUDED.level,
                 years_experience = COALESCE(EXCLUDED.years_experience, skills.years_experience),
                 last_used_date = COALESCE(EXCLUDED.last_used_date, skills.last_used_date),
                 updated_at = now()
           RETURNING *`,
          [id, name, level, years_experience || 0, last_used_date || null, tenant]
        );
    }, tenant);
    if (result.rows && result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(500).json({ error: 'Failed to save skill' });
    }
  } catch (error) {
    console.error('Error saving skill:', error);
    res.status(500).json({ error: error.message || 'Failed to save skill' });
  }
});

// Update skill
router.put('/employees/:id/skills/:skillId', authenticateToken, async (req, res) => {
  try {
    const { id, skillId } = req.params;
    const { name, level, years_experience, last_used_date } = req.body || {};
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only edit own skills' });
    }
    
    const result = await withClient(async (client) => {
      return client.query(
        `UPDATE skills 
         SET name = COALESCE($1, name),
             level = COALESCE($2, level),
             years_experience = COALESCE($3, years_experience),
             last_used_date = $4,
             updated_at = now()
         WHERE id = $5 AND employee_id = $6 AND tenant_id = $7
         RETURNING *`,
        [name || null, level || null, years_experience || null, last_used_date || null, skillId, id, tenant]
      );
    }, tenant);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: error.message || 'Failed to update skill' });
  }
});

// Delete skill
router.delete('/employees/:id/skills/:skillId', authenticateToken, async (req, res) => {
  try {
    const { id, skillId } = req.params;
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only delete own skills' });
    }
    
    const result = await withClient(async (client) => {
      return client.query(
        `DELETE FROM skills 
         WHERE id = $1 AND employee_id = $2 AND tenant_id = $3
         RETURNING id`,
        [skillId, id, tenant]
      );
    }, tenant);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: error.message || 'Failed to delete skill' });
  }
});

// Certifications (CEO/HR can view any employee in same tenant, employee can view own)
router.get('/employees/:id/certifications', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: empTenant, user_id: empUserId } = empRes.rows[0];
    if (!empTenant) {
      return res.status(400).json({ error: 'Employee has no tenant assigned' });
    }
    
    // Check requester's tenant and role
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== empTenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: only CEO/HR or employee can view certifications' });
    }
    
    // Query certifications - tenant isolation is handled by application-level checks above
    const result = await query('SELECT * FROM certifications WHERE employee_id = $1 ORDER BY issue_date DESC NULLS LAST', [id]);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching certifications:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to fetch certifications' });
  }
});

router.post('/employees/:id/certifications', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, issuer, issue_date, expiry_date, file_url } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only edit own certifications' });
    }
    
    const result = await withClient(async (client) => {
      const hasTenantId = await checkTenantIdColumn(client);
      
      if (hasTenantId) {
        return client.query(
          `INSERT INTO certifications (employee_id, name, issuer, issue_date, expiry_date, file_url, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [id, name, issuer || null, issue_date || null, expiry_date || null, file_url || null, tenant]
        );
      } else {
        return client.query(
          `INSERT INTO certifications (employee_id, name, issuer, issue_date, expiry_date, file_url)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING *`,
          [id, name, issuer || null, issue_date || null, expiry_date || null, file_url || null]
        );
      }
    }, tenant);
    if (result.rows && result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(500).json({ error: 'Failed to save certification' });
    }
  } catch (error) {
    console.error('Error saving certification:', error);
    res.status(500).json({ error: error.message || 'Failed to save certification' });
  }
});

// Update certification
router.put('/employees/:id/certifications/:certId', authenticateToken, async (req, res) => {
  try {
    const { id, certId } = req.params;
    const { name, issuer, issue_date, expiry_date, file_url } = req.body || {};
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only edit own certifications' });
    }
    
    const result = await withClient(async (client) => {
      const hasTenantId = await checkTenantIdColumn(client);
      
      if (hasTenantId) {
        return client.query(
          `UPDATE certifications 
           SET name = COALESCE($1, name),
               issuer = $2,
               issue_date = $3,
               expiry_date = $4,
               file_url = $5,
               updated_at = now()
           WHERE id = $6 AND employee_id = $7 AND tenant_id = $8
           RETURNING *`,
          [name || null, issuer || null, issue_date || null, expiry_date || null, file_url || null, certId, id, tenant]
        );
      } else {
        return client.query(
          `UPDATE certifications 
           SET name = COALESCE($1, name),
               issuer = $2,
               issue_date = $3,
               expiry_date = $4,
               file_url = $5,
               updated_at = now()
           WHERE id = $6 AND employee_id = $7
           RETURNING *`,
          [name || null, issuer || null, issue_date || null, expiry_date || null, file_url || null, certId, id]
        );
      }
    }, tenant);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating certification:', error);
    res.status(500).json({ error: error.message || 'Failed to update certification' });
  }
});

// Delete certification
router.delete('/employees/:id/certifications/:certId', authenticateToken, async (req, res) => {
  try {
    const { id, certId } = req.params;
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only delete own certifications' });
    }
    
    const result = await withClient(async (client) => {
      const hasTenantId = await checkTenantIdColumn(client);
      
      if (hasTenantId) {
        return client.query(
          `DELETE FROM certifications 
           WHERE id = $1 AND employee_id = $2 AND tenant_id = $3
           RETURNING id`,
          [certId, id, tenant]
        );
      } else {
        return client.query(
          `DELETE FROM certifications 
           WHERE id = $1 AND employee_id = $2
           RETURNING id`,
          [certId, id]
        );
      }
    }, tenant);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting certification:', error);
    res.status(500).json({ error: error.message || 'Failed to delete certification' });
  }
});

export default router;


