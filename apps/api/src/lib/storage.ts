/**
 * Storage helper — uses Google Cloud Storage or S3/R2 when configured, local filesystem otherwise.
 *
 * Google Cloud Storage (production on Cloud Run): set GCS_BUCKET. Auth comes from the
 * runtime service account; the bucket must allow public reads so Meta/Google can fetch media.
 *
 * S3/R2: set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET
 *
 * For Cloudflare R2 also set:
 *   S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
 *   CLOUDFRONT_DOMAIN=https://your-r2-public-domain.com   (optional public CDN)
 *
 * Local disk is per Cloud Run instance and wiped on restart, so it is for development only.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Lazy-load cloud clients only when needed (avoids missing-module errors in dev)
let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;
let gcsClient: import('@google-cloud/storage').Storage | null = null;

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

async function getGcsBucket() {
  if (!gcsClient) {
    const { Storage } = await import('@google-cloud/storage');
    gcsClient = new Storage();
  }
  return gcsClient.bucket(process.env['GCS_BUCKET']!);
}

function isGcsConfigured(): boolean {
  return !!process.env['GCS_BUCKET']?.trim();
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
  if (isGcsConfigured()) {
    const bucket = await getGcsBucket();
    await bucket.file(key).save(buffer, { contentType, resumable: false });
    return `https://storage.googleapis.com/${bucket.name}/${key}`;
  }

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

/**
 * Read back a file stored with uploadFile, from wherever uploadFile put it.
 * Reading the local directory directly breaks as soon as cloud storage is on,
 * and on Cloud Run whenever the read lands on a different instance.
 */
export async function readStoredFile(key: string, localDir: string): Promise<Buffer> {
  if (isGcsConfigured()) {
    const bucket = await getGcsBucket();
    const [contents] = await bucket.file(key).download();
    return contents;
  }

  if (isS3Configured()) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    const res = await client.send(new GetObjectCommand({ Bucket: process.env['S3_BUCKET']!, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  return readFile(path.join(localDir, path.basename(key)));
}
