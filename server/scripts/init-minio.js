/**
 * S3 Bucket Initialization Script (Supports both MinIO and AWS S3)
 * 
 * MIGRATION NOTE: This script now supports both MinIO and AWS S3.
 * It automatically detects which storage backend is configured and initializes buckets accordingly.
 * 
 * This script ensures that all required S3 buckets are created.
 * Run this after starting MinIO or configuring AWS S3 to initialize buckets.
 * 
 * Usage: node server/scripts/init-minio.js
 */

import dotenv from 'dotenv';
import { ensureBucketExists, getStorageProvider, getOnboardingBucket, isS3Available } from '../services/storage.js';

dotenv.config();

async function initializeS3() {
  console.log('🔧 Initializing S3 buckets (MinIO or AWS S3)...\n');

  const storageProvider = getStorageProvider();
  
  if (storageProvider !== 's3') {
    console.error('❌ S3 storage is not configured or not available.');
    console.log('\n📋 Required environment variables for AWS S3:');
    console.log('   AWS_ACCESS_KEY_ID=your-access-key');
    console.log('   AWS_SECRET_ACCESS_KEY=your-secret-key');
    console.log('   AWS_REGION=us-east-1 (or your preferred region)');
    console.log('   MINIO_BUCKET_ONBOARDING=hr-onboarding-docs (or DOCS_STORAGE_BUCKET)');
    console.log('\n📋 Or for MinIO:');
    console.log('   MINIO_ENABLED=true');
    console.log('   MINIO_ENDPOINT=localhost (or minio for Docker)');
    console.log('   MINIO_PORT=9000');
    console.log('   MINIO_ACCESS_KEY=minioadmin (or MINIO_ROOT_USER)');
    console.log('   MINIO_SECRET_KEY=minioadmin123 (or MINIO_ROOT_PASSWORD)');
    console.log('   MINIO_BUCKET_ONBOARDING=hr-onboarding-docs');
    console.log('\n💡 Make sure your S3 service (MinIO or AWS S3) is running and accessible.');
    process.exit(1);
  }

  if (!isS3Available()) {
    console.error('❌ S3 client is not available. Check your S3 configuration.');
    process.exit(1);
  }

  // Detect if using AWS S3 or MinIO
  const customEndpoint = process.env.AWS_S3_ENDPOINT || process.env.MINIO_ENDPOINT;
  const isAWS = !customEndpoint || 
                customEndpoint.includes('amazonaws.com') || 
                customEndpoint.includes('s3.') ||
                (process.env.AWS_ACCESS_KEY_ID && !process.env.MINIO_ENABLED);

  try {
    const bucketName = getOnboardingBucket();
    console.log(`📦 Checking/creating bucket: ${bucketName}`);
    await ensureBucketExists(bucketName);
    console.log(`✅ Bucket '${bucketName}' is ready!\n`);
    
    if (isAWS) {
      console.log('✅ AWS S3 initialization complete!');
      console.log(`\n📝 Bucket: ${bucketName}`);
      console.log(`   Region: ${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'}`);
      console.log(`\n💡 Note: For AWS S3, ensure your IAM user/role has the following permissions:`);
      console.log(`   - s3:CreateBucket (if bucket doesn't exist)`);
      console.log(`   - s3:PutObject`);
      console.log(`   - s3:GetObject`);
      console.log(`   - s3:DeleteObject`);
      console.log(`   - s3:ListBucket`);
    } else {
      console.log('✅ MinIO initialization complete!');
      console.log(`\n📝 You can now access MinIO Console at:`);
      console.log(`   http://localhost:9001`);
      console.log(`   Username: ${process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minioadmin'}`);
      console.log(`   Password: ${process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minioadmin123'}`);
    }
  } catch (error) {
    console.error('❌ Failed to initialize S3 buckets:', error.message);
    console.error('\n🔍 Troubleshooting:');
    if (isAWS) {
      console.error('   1. Verify AWS credentials are correct');
      console.error('   2. Check IAM permissions for S3 bucket operations');
      console.error('   3. Ensure the bucket exists or you have permission to create it');
      console.error('   4. Verify AWS_REGION matches your bucket region');
      console.error('   5. Test AWS CLI: aws s3 ls');
    } else {
      console.error('   1. Ensure MinIO is running: docker-compose ps minio');
      console.error('   2. Check MinIO logs: docker-compose logs minio');
      console.error('   3. Verify credentials in .env file');
      console.error('   4. Test connection: curl http://localhost:9000/minio/health/live');
    }
    process.exit(1);
  }
}

initializeS3();

