import { Router, Request, Response } from "express";
import { query } from "../db.js";

const router = Router();

// Helper to get organization id from tenantId
const getOrganizationId = async (tenantId: string): Promise<string | null> => {
  try {
    const orgResult = await query(
      `SELECT id FROM organizations WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    if (orgResult.rows[0]) {
      return tenantId;
    }
    
    const orgByOrgIdResult = await query(
      `SELECT id FROM organizations WHERE org_id = $1 LIMIT 1`,
      [tenantId]
    );
    if (orgByOrgIdResult.rows[0]) {
      return orgByOrgIdResult.rows[0].id;
    }
    
    return tenantId;
  } catch (e: any) {
    console.error("[AUDIT_LOGS] Error getting organization id:", e.message);
    return tenantId;
  }
};

// Get audit logs with filtering
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    // Extract query parameters
    const {
      entity_type,
      limit = "50",
      action,
      from,
      to,
    } = req.query;

    // Build the query
    let queryStr = `
      SELECT 
        al.id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.details,
        al.created_at,
        COALESCE(
          jsonb_build_object(
            'id', p.id,
            'email', p.email,
            'first_name', p.first_name,
            'last_name', p.last_name
          ),
          jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'first_name', NULL,
            'last_name', NULL
          )
        ) as actor,
        COALESCE(ur.role, 'unknown') as actor_role,
        al.details->>'reason' as reason,
        al.details->>'diff' as diff,
        al.details->>'scope' as scope
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN profiles p ON p.id = u.id OR p.email = u.email
      LEFT JOIN user_roles ur ON ur.user_id = COALESCE(u.id, p.id)
      WHERE al.tenant_id = $1
    `;

    const params: any[] = [orgId];
    let paramIndex = 2;

    // Add filters
    if (entity_type) {
      // entity_type can be comma-separated list
      const entityTypes = (entity_type as string).split(',').map(t => t.trim());
      queryStr += ` AND al.entity_type = ANY($${paramIndex}::text[])`;
      params.push(entityTypes);
      paramIndex++;
    }

    if (action) {
      queryStr += ` AND al.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (from) {
      queryStr += ` AND al.created_at >= $${paramIndex}::timestamptz`;
      params.push(from);
      paramIndex++;
    }

    if (to) {
      queryStr += ` AND al.created_at <= $${paramIndex}::timestamptz`;
      params.push(to);
      paramIndex++;
    }

    // Add sorting and limit
    queryStr += ` ORDER BY al.created_at DESC LIMIT $${paramIndex}::integer`;
    params.push(parseInt(limit as string, 10) || 50);

    const result = await query(queryStr, params);

    // Transform the results to match the expected format
    const auditLogs = result.rows.map((row) => ({
      id: row.id,
      actor: row.actor && row.actor.id ? row.actor : null,
      actor_role: row.actor_role || null,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      reason: row.reason || null,
      details: row.details || null,
      diff: row.diff ? (typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff) : null,
      scope: row.scope || null,
      created_at: row.created_at,
    }));

    res.json(auditLogs);
  } catch (error: any) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: error.message || "Failed to fetch audit logs" });
  }
});

export default router;

