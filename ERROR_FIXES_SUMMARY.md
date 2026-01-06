# Backend Error Fixes Summary

## Issues Fixed

### 1. ✅ S3 Configuration Detection
**Problem**: S3 storage was not being detected even though `DOCS_STORAGE_DRIVER=s3` was set in `.env`.

**Root Cause**: The condition in `server/services/storage.js` was checking for `AWS_ACCESS_KEY_ID` OR `DRIVER === 's3'`, but it wasn't explicitly requiring both credentials to be present.

**Fix**: 
- Improved the condition to explicitly check for `DOCS_STORAGE_DRIVER=s3` or both AWS credentials
- Added debug logging (in non-production) to help diagnose S3 configuration issues
- Changed condition from `if (DRIVER === 's3' || process.env.MINIO_ENABLED === 'true' || process.env.AWS_ACCESS_KEY_ID)` to `if (shouldUseS3)` where `shouldUseS3` checks for both credentials when using AWS

**File**: `server/services/storage.js`

### 2. ✅ Auto Clock-Out capture_method Constraint Violation
**Problem**: Auto clock-out was trying to insert `capture_method = 'auto'`, but the database constraint only allows `('geo', 'manual', 'kiosk', 'unknown')`.

**Error**: 
```
new row for relation "attendance_events" violates check constraint "attendance_events_capture_method_check"
```

**Fix**: Changed `capture_method` from `'auto'` to `'unknown'` in the auto clock-out INSERT statement, since auto clock-out is a system action and `'unknown'` is the appropriate value for system-generated events.

**File**: `server/services/auto-clockout.js` (line 92)

### 3. ✅ audit_logs Table org_id Column Missing
**Problem**: The `audit_logs` table creation was failing because the index was being created before ensuring the `org_id` column exists.

**Error**:
```
Error creating audit_logs table: error: column "org_id" does not exist
```

**Fix**: 
- Added a check to ensure the `org_id` column exists before creating indexes
- Added a migration step to add the `org_id` column if the table exists without it
- Wrapped index creation in a conditional check to only create indexes if the column exists

**File**: `server/utils/auditLog.js`

### 4. ✅ ensureManagerRoles SQL Query Error
**Problem**: The SQL query had an invalid reference to the `ur` table alias in the FROM clause.

**Error**:
```
ensureManagerRoles error: error: invalid reference to FROM-clause entry for table "ur"
```

**Fix**: Added an `EXISTS` clause to properly reference the `mgrs` CTE and ensure the join condition is correct.

**File**: `server/utils/ensureManagerRoles.js`

## Testing

After these fixes, restart the backend server and verify:

1. **S3 Configuration**: Check backend logs for:
   ```
   [storage] Detected AWS S3 configuration (region: ap-south-1)
   [storage] ✅ Initialized S3 client for s3.ap-south-1.amazonaws.com (AWS S3) with bucket hr-docs
   ✅ S3 bucket 'hr-docs' is ready
   ```

2. **Auto Clock-Out**: The auto clock-out cron job should no longer show constraint violation errors.

3. **audit_logs**: The table should be created successfully without errors.

4. **Manager Roles**: The `ensureManagerRoles` function should complete without SQL errors.

## Next Steps

1. Restart the backend server to apply these fixes
2. Monitor the logs for the S3 initialization messages
3. Verify that auto clock-out works correctly (check for absence of constraint errors)
4. Test profile picture uploads to confirm S3 is working

---

**All fixes have been applied. Please restart the backend server to see the changes take effect.**

