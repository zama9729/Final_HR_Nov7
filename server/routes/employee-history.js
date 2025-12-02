import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Helper to get tenant ID
async function getTenantId(userId) {
  const result = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.tenant_id || null;
}

// Helper to get employee ID from user ID
async function getEmployeeId(userId, tenantId) {
  const result = await query(
    'SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );
  return result.rows[0]?.id || null;
}

// GET /api/me/history - Get current user's history
router.get('/me/history', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const employeeId = await getEmployeeId(req.user.id, tenantId);
    if (!employeeId) {
      return res.json({ events: [], grouped: {} });
    }

    const { year, types } = req.query;
    
    let queryStr = `
      SELECT *
      FROM employee_events
      WHERE org_id = $1 AND employee_id = $2
    `;
    
    const params = [tenantId, employeeId];
    let paramIndex = 3;
    
    if (year) {
      queryStr += ` AND EXTRACT(YEAR FROM event_date) = $${paramIndex++}`;
      params.push(parseInt(year));
    }
    
    if (types) {
      const typeArray = Array.isArray(types) ? types : types.split(',');
      queryStr += ` AND event_type = ANY($${paramIndex++})`;
      params.push(typeArray);
    }
    
    queryStr += ` ORDER BY event_date DESC, created_at DESC`;
    
    const result = await queryWithOrg(queryStr, params, tenantId);
    
    // Group by year and month
    const grouped = {};
    result.rows.forEach(event => {
      const eventDate = new Date(event.event_date);
      const year = eventDate.getFullYear();
      const month = eventDate.toLocaleString('default', { month: 'long' });
      
      if (!grouped[year]) {
        grouped[year] = {};
      }
      if (!grouped[year][month]) {
        grouped[year][month] = [];
      }
      grouped[year][month].push(event);
    });
    
    res.json({
      events: result.rows,
      grouped
    });
  } catch (error) {
    console.error('Error fetching employee history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch history' });
  }
});

// GET /api/employees/:id/history - Get employee history (HR/Manager)
router.get('/employees/:id/history', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director', 'manager'), async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id: employeeId } = req.params;
    const { year, types } = req.query;
    
    // Verify employee belongs to same org
    const empCheck = await queryWithOrg(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
      tenantId
    );
    
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    let queryStr = `
      SELECT *
      FROM employee_events
      WHERE org_id = $1 AND employee_id = $2
    `;
    
    const params = [tenantId, employeeId];
    let paramIndex = 3;
    
    if (year) {
      queryStr += ` AND EXTRACT(YEAR FROM event_date) = $${paramIndex++}`;
      params.push(parseInt(year));
    }
    
    if (types) {
      const typeArray = Array.isArray(types) ? types : types.split(',');
      queryStr += ` AND event_type = ANY($${paramIndex++})`;
      params.push(typeArray);
    }
    
    queryStr += ` ORDER BY event_date DESC, created_at DESC`;
    
    const result = await queryWithOrg(queryStr, params, tenantId);
    
    // Group by year and month
    const grouped = {};
    result.rows.forEach(event => {
      const eventDate = new Date(event.event_date);
      const year = eventDate.getFullYear();
      const month = eventDate.toLocaleString('default', { month: 'long' });
      
      if (!grouped[year]) {
        grouped[year] = {};
      }
      if (!grouped[year][month]) {
        grouped[year][month] = [];
      }
      grouped[year][month].push(event);
    });
    
    res.json({
      events: result.rows,
      grouped
    });
  } catch (error) {
    console.error('Error fetching employee history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch history' });
  }
});

// GET /api/employee-history/:eventId - Get single event details
router.get('/history/events/:eventId', authenticateToken, setTenantContext, async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { eventId } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      // Not a valid UUID – let the next route handle it (prevents hijacking /api/announcements, etc.)
      return next();
    }

    const employeeId = await getEmployeeId(req.user.id, tenantId);
    
    let queryStr = `
      SELECT *
      FROM employee_events
      WHERE id = $1 AND org_id = $2
    `;
    const params = [eventId, tenantId];
    
    // If not HR/Admin, restrict to own events
    if (!['hr', 'ceo', 'admin', 'director'].includes(req.user.role)) {
      if (!employeeId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      queryStr += ` AND employee_id = $3`;
      params.push(employeeId);
    }
    
    const result = await queryWithOrg(queryStr, params, tenantId);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch event' });
  }
});

export default router;

