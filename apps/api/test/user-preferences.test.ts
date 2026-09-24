import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { NOTIFICATION_TYPES, notificationPrefsOf, wantsNotification } from '../src/lib/notifications.js';
import { mergeNotificationPrefs, parsePreferencesUpdate, preferencesView, themeModeOf } from '../src/lib/userPreferences.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newUser() {
  const dealer = await prisma.dealer.create({ data: { name: 'Pref Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  return prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Asha', role: 'user', dealer_id: dealer.id, is_active: true } });
}

function headersFor(userId: string, dealerId: string | null) {
  const payload: JwtUser = {
    dealer_user_id: userId, dealer_id: dealerId, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const allOn = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true]));

describe('preference helpers', () => {
  it('treats a missing or unknown theme as system', () => {
    assert.equal(themeModeOf('dark'), 'dark');
    assert.equal(themeModeOf('DARK'), 'system');
    assert.equal(themeModeOf(undefined), 'system');
  });

  it('turns a type off only when it is stored as false', () => {
    assert.deepEqual(notificationPrefsOf(null), allOn);
    assert.deepEqual(notificationPrefsOf([false]), allOn);
    assert.equal(notificationPrefsOf({ post_failed: false, inbox_message: 'no' }).post_failed, false);
    assert.equal(notificationPrefsOf({ post_failed: false, inbox_message: 'no' }).inbox_message, true);
    assert.equal(wantsNotification({ reel_ready: false }, 'reel_ready'), false);
    assert.equal(wantsNotification({ reel_ready: false }, 'post_published'), true);
  });

  it('parses partial updates and refuses anything else', () => {
    assert.deepEqual(parsePreferencesUpdate({ theme_mode: 'light' }), { ok: true, update: { theme_mode: 'light' } });
    assert.deepEqual(parsePreferencesUpdate({ notification_prefs: { post_failed: false } }), { ok: true, update: { notification_prefs: { post_failed: false } } });
    for (const bad of [null, [], {}, { theme_mode: 'sepia' }, { notification_prefs: { weekly_digest: false } }, { notification_prefs: { post_failed: 'off' } }, { notification_prefs: [] }, { colour: 'red' }]) {
      assert.equal(parsePreferencesUpdate(bad).ok, false, JSON.stringify(bad));
    }
  });

  it('merges a change into the full stored map', () => {
    const merged = mergeNotificationPrefs({ post_failed: false }, { inbox_message: false });
    assert.equal(merged.post_failed, false);
    assert.equal(merged.inbox_message, false);
    assert.equal(merged.post_published, true);
    assert.deepEqual(Object.keys(merged).sort(), [...NOTIFICATION_TYPES].sort());
    assert.deepEqual(preferencesView({ theme_mode: 'weird', notification_prefs: null }), { theme_mode: 'system', notification_prefs: allOn });
  });
});

describe('/v1/users/me/preferences', () => {
  it('starts at system with every notification on', async () => {
    const user = await newUser();
    const res = await fastify.inject({ method: 'GET', url: '/v1/users/me/preferences', headers: headersFor(user.id, user.dealer_id) });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { theme_mode: 'system', notification_prefs: allOn });
  });

  it('saves the theme and merges notification choices', async () => {
    const user = await newUser();
    const h = headersFor(user.id, user.dealer_id);
    const put = (payload: object) => fastify.inject({ method: 'PUT', url: '/v1/users/me/preferences', headers: h, payload });

    assert.equal((await put({ theme_mode: 'dark' })).json().theme_mode, 'dark');
    await put({ notification_prefs: { post_published: false } });
    const res = await put({ notification_prefs: { inbox_message: false } });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { theme_mode: string; notification_prefs: Record<string, boolean> };
    assert.equal(body.theme_mode, 'dark');
    assert.equal(body.notification_prefs['post_published'], false);
    assert.equal(body.notification_prefs['inbox_message'], false);
    assert.equal(body.notification_prefs['post_failed'], true);
    const stored = await prisma.dealerUser.findUnique({ where: { id: user.id } });
    assert.equal(stored?.theme_mode, 'dark');
  });

  it('refuses bad input and unknown accounts', async () => {
    const user = await newUser();
    const bad = await fastify.inject({ method: 'PUT', url: '/v1/users/me/preferences', headers: headersFor(user.id, user.dealer_id), payload: { theme_mode: 'sepia' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'INVALID_INPUT');

    const ghost = headersFor(`ghost-${randomUUID()}`, user.dealer_id);
    assert.equal((await fastify.inject({ method: 'GET', url: '/v1/users/me/preferences', headers: ghost })).statusCode, 404);
    assert.equal((await fastify.inject({ method: 'PUT', url: '/v1/users/me/preferences', headers: ghost, payload: { theme_mode: 'dark' } })).statusCode, 404);
  });
});
