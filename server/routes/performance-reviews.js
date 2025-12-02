import express from "express";
import { query, queryWithOrg } from "../db/pool.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { createAppraisalEvent } from "../utils/employee-events.js";
const router = express.Router();

// Get reviews for a cycle
router.get("/", authenticateToken, async (req, res) => {
  const { cycle } = req.query;
  if (!cycle) return res.status(400).json({ error: "cycle is required" });
  try {
    const userId = req.user.id;
    const { rows } = await query(
      `SELECT pr.*, 
              e.employee_id, e.position, 
              p.first_name, p.last_name, p.email
       FROM performance_reviews pr
       JOIN employees e ON e.id = pr.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE pr.appraisal_cycle_id = $1 AND pr.tenant_id = (SELECT tenant_id FROM profiles WHERE id = $2)`,
      [cycle, userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Failed to fetch" });
  }
});

router.get("/my", authenticateToken, async (req, res) => {
  try {
    const employeeRes = await query(
      'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!employeeRes.rows.length) {
      return res.json([]);
    }
    const employeeId = employeeRes.rows[0].id;
    const { rows } = await query(
      `SELECT pr.*,
              ac.cycle_name,
              ac.cycle_year,
              reviewer_profiles.first_name AS reviewer_first_name,
              reviewer_profiles.last_name AS reviewer_last_name
       FROM performance_reviews pr
       LEFT JOIN appraisal_cycles ac ON ac.id = pr.appraisal_cycle_id
       LEFT JOIN employees reviewer ON reviewer.id = pr.reviewer_id
       LEFT JOIN profiles reviewer_profiles ON reviewer_profiles.id = reviewer.user_id
       WHERE pr.employee_id = $1
       ORDER BY pr.created_at DESC`,
      [employeeId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch employee reviews', error);
    res.status(500).json({ error: error?.message || "Failed to fetch" });
  }
});

router.post('/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const employeeRes = await query(
      'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!employeeRes.rows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const result = await query(
      `UPDATE performance_reviews
       SET status = 'acknowledged', updated_at = now()
       WHERE id = $1 AND employee_id = $2
       RETURNING id`,
      [req.params.id, employeeRes.rows[0].id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to acknowledge review', error);
    res.status(500).json({ error: error?.message || "Failed to acknowledge" });
  }
});

// Upsert review
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { appraisal_cycle_id, employee_id, rating, performance_score, strengths, areas_of_improvement, goals, comments } = req.body;
    if (!appraisal_cycle_id || !employee_id) {
      return res.status(400).json({ error: "Missing IDs" });
    }
    // find tenant & reviewer id
    const userId = req.user.id;
    const profile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const emp = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    const tenant_id = profile.rows[0]?.tenant_id;
    const reviewer_id = emp.rows[0]?.id;
    if (!tenant_id || !reviewer_id) return res.status(400).json({ error: "Invalid session" });
    const result = await query(
      `INSERT INTO performance_reviews (
        appraisal_cycle_id, employee_id, reviewer_id, tenant_id, rating, performance_score, strengths, areas_of_improvement, goals, comments, status, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted', now())
      ON CONFLICT (appraisal_cycle_id, employee_id) DO UPDATE SET
        reviewer_id = $3,
        tenant_id = $4,
        rating=$5,
        performance_score=$6,
        strengths=$7, areas_of_improvement=$8, goals=$9, comments=$10, status='submitted', updated_at=now()`,
      [appraisal_cycle_id, employee_id, reviewer_id, tenant_id, rating, performance_score, strengths, areas_of_improvement, goals, comments]
    );
    
    // Get the created/updated review with cycle info
    const reviewResult = await query(
      `SELECT pr.*, ac.cycle_name, ac.cycle_year, ac.end_date
       FROM performance_reviews pr
       LEFT JOIN appraisal_cycles ac ON ac.id = pr.appraisal_cycle_id
       WHERE pr.appraisal_cycle_id = $1 AND pr.employee_id = $2`,
      [appraisal_cycle_id, employee_id]
    );
    
    if (reviewResult.rows.length > 0) {
      const review = reviewResult.rows[0];
      // Create employee event for appraisal
      try {
        await createAppraisalEvent(tenant_id, employee_id, {
          ...review,
          appraisal_cycle: {
            cycle_name: review.cycle_name,
            cycle_year: review.cycle_year,
            end_date: review.end_date
          }
        });
      } catch (eventError) {
        console.error('Error creating appraisal event:', eventError);
        // Don't fail the request if event creation fails
      }
    }
    
    // Check for promotion based on performance
    if (performance_score && performance_score >= 4.0) {
      await query(
        `SELECT check_performance_promotion($1, $2, $3)`,
        [employee_id, performance_score, tenant_id]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Failed to upsert" });
  }
});

export default router;
