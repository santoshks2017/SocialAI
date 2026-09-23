import path from 'path';
import { readStoredFile } from './storage.js';
import { safeFetchBuffer, type SafeFetchOptions, type SafeFetchResult } from './safeUrl.js';
import { ORIGINALS_DIR, CREATIVES_DIR } from '../routes/upload.js';

export class InvalidFileIdError extends Error {
  readonly code = 'INVALID_FILE_ID';
  readonly statusCode = 400;
}

/** Client-supplied upload ids are bare file names; this strips any path so they cannot leave their directory. */
export function safeFileId(id: unknown): string {
  const name = typeof id === 'string' ? path.basename(id) : '';
  if (!name || name === '.' || name === '..') throw new InvalidFileIdError('Invalid file id');
  return name;
}

/** Reads back an image uploaded through POST /v1/upload/image. */
export function readOriginalUpload(id: unknown): Promise<Buffer> {
  return readStoredFile(`originals/${safeFileId(id)}`, ORIGINALS_DIR);
}

function mimeFromName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
}

// Relative /uploads/... URLs and ones on API_BASE_URL point at files we stored ourselves.
function storedUploadRef(raw: string): { key: string; dir: string; name: string } | null {
  let url: URL;
  try {
    url = new URL(raw, 'http://relative.invalid');
  } catch {
    return null;
  }
  const apiBase = process.env['API_BASE_URL'];
  const ours = url.origin === 'http://relative.invalid'
    || (!!apiBase && URL.canParse(apiBase) && new URL(apiBase).origin === url.origin);
  const match = ours ? /^\/uploads\/(originals|creatives)\/([^/]+)$/.exec(url.pathname) : null;
  if (!match) return null;
  const name = safeFileId(decodeURIComponent(match[2]!));
  return { key: `${match[1]}/${name}`, dir: match[1] === 'originals' ? ORIGINALS_DIR : CREATIVES_DIR, name };
}

/** Loads an image by URL: our own uploads from storage, anything else through the SSRF-guarded fetch. */
export async function loadImageFromUrl(url: string, options?: SafeFetchOptions): Promise<SafeFetchResult> {
  const stored = storedUploadRef(url);
  if (stored) {
    return { buffer: await readStoredFile(stored.key, stored.dir), contentType: mimeFromName(stored.name) };
  }
  return safeFetchBuffer(url, options);
}

/** A dealer logo: uploaded logos are read back from storage, external URLs go through the SSRF guard. */
export async function loadDealerLogo(logoUrl: string): Promise<Buffer> {
  try {
    return await readOriginalUpload(path.basename(logoUrl));
  } catch {
    return (await loadImageFromUrl(logoUrl, { timeoutMs: 10000 })).buffer;
  }
}
