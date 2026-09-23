import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { isGlobalOwner, resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';
import { signOAuthState } from '../src/lib/oauthState.js';
import { OTP_MAX_ATTEMPTS, OTP_MAX_SENDS, OTP_TTL_SECONDS, storeOtp, verifyOtp } from '../src/lib/otpStore.js';

type FetchArgs = Parameters<typeof fetch>;

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

function sign(user: Partial<JwtUser> & { role: Role }, typ?: 'access' | 'refresh'): string {
  const payload = {
    dealer_user_id: 'u-' + Math.random().toString(36).slice(2),
    dealer_id: null,
    phone: '+910000000000',
    permissions: resolvePermissions(user.role),
    ...user,
    ...(typ ? { typ } : {}),
  } as JwtUser;
  return fastify.jwt.sign(payload);
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

before(async () => {
  await fastify.ready();
});

afterEach(restoreEnv);

after(async () => {
  await fastify.close();
});

describe('platform owner vs dealership roles', () => {
  it('demo login issues a dealership admin and resets a stored owner role', async () => {
    // Pre-create the demo dealer (with a synced model) so the endpoint skips its
    // first-boot scraping, and store the demo user as 'owner' like production does.
    const dealer = await prisma.dealer.create({
      data: { phone: '+0000000001', name: 'Demo Dealership', city: 'Mumbai', onboarding_completed: true },
    });
    await prisma.syncedModel.create({ data: { dealer_id: dealer.id, brand: 'Hyundai', model_name: 'Creta' } });
    await prisma.dealerUser.create({
      data: { phone: '+0000000001', name: 'Demo User', role: 'owner', dealer_id: dealer.id, is_active: true },
    });

    const res = await fastify.inject({ method: 'POST', url: '/v1/auth/demo' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.user.role, 'admin');
    const claims = fastify.jwt.verify<JwtUser>(body.token);
    assert.equal(claims.role, 'admin');
    assert.equal(claims.dealer_id, dealer.id);
    assert.equal(claims.typ, 'access');
    assert.equal(fastify.jwt.verify<JwtUser>(body.refreshToken).typ, 'refresh');

    const stored = await prisma.dealerUser.findUnique({ where: { phone: '+0000000001' } });
    assert.equal(stored?.role, 'admin');

    for (const [method, url] of [['GET', '/v1/admin/dashboard'], ['GET', '/v1/admin/dealers'], ['POST', `/v1/admin/dealers/${dealer.id}/impersonate`]] as const) {
      const denied = await fastify.inject({ method, url, headers: bearer(body.token) });
      assert.equal(denied.statusCode, 403, `${method} ${url}`);
    }
  });

  it('an owner token tied to a dealer (old demo tokens) cannot reach /v1/admin', async () => {
    const legacyDemo = sign({ role: 'owner', dealer_id: 'demo-dealer' });
    for (const url of ['/v1/admin/dashboard', '/v1/admin/dealers', '/v1/users/dealers']) {
      const res = await fastify.inject({ method: 'GET', url, headers: bearer(legacyDemo) });
      assert.equal(res.statusCode, 403, url);
    }
    const impersonate = await fastify.inject({
      method: 'POST', url: '/v1/admin/dealers/any/impersonate', headers: bearer(legacyDemo),
    });
    assert.equal(impersonate.statusCode, 403);
  });

  it('the global owner (dealer_id null) reaches /v1/admin', async () => {
    const owner = sign({ role: 'owner', dealer_id: null });
    const res = await fastify.inject({ method: 'GET', url: '/v1/admin/dashboard', headers: bearer(owner) });
    assert.equal(res.statusCode, 200);
  });

  it('a dealer-scoped owner cannot assign the owner role or see other dealers’ users', async () => {
    const dealerA = await prisma.dealer.create({ data: { phone: 'role-a', name: 'A', city: '' } });
    const dealerB = await prisma.dealer.create({ data: { phone: 'role-b', name: 'B', city: '' } });
    const target = await prisma.dealerUser.create({
      data: { phone: 'role-target', name: 'T', role: 'user', dealer_id: dealerA.id, is_active: true },
    });
    const outsider = await prisma.dealerUser.create({
      data: { phone: 'role-outsider', name: 'O', role: 'user', dealer_id: dealerB.id, is_active: true },
    });
    const scopedOwner = sign({ role: 'owner', dealer_id: dealerA.id });

    const promote = await fastify.inject({
      method: 'PATCH', url: `/v1/users/${target.id}/role`, headers: bearer(scopedOwner), payload: { role: 'owner' },
    });
    assert.equal(promote.statusCode, 403);

    const crossDealer = await fastify.inject({
      method: 'PATCH', url: `/v1/users/${outsider.id}/status`, headers: bearer(scopedOwner), payload: { isActive: false },
    });
    assert.equal(crossDealer.statusCode, 404);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: outsider.id } }))?.is_active, true);
  });
});

