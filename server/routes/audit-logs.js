import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAuditLogs } from '../utils/auditLog.js';

const router = express.Router();

router.get('/', requireRole('ceo', 'hr'), async (req, res) => {
  try {
    const tenantId = req.orgId || req.user?.org_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Organization context missing' });
    }

    const {
      limit = 100,
      actor_id: actorId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      from,
      to,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const logs = await getAuditLogs({
      tenantId,
      actorId,
      entityType,
      entityId,
      action,
      from,
      to,
      limit: parsedLimit,
    });

    res.json(
      logs.map((log) => ({
        id: log.id,
        actor: log.actor || null,
        actor_role: log.actor_role,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        reason: log.reason,
        details: log.details,
        diff: log.diff,
        scope: log.scope,
        created_at: log.created_at,
      }))
    );
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
  }
});

export default router;


