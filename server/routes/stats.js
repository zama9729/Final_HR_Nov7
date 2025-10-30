import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get pending counts
router.get('/pending-counts', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.json({ timesheets: 0, leaves: 0 });
    }

    // Count pending timesheets
    const timesheetResult = await query(
      'SELECT COUNT(*) as count FROM timesheets WHERE status = $1 AND tenant_id = $2',
      ['pending', tenantId]
    );

    // Count pending leave requests
    const leaveResult = await query(
      'SELECT COUNT(*) as count FROM leave_requests WHERE status = $1 AND tenant_id = $2',
      ['pending', tenantId]
    );

    res.json({
      timesheets: parseInt(timesheetResult.rows[0]?.count || '0'),
      leaves: parseInt(leaveResult.rows[0]?.count || '0'),
    });
  } catch (error) {
    console.error('Error fetching pending counts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get leave balance for current user
router.get('/leave-balance', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.json({ leaveBalance: 0, totalLeaves: 0, approvedLeaves: 0 });
    }

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.json({ leaveBalance: 0, totalLeaves: 0, approvedLeaves: 0 });
    }

    const employeeId = empResult.rows[0].id;

    // Get all leave policies for the tenant
    const policiesResult = await query(
      'SELECT id, annual_entitlement FROM leave_policies WHERE tenant_id = $1 AND is_active = true',
      [tenantId]
    );

    let totalLeaves = 0;
    const policyIds = policiesResult.rows.map(p => p.id);
    
    if (policyIds.length > 0) {
      totalLeaves = policiesResult.rows.reduce((sum, p) => sum + (p.annual_entitlement || 0), 0);
    }

    // Get approved leave requests for current year
    const currentYear = new Date().getFullYear();
    const approvedLeavesResult = await query(
      `SELECT COALESCE(SUM(total_days), 0) as days FROM leave_requests 
       WHERE employee_id = $1 AND status = 'approved' 
       AND EXTRACT(YEAR FROM start_date) = $2`,
      [employeeId, currentYear]
    );

    const approvedLeaves = parseInt(approvedLeavesResult.rows[0]?.days || '0');
    const leaveBalance = totalLeaves - approvedLeaves;

    res.json({
      leaveBalance: Math.max(0, leaveBalance), // Ensure non-negative
      totalLeaves,
      approvedLeaves,
    });
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

