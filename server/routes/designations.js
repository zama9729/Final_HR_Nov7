import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// GET /api/designations - Get all designations (hierarchy tree or flat list)
router.get('/', authenticateToken, setTenantContext, async (req, res) => {
    try {
        const orgId = req.orgId;
        const { view } = req.query; // 'tree' or 'flat'

        const result = await queryWithOrg(
            `SELECT d.*, 
              (SELECT COUNT(*) FROM employees e WHERE e.designation_id = d.id) as employee_count
       FROM designations d 
       WHERE d.org_id = $1 
       ORDER BY d.level ASC, d.name ASC`,
            [orgId],
            orgId
        );

        if (view === 'tree') {
            const designations = result.rows;
            const map = {};
            const roots = [];

            designations.forEach(d => {
                map[d.id] = { ...d, children: [] };
            });

            designations.forEach(d => {
                if (d.parent_designation_id && map[d.parent_designation_id]) {
                    map[d.parent_designation_id].children.push(map[d.id]);
                } else {
                    roots.push(map[d.id]);
                }
            });

            return res.json(roots);
        }

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching designations:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/designations - Create new designation
router.post('/', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
    try {
        const orgId = req.orgId;
        const { name, level, parent_designation_id } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const result = await queryWithOrg(
            `INSERT INTO designations (org_id, name, level, parent_designation_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [orgId, name, level || 0, parent_designation_id || null],
            orgId
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating designation:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Designation with this name already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/designations/:id - Update designation
router.put('/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
    try {
        const orgId = req.orgId;
        const { id } = req.params;
        const { name, level, parent_designation_id } = req.body;

        // Prevent circular dependency
        if (parent_designation_id === id) {
            return res.status(400).json({ error: 'Cannot report to itself' });
        }

        const result = await queryWithOrg(
            `UPDATE designations 
       SET name = COALESCE($1, name),
           level = COALESCE($2, level),
           parent_designation_id = $3,
           updated_at = now()
       WHERE id = $4 AND org_id = $5
       RETURNING *`,
            [name, level, parent_designation_id, id, orgId],
            orgId
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Designation not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating designation:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/designations/:id - Delete designation
router.delete('/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
    try {
        const orgId = req.orgId;
        const { id } = req.params;

        // Check if any employees are assigned
        const empCheck = await queryWithOrg(
            'SELECT 1 FROM employees WHERE designation_id = $1 AND tenant_id = $2 LIMIT 1',
            [id, orgId],
            orgId
        );

        if (empCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Cannot delete designation assigned to employees' });
        }

        // Check if it has child designations
        const childCheck = await queryWithOrg(
            'SELECT 1 FROM designations WHERE parent_designation_id = $1 AND org_id = $2 LIMIT 1',
            [id, orgId],
            orgId
        );

        if (childCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Cannot delete designation that has child designations' });
        }

        const result = await queryWithOrg(
            'DELETE FROM designations WHERE id = $1 AND org_id = $2 RETURNING id',
            [id, orgId],
            orgId
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Designation not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting designation:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
