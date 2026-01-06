# S3 Configuration Status Check

## Current Status: ❌ NOT CONFIGURED

Based on the test results, S3 storage is **not properly configured**.

## Current .env Configuration

From your `.env` file:
- `MINIO_ENABLED=false` ❌ (S3 storage disabled)
- `MINIO_BUCKET_ONBOARDING=docshr` (but MinIO is disabled)
- No `AWS_ACCESS_KEY_ID` set ❌
- No `AWS_SECRET_ACCESS_KEY` set ❌
- No `DOCS_STORAGE_BUCKET` set ❌
- No `AWS_S3_ENDPOINT` set ❌

## Required Configuration for AWS S3

To use AWS S3, add these to your `.env` file:

```env
# AWS S3 Configuration
DOCS_STORAGE_DRIVER=s3
DOCS_STORAGE_BUCKET=hr-docs
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_REGION=ap-south-1
AWS_S3_ENDPOINT=https://s3.ap-south-1.amazonaws.com
AWS_S3_FORCE_PATH_STYLE=false
```

## Required Configuration for MinIO (Local S3)

If you want to use MinIO instead:

```env
# MinIO Configuration
DOCS_STORAGE_DRIVER=s3
MINIO_ENABLED=true
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=hr-docs
DOCS_STORAGE_BUCKET=hr-docs
MINIO_PUBLIC_URL=http://localhost:9000
```

## Quick Fix Steps

1. **Open your `.env` file** in the project root
2. **Add or update** the S3 configuration variables above
3. **Save the file**
4. **Restart your server** to load the new configuration
5. **Run the test script** again:
   ```bash
   cd server
   node scripts/test-s3-config.js
   ```

## Verification

After configuring, you should see:
- ✅ Storage Provider: s3
- ✅ S3 client is available
- ✅ Bucket is accessible
- ✅ Can generate presigned URLs

## Common Issues

1. **Credentials not set**: Make sure `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set
2. **Bucket doesn't exist**: For AWS S3, create the bucket manually in AWS Console
3. **Wrong region**: Ensure `AWS_REGION` matches your S3 bucket's region
4. **Endpoint incorrect**: For AWS S3, use `https://s3.REGION.amazonaws.com`

## Test Your Configuration

Run this command to test:
```bash
cd server
node scripts/test-s3-config.js
```

