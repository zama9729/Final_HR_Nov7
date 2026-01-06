import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DRIVER = (process.env.DOCS_STORAGE_DRIVER || (process.env.MINIO_ENABLED === 'true' ? 's3' : 'local')).toLowerCase();
const LOCAL_DIR = path.resolve(
  process.env.ONBOARDING_DOCS_DIR ||
    path.join(process.cwd(), 'uploads', 'onboarding-documents')
);

fs.mkdirSync(LOCAL_DIR, { recursive: true });

let s3Client = null;
let s3ClientPublic = null; // Separate client for presigned URLs (uses public URL)
let usingS3 = false; // Declare before initialization to avoid temporal dead zone

// Support both old and new env var names for backward compatibility
// Priority: DOCS_STORAGE_BUCKET (most specific) > MINIO_BUCKET_ONBOARDING > MINIO_BUCKET > default
const S3_BUCKET = process.env.DOCS_STORAGE_BUCKET || 
                  process.env.MINIO_BUCKET_ONBOARDING || 
                  process.env.MINIO_BUCKET || 
                  'hr-onboarding-docs';

// Debug logging for S3 configuration
if (process.env.NODE_ENV !== 'production') {
  console.log(`[storage] DRIVER: ${DRIVER}, DOCS_STORAGE_DRIVER: ${process.env.DOCS_STORAGE_DRIVER || 'not set'}`);
  console.log(`[storage] AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'set' : 'not set'}`);
  console.log(`[storage] AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'set' : 'not set'}`);
  console.log(`[storage] S3_BUCKET: ${S3_BUCKET}`);
}

// Initialize S3 client for MinIO or AWS S3
// MIGRATION NOTE: This code now supports both MinIO and AWS S3 seamlessly.
// It automatically detects which one to use based on environment variables.
// Check explicitly for DOCS_STORAGE_DRIVER=s3 or AWS credentials
const shouldUseS3 = DRIVER === 's3' || 
                    process.env.MINIO_ENABLED === 'true' || 
                    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

