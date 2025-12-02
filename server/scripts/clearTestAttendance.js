import { query } from '../db/pool.js';

async function clearAttendanceForDomain(domain) {
  console.log(`🔍 Looking up organization for domain: ${domain}`);
  const orgRes = await query('SELECT id, name, domain FROM organizations WHERE domain = $1', [domain]);
  if (orgRes.rows.length === 0) {
    throw new Error(`No organization found for domain ${domain}`);
  }
  const org = orgRes.rows[0];
  const orgId = org.id;
  console.log(`✅ Found organization "${org.name}" (${orgId})`);

  console.log('🔍 Finding attendance upload ids…');
  const uploadsRes = await query(
    'SELECT id, original_filename, created_at FROM attendance_uploads WHERE tenant_id = $1 ORDER BY created_at DESC',
    [orgId]
  );

  if (uploadsRes.rows.length === 0) {
    console.log('ℹ️ No attendance uploads found for this organization. Nothing to clear.');
    return;
  }

  const uploadIds = uploadsRes.rows.map((r) => r.id);
  console.log(`🧹 Clearing ${uploadIds.length} attendance upload(s) and related rows for org ${orgId}…`);

  await query('BEGIN');
  try {
    // Clear upload rows first (FK to attendance_uploads)
    await query(
      'DELETE FROM attendance_upload_rows WHERE upload_id = ANY($1::uuid[])',
      [uploadIds]
    );

    // Optionally clear timesheet entries that came from uploads for this org
    // (keep this conservative: only entries with source = upload)
    await query(
      `DELETE FROM timesheet_entries 
       WHERE tenant_id = $1 AND source = 'upload'`,
      [orgId]
    );

    // Delete uploads themselves
    await query(
      'DELETE FROM attendance_uploads WHERE tenant_id = $1',
      [orgId]
    );

    await query('COMMIT');
    console.log('✅ Done. All attendance upload data for this organization has been cleared.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Failed to clear attendance data:', err);
    throw err;
  }
}

// Run directly as a script
if (process.argv[1] && process.argv[1].includes('clearTestAttendance.js')) {
  const domain = process.argv[2];
  if (!domain) {
    console.error('Usage: node server/scripts/clearTestAttendance.js <org-domain>');
    process.exit(1);
  }

  clearAttendanceForDomain(domain)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { clearAttendanceForDomain };



