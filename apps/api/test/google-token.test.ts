import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { getFreshGoogleAccessToken } from '../src/lib/googleToken.js';

const HOUR = 3_600_000;

function setGoogleEnv(t: TestContext) {
  const saved = { id: process.env['GOOGLE_CLIENT_ID'], secret: process.env['GOOGLE_CLIENT_SECRET'] };
  process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
  t.after(() => {
    for (const [key, value] of [['GOOGLE_CLIENT_ID', saved.id], ['GOOGLE_CLIENT_SECRET', saved.secret]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Revoked Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  return { dealerId: dealer.id, admin };
}

const googleAnswer = (body: Record<string, unknown>, status: number) => async () => new Response(JSON.stringify(body), { status });

describe('revoked Google access', () => {
  it('disconnects the account and tells the team once', async (t) => {
    setGoogleEnv(t);
    const { dealerId, admin } = await team();
    const conn = await prisma.platformConnection.create({
      data: {
        dealer_id: dealerId, platform: 'gmb', platform_account_id: 'accounts/1/locations/7', platform_account_name: 'Apex Bandra',
        access_token: 'ya29.old', refresh_token: '1//revoked', token_expires_at: new Date(Date.now() - HOUR), is_connected: true,
      },
    });
    t.mock.method(globalThis, 'fetch', googleAnswer({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));

    await assert.rejects(getFreshGoogleAccessToken(conn), {
      message: 'Could not renew Google Business Profile access (Token has been expired or revoked.). Reconnect Google Business Profile on Accounts, then publish again.',
    });

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: conn.id } }))?.is_connected, false);
    const notices = await prisma.notification.findMany({ where: { user_id: admin.id } });
    assert.deepEqual(
      notices.map((n) => [n.type, n.title, n.body, n.link]),
      [['platform_disconnected', 'Google Business Profile disconnected', 'Apex Bandra needs reconnecting \u2014 access was revoked or expired.', '/accounts']],
    );

    await assert.rejects(getFreshGoogleAccessToken(conn));
    assert.equal((await prisma.notification.findMany({ where: { user_id: admin.id } })).length, 1);
  });

  it('disconnects every account on the revoked grant at once and tells the team once, with the count', async (t) => {
    setGoogleEnv(t);
    const { dealerId, admin } = await team();
    const location = (n: number, refresh: string) => prisma.platformConnection.create({
      data: {
        dealer_id: dealerId, platform: 'gmb', platform_account_id: `accounts/1/locations/${n}`, platform_account_name: `Apex ${n}`,
        access_token: 'ya29.old', refresh_token: refresh, token_expires_at: new Date(Date.now() - HOUR), is_connected: true,
      },
    });
    const [a, b, c] = [await location(1, '1//shared'), await location(2, '1//shared'), await location(3, '1//shared')];
    const other = await location(4, '1//other-grant');
    const elsewhere = await (async () => {
      const { dealerId: otherDealer } = await team();
      return prisma.platformConnection.create({
        data: {
          dealer_id: otherDealer, platform: 'gmb', platform_account_id: 'accounts/9/locations/1', access_token: 'ya29.x',
          refresh_token: '1//shared', token_expires_at: new Date(Date.now() + HOUR), is_connected: true,
        },
      });
    })();
    t.mock.method(globalThis, 'fetch', googleAnswer({ error: 'invalid_grant' }, 400));

    // Two locations of the grant renew at the same moment (cron publishing, follower sync): still one notice.
    await Promise.all([assert.rejects(getFreshGoogleAccessToken(a)), assert.rejects(getFreshGoogleAccessToken(b))]);
    await assert.rejects(getFreshGoogleAccessToken(c));

    const connected = async (id: string) => (await prisma.platformConnection.findUnique({ where: { id } }))?.is_connected;
    assert.deepEqual(
      [await connected(a.id), await connected(b.id), await connected(c.id), await connected(other.id), await connected(elsewhere.id)],
      [false, false, false, true, true],
    );
    const notices = await prisma.notification.findMany({ where: { user_id: admin.id } });
    assert.deepEqual(
      notices.map((n) => [n.title, n.body]),
      [['Google Business Profile disconnected', '3 Google Business Profile accounts need reconnecting \u2014 access was revoked or expired.']],
    );
  });

  it('leaves an account alone when it was reconnected with a new token after the refresh started', async (t) => {
    setGoogleEnv(t);
    const { dealerId, admin } = await team();
    const conn = await prisma.platformConnection.create({
      data: {
        dealer_id: dealerId, platform: 'youtube', platform_account_id: 'UC-re', platform_account_name: 'Apex TV',
        access_token: 'ya29.old', refresh_token: '1//old-grant', token_expires_at: new Date(Date.now() - HOUR), is_connected: true,
      },
    });
    await prisma.platformConnection.update({ where: { id: conn.id }, data: { refresh_token: '1//new-grant' } });
    t.mock.method(globalThis, 'fetch', googleAnswer({ error: 'invalid_grant' }, 400));

    await assert.rejects(getFreshGoogleAccessToken(conn));

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: conn.id } }))?.is_connected, true);
    assert.equal((await prisma.notification.findMany({ where: { user_id: admin.id } })).length, 0);
  });

  it('words YouTube failures for YouTube and keeps the account on other errors', async (t) => {
    setGoogleEnv(t);
    const { dealerId, admin } = await team();
    const conn = await prisma.platformConnection.create({
      data: {
        dealer_id: dealerId, platform: 'youtube', platform_account_id: 'UC-9', platform_account_name: 'Apex TV',
        access_token: 'ya29.old', refresh_token: '1//r', token_expires_at: new Date(Date.now() - HOUR), is_connected: true,
      },
    });
    t.mock.method(globalThis, 'fetch', googleAnswer({ error: 'internal_failure' }, 500));

    await assert.rejects(getFreshGoogleAccessToken(conn), {
      message: 'Could not renew YouTube access (internal_failure). Reconnect YouTube on Accounts, then publish again.',
    });
    await assert.rejects(getFreshGoogleAccessToken({ ...conn, refresh_token: null }), {
      message: 'YouTube access expired and cannot be renewed. Reconnect YouTube on Accounts, then publish again.',
    });
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: conn.id } }))?.is_connected, true);
    assert.equal((await prisma.notification.findMany({ where: { user_id: admin.id } })).length, 0);
  });
});
