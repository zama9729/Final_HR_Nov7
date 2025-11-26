/**
 * Biometric Device Sync Service
 * 
 * Syncs punches from biometric devices (e.g., ZKTeco) to the attendance system.
 * Maps device user codes to employees and creates attendance_events and clock_punch_sessions.
 * 
 * Usage:
 *   - Run as a cron job or scheduled service
 *   - Fetches all punches from device
 *   - Groups by employee and date
 *   - First punch = clock_in, last punch = clock_out
 *   - Updates attendance_events and clock_punch_sessions tables
 */

import { query, queryWithOrg } from '../db/pool.js';

const DEVICE_IP = process.env.BIOMETRIC_DEVICE_IP || '192.168.1.50';
const DEVICE_PORT = Number(process.env.BIOMETRIC_DEVICE_PORT || 4370);
const SYNC_INTERVAL_MS = Number(process.env.BIOMETRIC_SYNC_INTERVAL_MS || 60_000); // Default: 1 minute
const DEVICE_TIMEOUT = Number(process.env.BIOMETRIC_DEVICE_TIMEOUT || 10000);

/**
 * Fetch all punches from the biometric device
 * Supports multiple ZKTeco library packages
 * @returns {Promise<Array<{userCode: string, punchTime: Date}>>}
 */
async function getPunchesFromDevice() {
  // Try to import common ZKTeco libraries
  let ZKLib = null;
  const possiblePackages = ['node-zklib', 'zkteco', 'zk-lib', 'node-zkteco'];
  
  for (const pkg of possiblePackages) {
    try {
      const zklibModule = await import(pkg);
      ZKLib = zklibModule.default || zklibModule.ZKLib || zklibModule;
      console.log(`[BiometricSync] Using package: ${pkg}`);
      break;
    } catch (err) {
      // Try next package
      continue;
    }
  }

  if (!ZKLib) {
    console.error('[BiometricSync] No ZKTeco library found. Please install one of:');
    console.error('  npm install node-zklib');
    console.error('  npm install zkteco');
    console.error('  npm install zk-lib');
    console.error('Or implement a custom device connector.');
    return [];
  }

  let zk = null;
  try {
    zk = new ZKLib(DEVICE_IP, DEVICE_PORT, DEVICE_TIMEOUT, 5200);
    await zk.createSocket();
    console.log(`[BiometricSync] Connected to device ${DEVICE_IP}:${DEVICE_PORT}`);

    const logs = await zk.getAttendances();
    console.log(`[BiometricSync] Fetched ${logs.length} punches from device`);

    // Normalize into simple structure
    const punches = logs.map((log) => {
      const userCode = String(log.deviceUserId || log.userId || log.uid || '');
      const punchTime = new Date(log.timestamp || log.attTime);
      
      return {
        userCode,
        punchTime,
      };
    });

    return punches;
  } catch (err) {
    console.error('[BiometricSync] Error talking to device:', err.message);
    return [];
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}

/**
 * Convert date to YYYY-MM-DD string
 */
function toDateString(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Get employee mappings for all tenants or a specific tenant
 * @param {string|null} tenantId - Optional tenant ID to filter
 * @returns {Promise<Map<string, {employeeId: string, tenantId: string}>>}
 */
async function getEmployeeMappings(tenantId = null) {
  let queryText = `
    SELECT device_user_code, employee_id, tenant_id
    FROM biometric_employee_map
    WHERE is_active = true
  `;
  const params = [];

  if (tenantId) {
    queryText += ' AND tenant_id = $1';
    params.push(tenantId);
  }

  const { rows } = await query(queryText, params);
  
  // Map: device_user_code -> {employeeId, tenantId}
  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row.device_user_code), {
      employeeId: row.employee_id,
      tenantId: row.tenant_id,
    });
  });

  return map;
}

/**
 * Process punches and update attendance system
 * @param {Array<{userCode: string, punchTime: Date}>} punches
 */