if (shouldUseS3) {
  // Support both MinIO and AWS S3 environment variables
  // Priority: AWS S3 vars first (for migration), then MinIO vars (for backward compatibility)
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 
                      process.env.MINIO_ACCESS_KEY || 
                      process.env.MINIO_ROOT_USER;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 
                          process.env.MINIO_SECRET_KEY || 
                          process.env.MINIO_ROOT_PASSWORD;
  const region = process.env.AWS_REGION || 
                 process.env.AWS_DEFAULT_REGION || 
                 process.env.MINIO_REGION || 
                 'us-east-1';
  
  // Detect if this is AWS S3 or MinIO
  // Priority: Check AWS_S3_ENDPOINT first, then MINIO_ENDPOINT
  // AWS S3 indicators: endpoint contains 'amazonaws.com' or 's3.', or AWS credentials are set without MINIO_ENABLED
  const awsEndpoint = process.env.AWS_S3_ENDPOINT;
  const minioEndpoint = process.env.MINIO_ENDPOINT;
  const customEndpoint = awsEndpoint || minioEndpoint;
  
  // Determine if using AWS S3
  const isAWS = awsEndpoint !== undefined || // AWS_S3_ENDPOINT is explicitly set
                (customEndpoint && (customEndpoint.includes('amazonaws.com') || customEndpoint.includes('s3.'))) ||
                (process.env.AWS_ACCESS_KEY_ID && process.env.MINIO_ENABLED !== 'true');
  
  let fullEndpoint = null;
  let publicEndpoint = null;
  let useSSL = false;
  let forcePathStyle = true; // Default to path-style (works for both MinIO and AWS S3)
  
  if (isAWS) {
    // AWS S3 Configuration
    // AWS S3 uses region-based endpoints or custom endpoints without ports
    if (customEndpoint) {
      // Custom endpoint (e.g., for S3-compatible services or custom domains)
      fullEndpoint = customEndpoint;
      if (!fullEndpoint.startsWith('http')) {
        useSSL = process.env.AWS_USE_SSL !== 'false';
        const protocol = useSSL ? 'https' : 'http';
        fullEndpoint = `${protocol}://${fullEndpoint}`;
      } else {
        useSSL = fullEndpoint.startsWith('https');
      }
    } else {
      // Standard AWS S3 endpoint - SDK will construct it automatically
      // We don't set endpoint for standard AWS S3, let the SDK handle it
      fullEndpoint = undefined;
      useSSL = true;
      // AWS S3 can use virtual-hosted style, but path-style is safer and works everywhere
      forcePathStyle = process.env.AWS_FORCE_PATH_STYLE !== 'false';
    }
    // For AWS S3, public endpoint is the same as full endpoint (or undefined for SDK auto-construction)
    // Never use MinIO_PUBLIC_URL for AWS S3
    publicEndpoint = fullEndpoint; // AWS S3 doesn't need separate public endpoint
    
    console.log(`[storage] Detected AWS S3 configuration (region: ${region})`);
    if (fullEndpoint) {
      console.log(`[storage] Using AWS S3 endpoint: ${fullEndpoint}`);
    } else {
      console.log(`[storage] Using AWS S3 SDK auto-constructed endpoint for region: ${region}`);
    }
  } else {
    // MinIO Configuration (backward compatibility)
    const endpoint = customEndpoint;
    const port = process.env.MINIO_PORT || '9000';
    useSSL = process.env.MINIO_USE_SSL === 'true' || 
             process.env.MINIO_USE_SSL === '1' ||
             (endpoint && endpoint.startsWith('https://'));
    
    // Construct full endpoint URL if port is separate
    if (endpoint && !endpoint.includes(':')) {
      const protocol = useSSL ? 'https' : 'http';
      fullEndpoint = `${protocol}://${endpoint}:${port}`;
    } else if (endpoint) {
      fullEndpoint = endpoint;
    }
    
    // Determine public URL for presigned URLs (browser access)
    // If MINIO_PUBLIC_URL is set, use it; otherwise convert internal hostname to localhost
    publicEndpoint = process.env.MINIO_PUBLIC_URL;
    if (!publicEndpoint) {
      if (fullEndpoint && fullEndpoint.includes('minio:')) {
        // Replace internal Docker hostname with localhost for browser access
        publicEndpoint = fullEndpoint.replace(/minio:\d+/, 'localhost:9000');
      } else {
        publicEndpoint = fullEndpoint;
      }
    }
    // Ensure publicEndpoint has protocol
    if (publicEndpoint && !publicEndpoint.startsWith('http')) {
      const protocol = useSSL ? 'https' : 'http';
      publicEndpoint = `${protocol}://${publicEndpoint}`;
    }
    
    forcePathStyle = true; // Required for MinIO
    console.log(`[storage] Detected MinIO configuration (endpoint: ${fullEndpoint})`);
  }
  
  if (!S3_BUCKET) {
    console.warn(
      '[storage] MINIO_BUCKET_ONBOARDING/DOCS_STORAGE_BUCKET/MINIO_BUCKET missing, falling back to local storage'
    );
  } else if (accessKeyId && secretAccessKey) {
    try {
      // Build S3 client configuration
      const s3Config = {
        region: region,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
        forcePathStyle: forcePathStyle,
      };
      
      // Only set endpoint if it's a custom endpoint (MinIO or custom S3-compatible)
      if (fullEndpoint) {
        s3Config.endpoint = fullEndpoint;
      }
      
      // Disable SSL verification for local MinIO (can be overridden)
      if (!isAWS && process.env.MINIO_SSL_VERIFY === 'false') {
        s3Config.requestHandler = {
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false
          })
        };
      }
      
      s3Client = new S3Client(s3Config);
      const endpointDisplay = fullEndpoint || `s3.${region}.amazonaws.com (AWS S3)`;
      console.log(`[storage] ✅ Initialized S3 client for ${endpointDisplay} with bucket ${S3_BUCKET}`);
      usingS3 = true;
      
      // Create a separate S3 client for presigned URLs using the public endpoint
      // This ensures presigned URLs are signed for the correct hostname (localhost vs minio)
      // For AWS S3, we always use the same client (no separate public endpoint needed)
      if (isAWS) {
        // AWS S3: Use the same client for all operations
        s3ClientPublic = s3Client;
        console.log(`[storage] Using AWS S3 client for presigned URLs`);
      } else if (publicEndpoint && publicEndpoint !== fullEndpoint) {
        // MinIO: Use separate public client if public endpoint differs
        try {
          s3ClientPublic = new S3Client({
            region: region,
            endpoint: publicEndpoint,
            credentials: {
              accessKeyId: accessKeyId,
              secretAccessKey: secretAccessKey,
            },
            forcePathStyle: true,
            ...(process.env.MINIO_SSL_VERIFY === 'false' ? {
              requestHandler: {
                httpsAgent: new (require('https').Agent)({
                  rejectUnauthorized: false
                })
              }
            } : {}),
          });
          console.log(`[storage] Initialized public MinIO client for presigned URLs: ${publicEndpoint}`);
        } catch (error) {
          console.warn(`[storage] Failed to create public S3 client, using internal client: ${error.message}`);
          s3ClientPublic = s3Client; // Fallback to internal client
        }
      } else {
        s3ClientPublic = s3Client; // Use same client if endpoints match
      }
      
      // Try to ensure bucket exists during initialization (non-blocking)
      // It will be retried on server startup in server/index.js
      // Note: For AWS S3, bucket must already exist (AWS doesn't auto-create)
      ensureBucketExists(S3_BUCKET).catch(err => {
        console.warn(`[storage] ⚠️  Bucket creation during init failed: ${err.message}`);
        console.warn(`[storage]    Bucket will be created on server startup or first use`);
        if (isAWS) {
          console.warn(`[storage]    Note: AWS S3 buckets must be created manually or via infrastructure`);
        }
      });
    } catch (error) {
      console.error('[storage] Failed to initialize S3 client:', error.message);
      console.warn('[storage] Falling back to local storage');
    }
  } else {
      console.warn('[storage] Missing S3 credentials, falling back to local storage');
      console.warn(`[storage] Endpoint: ${fullEndpoint || 'AWS S3 (default)'}, AccessKey: ${accessKeyId ? 'provided' : 'missing'}, SecretKey: ${secretAccessKey ? 'provided' : 'missing'}`);
  }
}

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

  // Use the public client for presigned URLs to ensure correct hostname in signature
  const clientForPresigning = s3ClientPublic || s3Client;
  const presignedUrl = await getSignedUrl(clientForPresigning, command, { expiresIn });
  
  return presignedUrl;
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

  // Use the public client for presigned URLs to ensure correct hostname in signature
  const clientForPresigning = s3ClientPublic || s3Client;
  return await getSignedUrl(clientForPresigning, command, { expiresIn });
}