describe('access vs refresh tokens', () => {
  it('a refresh token is not accepted as an access token', async () => {
    const refresh = sign({ role: 'admin', dealer_id: 'd1' }, 'refresh');
    const res = await fastify.inject({ method: 'GET', url: '/v1/users/permissions/config', headers: bearer(refresh) });
    assert.equal(res.statusCode, 401);

    const access = sign({ role: 'admin', dealer_id: 'd1' }, 'access');
    const ok = await fastify.inject({ method: 'GET', url: '/v1/users/permissions/config', headers: bearer(access) });
    assert.equal(ok.statusCode, 200);

    const legacy = sign({ role: 'admin', dealer_id: 'd1' });
    const legacyOk = await fastify.inject({ method: 'GET', url: '/v1/users/permissions/config', headers: bearer(legacy) });
    assert.equal(legacyOk.statusCode, 200, 'tokens issued before the typ claim keep working');
  });

  it('a signed OAuth state is not accepted as an access token', async () => {
    const state = signOAuthState(fastify, 'platform_oauth', { dealer_id: 'd1' });
    const res = await fastify.inject({ method: 'GET', url: '/v1/users/permissions/config', headers: bearer(state) });
    assert.equal(res.statusCode, 401);
  });

  it('/refresh rebuilds claims from the database', async () => {
    const dealer = await prisma.dealer.create({ data: { phone: 'refresh-dealer', name: 'R', city: '' } });
    const user = await prisma.dealerUser.create({
      data: { phone: 'refresh-user', name: 'R', role: 'user', dealer_id: dealer.id, is_active: true },
    });
    // The old token claims admin; the database says user.
    const refreshToken = sign({ dealer_user_id: user.id, role: 'admin', dealer_id: dealer.id }, 'refresh');

    const res = await fastify.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken } });
    assert.equal(res.statusCode, 200);
    const claims = fastify.jwt.verify<JwtUser>(res.json().token);
    assert.equal(claims.role, 'user');
    assert.equal(claims.dealer_id, dealer.id);
    assert.equal(claims.typ, 'access');
    assert.equal(claims.permissions.view_billing, false);
  });

  it('/refresh rejects deactivated and unknown users', async () => {
    const user = await prisma.dealerUser.create({
      data: { phone: 'inactive-user', name: 'I', role: 'admin', dealer_id: 'd-inactive', is_active: false },
    });
    for (const dealer_user_id of [user.id, 'no-such-user']) {
      const refreshToken = sign({ dealer_user_id, role: 'admin', dealer_id: 'd-inactive' }, 'refresh');
      const res = await fastify.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken } });
      assert.equal(res.statusCode, 401, dealer_user_id);
    }
  });

  it('/refresh rejects access tokens and OAuth states', async () => {
    const user = await prisma.dealerUser.create({
      data: { phone: 'typ-user', name: 'T', role: 'admin', dealer_id: 'd-typ', is_active: true },
    });
    const access = sign({ dealer_user_id: user.id, role: 'admin', dealer_id: 'd-typ' }, 'access');
    const state = signOAuthState(fastify, 'google_signin', { dealer_user_id: user.id });
    for (const refreshToken of [access, state]) {
      const res = await fastify.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken } });
      assert.equal(res.statusCode, 401);
    }
  });

  it('/refresh drops impersonation sessions started by a non-global owner', async () => {
    const dealer = await prisma.dealer.create({ data: { phone: 'imp-dealer', name: 'I', city: '' } });
    const admin = await prisma.dealerUser.create({
      data: { phone: 'imp-admin', name: 'A', role: 'admin', dealer_id: dealer.id, is_active: true },
    });
    const fakeOwner = await prisma.dealerUser.create({
      data: { phone: 'imp-fake-owner', name: 'F', role: 'owner', dealer_id: 'demo', is_active: true },
    });
    const refreshToken = sign(
      { dealer_user_id: admin.id, role: 'admin', dealer_id: dealer.id, impersonatedBy: fakeOwner.id },
      'refresh',
    );
    const res = await fastify.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken } });
    assert.equal(res.statusCode, 401);
  });
});

