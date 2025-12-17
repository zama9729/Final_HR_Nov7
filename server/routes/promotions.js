import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { audit } from '../utils/auditLog.js';
import { applyPromotion } from '../services/promotion-service.js';

// Ensure promotions schema exists (for environments where migration didn't run)
let promotionsSchemaEnsured = false;
async function ensurePromotionsSchema() {
  if (promotionsSchemaEnsured) return;
  try {
    // Create enum type if missing
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_status') THEN
          CREATE TYPE promotion_status AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED');
        END IF;
      END
      $$;
    `);

    // Create promotions table if missing (simplified version of migration)
    await query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        appraisal_id UUID REFERENCES performance_reviews(id) ON DELETE SET NULL,
        old_designation TEXT,
        old_grade TEXT,
        old_department_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
        old_ctc NUMERIC(12, 2),
        new_designation TEXT NOT NULL,
        new_grade TEXT,
        new_department_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
        new_ctc NUMERIC(12, 2),
        reason_text TEXT,
        recommendation_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
        approved_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
        status promotion_status NOT NULL DEFAULT 'DRAFT',
        effective_date DATE NOT NULL,
        rejected_at TIMESTAMP WITH TIME ZONE,
        rejection_reason TEXT,
        applied BOOLEAN DEFAULT false,
        applied_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        approved_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT valid_effective_date CHECK (effective_date >= DATE(created_at))
      );
    `);

    promotionsSchemaEnsured = true;
    console.log('[promotions] Schema ensured');
  } catch (error) {
    console.error('Failed to ensure promotions schema:', error);
  }
}

// Helper to send notification to employee
async function notifyEmployee(tenantId, employeeId, title, message, type = 'promotion') {
  try {
    const empResult = await query(
      'SELECT user_id FROM employees WHERE id = $1',
      [employeeId]
    );
    if (empResult.rows.length === 0) return;
    
    const userId = empResult.rows[0].user_id;
    await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [tenantId, userId, title, message, type]
    );
  } catch (error) {
    console.error('Failed to send promotion notification:', error);
    // Don't fail the request if notification fails
  }
}

const router = express.Router();

// Helper to get tenant ID
async function getTenantId(userId) {
  const result = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.tenant_id || null;
}

// GET /api/promotions - List promotions (HR/Admin/Manager)
router.get('/', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director', 'manager'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { status, employeeId, year } = req.query;
    
    let queryStr = `
      SELECT 
        p.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'first_name', pr.first_name,
          'last_name', pr.last_name,
          'email', pr.email
        ) as employee,
        json_build_object(
          'id', appr.id,
          'cycle_name', ac.cycle_name,
          'cycle_year', ac.cycle_year,
          'rating', appr.rating
        ) as appraisal,
        json_build_object(
          'id', rec.id,
          'first_name', rec.first_name,
          'last_name', rec.last_name
        ) as recommended_by_profile,
        json_build_object(
          'id', app.id,
          'first_name', app.first_name,
          'last_name', app.last_name
        ) as approved_by_profile
      FROM promotions p
      JOIN employees e ON e.id = p.employee_id
      JOIN profiles pr ON pr.id = e.user_id
      LEFT JOIN performance_reviews appr ON appr.id = p.appraisal_id
      LEFT JOIN appraisal_cycles ac ON ac.id = appr.appraisal_cycle_id
      LEFT JOIN profiles rec ON rec.id = p.recommendation_by_id
      LEFT JOIN profiles app ON app.id = p.approved_by_id
      WHERE p.org_id = $1
    `;
    
    const params = [tenantId];
    let paramIndex = 2;
    
    if (status) {
      queryStr += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (employeeId) {
      queryStr += ` AND p.employee_id = $${paramIndex++}`;
      params.push(employeeId);
    }
    
    if (year) {
      queryStr += ` AND EXTRACT(YEAR FROM p.effective_date) = $${paramIndex++}`;
      params.push(parseInt(year));
    }
    
    queryStr += ` ORDER BY p.created_at DESC`;
    
    const result = await queryWithOrg(queryStr, params, tenantId);
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch promotions' });
  }
});

