import { Router, Request, Response } from "express";
import ExcelJS from "exceljs";
import { query } from "../db.js";

const router = Router();

// Helper to get organization id from tenantId (similar to reimbursements.ts)
const getOrganizationId = async (tenantId: string): Promise<string | null> => {
  try {
    // In unified database, tenantId should already be organizations.id
    const orgResult = await query(
      `SELECT id FROM organizations WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    if (orgResult.rows[0]) {
      return tenantId; // tenantId is already organizations.id
    }
    
    // If not found by id, try org_id field (for backward compatibility)
    const orgByOrgIdResult = await query(
      `SELECT id FROM organizations WHERE org_id = $1 LIMIT 1`,
      [tenantId]
    );
    if (orgByOrgIdResult.rows[0]) {
      return orgByOrgIdResult.rows[0].id;
    }
    
    console.warn("[REIMBURSEMENT_RUN] Organization not found for tenantId:", tenantId);
    return tenantId;
  } catch (e: any) {
    console.error("[REIMBURSEMENT_RUN] Error getting organization id:", e.message);
    return tenantId;
  }
};

// Create a new reimbursement run (draft)
router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId = (req as any).userId as string;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    const { run_date, reference_note } = req.body;
    const runDate = run_date || new Date().toISOString().split("T")[0];

    // Auto-fetch ALL approved reimbursements that are not yet paid
    const approvedReimbursements = await query(
      `SELECT 
        er.id,
        er.employee_id,
        er.amount,
        er.description,
        er.category,
        e.employee_id as employee_code,
        COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, e.email, 'Unknown') as employee_name
      FROM employee_reimbursements er
      JOIN employees e ON e.id = er.employee_id
      LEFT JOIN profiles p ON p.id = e.user_id
      WHERE er.org_id = $1
        AND er.status = 'approved'
        AND er.reimbursement_run_id IS NULL
      ORDER BY er.submitted_at ASC`,
      [orgId]
    );

    const totalAmount = approvedReimbursements.rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );
    const totalClaims = approvedReimbursements.rows.length;

    // Create the reimbursement run
    const runResult = await query(
      `INSERT INTO reimbursement_runs (
        tenant_id, run_date, status, total_amount, total_claims, reference_note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        orgId,
        runDate,
        "draft",
        totalAmount,
        totalClaims,
        reference_note || null,
        userId,
      ]
    );

    const run = runResult.rows[0];

    // Link all approved reimbursements to this run
    if (approvedReimbursements.rows.length > 0) {
      const reimbursementIds = approvedReimbursements.rows.map((r) => r.id);
      await query(
        `UPDATE employee_reimbursements
         SET reimbursement_run_id = $1
         WHERE id = ANY($2::uuid[])
           AND org_id = $3
           AND status = 'approved'
           AND reimbursement_run_id IS NULL`,
        [run.id, reimbursementIds, orgId]
      );
    }

    res.status(201).json({
      run,
      claims: approvedReimbursements.rows,
      summary: {
        total_claims: totalClaims,
        total_amount: totalAmount,
      },
    });
  } catch (error: any) {
    console.error("Error creating reimbursement run:", error);
    res.status(500).json({ error: error.message || "Failed to create reimbursement run" });
  }
});

// Get all reimbursement runs
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

    const runs = await query(
      `SELECT 
        rr.*,
        COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, u.email, 'System') as created_by_name
      FROM reimbursement_runs rr
      LEFT JOIN profiles p ON p.id = rr.created_by
      LEFT JOIN users u ON u.id = rr.created_by
      WHERE rr.tenant_id = $1
      ORDER BY rr.run_date DESC, rr.created_at DESC`,
      [orgId]
    );

    res.json({ runs: runs.rows });
  } catch (error: any) {
    console.error("Error fetching reimbursement runs:", error);
    res.status(500).json({ error: error.message || "Failed to fetch reimbursement runs" });
  }
});