describe('rate limiting', () => {
  it('buckets signed-in requests per user and anonymous ones per client IP', async () => {
    const remaining = async (headers: Record<string, string>) => {
      const res = await fastify.inject({ method: 'GET', url: '/v1/health', headers });
      return Number(res.headers['x-ratelimit-remaining']);
    };
    const alice = bearer(sign({ role: 'admin', dealer_id: 'd1', dealer_user_id: 'alice' }, 'access'));
    const bob = bearer(sign({ role: 'admin', dealer_id: 'd1', dealer_user_id: 'bob' }, 'access'));

    const a1 = await remaining(alice);
    const a2 = await remaining(alice);
    assert.equal(a2, a1 - 1);
    assert.equal(await remaining(bob), a1, 'bob has his own bucket');

    const ip1 = await remaining({ 'x-forwarded-for': '203.0.113.10' });
    assert.equal(await remaining({ 'x-forwarded-for': '203.0.113.11' }), ip1, 'client IP from X-Forwarded-For');
  });
});

describe('OTP store', () => {
  it('accepts the right code once', async () => {
    await storeOtp('otp-once', '123456');
    assert.equal(await verifyOtp('otp-once', '123456'), 'valid');
    assert.equal(await verifyOtp('otp-once', '123456'), 'invalid');
  });

  it('burns the code after too many wrong guesses', async () => {
    await storeOtp('otp-burn', '123456');
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      assert.equal(await verifyOtp('otp-burn', '000000'), 'invalid');
    }
    assert.equal(await verifyOtp('otp-burn', '000000'), 'locked');
    assert.equal(await verifyOtp('otp-burn', '123456'), 'invalid', 'the right code no longer works');
  });

  it('expires codes after the TTL', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    await storeOtp('otp-expiry', '123456');
    t.mock.timers.tick(OTP_TTL_SECONDS * 1000 + 1);
    assert.equal(await verifyOtp('otp-expiry', '123456'), 'invalid');
  });

  it('limits how many codes one number can request', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    for (let i = 0; i < OTP_MAX_SENDS; i++) assert.equal(await storeOtp('otp-sends', '111111'), true);
    assert.equal(await storeOtp('otp-sends', '111111'), false);
    t.mock.timers.tick(OTP_TTL_SECONDS * 1000 + 1);
    assert.equal(await storeOtp('otp-sends', '111111'), true, 'the window resets');
  });
});

describe('OTP routes', () => {
  it('phone OTP send is unavailable in production without a provider', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['OTP_PROVIDER'];
    const res = await fastify.inject({
      method: 'POST', url: '/v1/auth/otp/send', payload: { phone: '+919812345678' },
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'OTP_UNAVAILABLE');
  });

  it('email OTP send is unavailable in production and logs no code', async (t) => {
    process.env['NODE_ENV'] = 'production';
    const log = t.mock.method(console, 'log');
    const res = await fastify.inject({
      method: 'POST', url: '/v1/auth/email-otp/send', payload: { email: 'someone@example.com' },
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });
    assert.equal(res.statusCode, 501);
    assert.equal(res.json().error.code, 'EMAIL_OTP_UNAVAILABLE');
    assert.ok(!log.mock.calls.some((c) => String(c.arguments[0]).includes('someone@example.com')));
  });

  it('verify locks the code after the attempt limit', async () => {
    await storeOtp('+919800000001', '424242');
    let last;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      last = await fastify.inject({
        method: 'POST', url: '/v1/auth/otp/verify', payload: { phone: '+919800000001', otp: '000000' },
        headers: { 'x-forwarded-for': `198.51.100.${10 + i}` },
      });
    }
    assert.equal(last?.statusCode, 429);
    assert.equal(last?.json().error.code, 'OTP_LOCKED');

    const right = await fastify.inject({
      method: 'POST', url: '/v1/auth/otp/verify', payload: { phone: '+919800000001', otp: '424242' },
      headers: { 'x-forwarded-for': '198.51.100.30' },
    });
    assert.equal(right.statusCode, 400);
  });

  it('rate-limits verify per client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fastify.inject({
        method: 'POST', url: '/v1/auth/otp/verify', payload: { phone: '+919800000002', otp: '000000' },
        headers: { 'x-forwarded-for': '198.51.100.99' },
      });
      statuses.push(res.statusCode);
    }
    assert.deepEqual(statuses.slice(0, 5).every((s) => s !== 429), true);
    assert.equal(statuses[5], 429);
  });
});

