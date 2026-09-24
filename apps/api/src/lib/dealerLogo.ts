/**
 * Dealer logo uploads (POST /v1/dealer/logo): PNG, JPEG or WebP, 2 MB at most.
 * SVG is refused: it can carry script. The file's own bytes decide the type, and the
 * declared MIME type must agree with them.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type LogoType = 'png' | 'jpeg' | 'webp';

const CONTENT_TYPES: Record<LogoType, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXTENSIONS: Record<LogoType, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const DECLARED: Record<string, LogoType> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/webp': 'webp' };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image type from the file's first bytes, whatever the upload claims. */
export function sniffLogoType(buf: Buffer): LogoType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** The logo's type when the declared MIME type is one we accept and matches the bytes; otherwise null. */
export function logoTypeFor(declaredMime: string, buf: Buffer): LogoType | null {
  const declared = DECLARED[declaredMime.trim().toLowerCase()];
  const actual = sniffLogoType(buf);
  return declared && actual === declared ? actual : null;
}

export function logoContentType(type: LogoType): string {
  return CONTENT_TYPES[type];
}

/** logos/{dealerId}/{id}.{ext} */
export function logoStorageKey(dealerId: string, id: string, type: LogoType): string {
  return `logos/${dealerId}/${id}.${EXTENSIONS[type]}`;
}
