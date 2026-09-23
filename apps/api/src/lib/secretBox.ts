import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export class KeyStorageUnavailableError extends Error {
  constructor() {
    super('Encrypted key storage is not configured (CREDENTIALS_KEY is missing)');
    this.name = 'KeyStorageUnavailableError';
  }
}

// CREDENTIALS_KEY comes from the Secret Manager secret `credentials-key` on Cloud Run.
// Outside production a key derived from JWT_SECRET is used, so local dev and tests need no setup.
function encryptionKey(): Buffer {
  const raw = process.env['CREDENTIALS_KEY']?.trim();
  if (raw) {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes, base64-encoded');
    return key;
  }
  if (process.env['NODE_ENV'] === 'production') throw new KeyStorageUnavailableError();
  return createHash('sha256').update(`dev-credentials:${process.env['JWT_SECRET'] ?? ''}`).digest();
}

export function isKeyStorageReady(): boolean {
  return !!process.env['CREDENTIALS_KEY']?.trim() || process.env['NODE_ENV'] !== 'production';
}

export function sealSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
