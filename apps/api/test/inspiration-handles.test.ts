import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { isHttpUrl } from '../src/lib/safeUrl.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function headersForNewDealer() {
  const dealer = await prisma.dealer.create({ data: { name: 'Muse Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealer.id, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` }, dealerId: dealer.id };
}

describe('inspiration handle URLs', () => {
  it('accepts only http and https links', () => {
    assert.equal(isHttpUrl('https://www.facebook.com/MarutiSuzukiArena'), true);
    assert.equal(isHttpUrl('http://example.com/page'), true);
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'ftp://example.com/x', 'www.facebook.com/page', '', 5, null]) {
      assert.equal(isHttpUrl(bad), false, String(bad));
    }
  });

  it('refuses a non-http(s) handle_url with 400 and stores nothing', async () => {
    const { headers, dealerId } = await headersForNewDealer();
    for (const handle_url of ['javascript:alert(document.cookie)', 'data:text/html,<b>x</b>', 'not a url']) {
      const res = await fastify.inject({ method: 'POST', url: '/v1/dealer/inspiration-handles', headers, payload: { handle_url, platform: 'facebook' } });
      assert.equal(res.statusCode, 400, handle_url);
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
    assert.equal((await prisma.inspirationHandle.findMany({ where: { dealer_id: dealerId } })).length, 0);
  });

  it('stores an https link', async () => {
    const { headers, dealerId } = await headersForNewDealer();
    // localhost: the background scrape's SSRF guard refuses it at once, so the test makes no network call.
    const res = await fastify.inject({
      method: 'POST', url: '/v1/dealer/inspiration-handles', headers, payload: { handle_url: 'https://localhost/reference-page', platform: 'instagram' },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await prisma.inspirationHandle.findMany({ where: { dealer_id: dealerId } })).length, 1);
  });
});