async function processPunchesAndUpdateAttendance(punches) {
  if (!punches.length) {
    console.log('[BiometricSync] No punches to process');
    return;
  }

  // 1) Get all employee mappings
  const mapUserToEmployee = await getEmployeeMappings();
  
  if (mapUserToEmployee.size === 0) {
    console.warn('[BiometricSync] No employee mappings found. Please configure biometric_employee_map table.');
    return;
  }

  // 2) Group punches by tenant + employee_id + date
  const grouped = new Map(); // key: `${tenantId}_${employeeId}_${date}`

  for (const p of punches) {
    const mapping = mapUserToEmployee.get(p.userCode);
    if (!mapping) {
      // Unmapped user code – log but continue
      console.warn(`[BiometricSync] No mapping for device user code: ${p.userCode}`);
      continue;
    }

    const dateStr = toDateString(p.punchTime);
    const key = `${mapping.tenantId}_${mapping.employeeId}_${dateStr}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        tenantId: mapping.tenantId,
        employeeId: mapping.employeeId,
        date: dateStr,
        punches: [],
      });
    }
    grouped.get(key).punches.push(p);
  }

  console.log(`[BiometricSync] Processing ${grouped.size} employee-day combinations`);

  // 3) For each employee+day, calculate clock_in / clock_out and update DB
  for (const [key, group] of grouped) {
    const { tenantId, employeeId, date, punches } = group;

    // Sort punches by time
    punches.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());

    const clockIn = punches[0].punchTime;
    const clockOut = punches.length > 1 ? punches[punches.length - 1].punchTime : null;

    let totalMinutes = null;
    if (clockOut) {
      const diffMs = clockOut.getTime() - clockIn.getTime();
      totalMinutes = Math.floor(diffMs / 60000);
    }

    try {
      // Use queryWithOrg for RLS context
      await processEmployeeDayAttendance(tenantId, employeeId, date, clockIn, clockOut, totalMinutes);
      
      console.log(
        `[BiometricSync] Updated attendance for emp=${employeeId}, date=${date}, in=${clockIn.toISOString()}, out=${clockOut ? clockOut.toISOString() : 'null'}`
      );
    } catch (err) {
      console.error(`[BiometricSync] Error updating attendance for ${key}:`, err.message);
    }
  }
}

/**
 * Process attendance for a single employee-day combination
 * Creates/updates attendance_events and clock_punch_sessions
 */
async function processEmployeeDayAttendance(tenantId, employeeId, date, clockIn, clockOut, totalMinutes) {
  // Check if we already have events for this day
  const existingEvents = await queryWithOrg(
    `SELECT id, event_type, raw_timestamp
     FROM attendance_events
     WHERE tenant_id = $1 
       AND employee_id = $2 
       AND DATE(raw_timestamp) = $3
       AND device_id LIKE 'BIOMETRIC:%'
     ORDER BY raw_timestamp ASC`,
    [tenantId, employeeId, date],
    tenantId
  );

  const existingIn = existingEvents.rows.find(e => e.event_type === 'IN');
  const existingOut = existingEvents.rows.find(e => e.event_type === 'OUT');

  // Create or update IN event
  let inEventId = existingIn?.id;
  if (!inEventId) {
    const inEventResult = await queryWithOrg(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id, metadata, created_by
      ) VALUES ($1, $2, $3, 'IN', 'BIOMETRIC:SYNC', $4::jsonb, NULL)
      RETURNING id`,
      [
        tenantId,
        employeeId,
        clockIn,
        JSON.stringify({ source: 'biometric_sync', sync_time: new Date().toISOString() }),
      ],
      tenantId
    );
    inEventId = inEventResult.rows[0].id;
  } else {
    // Update existing IN event if clock_in is earlier
    await queryWithOrg(
      `UPDATE attendance_events
       SET raw_timestamp = LEAST(raw_timestamp, $1)
       WHERE id = $2`,
      [clockIn, inEventId],
      tenantId
    );
  }

  // Create or update OUT event
  let outEventId = existingOut?.id;
  if (clockOut) {
    if (!outEventId) {
      const outEventResult = await queryWithOrg(
        `INSERT INTO attendance_events (
          tenant_id, employee_id, raw_timestamp, event_type, device_id, metadata, created_by
        ) VALUES ($1, $2, $3, 'OUT', 'BIOMETRIC:SYNC', $4::jsonb, NULL)
        RETURNING id`,
        [
          tenantId,
          employeeId,
          clockOut,
          JSON.stringify({ source: 'biometric_sync', sync_time: new Date().toISOString() }),
        ],
        tenantId
      );
      outEventId = outEventResult.rows[0].id;
    } else {
      // Update existing OUT event if clock_out is later
      await queryWithOrg(
        `UPDATE attendance_events
         SET raw_timestamp = GREATEST(raw_timestamp, $1)
         WHERE id = $2`,
        [clockOut, outEventId],
        tenantId
      );
    }
  }

  // Update or create clock_punch_sessions
  const sessionResult = await queryWithOrg(
    `SELECT id FROM clock_punch_sessions
     WHERE tenant_id = $1 
       AND employee_id = $2 
       AND DATE(clock_in_at) = $3
     LIMIT 1`,
    [tenantId, employeeId, date],
    tenantId
  );

  if (sessionResult.rows.length > 0) {
    // Update existing session
    const sessionId = sessionResult.rows[0].id;
    await queryWithOrg(
      `UPDATE clock_punch_sessions
       SET 
         in_event_id = $1,
         out_event_id = $2,
         clock_in_at = LEAST(clock_in_at, $3),
         clock_out_at = CASE
           WHEN $4 IS NOT NULL THEN GREATEST(COALESCE(clock_out_at, $4), $4)
           ELSE clock_out_at
         END,
         duration_minutes = CASE
           WHEN $4 IS NOT NULL AND $5 IS NOT NULL THEN $5
           ELSE duration_minutes
         END,
         device_in = 'BIOMETRIC:SYNC',
         device_out = CASE WHEN $4 IS NOT NULL THEN 'BIOMETRIC:SYNC' ELSE device_out END,
         updated_at = now()
       WHERE id = $6`,
      [inEventId, outEventId, clockIn, clockOut, totalMinutes, sessionId],
      tenantId
    );
  } else {
    // Create new session
    await queryWithOrg(
      `INSERT INTO clock_punch_sessions (
        tenant_id, employee_id, in_event_id, out_event_id,
        clock_in_at, clock_out_at, duration_minutes,
        device_in, device_out, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        tenantId,
        employeeId,
        inEventId,
        outEventId,
        clockIn,
        clockOut,
        totalMinutes,
        'BIOMETRIC:SYNC',
        clockOut ? 'BIOMETRIC:SYNC' : null,
        JSON.stringify({ source: 'biometric_sync', sync_time: new Date().toISOString() }),
      ],
      tenantId
    );
  }
}

/**
 * Run a single sync cycle
 */
export async function runBiometricSync() {
  try {
    console.log('[BiometricSync] Starting sync cycle...');
    const punches = await getPunchesFromDevice();
    await processPunchesAndUpdateAttendance(punches);
    console.log('[BiometricSync] Sync cycle completed');
  } catch (err) {
    console.error('[BiometricSync] Fatal error in sync cycle:', err);
    throw err;
  }
}

/**
 * Start the sync service (runs continuously)
 */
export async function startBiometricSyncService() {
  console.log(`[BiometricSync] Starting service (device: ${DEVICE_IP}:${DEVICE_PORT}, interval: ${SYNC_INTERVAL_MS}ms)`);
  
  // Run immediately
  await runBiometricSync();
  
  // Then run on interval
  const intervalId = setInterval(async () => {
    try {
      await runBiometricSync();
    } catch (err) {
      console.error('[BiometricSync] Error in scheduled sync:', err);
    }
  }, SYNC_INTERVAL_MS);

  // Return function to stop the service
  return () => {
    clearInterval(intervalId);
    console.log('[BiometricSync] Service stopped');
  };
}

// If run directly (not imported), start the service
if (import.meta.url === `file://${process.argv[1]}`) {
  startBiometricSyncService().catch((err) => {
    console.error('[BiometricSync] Fatal error:', err);
    process.exit(1);
  });
}

