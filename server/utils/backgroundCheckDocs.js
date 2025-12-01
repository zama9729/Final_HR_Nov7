import { query } from '../db/pool.js';

const BACKGROUND_DOC_TYPES = [
  'RESUME',
  'ID_PROOF',
  'PAN',
  'AADHAAR',
  'PASSPORT',
  'EDUCATION_CERT',
  'EXPERIENCE_LETTER',
  'ADDRESS_PROOF',
  'BANK_STATEMENT',
  'SIGNED_CONTRACT',
  'BG_CHECK_DOC',
];

export async function linkDocumentsToBackgroundCheck(backgroundCheckId, employeeId) {
  if (!backgroundCheckId || !employeeId) return 0;

  const { rowCount } = await query(
    `
    INSERT INTO background_check_documents (
      background_check_id,
      document_id,
      onboarding_document_id,
      is_required,
      verification_status,
      decision,
      created_at,
      updated_at
    )
    SELECT
      $1,
      d.id,
      d.id,
      COALESCE(d.is_required, true),
      'PENDING',
      'pending',
      now(),
      now()
    FROM onboarding_documents d
    WHERE (d.employee_id = $2 OR d.candidate_id = $2)
      AND UPPER(d.document_type) = ANY($3::text[])
      AND NOT EXISTS (
        SELECT 1
        FROM background_check_documents bcd
        WHERE bcd.background_check_id = $1
          AND bcd.document_id = d.id
      )
    RETURNING document_id
    `,
    [backgroundCheckId, employeeId, BACKGROUND_DOC_TYPES]
  ).catch((error) => {
    console.error('Failed to link background documents:', error.message);
    return { rowCount: 0 };
  });

  return rowCount || 0;
}

