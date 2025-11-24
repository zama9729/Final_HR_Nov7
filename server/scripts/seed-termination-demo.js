import dotenv from 'dotenv';
import { createPool, query } from '../db/pool.js';

dotenv.config();

const samplePreview = {
  noticeDays: 30,
  lines: [
    { code: 'NOTICE_PAY', amount: 45000 },
    { code: 'GRATUITY', amount: 120000 },
  ],
};

const seed = async () => {
  await createPool();
  const employees = await query(
    `
    SELECT id, tenant_id, manager_id
    FROM employees
    ORDER BY created_at ASC
    LIMIT 2
    `
  );

  if (employees.rows.length === 0) {
    console.warn('⚠️  Seed aborted: no employees found.');
    return;
  }

  const target = employees.rows[0];
  const tenantId = target.tenant_id;

  const existingTermination = await query(
    'SELECT id FROM terminations WHERE employee_id = $1 LIMIT 1',
    [target.id]
  );

  let terminationId = existingTermination.rows[0]?.id;

  if (!terminationId) {
    const inserted = await query(
      `
      INSERT INTO terminations (
        tenant_id,
        employee_id,
        type,
        initiator_id,
        initiator_role,
        reason_text,
        proposed_lwd,
        notice_days,
        notice_pay_amount,
        gratuity_amount,
        settlement_amount,
        status,
        attachments,
        evidence_refs
      )
      VALUES (
        $1,
        $2,
        'resignation',
        NULL,
        'seed',
        'Demo resignation workflow',
        current_date + INTERVAL '14 days',
        30,
        45000,
        120000,
        165000,
        'manager_review',
        '[]'::jsonb,
        '[]'::jsonb
      )
      RETURNING id
      `,
      [tenantId, target.id]
    );
    terminationId = inserted.rows[0].id;
  }

  const existingCheck = await query(
    'SELECT id FROM background_checks WHERE employee_id = $1 LIMIT 1',
    [target.id]
  );

  if (!existingCheck.rows.length) {
    await query(
      `
      INSERT INTO background_checks (
        tenant_id,
        employee_id,
        type,
        status,
        consent_snapshot,
        request_payload,
        initiated_by
      )
      VALUES (
        $1,
        $2,
        'prehire',
        'in_progress',
        $3,
        $4,
        NULL
      )
      `,
      [
        tenantId,
        target.id,
        JSON.stringify({
          text: 'Demo consent for verification',
          captured: new Date().toISOString(),
        }),
        JSON.stringify({ identity: true, employment: true }),
      ]
    );
  }

  const existingRehire = await query(
    'SELECT id FROM rehire_requests WHERE ex_employee_id = $1 LIMIT 1',
    [target.id]
  );

  if (!existingRehire.rows.length) {
    await query(
      `
      INSERT INTO rehire_requests (
        tenant_id,
        ex_employee_id,
        requested_by,
        requested_start_date,
        prior_termination_id,
        eligibility_status,
        eligibility_reason,
        status,
        rehire_policy_snapshot
      )
      VALUES (
        $1,
        $2,
        NULL,
        current_date + INTERVAL '45 days',
        $3,
        'eligible',
        NULL,
        'awaiting_checks',
        $4
      )
      `,
      [
        tenantId,
        target.id,
        terminationId,
        JSON.stringify({ cool_off_days: process.env.REHIRE_COOLOFF_DAYS || 90 }),
      ]
    );
  }

  console.log('✅ Seeded demo termination, rehire, and background check data.');
};

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed', err);
    process.exit(1);
  });

