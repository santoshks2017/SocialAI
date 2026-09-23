import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { KeyStorageUnavailableError, isKeyStorageReady, openSecret, sealSecret } from '../src/lib/secretBox.js';

const originalEnv = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

describe('secretBox', () => {
  it('round-trips a secret and never stores the plaintext', () => {
    const sealed = sealSecret('AIzaSy-test-key-1234');
    assert.equal(openSecret(sealed), 'AIzaSy-test-key-1234');
    assert.ok(!sealed.ciphertext.includes('AIzaSy'));
  });

  it('uses a fresh IV each time', () => {
    const a = sealSecret('same');
    const b = sealSecret('same');
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  it('rejects tampered ciphertext', () => {
    const sealed = sealSecret('secret-value');
    const bytes = Buffer.from(sealed.ciphertext, 'base64');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    assert.throws(() => openSecret({ ...sealed, ciphertext: bytes.toString('base64') }));
  });

  it('works with an explicit 32-byte CREDENTIALS_KEY and rejects a wrong-length one', () => {
    process.env['CREDENTIALS_KEY'] = randomBytes(32).toString('base64');
    assert.equal(openSecret(sealSecret('k')), 'k');
    process.env['CREDENTIALS_KEY'] = randomBytes(16).toString('base64');
    assert.throws(() => sealSecret('k'), /32 bytes/);
  });

  it('refuses to seal or open in production without CREDENTIALS_KEY', () => {
    const sealed = sealSecret('k');
    process.env['NODE_ENV'] = 'production';
    delete process.env['CREDENTIALS_KEY'];
    assert.equal(isKeyStorageReady(), false);
    assert.throws(() => sealSecret('k'), KeyStorageUnavailableError);
    assert.throws(() => openSecret(sealed), KeyStorageUnavailableError);
  });
});
