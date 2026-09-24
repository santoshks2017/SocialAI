import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function headersForDealerIn(city: string) {
  const dealer = await prisma.dealer.create({ data: { name: 'Festival Motors', city, phone: `phone-${randomUUID()}` } });
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealer.id, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const get = (headers: Record<string, string>, query: string) => fastify.inject({ method: 'GET', url: `/v1/dealer/festivals${query}`, headers });

describe('GET /v1/dealer/festivals', () => {
  it("lists festival dates in a range for the dealer's region", async () => {
    const res = await get(await headersForDealerIn('Pune'), '?from=2026-09-01&to=2026-10-01');
    assert.equal(res.statusCode, 200);
    const festivals = (res.json() as { festivals: Array<{ id: string; date: string }> }).festivals;
    assert.equal(festivals.find((f) => f.id === 'ganesh_chaturthi')?.date, '2026-09-15');
  });

  it('refuses a bad or over-long range', async () => {
    const h = await headersForDealerIn('Pune');
    for (const query of ['?from=2026-09-01', '?from=2026-10-01&to=2026-09-01', '?from=2026-9-1&to=2026-10-01', '?from=2020-01-01&to=2026-01-01']) {
      const res = await get(h, query);
      assert.equal(res.statusCode, 400, query);
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });

  it('still lists upcoming festivals without a range', async () => {
    const res = await get(await headersForDealerIn('Pune'), '?limit=3');
    assert.equal(res.statusCode, 200);
    const festivals = (res.json() as { festivals: Array<{ id: string; daysRemaining: number }> }).festivals;
    // Known, ordered upcoming festivals for a Pune dealer as of this table: catches a broken or emptied festival feed.
    assert.deepEqual(festivals.map((f) => f.id), ['dussehra', 'diwali', 'christmas']);
    assert.ok(festivals.every((f) => f.daysRemaining >= 0));
  });
});