/**
 * Calculate SHA-256 checksum of a buffer
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<string>} Hex checksum
 */
export async function calculateChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Ensure S3 bucket exists, create if it doesn't
 * @param {string} bucketName - Name of the bucket
 * @returns {Promise<void>}
 * 
 * MIGRATION NOTE: For AWS S3, buckets typically need to be created manually via AWS Console/CLI.
 * This function will attempt to create the bucket, but may fail due to AWS permissions.
 * For MinIO, buckets are created automatically if they don't exist.
 */
export async function ensureBucketExists(bucketName) {
  if (!usingS3 || !s3Client) {
    console.warn(`[storage] Cannot create bucket ${bucketName}: S3 is not configured`);
    return; // Not using S3, skip
  }

  try {
    // Check if bucket exists
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      console.log(`[storage] ✅ Bucket '${bucketName}' already exists`);
      return;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404 || error.Code === 'NoSuchBucket') {
        // Bucket doesn't exist, try to create it
        // Note: AWS S3 may require manual bucket creation or specific permissions
        try {
          console.log(`[storage] Creating bucket '${bucketName}'...`);
          await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
          console.log(`[storage] ✅ Successfully created bucket '${bucketName}'`);
        } catch (createError) {
          // For AWS S3, bucket creation might fail due to:
          // - Bucket already exists in another region
          // - Insufficient permissions
          // - Bucket name conflicts
          console.error(`[storage] ❌ Failed to create bucket '${bucketName}':`, createError.message);
          console.error(`[storage] Error details:`, createError);
          if (createError.name === 'BucketAlreadyOwnedByYou' || createError.Code === 'BucketAlreadyOwnedByYou') {
            console.log(`[storage] ℹ️  Bucket exists but may be in a different region`);
          } else {
            console.warn(`[storage] ⚠️  For AWS S3, ensure the bucket exists manually or check IAM permissions`);
          }
          throw createError;
        }
      } else {
        // Other error (permissions, network, etc.)
        console.error(`[storage] ❌ Error checking bucket '${bucketName}':`, error.message);
        console.error(`[storage] Error code: ${error.name || error.Code}, Status: ${error.$metadata?.httpStatusCode}`);
        throw error;
      }
    }
  } catch (error) {
    console.error(`[storage] ❌ Error ensuring bucket '${bucketName}' exists:`, error.message);
    console.error(`[storage] This may indicate:`);
    console.error(`[storage]   1. Storage service (S3/MinIO) is not running or not accessible`);
    console.error(`[storage]   2. Incorrect credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or MINIO_ACCESS_KEY/MINIO_SECRET_KEY)`);
    console.error(`[storage]   3. Network connectivity issues`);
    console.error(`[storage]   4. Insufficient permissions (for AWS S3, check IAM policies)`);
    console.error(`[storage]   5. Bucket needs to be created manually (common for AWS S3)`);
    // Don't throw - allow fallback to local storage, but log the issue clearly
  }
}

/**
 * Get bucket name for onboarding documents
 * @returns {string} Bucket name
 */
export function getOnboardingBucket() {
  return S3_BUCKET;
}

/**
 * Check if S3/MinIO is properly configured
 * @returns {boolean} True if S3 is available
 */
export function isS3Available() {
  return usingS3 && s3Client !== null;
}

