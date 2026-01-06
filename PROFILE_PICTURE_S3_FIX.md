# Profile Picture S3 URL Fix

## Problem
Profile pictures were failing to load because presigned URLs were being generated with MinIO endpoint (`http://localhost:9000`) instead of AWS S3, even though AWS S3 was configured.

## Root Cause
The storage service detection logic was not properly prioritizing AWS S3 over MinIO when both `AWS_S3_ENDPOINT` and `MINIO_ENDPOINT` were set in `.env`. The presigned URL generation was using MinIO's public endpoint instead of AWS S3.

## Fix Applied

### 1. Improved AWS S3 Detection
- Changed detection logic to explicitly check for `AWS_S3_ENDPOINT` first
- Added explicit check: if `AWS_S3_ENDPOINT` is set, always use AWS S3
- Improved condition: `isAWS = awsEndpoint !== undefined || ...`

### 2. Fixed Presigned URL Generation
- For AWS S3: Always use the same S3 client for presigned URLs (no separate public endpoint)
- For MinIO: Only use separate public client if public endpoint differs from internal endpoint
- Added explicit check to ensure AWS S3 never uses MinIO's `MINIO_PUBLIC_URL`

### 3. Enhanced Logging
- Added logging to show which endpoint is being used for AWS S3
- Added logging to show which client is being used for presigned URLs

## Files Modified
- `server/services/storage.js`

## Next Steps
1. Restart the backend server to apply the changes
2. Verify in backend logs that AWS S3 is detected correctly
3. Test profile picture upload and viewing
4. Verify presigned URLs point to AWS S3, not MinIO

## Expected Backend Logs
After restart, you should see:
```
[storage] Detected AWS S3 configuration (region: ap-south-1)
[storage] Using AWS S3 endpoint: https://s3.ap-south-1.amazonaws.com
[storage] ✅ Initialized S3 client for https://s3.ap-south-1.amazonaws.com with bucket hr-docs
[storage] Using AWS S3 client for presigned URLs
```

## Testing
1. Upload a new profile picture
2. Check the presigned URL in the browser network tab
3. Verify the URL points to AWS S3 (should contain `amazonaws.com` or `s3.ap-south-1.amazonaws.com`)
4. Verify the image loads correctly