// GET /api/promotions/:id - Get single promotion
router.get('/:id', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director', 'manager'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    
    const result = await queryWithOrg(
      `SELECT 
        p.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'first_name', pr.first_name,
          'last_name', pr.last_name,
          'email', pr.email
        ) as employee,
        json_build_object(
          'id', appr.id,
          'cycle_name', ac.cycle_name,
          'cycle_year', ac.cycle_year,
          'rating', appr.rating
        ) as appraisal
      FROM promotions p
      JOIN employees e ON e.id = p.employee_id
      JOIN profiles pr ON pr.id = e.user_id
      LEFT JOIN performance_reviews appr ON appr.id = p.appraisal_id
      LEFT JOIN appraisal_cycles ac ON ac.id = appr.appraisal_cycle_id
      WHERE p.id = $1 AND p.org_id = $2`,
      [id, tenantId],
      tenantId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch promotion' });
  }
});

// POST /api/promotions - Create promotion
router.post('/', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director', 'manager'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const {
      employee_id,
      appraisal_id,
      old_designation,
      old_grade,
      old_department_id,
      old_ctc,
      new_designation,
      new_grade,
      new_department_id,
      new_ctc,
      reason_text,
      effective_date,
      status = 'DRAFT'
    } = req.body;
    
    if (!employee_id || !new_designation || !effective_date) {
      return res.status(400).json({ error: 'employee_id, new_designation, and effective_date are required' });
    }
    
    // Get current employee details if not provided
    let oldDesig = old_designation;
    let oldGrade = old_grade;
    let oldDept = old_department_id;
    let oldCTC = old_ctc;
    
    if (!oldDesig || !oldGrade || !oldDept) {
      // Fetch employee with home assignment to get department_id
      const empResult = await queryWithOrg(
        `SELECT 
          e.position, 
          e.designation,
          e.grade,
          e.ctc,
          ea.department_id
        FROM employees e
        LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
        WHERE e.id = $1 AND e.tenant_id = $2`,
        [employee_id, tenantId],
        tenantId
      );
      
      if (empResult.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      const emp = empResult.rows[0];
      oldDesig = oldDesig || emp.designation || emp.position;
      oldGrade = oldGrade || emp.grade;
      oldDept = oldDept || emp.department_id;
      oldCTC = oldCTC || emp.ctc;
    }
    
    const result = await queryWithOrg(
      `INSERT INTO promotions (
        org_id, employee_id, appraisal_id,
        old_designation, old_grade, old_department_id, old_ctc,
        new_designation, new_grade, new_department_id, new_ctc,
        reason_text, recommendation_by_id, status, effective_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        tenantId, employee_id, appraisal_id || null,
        oldDesig, oldGrade || null, oldDept || null, oldCTC || null,
        new_designation, new_grade || null, new_department_id || null, new_ctc || null,
        reason_text || null, req.user.id, status, effective_date
      ],
      tenantId
    );
    
    const promotion = result.rows[0];
    
    // Create audit log
    try {
      await audit({
        actorId: req.user.id,
        action: 'promotion_create',
        entityType: 'promotion',
        entityId: promotion.id,
        details: {
          employeeId: promotion.employee_id,
          newDesignation: promotion.new_designation,
          effectiveDate: promotion.effective_date,
          status: promotion.status,
        },
        scope: 'org',
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }
    
    res.status(201).json(promotion);
  } catch (error) {
    console.error('Error creating promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to create promotion' });
  }
});

// PATCH /api/promotions/:id - Update promotion (only if DRAFT or PENDING_APPROVAL)
router.patch('/:id', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director', 'manager'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    const updates = req.body;
    
    // Check current status
    const current = await queryWithOrg(
      'SELECT status FROM promotions WHERE id = $1 AND org_id = $2',
      [id, tenantId],
      tenantId
    );
    
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(current.rows[0].status)) {
      return res.status(400).json({ error: 'Can only update promotions in DRAFT or PENDING_APPROVAL status' });
    }
    
    // Build update query dynamically
    const allowedFields = [
      'new_designation', 'new_grade', 'new_department_id', 'new_ctc',
      'reason_text', 'effective_date', 'appraisal_id'
    ];
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(updates[field]);
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(id, tenantId);
    
    const result = await queryWithOrg(
      `UPDATE promotions 
       SET ${setClauses.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      values,
      tenantId
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to update promotion' });
  }
});

