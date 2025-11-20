import express from 'express';
import multer from 'multer';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { resolveOrgFromSlug } from '../middleware/tenant.js';

const router = express.Router();

/**
 * Generate a slug from organization name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug (adds suffix if needed)
 */
async function generateUniqueSlug(baseSlug) {
  // Check if slug column exists
  try {
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' AND column_name = 'slug'
    `);
    
    if (columnCheck.rows.length === 0) {
      // Slug column doesn't exist, return base slug
      return baseSlug;
    }
  } catch (error) {
    // If check fails, assume column doesn't exist
    return baseSlug;
  }
  
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const result = await query(
      'SELECT id FROM organizations WHERE slug = $1',
      [slug]
    );
    
    if (result.rows.length === 0) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

// Configure multer for logo uploads (5MB limit, images only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files (JPG, PNG, WEBP, GIF) are allowed.'));
    }
  }
});

// Create organization (public, for signup)
router.post('/', async (req, res) => {
  try {
    const { name, domain, companySize, industry, timezone, subdomain, adminEmail } = req.body;

    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    // Validate payroll subdomain (optional but recommended)
    let payrollSubdomain = (subdomain || '').toString().toLowerCase().trim();
    if (payrollSubdomain) {
      const subRegex = /^[a-z0-9-]{3,32}$/;
      if (!subRegex.test(payrollSubdomain)) {
        return res.status(400).json({ error: 'Invalid payroll subdomain format' });
      }
      // Ensure unique
      await query(`
        ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subdomain VARCHAR(64);
        CREATE UNIQUE INDEX IF NOT EXISTS ux_orgs_subdomain ON organizations(subdomain);
      `);
      const dup = await query(`SELECT 1 FROM organizations WHERE subdomain = $1`, [payrollSubdomain]);
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'Payroll subdomain already taken' });
      }
    }

    // Check if slug column exists
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' AND column_name = 'slug'
    `);
    
    const hasSlugColumn = columnCheck.rows.length > 0;
    let slug = null;
    
    if (hasSlugColumn) {
      // Generate unique slug
      const baseSlug = generateSlug(name);
      slug = await generateUniqueSlug(baseSlug);
    }

    let result;
    if (hasSlugColumn) {
      result = await query(
        `INSERT INTO organizations (name, domain, slug, company_size, industry, timezone, subdomain)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, slug, domain, company_size, industry, timezone, subdomain`,
        [name, domain, slug, companySize || null, industry || null, timezone || 'Asia/Kolkata', payrollSubdomain || null]
      );
    } else {
      result = await query(
        `INSERT INTO organizations (name, domain, company_size, industry, timezone, subdomain)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, domain, company_size, industry, timezone, subdomain`,
        [name, domain, companySize || null, industry || null, timezone || 'Asia/Kolkata', payrollSubdomain || null]
      );
      // Add slug as null for backward compatibility
      result.rows[0].slug = null;
    }

    const org = result.rows[0];

    // Call Payroll provisioning API if subdomain provided
    if (org.subdomain) {
      try {
        const provisionUrl = process.env.PAYROLL_PROVISION_URL;
        const provisionToken = process.env.PAYROLL_PROVISION_TOKEN;
        if (provisionUrl && provisionToken) {
          await fetch(provisionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provisionToken}`
            },
            body: JSON.stringify({
              org_id: org.id,
              org_name: org.name,
              subdomain: org.subdomain,
              admin_email: (adminEmail || '').toString().toLowerCase().trim()
            })
          });
        }
      } catch (e) {
        console.warn('⚠️  Payroll provisioning failed:', e);
      }
    }

    res.status(201).json(org);
  } catch (error) {
    console.error('Error creating organization:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Domain or slug already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to create organization' });
  }
});

// Resolve organization by slug
router.get('/resolve', resolveOrgFromSlug, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if slug column exists
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' AND column_name = 'slug'
    `);
    
    const hasSlugColumn = columnCheck.rows.length > 0;
    
    let result;
    if (hasSlugColumn) {
      result = await query(
        'SELECT id, name, slug, domain FROM organizations WHERE id = $1',
        [req.orgId]
      );
    } else {
      result = await query(
        'SELECT id, name, domain FROM organizations WHERE id = $1',
        [req.orgId]
      );
      // Add slug as null for backward compatibility
      if (result.rows.length > 0) {
        result.rows[0].slug = null;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error resolving organization:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve organization' });
  }
});

// Get organization by user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if slug column exists
    let hasSlugColumn = false;
    try {
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'slug'
      `);
      hasSlugColumn = columnCheck.rows.length > 0;
    } catch (error) {
      // If check fails, assume column doesn't exist
      hasSlugColumn = false;
    }
    
    let orgResult;
    if (hasSlugColumn) {
      orgResult = await query(
        'SELECT id, name, slug, logo_url, domain, company_size, industry, timezone FROM organizations WHERE id = $1',
        [profileResult.rows[0].tenant_id]
      );
    } else {
      orgResult = await query(
        'SELECT id, name, logo_url, domain, company_size, industry, timezone FROM organizations WHERE id = $1',
        [profileResult.rows[0].tenant_id]
      );
      // Add slug as null for backward compatibility
      if (orgResult.rows.length > 0) {
        orgResult.rows[0].slug = null;
      }
    }

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(orgResult.rows[0]);
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update organization (name, logo, etc.) - Admin/CEO/HR only
router.patch('/me', authenticateToken, requireRole('admin', 'ceo', 'director', 'hr'), upload.single('logo'), async (req, res) => {
  try {
    // Get user's tenant_id
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const tenantId = profileResult.rows[0].tenant_id;
    const { name, pf_code, esi_code } = req.body;

    let logoUrl = null;

    // Handle logo upload
    if (req.file) {
      try {
        // Convert file buffer to base64 data URL
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        logoUrl = `data:${mimeType};base64,${base64}`;
      } catch (error) {
        console.error('Error processing logo:', error);
        return res.status(400).json({ error: 'Failed to process logo file' });
      }
    }

    // Update organization
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (logoUrl !== null) {
      updates.push(`logo_url = $${paramIndex++}`);
      values.push(logoUrl);
    }

    if (pf_code !== undefined) {
      updates.push(`pf_code = $${paramIndex++}`);
      values.push(pf_code || null);
    }

    if (esi_code !== undefined) {
      updates.push(`esi_code = $${paramIndex++}`);
      values.push(esi_code || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(tenantId);
    
    // Check if slug column exists
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' AND column_name = 'slug'
    `);
    
    const hasSlugColumn = columnCheck.rows.length > 0;
    const returnFields = hasSlugColumn 
      ? 'id, name, slug, logo_url, domain, company_size, industry, timezone, pf_code, esi_code'
      : 'id, name, logo_url, domain, company_size, industry, timezone, pf_code, esi_code';
    
    const updateQuery = `
      UPDATE organizations 
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex}
      RETURNING ${returnFields}
    `;

    const result = await query(updateQuery, values);
    
    // Add slug as null if column doesn't exist
    if (!hasSlugColumn && result.rows.length > 0) {
      result.rows[0].slug = null;
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: error.message || 'Failed to update organization' });
  }
});

export default router;

