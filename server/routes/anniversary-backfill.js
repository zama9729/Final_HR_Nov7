import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { backfillAnniversaryEvents } from '../services/anniversary-events.js';

const router = express.Router();

// POST /api/anniversary/backfill - Backfill anniversary events for all employees (HR/CEO only)
router.post('/backfill', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin'), async (req, res) => {
  try {
    console.log('[Anniversary Backfill] Starting backfill...');
    const result = await backfillAnniversaryEvents();
    
    res.json({
      success: true,
      message: `Backfill completed: ${result.processed} anniversary events created, ${result.skipped} skipped`,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[Anniversary Backfill] Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to backfill anniversary events' 
    });
  }
});

export default router;