// Get reimbursement run details with claims and employee bank details
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    // Get run details
    const runResult = await query(
      `SELECT rr.*,
        COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, u.email, 'System') as created_by_name
      FROM reimbursement_runs rr
      LEFT JOIN profiles p ON p.id = rr.created_by
      LEFT JOIN users u ON u.id = rr.created_by
      WHERE rr.id = $1 AND rr.tenant_id = $2`,
      [id, orgId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: "Reimbursement run not found" });
    }

    const run = runResult.rows[0];

    // Get all claims with employee bank details
    const claimsResult = await query(
      `SELECT 
        er.id,
        er.employee_id,
        er.amount,
        er.description,
        er.category,
        er.receipt_url,
        er.submitted_at,
        e.employee_id as employee_code,
        COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, e.email, 'Unknown') as employee_name,
        COALESCE(od.bank_account_number, 'N/A') as bank_account_number,
        COALESCE(od.ifsc_code, 'N/A') as bank_ifsc_code,
        COALESCE(od.bank_name, 'N/A') as bank_name
      FROM employee_reimbursements er
      JOIN employees e ON e.id = er.employee_id
      LEFT JOIN profiles p ON p.id = e.user_id
      LEFT JOIN onboarding_data od ON od.employee_id = e.id
      WHERE er.reimbursement_run_id = $1
        AND er.org_id = $2
      ORDER BY er.submitted_at ASC`,
      [id, orgId]
    );

    res.json({
      run,
      claims: claimsResult.rows,
    });
  } catch (error: any) {
    console.error("Error fetching reimbursement run details:", error);
    res.status(500).json({ error: error.message || "Failed to fetch reimbursement run details" });
  }
});

// Process reimbursement run (mark as paid)
router.post("/:id/process", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    // Verify run exists and belongs to tenant
    const runResult = await query(
      `SELECT * FROM reimbursement_runs WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: "Reimbursement run not found" });
    }

    const run = runResult.rows[0];

    if (run.status === "paid") {
      return res.status(400).json({ error: "Reimbursement run is already processed" });
    }

    // Update run status to paid
    await query(
      `UPDATE reimbursement_runs
       SET status = 'paid', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    // Update all linked reimbursements to paid
    await query(
      `UPDATE employee_reimbursements
       SET status = 'paid', updated_at = NOW()
       WHERE reimbursement_run_id = $1
         AND org_id = $2
         AND status = 'approved'`,
      [id, orgId]
    );

    res.json({
      message: "Reimbursement run processed successfully",
      run: { ...run, status: "paid" },
    });
  } catch (error: any) {
    console.error("Error processing reimbursement run:", error);
    res.status(500).json({ error: error.message || "Failed to process reimbursement run" });
  }
});

// Export bank file for reimbursement run
router.get("/:id/export/bank-file", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    // Verify run exists and belongs to tenant
    const runResult = await query(
      `SELECT * FROM reimbursement_runs WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: "Reimbursement run not found" });
    }

    const run = runResult.rows[0];

    // Get all claims with employee bank details
    const claimsResult = await query(
      `SELECT 
        er.id,
        er.amount,
        er.description,
        er.category,
        e.employee_id as employee_code,
        COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name, e.email, 'Unknown') as employee_name,
        COALESCE(od.bank_account_number, 'N/A') as bank_account_number,
        COALESCE(od.ifsc_code, 'N/A') as bank_ifsc_code,
        COALESCE(od.bank_name, 'N/A') as bank_name
      FROM employee_reimbursements er
      JOIN employees e ON e.id = er.employee_id
      LEFT JOIN profiles p ON p.id = e.user_id
      LEFT JOIN onboarding_data od ON od.employee_id = e.id
      WHERE er.reimbursement_run_id = $1
        AND er.org_id = $2
      ORDER BY e.employee_id ASC, er.submitted_at ASC`,
      [id, orgId]
    );

    if (claimsResult.rows.length === 0) {
      return res.status(404).json({ error: "No claims found for this reimbursement run" });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Reimbursement Payout");

    // Set column headers
    worksheet.columns = [
      { header: "Employee ID", key: "employee_code", width: 15 },
      { header: "Name", key: "employee_name", width: 30 },
      { header: "Bank Name", key: "bank_name", width: 20 },
      { header: "Account No", key: "bank_account_number", width: 20 },
      { header: "IFSC", key: "bank_ifsc_code", width: 15 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Expense Reference", key: "description", width: 40 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add data rows
    claimsResult.rows.forEach((row) => {
      const amount = parseFloat(row.amount) || 0;
      const description = row.description || row.category || "N/A";

      worksheet.addRow({
        employee_code: row.employee_code || "N/A",
        employee_name: row.employee_name || "N/A",
        bank_name: row.bank_name || "N/A",
        bank_account_number: row.bank_account_number || "N/A",
        bank_ifsc_code: row.bank_ifsc_code || "N/A",
        amount: amount,
        description: description,
      });
    });

    // Format Amount column as currency
    worksheet.getColumn("amount").numFmt = "#,##0.00";
    worksheet.getColumn("amount").alignment = { horizontal: "right" };

    // Generate filename
    const runDate = new Date(run.run_date).toISOString().split("T")[0];
    const filename = `Reimbursement_Payout_${runDate}_${id.substring(0, 8)}.xlsx`;

    // Set response headers
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error("Error exporting reimbursement bank file:", error);
    res.status(500).json({ error: error.message || "Failed to export bank file" });
  }
});

export default router;
