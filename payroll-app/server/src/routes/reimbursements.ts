import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { query } from "../db.js";

const router = Router();

const RECEIPTS_DIR =
  process.env.REIMBURSEMENTS_RECEIPT_DIR || path.resolve(process.cwd(), "uploads", "receipts");
const RECEIPTS_BASE_URL = process.env.REIMBURSEMENTS_RECEIPT_BASE_URL || "/receipts";
const RECEIPTS_MAX_SIZE =
  Number(process.env.REIMBURSEMENTS_MAX_SIZE || 10 * 1024 * 1024); // default 10 MB

const REIMBURSEMENT_CATEGORIES = [
  { value: "food", label: "Food & Meals" },
  { value: "travel", label: "Travel" },
  { value: "stay", label: "Stay & Lodging" },
  { value: "transport", label: "Local Transport" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "internet", label: "Internet & Connectivity" },
  { value: "other", label: "Other" },
];

const CATEGORY_VALUES = new Set(REIMBURSEMENT_CATEGORIES.map((item) => item.value));
const CATEGORY_LABEL_LOOKUP = REIMBURSEMENT_CATEGORIES.reduce((acc: Record<string, string>, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const CATEGORY_SYNONYMS: Record<string, string> = {
  meal: "food",
  meals: "food",
  food: "food",
  dining: "food",
  lunch: "food",
  dinner: "food",
  travel: "travel",
  trip: "travel",
  airfare: "travel",
  flight: "travel",
  stay: "stay",
  lodging: "stay",
  hotel: "stay",
  accommodation: "stay",
  transport: "transport",
  transportation: "transport",
  cab: "transport",
  taxi: "transport",
  commute: "transport",
  mileage: "transport",
  office: "office_supplies",
  supplies: "office_supplies",
  stationery: "office_supplies",
  hardware: "office_supplies",
  internet: "internet",
  wifi: "internet",
  broadband: "internet",
  data: "internet",
  misc: "other",
  miscellaneous: "other",
  other: "other",
};

const toTitleCase = (value: string) =>
  value
    .toString()
    .replace(/[_\s]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const normalizeCategoryValue = (rawValue: any): string | null => {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }
  const normalized = rawValue.toString().trim().toLowerCase();
  if (CATEGORY_VALUES.has(normalized)) {
    return normalized;
  }
  if (CATEGORY_SYNONYMS[normalized]) {
    return CATEGORY_SYNONYMS[normalized];
  }
  return null;
};

const mapReimbursementRow = (row: any) => {
  const canonical = normalizeCategoryValue(row.category);
  const fallbackLabel =
    typeof row.category === "string" && row.category.trim().length > 0
      ? toTitleCase(row.category)
      : "Other";
  return {
    ...row,
    category_value: canonical || "other",
    category_label: canonical ? CATEGORY_LABEL_LOOKUP[canonical] : fallbackLabel,
  };
};

fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RECEIPTS_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitized = file.originalname.replace(/\s+/g, "_");
    cb(null, `${uniqueSuffix}-${sanitized}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: RECEIPTS_MAX_SIZE },
});

const normalizeBasePath = () => {
  if (!RECEIPTS_BASE_URL) {
    return "/receipts";
  }

  if (RECEIPTS_BASE_URL.startsWith("http")) {
    try {
      const parsed = new URL(RECEIPTS_BASE_URL);
      return parsed.pathname?.replace(/\/+$/, "") || "/receipts";
    } catch (err) {
      console.warn("Invalid REIMBURSEMENTS_RECEIPT_BASE_URL, defaulting to /receipts:", err);
      return "/receipts";
    }
  }

  const trimmed = RECEIPTS_BASE_URL.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const RECEIPTS_BASE_PATH = normalizeBasePath();

// Helper to get organization id from tenantId
// In unified database, tenantId should be organizations.id (the primary key)
// HR system uses profiles.tenant_id which is organizations.id
// Payroll uses users.org_id which should also be organizations.id
const getOrganizationId = async (tenantId: string): Promise<string | null> => {
  try {
    // In unified database, tenantId should already be organizations.id
    // Verify it exists, but use it directly to match HR system behavior
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
    
    // If still not found, log warning
    console.warn("[REIMBURSEMENT] Organization not found for tenantId:", tenantId);
    // Still return tenantId as fallback - it might be correct but org table might not be set up yet
    return tenantId;
  } catch (e: any) {
    console.error("[REIMBURSEMENT] Error getting organization id:", e.message);
    // Fallback: assume tenantId is the organizations.id
    return tenantId;
  }
};

const getEmployeeForUser = async (userId: string, tenantId: string, email: string) => {
  // Try to get employee from payroll_employee_view first (unified database)
  // The view returns employee_id (which is employee_code), but we need the actual UUID id
  try {
    const viewResult = await query(
      `SELECT employee_id, org_id, user_id
       FROM payroll_employee_view
       WHERE org_id = $1 AND email = $2
       LIMIT 1`,
      [tenantId, email]
    );
    if (viewResult.rows[0]?.user_id) {
      // Get the actual UUID id from employees table using user_id
      const empResult = await query(
        `SELECT id, tenant_id
         FROM employees
         WHERE user_id = $1 AND tenant_id = $2
         LIMIT 1`,
        [viewResult.rows[0].user_id, tenantId]
      );
      if (empResult.rows[0]) {
        return empResult.rows[0];
      }
    }
  } catch (viewError: any) {
    // View might not exist, fall back to employees table
    console.log("[REIMBURSEMENT] payroll_employee_view not available, using employees table:", viewError.message);
  }

  // Fallback: Try to get employee by joining with profiles table
  try {
    const result = await query(
      `SELECT e.id, e.tenant_id
       FROM employees e
       INNER JOIN profiles p ON e.user_id = p.id
       WHERE e.tenant_id = $1 AND p.email = $2
       LIMIT 1`,
      [tenantId, email]
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
  } catch (e: any) {
    console.log("[REIMBURSEMENT] Error querying employees with profiles:", e.message);
  }

  return null;
};

const buildReceiptUrl = (filename: string | undefined) => {
  if (!filename) {
    return null;
  }
  return `${RECEIPTS_BASE_PATH}/${filename}`;
};

router.post(
  "/submit",
  upload.single("receipt"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const tenantId = (req as any).tenantId as string;
      const email = (req as any).userEmail as string;
      const { category, amount, description } = req.body;

      if (!category) {
        return res.status(400).json({ error: "Category is required" });
      }

      const normalizedCategory = normalizeCategoryValue(category);
      if (!normalizedCategory) {
        return res.status(400).json({ error: "Invalid category" });
      }

      if (amount === undefined) {
        return res.status(400).json({ error: "Amount is required" });
      }

      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }

      const employeeRecord = await getEmployeeForUser(userId, tenantId, email);
      if (!employeeRecord) {
        console.error("[REIMBURSEMENT] Employee not found for userId:", userId, "tenantId:", tenantId, "email:", email);
        return res.status(404).json({ error: "Employee profile not found" });
      }

      // Get the organization id (organizations.id, not org_id field)
      // HR system uses tenant_id from profiles which is organizations.id
      // We need to ensure we use the same value for consistency
      const orgId = await getOrganizationId(tenantId);
      if (!orgId) {
        console.error("[REIMBURSEMENT] Organization not found for tenantId:", tenantId);
        return res.status(400).json({ error: "Organization not found" });
      }
      
      console.log("[REIMBURSEMENT] Submitting reimbursement with orgId:", orgId, "tenantId:", tenantId, "employeeId:", employeeRecord.id);

      const receiptUrl = (req as any).file ? buildReceiptUrl((req as any).file.filename) : null;

      const insertResult = await query(
        `INSERT INTO employee_reimbursements (
          employee_id,
          org_id,
          category,
          amount,
          description,
          receipt_url,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *`,
        [
          employeeRecord.id,
          orgId,
          normalizedCategory,
          numericAmount,
          description?.trim() || null,
          receiptUrl,
        ]
      );

      res.status(201).json({ reimbursement: mapReimbursementRow(insertResult.rows[0]) });
    } catch (error: any) {
      console.error("Error submitting reimbursement:", error);
      res.status(500).json({ error: error.message || "Failed to submit reimbursement" });
    }
  }
);

router.get("/my-claims", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    const email = (req as any).userEmail as string;

    const employeeRecord = await getEmployeeForUser(userId, tenantId, email);
    if (!employeeRecord) {
      return res.status(404).json({ error: "Employee profile not found" });
    }

    const claimsResult = await query(
      `SELECT *
       FROM employee_reimbursements
       WHERE employee_id = $1
       ORDER BY submitted_at DESC`,
      [employeeRecord.id]
    );

    res.json({ reimbursements: claimsResult.rows.map(mapReimbursementRow) });
  } catch (error: any) {
    console.error("Error fetching reimbursement claims:", error);
    res.status(500).json({ error: error.message || "Failed to fetch reimbursements" });
  }
});

router.get("/pending", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    // Get the organization id (organizations.id, not org_id field)
    // This should match HR system's org_id resolution
    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    // Debug: Log what we're querying for
    console.log("[REIMBURSEMENT] Querying pending reimbursements with orgId:", orgId, "tenantId:", tenantId);
    
    // First, let's check if there are any pending reimbursements at all
    const checkResult = await query(
      `SELECT COUNT(*) as count FROM employee_reimbursements WHERE status = 'pending'`
    );
    console.log("[REIMBURSEMENT] Total pending reimbursements in database:", checkResult.rows[0]?.count);
    
    // Query reimbursements - get employee info from employees and profiles tables
    // Match HR system's query structure exactly
    const pendingResult = await query(
      `SELECT 
        r.*,
        e.employee_id as employee_code,
        p.first_name,
        p.last_name
       FROM employee_reimbursements r
       JOIN employees e ON e.id = r.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE r.org_id = $1
         AND r.status = 'pending'
       ORDER BY r.submitted_at ASC`,
      [orgId]
    );
    
    console.log("[REIMBURSEMENT] Found", pendingResult.rows.length, "pending reimbursements for orgId:", orgId);
    
    // If no results, also try with tenantId directly (in case they differ)
    if (pendingResult.rows.length === 0 && orgId !== tenantId) {
      console.log("[REIMBURSEMENT] No results with orgId, trying tenantId directly:", tenantId);
      const fallbackResult = await query(
        `SELECT 
          r.*,
          e.employee_id as employee_code,
          p.first_name,
          p.last_name
         FROM employee_reimbursements r
         JOIN employees e ON e.id = r.employee_id
         JOIN profiles p ON p.id = e.user_id
         WHERE r.org_id = $1
           AND r.status = 'pending'
         ORDER BY r.submitted_at ASC`,
        [tenantId]
      );
      console.log("[REIMBURSEMENT] Fallback query found", fallbackResult.rows.length, "pending reimbursements");
      return res.json({ reimbursements: fallbackResult.rows.map(mapReimbursementRow) });
    }

    res.json({ reimbursements: pendingResult.rows.map(mapReimbursementRow) });
  } catch (error: any) {
    console.error("Error fetching pending reimbursements:", error);
    res.status(500).json({ error: error.message || "Failed to fetch pending reimbursements" });
  }
});

const handleReview = (status: "approved" | "rejected") => [
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = (req as any).tenantId as string;
      const userId = (req as any).userId as string;
      const hrUserId = (req as any).hrUserId as string | null;

      if (!tenantId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get profile ID from hr_user_id if available, otherwise use null
      // reviewed_by_user_id references profiles(id), not users(id)
      let profileId: string | null = null;
      if (hrUserId) {
        try {
          const profileResult = await query(
            `SELECT id FROM profiles WHERE id = $1 LIMIT 1`,
            [hrUserId]
          );
          if (profileResult.rows[0]) {
            profileId = profileResult.rows[0].id;
          }
        } catch (e) {
          // If profile doesn't exist, leave as null
          console.log("[REIMBURSEMENT] Could not find profile for hr_user_id:", hrUserId);
        }
      }

      // Get the organization id (organizations.id, not org_id field)
      const orgId = await getOrganizationId(tenantId);
      if (!orgId) {
        return res.status(400).json({ error: "Organization not found" });
      }

      const updateResult = await query(
        `UPDATE employee_reimbursements
         SET status = $1,
             reviewed_by_user_id = $2,
             reviewed_at = NOW()
         WHERE id = $3
           AND org_id = $4
         RETURNING *`,
        [status, profileId, id, orgId]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ error: "Reimbursement not found" });
      }

      const updated = mapReimbursementRow(updateResult.rows[0]);

      res.json({ reimbursement: updated });
    } catch (error: any) {
      console.error(`Error updating reimbursement (${status}):`, error);
      res.status(500).json({ error: error.message || "Failed to update reimbursement" });
    }
  },
];

router.post("/:id/approve", ...handleReview("approved"));
router.post("/:id/reject", ...handleReview("rejected"));

// Get pending count for notifications
router.get("/pending/count", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string;

    if (!tenantId) {
      return res.status(403).json({ error: "No organization found" });
    }

    const orgId = await getOrganizationId(tenantId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization not found" });
    }

    const countResult = await query(
      `SELECT COUNT(*) as count
       FROM employee_reimbursements
       WHERE org_id = $1 AND status = 'pending'`,
      [orgId]
    );

    const count = parseInt(countResult.rows[0]?.count || "0", 10);
    res.json({ count });
  } catch (error: any) {
    console.error("Error fetching pending count:", error);
    res.status(500).json({ error: error.message || "Failed to fetch pending count" });
  }
});

// Get reimbursement history with filtering and sorting
router.get("/history", async (req: Request, res: Response) => {
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
      status,
      employee_id,
      employee_name,
      from_date,
      to_date,
      sort_by = "submitted_at",
      sort_order = "desc",
    } = req.query;

    // Build the query
    // Try using payroll_employee_view first, fallback to employees + profiles if view doesn't exist
    // Note: employees table may or may not have full_name column, so we construct it from available fields
    let queryStr = `
      SELECT 
        r.*,
        COALESCE(ev.employee_code, e.employee_code, 'N/A') as employee_code,
        COALESCE(
          ev.full_name, 
          p.first_name || ' ' || p.last_name, 
          p.first_name, 
          p.last_name, 
          p.email,
          'Unknown'
        ) as employee_name,
        COALESCE(p.email, ev.email, 'N/A') as email
      FROM employee_reimbursements r
      LEFT JOIN employees e ON e.id = r.employee_id
      LEFT JOIN profiles p ON p.id = e.user_id
      LEFT JOIN payroll_employee_view ev ON ev.employee_id::text = r.employee_id::text AND ev.org_id = r.org_id
      WHERE r.org_id = $1
    `;

    const params: any[] = [orgId];
    let paramIndex = 2;

    // Add filters
    if (status) {
      queryStr += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (employee_id) {
      queryStr += ` AND (e.employee_id ILIKE $${paramIndex} OR ev.employee_id ILIKE $${paramIndex} OR ev.employee_code ILIKE $${paramIndex})`;
      params.push(`%${employee_id}%`);
      paramIndex++;
    }

    if (employee_name) {
      queryStr += ` AND (
        COALESCE(ev.full_name, p.first_name || ' ' || p.last_name, p.first_name, p.last_name, e.email, '') ILIKE $${paramIndex}
      )`;
      params.push(`%${employee_name}%`);
      paramIndex++;
    }

    if (from_date) {
      queryStr += ` AND r.submitted_at >= $${paramIndex}::date`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      queryStr += ` AND r.submitted_at <= $${paramIndex}::date + INTERVAL '1 day'`;
      params.push(to_date);
      paramIndex++;
    }

    // Add sorting
    const validSortColumns = ["submitted_at", "amount", "status", "employee_name", "employee_code"];
    const sortColumn = validSortColumns.includes(sort_by as string) ? sort_by : "submitted_at";
    const sortDirection = sort_order === "asc" ? "ASC" : "DESC";

    if (sortColumn === "employee_name") {
      queryStr += ` ORDER BY employee_name ${sortDirection}, r.submitted_at DESC`;
    } else if (sortColumn === "employee_code") {
      queryStr += ` ORDER BY employee_code ${sortDirection}, r.submitted_at DESC`;
    } else {
      queryStr += ` ORDER BY r.${sortColumn} ${sortDirection}`;
    }

    let result;
    try {
      result = await query(queryStr, params);
    } catch (viewError: any) {
      // If payroll_employee_view doesn't exist or has issues, fallback to simpler query
      console.warn("[REIMBURSEMENT] Error with payroll_employee_view, using fallback:", viewError.message);
      queryStr = `
        SELECT 
          r.*,
          COALESCE(e.employee_code, 'N/A') as employee_code,
          COALESCE(
            p.first_name || ' ' || p.last_name, 
            p.first_name, 
            p.last_name, 
            e.email,
            'Unknown'
          ) as employee_name,
          COALESCE(p.email, e.email, 'N/A') as email
        FROM employee_reimbursements r
        LEFT JOIN employees e ON e.id = r.employee_id
        LEFT JOIN profiles p ON p.id = e.user_id OR p.email = e.email
        WHERE r.org_id = $1
      `;
      
      // Rebuild params without view-specific filters
      const fallbackParams: any[] = [orgId];
      let fallbackIndex = 2;
      
      if (status) {
        queryStr += ` AND r.status = $${fallbackIndex}`;
        fallbackParams.push(status);
        fallbackIndex++;
      }
      
      if (employee_id) {
        queryStr += ` AND (e.employee_code ILIKE $${fallbackIndex} OR p.email ILIKE $${fallbackIndex})`;
        fallbackParams.push(`%${employee_id}%`);
        fallbackIndex++;
      }
      
      if (employee_name) {
        queryStr += ` AND (
          p.first_name || ' ' || p.last_name ILIKE $${fallbackIndex} 
          OR p.first_name ILIKE $${fallbackIndex} 
          OR p.last_name ILIKE $${fallbackIndex} 
          OR p.email ILIKE $${fallbackIndex}
        )`;
        fallbackParams.push(`%${employee_name}%`);
        fallbackIndex++;
      }
      
      if (from_date) {
        queryStr += ` AND r.submitted_at >= $${fallbackIndex}::date`;
        fallbackParams.push(from_date);
        fallbackIndex++;
      }
      
      if (to_date) {
        queryStr += ` AND r.submitted_at <= $${fallbackIndex}::date + INTERVAL '1 day'`;
        fallbackParams.push(to_date);
        fallbackIndex++;
      }
      
      // Add sorting
      const validSortColumns = ["submitted_at", "amount", "status", "employee_name", "employee_code"];
      const sortColumn = validSortColumns.includes(sort_by as string) ? sort_by : "submitted_at";
      const sortDirection = sort_order === "asc" ? "ASC" : "DESC";
      
      if (sortColumn === "employee_name") {
        queryStr += ` ORDER BY employee_name ${sortDirection}, r.submitted_at DESC`;
      } else if (sortColumn === "employee_code") {
        queryStr += ` ORDER BY employee_code ${sortDirection}, r.submitted_at DESC`;
      } else {
        queryStr += ` ORDER BY r.${sortColumn} ${sortDirection}`;
      }
      
      result = await query(queryStr, fallbackParams);
    }

    // Calculate summary statistics
    const totalAmount = result.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
    const paidAmount = result.rows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
    const approvedAmount = result.rows
      .filter((row) => row.status === "approved" || row.status === "paid")
      .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);

    res.json({
      reimbursements: result.rows.map(mapReimbursementRow),
      summary: {
        total_count: result.rows.length,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        approved_amount: approvedAmount,
      },
    });
  } catch (error: any) {
    console.error("Error fetching reimbursement history:", error);
    res.status(500).json({ error: error.message || "Failed to fetch reimbursement history" });
  }
});

export default router;