// POST /api/promotions/:id/submit - Submit for approval
router.post('/:id/submit', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director', 'manager'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    
    const result = await queryWithOrg(
      `UPDATE promotions 
       SET status = 'PENDING_APPROVAL', updated_at = now()
       WHERE id = $1 AND org_id = $2 AND status = 'DRAFT'
       RETURNING *`,
      [id, tenantId],
      tenantId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found or cannot be submitted' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to submit promotion' });
  }
});

// POST /api/promotions/:id/approve - Approve promotion
router.post('/:id/approve', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    
    // Get promotion details
    const promoQuery = await queryWithOrg(
      'SELECT * FROM promotions WHERE id = $1 AND org_id = $2',
      [id, tenantId],
      tenantId
    );
    
    if (promoQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    
    const promo = promoQuery.rows[0];
    
    if (promo.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'Only promotions in PENDING_APPROVAL can be approved' });
    }
    
    // Update promotion status
    const result = await queryWithOrg(
      `UPDATE promotions 
       SET status = 'APPROVED', 
           approved_by_id = $1,
           approved_at = now(),
           updated_at = now()
       WHERE id = $2 AND org_id = $3
       RETURNING *`,
      [req.user.id, id, tenantId],
      tenantId
    );
    
    const approvedPromotion = result.rows[0];
    
    // Send notification to employee
    await notifyEmployee(
      tenantId,
      approvedPromotion.employee_id,
      'Promotion Approved',
      `Your promotion to ${approvedPromotion.new_designation}${approvedPromotion.new_grade ? ` (${approvedPromotion.new_grade})` : ''} has been approved. Effective date: ${approvedPromotion.effective_date}`,
      'promotion'
    );
    
    // Apply promotion if effective_date is today or in the past
    const effectiveDate = new Date(promo.effective_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    effectiveDate.setHours(0, 0, 0, 0);
    
    if (effectiveDate <= today) {
      // Apply immediately using central promotion service
      await applyPromotion(approvedPromotion, tenantId);
    }
    // Otherwise, the cron job will apply it on the effective date
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to approve promotion' });
  }
});

// POST /api/promotions/:id/reject - Reject promotion
router.post('/:id/reject', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    await ensurePromotionsSchema();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    const { rejection_reason } = req.body;
    
    const result = await queryWithOrg(
      `UPDATE promotions 
       SET status = 'REJECTED',
           rejected_at = now(),
           rejection_reason = $1,
           updated_at = now()
       WHERE id = $2 AND org_id = $3 AND status = 'PENDING_APPROVAL'
       RETURNING *`,
      [rejection_reason || null, id, tenantId],
      tenantId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found or cannot be rejected' });
    }
    
    const rejectedPromotion = result.rows[0];
    
    // Create audit log for rejection
    try {
      await audit({
        actorId: req.user.id,
        action: 'promotion_reject',
        entityType: 'promotion',
        entityId: rejectedPromotion.id,
        reason: rejection_reason || 'No reason provided',
        details: {
          employeeId: rejectedPromotion.employee_id,
          newDesignation: rejectedPromotion.new_designation,
        },
        scope: 'org',
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }
    
    // Send notification to employee
    await notifyEmployee(
      tenantId,
      rejectedPromotion.employee_id,
      'Promotion Rejected',
      `Your promotion to ${rejectedPromotion.new_designation} has been rejected.${rejection_reason ? ` Reason: ${rejection_reason}` : ''}`,
      'promotion'
    );
    
    res.json(rejectedPromotion);
  } catch (error) {
    console.error('Error rejecting promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to reject promotion' });
  }
});

export default router;
