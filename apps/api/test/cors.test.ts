import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createOriginChecker } from '../src/lib/corsOrigins.js';
import { fastify } from '../src/index.js';

const ALLOWED = [
  'https://cardekho-social-ai.web.app',
  'https://cardekho-social-ai.firebaseapp.com',
  'https://gen-lang-client-0078524499.web.app',
  'https://gen-lang-client-0078524499.firebaseapp.com',
  'https://cardekho-social-ai-web.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
];

const REJECTED = [
  // Anyone's Firebase Hosting site
  'https://evil.web.app',
  'https://attacker-site.firebaseapp.com',
  // Anyone's Vercel deployment
  'https://evil.vercel.app',
  'https://cardekho-social-ai-web-git-attacker.vercel.app',
  // Retired old-project domains
  'https://social-ai.web.app',
  'https://social-ai.firebaseapp.com',
  'https://social-ai-ed9cf.web.app',
  'https://social-ai-ed9cf.firebaseapp.com',
  // Lookalikes of the production origin
  'https://cardekho-social-ai.web.app.evil.com',
  'https://evil.cardekho-social-ai.web.app',
  'https://cardekho-social-ai-evil.web.app',
  'https://cardekho-social-ai--preview.web.app',
  'http://cardekho-social-ai.web.app',
  'https://cardekho-social-ai.web.app:8443',
  // localhost over https or with a suffix
  'https://localhost:5173',
  'http://localhost.evil.com:5173',
  'http://localhost:5173.evil.com',
  'null',
];

describe('CORS origin allowlist (corsOrigins.ts)', () => {
  const isAllowedOrigin = createOriginChecker();

  for (const origin of ALLOWED) {
    it(`allows ${origin}`, () => {
      assert.equal(isAllowedOrigin(origin), true);
    });
  }

  for (const origin of REJECTED) {
    it(`rejects ${origin}`, () => {
      assert.equal(isAllowedOrigin(origin), false);
    });
  }

  it('allows FRONTEND_URL when provided', () => {
    const check = createOriginChecker('https://app.example.com');
    assert.equal(check('https://app.example.com'), true);
    assert.equal(check('https://evil.web.app'), false);
  });
});

describe('CORS headers on the API (fastify.inject)', () => {
  after(async () => {
    await fastify.close();
  });

  it('answers a preflight from the production origin with credentialed CORS headers', async () => {
    const response = await fastify.inject({
      method: 'OPTIONS',
      url: '/v1/health',
      headers: {
        origin: 'https://cardekho-social-ai.web.app',
        'access-control-request-method': 'POST',
      },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], 'https://cardekho-social-ai.web.app');
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
  });

  it('echoes an allowed origin on a normal request', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { origin: 'http://localhost:5173' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  for (const origin of ['https://evil.web.app', 'https://evil.vercel.app']) {
    it(`sends no CORS headers to ${origin}`, async () => {
      const preflight = await fastify.inject({
        method: 'OPTIONS',
        url: '/v1/health',
        headers: { origin, 'access-control-request-method': 'POST' },
      });
      assert.equal(preflight.headers['access-control-allow-origin'], undefined);
      assert.equal(preflight.headers['access-control-allow-credentials'], undefined);

      const request = await fastify.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { origin },
      });
      assert.notEqual(request.statusCode, 200);
      assert.equal(request.headers['access-control-allow-origin'], undefined);
      assert.equal(request.headers['access-control-allow-credentials'], undefined);
    });
  }

  it('still serves requests with no Origin header (server-to-server, curl)', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/v1/health' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  });
});
