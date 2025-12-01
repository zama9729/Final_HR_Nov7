/**
 * MinIO Bucket Initialization Script
 * 
 * This script ensures that all required MinIO buckets are created.
 * Run this after starting MinIO to initialize buckets.
 * 
 * Usage: node server/scripts/init-minio.js
 */

import dotenv from 'dotenv';
import { ensureBucketExists, getStorageProvider, getOnboardingBucket, isS3Available } from '../services/storage.js';

dotenv.config();

async function initializeMinIO() {
  console.log('🔧 Initializing MinIO buckets...\n');

  const storageProvider = getStorageProvider();
  
  if (storageProvider !== 's3') {
    console.error('❌ MinIO/S3 is not configured or not available.');
    console.log('\n📋 Required environment variables:');
    console.log('   MINIO_ENABLED=true');
    console.log('   MINIO_ENDPOINT=localhost (or minio for Docker)');
    console.log('   MINIO_PORT=9000');
    console.log('   MINIO_ACCESS_KEY=minioadmin (or MINIO_ROOT_USER)');
    console.log('   MINIO_SECRET_KEY=minioadmin123 (or MINIO_ROOT_PASSWORD)');
    console.log('   MINIO_BUCKET_ONBOARDING=hr-onboarding-docs');
    console.log('\n💡 Make sure MinIO is running and accessible.');
    process.exit(1);
  }

  if (!isS3Available()) {
    console.error('❌ S3 client is not available. Check your MinIO configuration.');
    process.exit(1);
  }

  try {
    const bucketName = getOnboardingBucket();
    console.log(`📦 Creating bucket: ${bucketName}`);
    await ensureBucketExists(bucketName);
    console.log(`✅ Bucket '${bucketName}' is ready!\n`);
    
    console.log('✅ MinIO initialization complete!');
    console.log(`\n📝 You can now access MinIO Console at:`);
    console.log(`   http://localhost:9001`);
    console.log(`   Username: ${process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minioadmin'}`);
    console.log(`   Password: ${process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minioadmin123'}`);
  } catch (error) {
    console.error('❌ Failed to initialize MinIO buckets:', error.message);
    console.error('\n🔍 Troubleshooting:');
    console.error('   1. Ensure MinIO is running: docker-compose ps minio');
    console.error('   2. Check MinIO logs: docker-compose logs minio');
    console.error('   3. Verify credentials in .env file');
    console.error('   4. Test connection: curl http://localhost:9000/minio/health/live');
    process.exit(1);
  }
}

initializeMinIO();

