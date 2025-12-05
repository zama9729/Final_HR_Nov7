# MinIO Setup Guide

This guide will help you configure MinIO for document storage in the HR Suite application.

## Quick Setup

### 1. Environment Variables

Add these to your `.env` file:

```bash
# MinIO Configuration
MINIO_ENABLED=true
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET_ONBOARDING=hr-onboarding-docs
MINIO_REGION=us-east-1
MINIO_USE_SSL=false
MINIO_PUBLIC_URL=http://localhost:9000
```

**Note for Docker:**
- If running in Docker, use `MINIO_ENDPOINT=minio` (Docker service name)
- If accessing from host machine, use `MINIO_ENDPOINT=localhost`

### 2. Start MinIO

If using Docker Compose:
```bash
docker-compose up -d minio
```

Or start MinIO manually:
```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  minio/minio server /data --console-address ":9001"
```

### 3. Initialize Buckets

Buckets are automatically created when the server starts. However, you can also initialize them manually:

```bash
# Using the initialization script
node server/scripts/init-minio.js
```

Or restart your server - buckets will be created automatically on startup.

### 4. Verify Setup

1. **Check MinIO Console**: http://localhost:9001
   - Login with: `minioadmin` / `minioadmin123`
   - You should see the `hr-onboarding-docs` bucket

2. **Check Server Logs**: Look for:
   ```
   [storage] ✅ Successfully created bucket 'hr-onboarding-docs'
   ```
   or
   ```
   [storage] ✅ Bucket 'hr-onboarding-docs' already exists
   ```

## Troubleshooting

### Bucket Not Created

**Issue**: Bucket doesn't appear in MinIO console

**Solutions**:
1. Check MinIO is running: `docker-compose ps minio`
2. Check MinIO logs: `docker-compose logs minio`
3. Verify environment variables are set correctly
4. Run the initialization script: `node server/scripts/init-minio.js`
5. Check server logs for error messages

### Connection Errors

**Issue**: "Failed to connect to MinIO" or "Invalid credentials"

**Solutions**:
1. Verify `MINIO_ENDPOINT` matches your setup:
   - Docker: `minio` (service name)
   - Local: `localhost`
2. Check credentials match MinIO root user/password
3. Ensure MinIO is accessible from the API server
4. Test connection: `curl http://localhost:9000/minio/health/live`

### Environment Variable Issues

**Issue**: "Missing MinIO/S3 credentials"

**Solutions**:
1. Ensure `.env` file exists in the project root
2. Check variable names match exactly (case-sensitive)
3. Restart the server after changing `.env`
4. For Docker, ensure variables are in `docker-compose.yml` or `.env`

## Manual Bucket Creation

If automatic creation fails, create the bucket manually:

### Using MinIO Console:
1. Go to http://localhost:9001
2. Login with your credentials
3. Click "Create Bucket"
4. Name: `hr-onboarding-docs`
5. Click "Create Bucket"

### Using MinIO Client (mc):
```bash
# Install mc: https://min.io/docs/minio/linux/reference/minio-mc.html

# Set alias
mc alias set local http://localhost:9000 minioadmin minioadmin123

# Create bucket
mc mb local/hr-onboarding-docs
```

## Testing

After setup, test document upload:
1. Go to the onboarding page
2. Try uploading a document
3. Check MinIO console - file should appear in the bucket
4. Check server logs for any errors

## Production Considerations

For production:
1. Change default credentials
2. Enable SSL/TLS
3. Set up bucket policies for access control
4. Configure backup/retention policies
5. Monitor bucket usage and storage

