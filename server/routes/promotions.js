import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Promote all existing employees with 2+ direct reports (one-time fix)
router.post('/promote-existing-managers', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    // Run the promotion function
    const result = await query('SELECT promote_existing_managers() as promoted_count');
    const promotedCount = result.rows[0]?.promoted_count || 0;
    
    res.json({ 
      success: true, 
      promoted_count: promotedCount,
      message: `Promoted ${promotedCount} employees to manager role based on direct reports`
    });
  } catch (error) {
    console.error('Error promoting existing managers:', error);
    res.status(500).json({ error: error.message || 'Failed to promote existing managers' });
  }
});

// Get employees eligible for promotion (for admin view)
router.get('/eligible', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Find employees with 2+ direct reports who are not managers
    const result = await query(
      `SELECT 
        e.id,
        e.employee_id,
        e.user_id,
        COUNT(dr.id) as direct_reports_count,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as profiles
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN employees dr ON dr.reporting_manager_id = e.id AND dr.status = 'active'
      WHERE e.status = 'active' AND e.tenant_id = $1
      GROUP BY e.id, e.employee_id, e.user_id, p.first_name, p.last_name, p.email
      HAVING COUNT(dr.id) >= 2
      AND NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = e.user_id
        AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')
      )
      ORDER BY direct_reports_count DESC`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching eligible employees:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch eligible employees' });
  }
});

// Health endpoint - check active cycle and pending evaluations
router.get('/health', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    const now = new Date().toISOString().split('T')[0];

    // Check for active cycle
    const cycleResult = await queryWithOrg(
      `SELECT COUNT(*) as count 
       FROM promotion_cycles 
       WHERE org_id = $1 
         AND status IN ('OPEN', 'REVIEW', 'APPROVAL')
         AND start_date <= $2::date 
         AND end_date >= $2::date`,
      [orgId, now],
      orgId
    );

    const activeCycle = parseInt(cycleResult.rows[0]?.count || '0') > 0;

    // Count pending evaluations
    const pendingResult = await queryWithOrg(
      `SELECT COUNT(*) as count
       FROM promotion_evaluations pe
       JOIN promotion_cycles pc ON pc.id = pe.cycle_id
       WHERE pc.org_id = $1
         AND pc.status IN ('OPEN', 'REVIEW', 'APPROVAL')`,
      [orgId],
      orgId
    );

    const pendingEvaluations = parseInt(pendingResult.rows[0]?.count || '0');

    res.json({
      activeCycle,
      pendingEvaluations
    });
  } catch (error) {
    console.error('Error checking promotion health:', error);
    res.status(500).json({ error: error.message || 'Failed to check promotion health' });
  }
});

// Create promotion cycle (HR/CEO/Admin)
router.post('/cycles', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    const { name, period, start_date, end_date, criteria } = req.body;

    if (!name || !period || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, period, start_date, and end_date are required' });
    }

    const result = await queryWithOrg(
      `INSERT INTO promotion_cycles (org_id, name, period, start_date, end_date, status, criteria)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
       RETURNING id, org_id, name, period, start_date, end_date, status, criteria, created_at`,
      [orgId, name, period, start_date, end_date, JSON.stringify(criteria || {})],
      orgId
    );

    // Log audit
    await queryWithOrg(
      `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        req.user.id,
        'create',
        'promotion_cycle',
        result.rows[0].id,
        JSON.stringify({ name, period, start_date, end_date })
      ],
      orgId
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating promotion cycle:', error);
    res.status(500).json({ error: error.message || 'Failed to create promotion cycle' });
  }
});

// Get current promotion cycles
router.get('/cycles/current', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    const now = new Date().toISOString().split('T')[0];

    const result = await queryWithOrg(
      `SELECT id, org_id, name, period, start_date, end_date, status, criteria, created_at
       FROM promotion_cycles
       WHERE org_id = $1
         AND status IN ('OPEN', 'REVIEW', 'APPROVAL')
         AND start_date <= $2::date
         AND end_date >= $2::date
       ORDER BY created_at DESC`,
      [orgId, now],
      orgId
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching current promotion cycles:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch promotion cycles' });
  }
});

// Submit promotion evaluation (Manager)
router.post('/evaluations', authenticateToken, setTenantContext, requireRole('manager', 'hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    const { cycle_id, employee_id, rating, remarks, recommendation, attachments } = req.body;

    if (!cycle_id || !employee_id || !rating) {
      return res.status(400).json({ error: 'cycle_id, employee_id, and rating are required' });
    }

    // Verify cycle belongs to org
    const cycleCheck = await queryWithOrg(
      'SELECT id FROM promotion_cycles WHERE id = $1 AND org_id = $2',
      [cycle_id, orgId],
      orgId
    );

    if (cycleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion cycle not found' });
    }

    // Get manager_id from request user
    const managerId = req.user.id;

    const result = await queryWithOrg(
      `INSERT INTO promotion_evaluations (cycle_id, employee_id, manager_id, rating, remarks, recommendation, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (cycle_id, employee_id) 
       DO UPDATE SET 
         manager_id = EXCLUDED.manager_id,
         rating = EXCLUDED.rating,
         remarks = EXCLUDED.remarks,
         recommendation = EXCLUDED.recommendation,
         attachments = EXCLUDED.attachments,
         submitted_at = now()
       RETURNING id, cycle_id, employee_id, manager_id, rating, remarks, recommendation, attachments, submitted_at`,
      [
        cycle_id,
        employee_id,
        managerId,
        rating,
        remarks || null,
        recommendation || 'NONE',
        JSON.stringify(attachments || {})
      ],
      orgId
    );

    // Log audit
    await queryWithOrg(
      `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        managerId,
        'create',
        'promotion_evaluation',
        result.rows[0].id,
        JSON.stringify({ cycle_id, employee_id, rating, recommendation })
      ],
      orgId
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting promotion evaluation:', error);
    res.status(500).json({ error: error.message || 'Failed to submit promotion evaluation' });
  }
});

