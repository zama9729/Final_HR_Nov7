import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAuditLogs } from '../utils/auditLog.js';

const router = express.Router();

router.get('/', requireRole('ceo', 'hr', 'admin', 'accountant'), async (req, res) => {
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
      logs.map((log) => {
        const payload = log.payload || {};
        return {
          id: log.id,
          actor: log.actor || null,
          actor_role: payload.actor_role || null,
          action: log.action,
          entity_type: log.object_type,
          entity_id: log.object_id,
          reason: payload.reason || null,
          details: payload.details || null,
          diff: payload.diff || null,
          scope: payload.scope || null,
          created_at: log.created_at,
        };
      })
    );
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
  }
});

export default router;


