import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';

describe('API Routes (In-Memory Fastify Inject)', () => {
  after(async () => {
    await fastify.close();
  });

  describe('GET /v1/health', () => {
    it('returns 200 OK with health status and service identifier', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.status, 'ok');
      assert.equal(body.service, 'Cardeko Social AI - API');
      assert.ok(body.env);
    });
  });

  describe('POST /v1/auth/otp/send', () => {
    it('returns 400 when phone number is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/auth/otp/send',
        payload: {},
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.error.code, 'INVALID_INPUT');
    });

    it('returns 400 when phone number format is invalid', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/auth/otp/send',
        payload: { phone: 'abc1234' },
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.error.code, 'INVALID_INPUT');
    });

    it('returns 200 success when valid Indian phone number is provided', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/auth/otp/send',
        payload: { phone: '+919876543210' },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.success, true);
      assert.ok(body.message.includes('+919876543210'));
    });
  });

  describe('POST /v1/auth/otp/verify', () => {
    it('returns 400 when phone or otp is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        payload: { phone: '+919876543210' },
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.error.code, 'INVALID_INPUT');
    });

    it('returns 400 INVALID_OTP when OTP does not match', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        payload: { phone: '+919876543210', otp: '000000' },
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.error.code, 'INVALID_OTP');
    });
  });
});