// Review promotion evaluation (HR)
router.post('/review/:id', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId || req.user?.org_id;
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    // Verify evaluation belongs to org
    const evalCheck = await queryWithOrg(
      `SELECT pe.id, pe.cycle_id 
       FROM promotion_evaluations pe
       JOIN promotion_cycles pc ON pc.id = pe.cycle_id
       WHERE pe.id = $1 AND pc.org_id = $2`,
      [id, orgId],
      orgId
    );

    if (evalCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion evaluation not found' });
    }

    // Update cycle status to REVIEW if needed
    await queryWithOrg(
      `UPDATE promotion_cycles 
       SET status = 'REVIEW'
       WHERE id = $1 AND status = 'OPEN'`,
      [evalCheck.rows[0].cycle_id],
      orgId
    );

    // Log audit
    await queryWithOrg(
      `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        req.user.id,
        'review',
        'promotion_evaluation',
        id,
        JSON.stringify({ cycle_id: evalCheck.rows[0].cycle_id })
      ],
      orgId
    );

    res.json({ success: true, message: 'Promotion evaluation reviewed' });
  } catch (error) {
    console.error('Error reviewing promotion evaluation:', error);
    res.status(500).json({ error: error.message || 'Failed to review promotion evaluation' });
  }
});

// Approve promotion (CEO)
router.post('/approve/:id', authenticateToken, setTenantContext, requireRole('ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId || req.user?.org_id;
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    // Get evaluation with cycle info
    const evalResult = await queryWithOrg(
      `SELECT pe.id, pe.cycle_id, pe.employee_id, pe.recommendation, pe.rating
       FROM promotion_evaluations pe
       JOIN promotion_cycles pc ON pc.id = pe.cycle_id
       WHERE pe.id = $1 AND pc.org_id = $2`,
      [id, orgId],
      orgId
    );

    if (evalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion evaluation not found' });
    }

    const evaluation = evalResult.rows[0];

    // If recommendation is PROMOTE, update employee record
    if (evaluation.recommendation === 'PROMOTE') {
      // Update employee designation, pay grade, CTC (if these fields exist)
      // For now, we'll just log the approval
      // In production, you'd update employees table with new designation, pay_grade, ctc
    }

    // Update cycle status to APPROVAL
    await queryWithOrg(
      `UPDATE promotion_cycles 
       SET status = 'APPROVAL'
       WHERE id = $1`,
      [evaluation.cycle_id],
      orgId
    );

    // Log audit
    await queryWithOrg(
      `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        req.user.id,
        'approve',
        'promotion_evaluation',
        id,
        JSON.stringify({ 
          cycle_id: evaluation.cycle_id,
          employee_id: evaluation.employee_id,
          recommendation: evaluation.recommendation
        })
      ],
      orgId
    );

    res.json({ success: true, message: 'Promotion approved' });
  } catch (error) {
    console.error('Error approving promotion:', error);
    res.status(500).json({ error: error.message || 'Failed to approve promotion' });
  }
});

export default router;

