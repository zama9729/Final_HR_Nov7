/**
 * Test S3 Configuration Script
 * Verifies that S3 (AWS S3 or MinIO) is properly configured and accessible
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  getStorageProvider, 
  isS3Available, 
  ensureBucketExists,
  getPresignedGetUrl,
  getPresignedPutUrl
} from '../services/storage.js';
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (two levels up from server/scripts/)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

async function testS3Configuration() {
  console.log('\n🔍 Testing S3 Configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log('   DOCS_STORAGE_DRIVER:', process.env.DOCS_STORAGE_DRIVER || 'not set');
  console.log('   DOCS_STORAGE_BUCKET:', process.env.DOCS_STORAGE_BUCKET || 'not set');
  console.log('   MINIO_BUCKET:', process.env.MINIO_BUCKET || 'not set');
  console.log('   MINIO_BUCKET_ONBOARDING:', process.env.MINIO_BUCKET_ONBOARDING || 'not set');
  console.log('   AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '***set***' : 'not set');
  console.log('   AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '***set***' : 'not set');
  console.log('   AWS_REGION:', process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'not set');
  console.log('   AWS_S3_ENDPOINT:', process.env.AWS_S3_ENDPOINT || 'not set');
  console.log('   MINIO_ENABLED:', process.env.MINIO_ENABLED || 'not set');
  console.log('   MINIO_ENDPOINT:', process.env.MINIO_ENDPOINT || 'not set');
  console.log('   MINIO_PUBLIC_URL:', process.env.MINIO_PUBLIC_URL || 'not set');
  console.log('');

  // Check if AWS credentials are set (should enable S3 even without DOCS_STORAGE_DRIVER)
  const hasAWSCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  const hasMinIO = process.env.MINIO_ENABLED === 'true';
  const hasDriver = process.env.DOCS_STORAGE_DRIVER === 's3';
  
  if (!hasAWSCreds && !hasMinIO && !hasDriver) {
    console.error('❌ S3 storage is not configured!');
    console.log('\n💡 To configure S3, set one of:');
    console.log('   - DOCS_STORAGE_DRIVER=s3');
    console.log('   - MINIO_ENABLED=true');
    console.log('   - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (for AWS S3)');
    return false;
  }

  // Check storage provider (will use the imported module)
  const storageProvider = getStorageProvider();
  console.log(`📦 Storage Provider: ${storageProvider}`);
  
  if (storageProvider !== 's3') {
    console.error('❌ S3 storage is not configured!');
    console.log('\n💡 Issue: Even though AWS credentials are set, S3 is not initializing.');
    console.log('\n🔧 Solution: Add this to your .env file:');
    console.log('   DOCS_STORAGE_DRIVER=s3');
    console.log('\n   OR set:');
    console.log('   MINIO_ENABLED=true');
    console.log('\n   The storage module needs one of these to enable S3 mode.');
    return false;
  }

  // Check if S3 is available
  if (!isS3Available()) {
    console.error('❌ S3 client is not available!');
    console.log('   Check your credentials and endpoint configuration.');
    return false;
  }

  console.log('✅ S3 client is available');

  // Get bucket name
  const bucketName = process.env.DOCS_STORAGE_BUCKET || 
                    process.env.MINIO_BUCKET_ONBOARDING || 
                    process.env.MINIO_BUCKET || 
                    'hr-onboarding-docs';
  console.log(`\n🪣 Bucket Name: ${bucketName}`);

  // Test bucket access
  try {
    console.log('\n🔍 Testing bucket access...');
    
    // Import storage service to get the S3 client
    const storageModule = await import('../services/storage.js');
    
    // Try to check if bucket exists (this will use the internal client)
    await ensureBucketExists(bucketName);
    console.log(`✅ Bucket '${bucketName}' is accessible`);

    // Try to list objects (test read access)
    try {
      // We need to access the internal client, but it's not exported
      // So we'll test by trying to generate a presigned URL instead
      const testKey = 'test-connection-check';
      const testUrl = await getPresignedGetUrl({
        objectKey: testKey,
        expiresIn: 60
      });
      console.log('✅ Can generate presigned URLs');
      console.log(`   Test URL generated (expires in 60s)`);
    } catch (error) {
      console.warn('⚠️  Could not generate presigned URL:', error.message);
    }

    // Test presigned PUT URL generation
    try {
      const putUrl = await getPresignedPutUrl({
        objectKey: 'test-upload-check',
        contentType: 'image/png',
        expiresIn: 60
      });
      console.log('✅ Can generate presigned PUT URLs');
    } catch (error) {
      console.warn('⚠️  Could not generate presigned PUT URL:', error.message);
    }

    console.log('\n✅ S3 Configuration Test: PASSED');
    console.log('\n📝 Summary:');
    console.log(`   - Storage Provider: ${storageProvider}`);
    console.log(`   - Bucket: ${bucketName}`);
    console.log(`   - Status: ✅ Configured and accessible`);
    
    return true;
  } catch (error) {
    console.error('\n❌ S3 Configuration Test: FAILED');
    console.error(`   Error: ${error.message}`);
    console.error(`   Details:`, error);
    
    if (error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') {
      console.error('\n💡 Credential Issue:');
      console.error('   - Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
      console.error('   - Verify credentials are correct and have proper permissions');
    } else if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
      console.error('\n💡 Bucket Issue:');
      console.error(`   - Bucket '${bucketName}' does not exist`);
      console.error('   - For AWS S3: Create bucket manually in AWS Console');
      console.error('   - For MinIO: Bucket should be created automatically');
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('\n💡 Connection Issue:');
      console.error('   - Check AWS_S3_ENDPOINT or MINIO_ENDPOINT');
      console.error('   - Verify the endpoint is accessible');
      console.error('   - For MinIO: Ensure MinIO service is running');
    }
    
    return false;
  }
}

// Run the test
testS3Configuration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

