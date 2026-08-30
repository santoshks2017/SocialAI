/**
 * Storage helper — uses S3/R2 when configured, local filesystem otherwise.
 *
 * Set these env vars to enable cloud storage:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET
 *
 * For Cloudflare R2 also set:
 *   S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
 *   CLOUDFRONT_DOMAIN=https://your-r2-public-domain.com   (optional public CDN)
 */
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Lazy-load S3 client only when needed (avoids missing-module errors in dev)
let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;

async function getS3Client() {
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  const endpoint = process.env['S3_ENDPOINT'];
  s3Client = new S3Client({
    region: process.env['AWS_REGION'] ?? 'auto',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
    },
  });
  return s3Client;
}

function isS3Configured(): boolean {
  return !!(
    process.env['AWS_ACCESS_KEY_ID'] &&
    process.env['AWS_SECRET_ACCESS_KEY'] &&
    process.env['S3_BUCKET']
  );
}

/** Upload a buffer and return its public URL. */
export async function uploadFile(
  buffer: Buffer,
  key: string,          // e.g. "creatives/uuid.png"
  contentType: string,  // e.g. "image/png"
  localDir: string,     // absolute path for local fallback directory
): Promise<string> {
  if (isS3Configured()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    const bucket = process.env['S3_BUCKET']!;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    const cdn = process.env['CLOUDFRONT_DOMAIN'];
    if (cdn) return `${cdn.replace(/\/$/, '')}/${key}`;
    const endpoint = process.env['S3_ENDPOINT'];
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    const region = process.env['AWS_REGION'] ?? 'us-east-1';
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  // Local fallback
  const filename = path.basename(key);
  await mkdir(localDir, { recursive: true });
  await writeFile(path.join(localDir, filename), buffer);
  const baseUrl = process.env['API_BASE_URL'] ?? '';
  const subPath = localDir.split('/uploads/')[1] ?? '';
  const pathPrefix = subPath ? `/uploads/${subPath}/${filename}` : `/uploads/${filename}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}${pathPrefix}` : pathPrefix;
}