describe('Google sign-in', () => {
  const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret' };

  function mockGoogle(t: import('node:test').TestContext, user: Record<string, unknown>) {
    t.mock.method(globalThis, 'fetch', async (...[input]: FetchArgs) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'google-access' });
      if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') return json(user);
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  async function signIn(state: string) {
    const callback = await fastify.inject({
      method: 'GET', url: `/v1/auth/google/callback?code=google-code&state=${encodeURIComponent(state)}`,
    });
    assert.equal(callback.statusCode, 302);
    const target = new URL(String(callback.headers['location']));
    const code = target.searchParams.get('code');
    if (!code) return { target, claims: null };
    const exchanged = await fastify.inject({ method: 'POST', url: '/v1/auth/oauth/exchange', payload: { code } });
    return { target, claims: fastify.jwt.verify<JwtUser>(exchanged.json().token) };
  }

  async function startState(): Promise<string> {
    const start = await fastify.inject({ method: 'GET', url: '/v1/auth/google' });
    assert.equal(start.statusCode, 302);
    return new URL(String(start.headers['location'])).searchParams.get('state')!;
  }

  it('rejects a callback without a valid state', async (t) => {
    Object.assign(process.env, GOOGLE_ENV);
    mockGoogle(t, { sub: 'x', name: 'X', email: 'x@example.com', email_verified: true });
    for (const state of ['signin', signOAuthState(fastify, 'platform_oauth')]) {
      const { target } = await signIn(state);
      assert.equal(target.searchParams.get('error'), 'invalid_state');
    }
  });

  it('a verified OWNER_EMAIL signs in as the global owner, separate from their dealership account', async (t) => {
    Object.assign(process.env, GOOGLE_ENV, { OWNER_EMAIL: ' someone@else.com , Boss@CarDekho.com ' });
    const dealer = await prisma.dealer.create({ data: { phone: 'boss-dealer', name: 'Boss Motors', city: '' } });
    const dealerAccount = await prisma.dealerUser.create({
      data: { phone: 'boss-dealer-user', email: 'boss@cardekho.com', name: 'Boss', role: 'admin', dealer_id: dealer.id, is_active: true },
    });
    mockGoogle(t, { sub: 'g-boss', name: 'The Boss', email: 'Boss@cardekho.com', email_verified: true });

    const { claims } = await signIn(await startState());
    assert.ok(claims);
    assert.equal(claims.role, 'owner');
    assert.equal(claims.dealer_id, null);
    assert.ok(isGlobalOwner(claims));
    assert.notEqual(claims.dealer_user_id, dealerAccount.id);

    const untouched = await prisma.dealerUser.findUnique({ where: { id: dealerAccount.id } });
    assert.equal(untouched?.role, 'admin');
    assert.equal(untouched?.dealer_id, dealer.id);

    // A second sign-in reuses the owner account.
    const again = await signIn(await startState());
    assert.equal(again.claims?.dealer_user_id, claims.dealer_user_id);
  });

  it('refuses an unverified email, even one on OWNER_EMAIL', async (t) => {
    Object.assign(process.env, GOOGLE_ENV, { OWNER_EMAIL: 'unverified@cardekho.com' });
    mockGoogle(t, { sub: 'g-unv', name: 'Unverified', email: 'unverified@cardekho.com', email_verified: false });
    const { target, claims } = await signIn(await startState());
    assert.equal(claims, null);
    assert.equal(target.searchParams.get('error'), 'email_unverified');
  });

  it('never resolves a regular sign-in to the owner record once the email leaves OWNER_EMAIL', async (t) => {
    Object.assign(process.env, GOOGLE_ENV, { OWNER_EMAIL: 'former-boss@cardekho.com' });
    mockGoogle(t, { sub: 'g-boss', name: 'Boss', email: 'former-boss@cardekho.com', email_verified: true });
    const first = await signIn(await startState());
    assert.ok(first.claims && isGlobalOwner(first.claims));

    process.env['OWNER_EMAIL'] = '';
    t.mock.restoreAll();
    mockGoogle(t, { sub: 'g-boss', name: 'Boss', email: 'former-boss@cardekho.com', email_verified: true });
    const { claims } = await signIn(await startState());
    assert.ok(claims);
    assert.ok(!isGlobalOwner(claims));
    assert.notEqual(claims.dealer_id, null);
  });

  it('other emails get the normal dealership flow', async (t) => {
    Object.assign(process.env, GOOGLE_ENV, { OWNER_EMAIL: 'boss@cardekho.com' });
    mockGoogle(t, { sub: 'g-dealer', name: 'Dealer', email: 'dealer@example.com', email_verified: true });
    const { claims } = await signIn(await startState());
    assert.ok(claims);
    assert.equal(claims.role, 'admin');
    assert.notEqual(claims.dealer_id, null);
  });
});
