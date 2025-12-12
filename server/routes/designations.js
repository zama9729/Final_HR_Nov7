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
              (SELECT COUNT(*) FROM employees e WHERE e.position = d.name AND e.tenant_id = $1) as employee_count
       FROM org_designations d 
       WHERE d.organisation_id = $1 
       ORDER BY d.name ASC`,
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

            // Build tree using org_reporting_lines
            const reportingLinesResult = await queryWithOrg(
                `SELECT designation_id, parent_designation_id 
                 FROM org_reporting_lines 
                 WHERE organisation_id = $1`,
                [orgId],
                orgId
            );
            
            const parentMap = new Map();
            reportingLinesResult.rows.forEach(rl => {
                if (rl.parent_designation_id) {
                    parentMap.set(rl.designation_id, rl.parent_designation_id);
                }
            });

            designations.forEach(d => {
                const parentId = parentMap.get(d.id);
                if (parentId && map[parentId]) {
                    map[parentId].children.push(map[d.id]);
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
            `INSERT INTO org_designations (organisation_id, name)
       VALUES ($1, $2)
       RETURNING *`,
            [orgId, name],
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
            `UPDATE org_designations 
       SET name = COALESCE($1, name),
           updated_at = now()
       WHERE id = $2 AND organisation_id = $3
       RETURNING *`,
            [name, id, orgId],
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

        // Get designation name first
        const desigResult = await queryWithOrg(
            'SELECT name FROM org_designations WHERE id = $1 AND organisation_id = $2',
            [id, orgId],
            orgId
        );

        if (desigResult.rows.length === 0) {
            return res.status(404).json({ error: 'Designation not found' });
        }

        const designationName = desigResult.rows[0].name;

        // Check if any employees are assigned (by matching position field)
        const empCheck = await queryWithOrg(
            'SELECT 1 FROM employees WHERE position = $1 AND tenant_id = $2 LIMIT 1',
            [designationName, orgId],
            orgId
        );

        if (empCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Cannot delete designation assigned to employees' });
        }

        // Check if it has child designations via reporting lines
        const childCheck = await queryWithOrg(
            'SELECT 1 FROM org_reporting_lines WHERE parent_designation_id = $1 AND organisation_id = $2 LIMIT 1',
            [id, orgId],
            orgId
        );

        if (childCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Cannot delete designation that has child designations' });
        }

        const result = await queryWithOrg(
            'DELETE FROM org_designations WHERE id = $1 AND organisation_id = $2 RETURNING id',
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
