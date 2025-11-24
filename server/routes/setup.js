import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import {
  ensureOrgSetupState,
  getOrgSetupState,
  updateSetupStep,
  SETUP_STEPS,
  STEP_LOOKUP,
} from '../services/setup-state.js';

const router = express.Router();

router.use(authenticateToken, requireRole('admin', 'hr', 'ceo'), setTenantContext);

function requireOrgId(req, res, next) {
  if (!req.orgId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  return next();
}

router.get('/status', requireOrgId, async (req, res) => {
  try {
    await ensureOrgSetupState(req.orgId);
    const state = await getOrgSetupState(req.orgId);
    res.json({
      ...state,
      stepOrder: SETUP_STEPS,
    });
  } catch (error) {
    console.error('Failed to fetch setup status', error);
    res.status(500).json({ error: error.message || 'Unable to fetch setup status' });
  }
});

router.get('/steps/:stepKey', requireOrgId, async (req, res) => {
  const { stepKey } = req.params;
  if (!STEP_LOOKUP[stepKey]) {
    return res.status(404).json({ error: 'Step not found' });
  }
  try {
    const state = await getOrgSetupState(req.orgId);
    res.json({
      definition: STEP_LOOKUP[stepKey],
      state: state.steps?.[stepKey] || null,
    });
  } catch (error) {
    console.error('Failed to fetch setup step', error);
    res.status(500).json({ error: error.message || 'Unable to fetch setup step' });
  }
});

router.post('/steps/:stepKey', requireOrgId, async (req, res) => {
  const { stepKey } = req.params;
  if (!STEP_LOOKUP[stepKey]) {
    return res.status(404).json({ error: 'Step not found' });
  }
  const { data, completed, skipped, finish } = req.body || {};
  try {
    const updated = await updateSetupStep(req.orgId, stepKey, {
      data,
      completed,
      skipped,
      finish,
    });
    res.json({
      ...updated,
      stepOrder: SETUP_STEPS,
    });
  } catch (error) {
    console.error('Failed to update setup step', error);
    const status = error.message && error.message.startsWith('Complete ')
      ? 409
      : 500;
    res.status(status).json({ error: error.message || 'Unable to update setup step' });
  }
});

export default router;


