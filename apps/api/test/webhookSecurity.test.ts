import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { validateMetaSignature, validateRazorpaySignature } from '../src/lib/webhookSecurity.js';

describe('Webhook Security (webhookSecurity.ts)', () => {
  const secret = 'test-secret-key-12345';
  const payload = JSON.stringify({ event: 'post_update', id: 42 });

  describe('validateMetaSignature', () => {
    it('validates a correct sha256 Meta webhook signature', () => {
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const signature = `sha256=${hmac}`;

      const isValid = validateMetaSignature(payload, signature, secret);
      assert.equal(isValid, true);
    });

    it('rejects an invalid signature hash', () => {
      const signature = 'sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const isValid = validateMetaSignature(payload, signature, secret);
      assert.equal(isValid, false);
    });

    it('rejects signature when payload is tampered', () => {
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const signature = `sha256=${hmac}`;
      const tamperedPayload = JSON.stringify({ event: 'post_update', id: 99 });

      const isValid = validateMetaSignature(tamperedPayload, signature, secret);
      assert.equal(isValid, false);
    });

    it('returns false for empty signature or secret', () => {
      assert.equal(validateMetaSignature(payload, '', secret), false);
      assert.equal(validateMetaSignature(payload, 'sha256=123', ''), false);
    });
  });

  describe('validateRazorpaySignature', () => {
    it('validates a correct Razorpay webhook signature', () => {
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const isValid = validateRazorpaySignature(payload, signature, secret);
      assert.equal(isValid, true);
    });

    it('rejects an invalid Razorpay signature', () => {
      const isValid = validateRazorpaySignature(payload, 'wrong-signature', secret);
      assert.equal(isValid, false);
    });

    it('returns false for empty signature or secret', () => {
      assert.equal(validateRazorpaySignature(payload, '', secret), false);
      assert.equal(validateRazorpaySignature(payload, 'any', ''), false);
    });
  });
});
