/**
 * Integration tests for document upload flow with MinIO
 * 
 * Run with: npm test
 * Or: node server/tests/document-upload.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { query } from '../db/pool.js';

// Mock MinIO client for testing
const TEST_MINIO_ENDPOINT = process.env.TEST_MINIO_ENDPOINT || 'http://localhost:9000';
const TEST_BUCKET = 'test-hr-docs';
const TEST_ACCESS_KEY = process.env.MINIO_ROOT_USER || 'minioadmin';
const TEST_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || 'minioadmin123';

let testS3Client;
let testUserId;
let testEmployeeId;
let testTenantId;

describe('Document Upload Flow', () => {
  before(async () => {
    // Initialize test S3 client
    testS3Client = new S3Client({
      endpoint: TEST_MINIO_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: TEST_ACCESS_KEY,
        secretAccessKey: TEST_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    // Create test bucket
    try {
      await testS3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
      console.log(`[test] Created test bucket: ${TEST_BUCKET}`);
    } catch (error) {
      if (error.name !== 'BucketAlreadyOwnedByYou') {
        throw error;
      }
    }

    // Create test user and employee (if not exists)
    try {
      const userResult = await query(
        `INSERT INTO profiles (email, password_hash, tenant_id)
         VALUES ('test-upload@example.com', 'hash', (SELECT id FROM organizations LIMIT 1))
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, tenant_id`,
        []
      );
      testUserId = userResult.rows[0]?.id;
      testTenantId = userResult.rows[0]?.tenant_id;

      if (testUserId) {
        const empResult = await query(
          `INSERT INTO employees (user_id, tenant_id, first_name, last_name, email)
           VALUES ($1, $2, 'Test', 'User', 'test-upload@example.com')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [testUserId, testTenantId]
        );
        testEmployeeId = empResult.rows[0]?.id;
      }
    } catch (error) {
      console.warn('[test] Could not create test user:', error.message);
    }
  });

  after(async () => {
    // Cleanup test data
    if (testEmployeeId) {
      await query('DELETE FROM hr_documents WHERE employee_id = $1', [testEmployeeId]);
    }
  });

  it('should generate presigned URL structure', async () => {
    const { getPresignedPutUrl } = await import('../services/storage.js');
    
    const objectKey = `test/${Date.now()}_test.pdf`;
    const url = await getPresignedPutUrl({
      objectKey,
      contentType: 'application/pdf',
      expiresIn: 300,
    });

    assert.ok(url, 'Presigned URL should be generated');
    assert.ok(url.includes(TEST_BUCKET) || url.includes(objectKey), 'URL should contain bucket or key');
  });

  it('should upload file to MinIO and save metadata', async () => {
    if (!testEmployeeId) {
      console.log('[test] Skipping - no test employee');
      return;
    }

    const testContent = Buffer.from('Test document content');
    const objectKey = `employees/${testTenantId}/${testUserId}/${Date.now()}_test.pdf`;

    // Upload to MinIO
    await testS3Client.send(
      new PutObjectCommand({
        Bucket: TEST_BUCKET,
        Key: objectKey,
        Body: testContent,
        ContentType: 'application/pdf',
      })
    );

    // Verify file exists
    const getResult = await testS3Client.send(
      new GetObjectCommand({
        Bucket: TEST_BUCKET,
        Key: objectKey,
      })
    );

    assert.ok(getResult.Body, 'File should exist in MinIO');

    // Save metadata to database
    const checksum = 'test-checksum-123';
    const docResult = await query(
      `INSERT INTO hr_documents (
        employee_id, object_key, filename, content_type, size_bytes,
        uploaded_by, checksum, verification_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id`,
      [testEmployeeId, objectKey, 'test.pdf', 'application/pdf', testContent.length, testUserId, checksum]
    );

    assert.ok(docResult.rows[0]?.id, 'Document metadata should be saved');
  });

  it('should list documents for employee', async () => {
    if (!testEmployeeId) {
      console.log('[test] Skipping - no test employee');
      return;
    }

    const result = await query(
      `SELECT id, object_key, filename, verification_status
       FROM hr_documents
       WHERE employee_id = $1
       ORDER BY uploaded_at DESC
       LIMIT 10`,
      [testEmployeeId]
    );

    assert.ok(Array.isArray(result.rows), 'Should return array of documents');
  });

  it('should update verification status', async () => {
    if (!testEmployeeId) {
      console.log('[test] Skipping - no test employee');
      return;
    }

    // Get a document
    const docResult = await query(
      'SELECT id FROM hr_documents WHERE employee_id = $1 LIMIT 1',
      [testEmployeeId]
    );

    if (docResult.rows.length === 0) {
      console.log('[test] Skipping - no documents to verify');
      return;
    }

    const docId = docResult.rows[0].id;

    // Update verification status
    await query(
      `UPDATE hr_documents
       SET verification_status = $1, verified = $2, verified_by = $3, verified_at = now()
       WHERE id = $4`,
      ['approved', true, testUserId, docId]
    );

    // Verify update
    const verifyResult = await query(
      'SELECT verification_status, verified FROM hr_documents WHERE id = $1',
      [docId]
    );

    assert.strictEqual(verifyResult.rows[0].verification_status, 'approved');
    assert.strictEqual(verifyResult.rows[0].verified, true);
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  import('node:test').then(({ run }) => {
    run();
  });
}

