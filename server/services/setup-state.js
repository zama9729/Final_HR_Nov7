import { queryWithOrg } from '../db/pool.js';

const SETUP_STATE_TTL_MS = parseInt(process.env.SETUP_STATE_TTL_MS || '60000', 10);

export const SETUP_STEPS = [
  { key: 'org-details', label: 'Organization Details', optional: false, deepLink: '/settings?tab=organization' },
  { key: 'branches', label: 'Branches & Locations', optional: false, deepLink: '/settings/branches' },
  { key: 'departments', label: 'Departments & Teams', optional: true, deepLink: '/settings/departments' },
  { key: 'policies', label: 'Policies', optional: true, deepLink: '/policies' },
  { key: 'employee-import', label: 'Employee Import', optional: true, deepLink: '/employees/import' },
  { key: 'attendance', label: 'Attendance Configuration', optional: false, deepLink: '/settings/attendance' },
  { key: 'review', label: 'Review & Finish', optional: false, deepLink: '/setup/review' },
];

export const STEP_LOOKUP = SETUP_STEPS.reduce((acc, step) => {
  acc[step.key] = step;
  return acc;
}, {});

const cache = new Map();

function nowMs() {
  return Date.now();
}

function defaultStepState() {
  return SETUP_STEPS.reduce((acc, step) => {
    acc[step.key] = {
      completed: false,
      skipped: false,
      optional: step.optional,
      data: {},
      updatedAt: null,
    };
    return acc;
  }, {});
}

export function invalidateSetupState(orgId) {
  cache.delete(orgId);
}

export async function ensureOrgSetupState(orgId) {
  if (!orgId) return;
  const steps = defaultStepState();
  try {
    await queryWithOrg(
      `INSERT INTO org_setup_status (org_id, steps, current_step)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (org_id) DO NOTHING`,
      [orgId, JSON.stringify(steps), 'org-details'],
      orgId
    );
    invalidateSetupState(orgId);
  } catch (error) {
    console.error('Failed ensuring org setup state', error?.message || error);
    throw error;
  }
}

function mergeSteps(rowSteps) {
  const base = defaultStepState();
  const incoming = rowSteps || {};
  return Object.keys(base).reduce((acc, key) => {
    acc[key] = {
      ...base[key],
      ...(incoming[key] || {}),
      optional: STEP_LOOKUP[key]?.optional ?? base[key].optional,
    };
    return acc;
  }, {});
}

function hydrateResponse(row) {
  const mergedSteps = mergeSteps(row?.steps);
  const pendingStep = SETUP_STEPS.find(
    (step) => !(mergedSteps[step.key]?.completed || mergedSteps[step.key]?.skipped)
  );
  const currentStep = row?.current_step || pendingStep?.key || 'review';
  const requiredSteps = SETUP_STEPS.filter((s) => !s.optional).map((s) => s.key);
  const requiredMet = requiredSteps.every((key) => mergedSteps[key]?.completed);
  return {
    orgId: row?.org_id,
    isCompleted: row?.is_completed && requiredMet,
    currentStep,
    steps: mergedSteps,
    requiredSteps,
    metadata: row?.metadata || {},
    updatedAt: row?.updated_at,
    completedAt: row?.completed_at,
  };
}

export async function getOrgSetupState(orgId, { skipCache = false } = {}) {
  if (!orgId) {
    throw new Error('orgId required for setup state');
  }
  const cacheEntry = cache.get(orgId);
  if (!skipCache && cacheEntry && cacheEntry.expiresAt > nowMs()) {
    return cacheEntry.value;
  }

  await ensureOrgSetupState(orgId);

  const { rows } = await queryWithOrg(
    `SELECT org_id, is_completed, current_step, steps, metadata, updated_at, completed_at
     FROM org_setup_status
     WHERE org_id = $1`,
    [orgId],
    orgId
  );

  if (!rows.length) {
    throw new Error('Unable to load setup state');
  }

  const payload = hydrateResponse(rows[0]);
  cache.set(orgId, { value: payload, expiresAt: nowMs() + SETUP_STATE_TTL_MS });
  return payload;
}

export async function updateSetupStep(orgId, stepKey, { data = {}, completed, skipped, finish }) {
  if (!STEP_LOOKUP[stepKey]) {
    throw new Error('Invalid setup step');
  }
  const state = await getOrgSetupState(orgId, { skipCache: true });
  const stepIndex = SETUP_STEPS.findIndex((s) => s.key === stepKey);
  if (stepIndex === -1) {
    throw new Error('Unknown step');
  }

  // Enforce sequential progression
  const unmet = SETUP_STEPS.slice(0, stepIndex).filter((step) => {
    const stepState = state.steps[step.key];
    if (!stepState) return true;
    if (stepState.optional && stepState.skipped) {
      return false;
    }
    return !stepState.completed;
  });
  if (unmet.length > 0) {
    throw new Error(`Complete ${unmet[0].label || unmet[0].key} before continuing`);
  }

  const nextStateForStep = {
    ...state.steps[stepKey],
    data: Object.keys(data || {}).length ? { ...state.steps[stepKey].data, ...data } : state.steps[stepKey].data,
    updatedAt: new Date().toISOString(),
  };

  if (typeof completed === 'boolean') {
    nextStateForStep.completed = completed;
  }
  if (typeof skipped === 'boolean' && STEP_LOOKUP[stepKey].optional) {
    nextStateForStep.skipped = skipped;
    if (skipped) {
      nextStateForStep.completed = false;
    }
  }

  const nextSteps = {
    ...state.steps,
    [stepKey]: nextStateForStep,
  };

  const requiredSteps = state.requiredSteps || SETUP_STEPS.filter((s) => !s.optional).map((s) => s.key);
  const requiredCompleted = requiredSteps.every((key) => nextSteps[key]?.completed);
  const nextPending = SETUP_STEPS.find(
    (step) => !(nextSteps[step.key]?.completed || nextSteps[step.key]?.skipped)
  );

  const markComplete = Boolean(finish) && stepKey === 'review' && requiredCompleted;
  let nextIsCompleted = state.isCompleted;
  if (markComplete) {
    nextIsCompleted = true;
  } else if (!state.isCompleted) {
    nextIsCompleted = requiredCompleted && Boolean(nextSteps['review']?.completed);
  }
  const nextCurrentStep = markComplete
    ? 'review'
    : (nextPending?.key || 'review');

  const dbResult = await queryWithOrg(
    `UPDATE org_setup_status
     SET steps = $1::jsonb,
         current_step = $2,
         is_completed = $3,
         completed_at = CASE WHEN $3 THEN COALESCE(completed_at, now()) ELSE completed_at END,
         updated_at = now()
     WHERE org_id = $4
     RETURNING org_id, is_completed, current_step, steps, metadata, updated_at, completed_at`,
    [
      JSON.stringify(nextSteps),
      nextCurrentStep,
      nextIsCompleted,
      orgId,
    ],
    orgId
  );

  if (!dbResult.rows.length) {
    throw new Error('Failed to update setup step');
  }

  invalidateSetupState(orgId);
  return hydrateResponse(dbResult.rows[0]);
}


