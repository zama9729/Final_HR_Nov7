import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DRIVER = (process.env.DOCS_STORAGE_DRIVER || (process.env.MINIO_ENABLED === 'true' ? 's3' : 'local')).toLowerCase();
const LOCAL_DIR = path.resolve(
  process.env.ONBOARDING_DOCS_DIR ||
    path.join(process.cwd(), 'uploads', 'onboarding-documents')
);

fs.mkdirSync(LOCAL_DIR, { recursive: true });

let s3Client = null;
const S3_BUCKET = process.env.DOCS_STORAGE_BUCKET || process.env.MINIO_BUCKET || 'hr-docs';

// Initialize S3 client for MinIO or AWS S3
if (DRIVER === 's3' || process.env.MINIO_ENABLED === 'true') {
  const endpoint = process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT;
  const accessKeyId = process.env.MINIO_ROOT_USER || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MINIO_ROOT_PASSWORD || process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!S3_BUCKET) {
    console.warn(
      '[storage] DOCS_STORAGE_BUCKET/MINIO_BUCKET missing, falling back to local storage'
    );
  } else if (endpoint && accessKeyId && secretAccessKey) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
    console.log(`[storage] Initialized S3 client for ${endpoint} with bucket ${S3_BUCKET}`);
  } else {
    console.warn('[storage] Missing MinIO/S3 credentials, falling back to local storage');
  }
}

const usingS3 = DRIVER === 's3' && s3Client && S3_BUCKET;

export function getStorageProvider() {
  return usingS3 ? 's3' : 'local';
}

export async function saveDocumentBuffer({
  buffer,
  mimeType,
  extension,
  originalName,
  tenantId,
}) {
  const safeExt = extension?.startsWith('.') ? extension : `.${extension || 'bin'}`;
  const keyPrefix = tenantId ? `tenants/${tenantId}` : 'shared';
  const fileName = `${crypto.randomUUID()}${safeExt}`;
  const storageKey = `${keyPrefix}/${fileName}`;

  if (usingS3) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          original_name: originalName || '',
        },
        ServerSideEncryption: process.env.S3_SSE || undefined,
      })
    );

    const publicBase = process.env.DOCS_PUBLIC_BASE_URL || '';
    const url = publicBase
      ? `${publicBase.replace(/\/$/, '')}/${storageKey}`
      : null;

    return {
      storageKey,
      storageProvider: 's3',
      url,
    };
  }

  const targetPath = path.join(LOCAL_DIR, storageKey);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buffer);

  return {
    storageKey,
    storageProvider: 'local',
    url: null,
  };
}

export async function getDocumentStream(storageKey) {
  if (!storageKey) {
    throw new Error('storageKey required');
  }

  if (usingS3) {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: storageKey,
      })
    );
    return {
      stream: result.Body,
      contentType: result.ContentType || 'application/octet-stream',
    };
  }

  const filePath = path.join(LOCAL_DIR, storageKey);
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found on disk');
  }
  return {
    stream: fs.createReadStream(filePath),
    contentType: undefined,
  };
}

export async function deleteDocument(storageKey) {
  if (!storageKey) return;

  if (usingS3) {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: storageKey,
        })
      );
    } catch (error) {
      console.error('Failed to delete S3 object', error);
    }
    return;
  }

  const filePath = path.join(LOCAL_DIR, storageKey);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath).catch((error) => {
      console.error('Failed to delete local document', error);
    });
  }
}

/**
 * Generate a presigned URL for uploading a file directly to S3/MinIO
 * @param {Object} params - Upload parameters
 * @param {string} params.objectKey - The S3 object key
 * @param {string} params.contentType - MIME type of the file
 * @param {number} params.expiresIn - URL expiration in seconds (default: 300 = 5 minutes)
 * @returns {Promise<string>} Presigned PUT URL
 */
export async function getPresignedPutUrl({ objectKey, contentType, expiresIn = 300 }) {
  if (!usingS3) {
    throw new Error('Presigned URLs require S3/MinIO storage');
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: objectKey,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading a file from S3/MinIO
 * @param {Object} params - Download parameters
 * @param {string} params.objectKey - The S3 object key
 * @param {number} params.expiresIn - URL expiration in seconds (default: 900 = 15 minutes)
 * @returns {Promise<string>} Presigned GET URL
 */
export async function getPresignedGetUrl({ objectKey, expiresIn = 900 }) {
  if (!usingS3) {
    throw new Error('Presigned URLs require S3/MinIO storage');
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: objectKey,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Calculate SHA-256 checksum of a buffer
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<string>} Hex checksum
 */
export async function calculateChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

