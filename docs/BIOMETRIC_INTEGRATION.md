# Biometric Device Integration

This integration syncs attendance punches from biometric devices (e.g., ZKTeco) to the HR system's attendance tables.

## Overview

The system:
1. Fetches all punches from the biometric device
2. Maps device user codes to employee IDs
3. Groups punches by employee and date
4. Determines clock_in (first punch) and clock_out (last punch) for each day
5. Updates `attendance_events` and `clock_punch_sessions` tables

## Setup

### 1. Install Dependencies

Install a ZKTeco library package. The service supports multiple packages:

```bash
# Option 1: node-zklib (if available)
npm install node-zklib

# Option 2: zkteco
npm install zkteco

# Option 3: zk-lib
npm install zk-lib

# Option 4: node-zkteco
npm install node-zkteco
```

**Note:** The exact package name depends on which ZKTeco library is available for your device model. Check npm for packages compatible with your specific device. If none are available, you can implement a custom connector in `getPunchesFromDevice()` function.

### 2. Run Migration

Run the migration to create the `biometric_employee_map` table:

```bash
# The migration file is at: server/db/migrations/20251126_biometric_employee_mapping.sql
```

### 3. Configure Environment Variables

Add these to your `.env` file:

```env
# Biometric Device Configuration
BIOMETRIC_DEVICE_IP=192.168.1.50
BIOMETRIC_DEVICE_PORT=4370
BIOMETRIC_DEVICE_TIMEOUT=10000
BIOMETRIC_SYNC_INTERVAL_MS=60000  # Sync every 60 seconds (1 minute)
```

### 4. Map Employees to Device Codes

Use the API to create mappings between device user codes and employee IDs:

```bash
POST /api/biometric/mappings
Authorization: Bearer <token>
Content-Type: application/json

{
  "device_user_code": "001",  # Code in the biometric device
  "employee_id": "uuid-of-employee",
  "device_id": "DEVICE-001"   # Optional: identifier for the device
}
```

## Usage

### Manual Sync

Trigger a sync manually via API:

```bash
POST /api/biometric/sync
Authorization: Bearer <token>
```

### Automatic Sync Service

To run the sync service continuously, you can:

1. **Run as a standalone service:**
   ```bash
   node server/services/biometric-sync.js
   ```

2. **Or integrate into your cron jobs:**
   ```javascript
   import { runBiometricSync } from './services/biometric-sync.js';
   
   // Run every 5 minutes
   setInterval(runBiometricSync, 5 * 60 * 1000);
   ```

## API Endpoints

### Get Mappings
```
GET /api/biometric/mappings
```
Returns all employee-device mappings for the current organization.

### Create Mapping
```
POST /api/biometric/mappings
Body: {
  "device_user_code": "001",
  "employee_id": "uuid",
  "device_id": "optional-device-id"
}
```

### Update Mapping
```
PATCH /api/biometric/mappings/:id
Body: {
  "device_user_code": "001",  // optional
  "employee_id": "uuid",      // optional
  "device_id": "device-id",   // optional
  "is_active": true           // optional
}
```

### Delete Mapping
```
DELETE /api/biometric/mappings/:id
```

### Trigger Sync
```
POST /api/biometric/sync
```
Manually triggers a sync cycle.

## How It Works

1. **Fetch Punches**: Connects to the biometric device and retrieves all attendance logs
2. **Map Users**: Looks up device user codes in `biometric_employee_map` to find corresponding employee IDs
3. **Group by Day**: Groups punches by employee and date
4. **Determine Clock In/Out**:
   - First punch of the day → `clock_in`
   - Last punch of the day → `clock_out`
   - If only one punch exists, it's treated as `clock_in` only
5. **Update Database**:
   - Creates/updates `attendance_events` (IN and OUT events)
   - Creates/updates `clock_punch_sessions` with the calculated times

## Data Flow

```
Biometric Device
    ↓
[Fetch Punches]
    ↓
[Map User Codes → Employee IDs]
    ↓
[Group by Employee + Date]
    ↓
[Calculate clock_in (first) / clock_out (last)]
    ↓
attendance_events table
clock_punch_sessions table
```

## Notes

- The system handles multiple punches per day (takes first as IN, last as OUT)
- If an employee has only one punch, it's recorded as clock_in only
- Existing attendance records are updated if new punches are earlier (IN) or later (OUT)
- All events are tagged with `device_id = 'BIOMETRIC:SYNC'` for tracking
- The sync respects tenant isolation (RLS) - each organization only sees their own data

## Troubleshooting

### Device Connection Issues
- Check `BIOMETRIC_DEVICE_IP` and `BIOMETRIC_DEVICE_PORT` are correct
- Ensure the device is on the same network
- Verify device firewall allows connections on the specified port

### Unmapped Users
- Check logs for warnings: `No mapping for device user code: XXX`
- Create mappings via the API for any unmapped users

### Sync Not Running
- Check `BIOMETRIC_SYNC_INTERVAL_MS` is set correctly
- Verify the service is running (check process logs)

