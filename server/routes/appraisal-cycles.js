import express from "express";
import { query } from "../db/pool.js";
import { authenticateToken } from "../middleware/auth.js";
const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get tenant_id
    const tenantResult = await query(
      "SELECT tenant_id FROM profiles WHERE id = $1",
      [userId]
    );
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const tenantId = tenantResult.rows[0].tenant_id;
    
    // Check if cycles exist for this tenant
    const countResult = await query(
      "SELECT COUNT(*) FROM appraisal_cycles WHERE tenant_id = $1",
      [tenantId]
    );
    
    // If no cycles exist, create default cycles
    if (parseInt(countResult.rows[0].count) === 0) {
      const currentYear = new Date().getFullYear();
      
      // Create Yearly cycle
      await query(
        `INSERT INTO appraisal_cycles (tenant_id, cycle_name, cycle_year, start_date, end_date, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          `Annual Review ${currentYear}`,
          currentYear,
          `${currentYear}-01-01`,
          `${currentYear}-12-31`,
          'draft',
          userId
        ]
      );
      
      // Create Quarterly cycles
      const quarters = [
        { name: `Q1 ${currentYear}`, start: '01-01', end: '03-31' },
        { name: `Q2 ${currentYear}`, start: '04-01', end: '06-30' },
        { name: `Q3 ${currentYear}`, start: '07-01', end: '09-30' },
        { name: `Q4 ${currentYear}`, start: '10-01', end: '12-31' },
      ];
      
      for (const quarter of quarters) {
        await query(
          `INSERT INTO appraisal_cycles (tenant_id, cycle_name, cycle_year, start_date, end_date, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            quarter.name,
            currentYear,
            `${currentYear}-${quarter.start}`,
            `${currentYear}-${quarter.end}`,
            'draft',
            userId
          ]
        );
      }
    }
    
    // Fetch all cycles
    const { rows } = await query(
      `SELECT id, cycle_name, cycle_year, status, start_date, end_date 
       FROM appraisal_cycles
       WHERE tenant_id = $1
       ORDER BY cycle_year DESC, cycle_name`,
      [tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching cycles:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch" });
  }
});

// Create new appraisal cycle
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { cycle_name, cycle_year, start_date, end_date, status } = req.body;

    // Validate required fields
    if (!cycle_name || !cycle_year || !start_date || !end_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      "SELECT tenant_id FROM profiles WHERE id = $1",
      [req.user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    // Insert new cycle
    const insertResult = await query(
      `INSERT INTO appraisal_cycles (tenant_id, cycle_name, cycle_year, start_date, end_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        cycle_name,
        cycle_year,
        start_date,
        end_date,
        status || "draft",
        req.user.id
      ]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error("Error creating appraisal cycle:", error);
    res.status(500).json({ error: error?.message || "Failed to create cycle" });
  }
});

export default router;
