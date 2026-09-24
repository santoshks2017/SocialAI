import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { prisma } from '../db/prisma.js';
import { exchangeForLongLivedToken, fetchManagedPages, type ManagedPage } from '../services/meta.js';
import { fetchGmbLocations, type GmbLocation } from '../services/gmb.js';
import { getFrontendUrl } from '../lib/frontendUrl.js';
import { issueHandoffCode, type SessionHandoff } from '../lib/oauthHandoff.js';
import { signOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { needsReconnect } from '../lib/platformHealth.js';
import { ACCOUNT_LIMIT_MESSAGE, MAX_CONNECTED_ACCOUNTS, byAge } from '../lib/connections.js';
import { saveConnection, saveConnections, type ConnectionInput } from '../lib/connectionStore.js';
import { discoverInstagram, instagramConnection } from '../lib/instagramDiscovery.js';

const META_APP_ID     = process.env['META_APP_ID']     ?? '';
const META_APP_SECRET = process.env['META_APP_SECRET'] ?? '';

// API_BASE_URL must be set to the deployed API URL in production (e.g. https://xxx.a.run.app)
const API_BASE_URL = process.env['API_BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3001}`;
const FRONTEND_URL = getFrontendUrl();

// Redirect URIs, registered in the Meta App Dashboard and Google Cloud Console. Google Business Profile and
// YouTube share the Google one.
const META_CALLBACK_URI   = `${API_BASE_URL}/v1/platforms/callback/meta`;
const GOOGLE_CALLBACK_URI = `${API_BASE_URL}/v1/platforms/callback/google`;
const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token';
const GOOGLE_TIMEOUT_MS   = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Shown on the OAuth return toast (the Google Business Profile copy is the reference's).
const NO_GBP_LOCATIONS = 'No Google Business locations found on this account. Make sure you have a verified Business Profile, then try again.';
const GBP_READ_FAILED = 'Could not read your Google Business Profile. Please try again, or contact support if it persists.';
const NO_INSTAGRAM = 'No Instagram Business account is linked to your Facebook Pages. Link one in Meta Business Suite, then try again.';
const INSTAGRAM_LOOKUP_FAILED = 'Couldn\u2019t reach Facebook to check your Pages. Try again, or reconnect Facebook if this keeps happening.';

// Instagram discovery calls one Graph endpoint per Page; running several in flight keeps a dealer with many
// Pages from stalling the OAuth redirect while staying well under Meta's rate limits.
const DISCOVERY_CONCURRENCY = 5;

// Local and demo connects: two Pages; lib/instagramDiscovery.ts links a mock Instagram account to the first.
const MOCK_PAGES: ManagedPage[] = [
  { id: 'mock_fb_page_id', name: 'Mock Dealership Page', access_token: 'mock_fb_page_token' },
  { id: 'mock_fb_page_id_2', name: 'Mock Dealership Page 2', access_token: 'mock_fb_page_token_2' },
];

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs `fn` over `items` with at most `concurrency` in flight, returning results in the same order as `items`. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await fn(items[index] as T, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// Page and OAuth tokens never leave the server.
function publicConnection(conn: Record<string, any>) {
  const { access_token: _a, refresh_token: _r, ...rest } = conn;
  return { ...rest, needs_reconnect: needsReconnect(conn as Parameters<typeof needsReconnect>[0]) };
}

type PlatformState = { dealer_id: string | null; platform?: string; signin?: boolean };

// Twitter (and YouTube without a Google client) are mock integrations that store fake tokens.
function mockPlatformsDisabled(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/** The Google OAuth client, read per request so tests (and a key rotation) see the current values. */
function googleClient(): { id: string; secret: string } | null {
  const id = process.env['GOOGLE_CLIENT_ID'];
  return id ? { id, secret: process.env['GOOGLE_CLIENT_SECRET'] ?? '' } : null;
}

async function exchangeGoogleCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const client = googleClient();
  const res = await axios.post<{ access_token: string; refresh_token?: string; expires_in: number }>(
    GOOGLE_TOKEN_URL,
    { code, client_id: client?.id ?? '', client_secret: client?.secret ?? '', redirect_uri: GOOGLE_CALLBACK_URI, grant_type: 'authorization_code' },
    { timeout: GOOGLE_TIMEOUT_MS },
  );
  return res.data;
}

// How many accounts a connect saved, for the return toast: accounts=<total>, plus fb / ig / google / youtube.
const COUNT_KEYS: ReadonlyArray<readonly [string, string]> = [['facebook', 'fb'], ['instagram', 'ig'], ['gmb', 'google'], ['youtube', 'youtube']];

function savedCountQuery(saved: ReadonlyArray<{ platform: string }>): string {
  const params = new URLSearchParams({ accounts: String(saved.length) });
  for (const [platform, key] of COUNT_KEYS) {
    const count = saved.filter((c) => c.platform === platform).length;
    if (count > 0) params.set(key, String(count));
  }
  return params.toString();
}

export default async function platformRoutes(fastify: FastifyInstance) {
  // GET /v1/platforms: list all connections for dealer
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const connections = await prisma.platformConnection.findMany({
      where: { dealer_id: request.user.dealer_id! },
    });
    return { success: true, platforms: connections.map(publicConnection) };
  });

  // GET /v1/platforms/connect/:platform: return OAuth URL as JSON
  // Supports two modes:
  //   - Default (requires auth JWT): links the platform to the existing dealer account
  //   - ?signin=1 (no auth required): creates a new account via social sign-in
  fastify.get('/connect/:platform', async (request, reply) => {
    const { platform: rawPlatform } = request.params as { platform: string };
    // google is the design's public name for the gmb platform.
    const platform = rawPlatform === 'google' ? 'gmb' : rawPlatform;
    const { signin, mock } = request.query as { signin?: string; mock?: string };
    const isSignin = signin === '1';
    const isMock = mock === 'true';

    if ((platform === 'twitter' || platform === 'youtube') && mockPlatformsDisabled()) {
      return reply.code(501).send({ error: { code: 'NOT_AVAILABLE', message: `${platform} connections are not available yet` } });
    }

    // For linking mode (not signin), require authentication
    let dealer_id: string | null = null;
    if (!isSignin) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return reply;
      dealer_id = request.user.dealer_id ?? null;

      // Enforce plan limits for platforms. Reconnecting one the dealer already has (e.g. an
      // expired token) adds nothing; Facebook and Instagram share one Meta connect flow.
      const samePlatforms = platform === 'facebook' || platform === 'instagram' ? ['facebook', 'instagram'] : [platform];
      const existing = dealer_id
        ? await prisma.platformConnection.findFirst({ where: { dealer_id, platform: { in: samePlatforms } } })
        : null;
      if (!existing) {
        const planGateHook = fastify.checkPlanLimit('platforms');
        await planGateHook(request, reply);
        if (reply.sent) return reply;
      }
    }

    if (platform === 'facebook' || platform === 'instagram') {
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform, signin: isSignin });
      if (isMock && process.env['NODE_ENV'] !== 'production') {
        const callbackUrl = `${API_BASE_URL}/v1/platforms/callback/meta?code=mock_facebook_code&state=${state}`;
        return { success: true, redirect_url: callbackUrl };
      }

      if (!META_APP_ID) {
        return reply.code(500).send({ error: { code: 'CONFIG_ERROR', message: 'META_APP_ID not configured' } });
      }
      const scopes = [
        'pages_manage_posts',
        'pages_read_engagement',
        'pages_manage_metadata',
        'pages_messaging',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_comments',
        'instagram_manage_messages',
        'ads_management',
      ].join(',');
      const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
      url.searchParams.set('client_id', META_APP_ID);
      url.searchParams.set('redirect_uri', META_CALLBACK_URI);
      url.searchParams.set('scope', scopes);
      url.searchParams.set('state', state);
      url.searchParams.set('response_type', 'code');
      return { success: true, redirect_url: url.toString() };
    }

    if (platform === 'gmb') {
      const google = googleClient();
      if (!google) {
        return reply.code(500).send({ error: { code: 'CONFIG_ERROR', message: 'GOOGLE_CLIENT_ID not configured' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform, signin: isSignin });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', google.id);
      url.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage email profile');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return { success: true, redirect_url: url.toString() };
    }

    // Twitter/X: mock OAuth only
    if (platform === 'twitter') {
      if (!dealer_id) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to link platforms' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform });
      // Mock: immediately redirect to our own callback (no real Twitter OAuth round-trip)
      const callbackUrl = `${API_BASE_URL}/v1/platforms/callback/twitter?code=mock_twitter_code&state=${state}`;
      return { success: true, redirect_url: callbackUrl };
    }

    // YouTube: mock OAuth (Task 5 adds real Google OAuth)
    if (platform === 'youtube') {
      if (!dealer_id) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to link platforms' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform });
      const callbackUrl = `${API_BASE_URL}/v1/platforms/callback/youtube?code=mock_youtube_code&state=${state}`;
      return { success: true, redirect_url: callbackUrl };
    }

    return reply.code(400).send({ error: { code: 'INVALID_PLATFORM', message: `Unknown platform: ${platform}` } });
  });

  // GET /v1/platforms/callback/twitter: mock Twitter/X OAuth callback: saves a demo connection.
  fastify.get('/callback/twitter', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=twitter`);

    if (mockPlatformsDisabled()) {
      return reply.code(501).send({ error: { code: 'NOT_AVAILABLE', message: 'twitter connections are not available yet' } });
    }

    if (oauthError || !code || !state) return fail(oauthError ?? 'Twitter login cancelled');

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || stateData.platform !== 'twitter') return fail('Invalid state');
    if (!stateData.dealer_id) return fail('Session expired. Please try again.');

    try {
      // Fetch dealer name for a realistic mock handle
      const dealer = await prisma.dealer.findUnique({ where: { id: stateData.dealer_id } });
      const handle = dealer?.name
        ? `@${dealer.name.toLowerCase().replace(/\s+/g, '').slice(0, 15)}`
        : '@dealershowroom';

      const outcome = await saveConnection(stateData.dealer_id, {
        platform: 'twitter',
        platform_account_id: `tw_${stateData.dealer_id.slice(0, 8)}`,
        platform_account_name: handle,
        access_token: 'mock_twitter_access_token',
        refresh_token: 'mock_twitter_refresh_token',
        token_expires_at: new Date(Date.now() + 90 * DAY_MS),
      });
      if (outcome.status === 'limit') return fail(ACCOUNT_LIMIT_MESSAGE);

      return reply.redirect(`${frontendCallback}?success=1&platform=twitter&page_name=${encodeURIComponent(handle)}&${savedCountQuery([outcome.connection])}`);
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'Twitter mock callback failed');
      return fail('Twitter connection failed');
    }
  });

  // GET /v1/platforms/callback/youtube: mock YouTube OAuth callback: saves a demo channel.
  fastify.get('/callback/youtube', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=youtube`);

    if (mockPlatformsDisabled()) {
      return reply.code(501).send({ error: { code: 'NOT_AVAILABLE', message: 'youtube connections are not available yet' } });
    }

    if (oauthError || !code || !state) return fail(oauthError ?? 'YouTube login cancelled');

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || stateData.platform !== 'youtube') return fail('Invalid state');
    if (!stateData.dealer_id) return fail('Session expired. Please try again.');

    try {
      const dealer = await prisma.dealer.findUnique({ where: { id: stateData.dealer_id } });
      const channelName = dealer?.name ? `${dealer.name} Official` : 'Dealership Channel';

      const outcome = await saveConnection(stateData.dealer_id, {
        platform: 'youtube',
        platform_account_id: `yt_${stateData.dealer_id.slice(0, 8)}`,
        platform_account_name: channelName,
        access_token: 'mock_youtube_access_token',
        refresh_token: 'mock_youtube_refresh_token',
        token_expires_at: new Date(Date.now() + 90 * DAY_MS),
      });
      if (outcome.status === 'limit') return fail(ACCOUNT_LIMIT_MESSAGE);

      return reply.redirect(`${frontendCallback}?success=1&platform=youtube&page_name=${encodeURIComponent(channelName)}&${savedCountQuery([outcome.connection])}`);
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'YouTube mock callback failed');
      return fail('YouTube connection failed');
    }
  });

  // GET /v1/platforms/callback/meta
  // Facebook redirects the browser here after the user authorises the app. Every Page the user manages is
  // saved, with the Instagram Business account linked to each; then the browser goes back to the web app.
  fastify.get('/callback/meta', async (request, reply) => {
    const { code, state, error: oauthError, error_description } = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=facebook`);

    if (oauthError || !code || !state) {
      fastify.log.warn({ oauthError, error_description }, 'Meta OAuth denied or missing params');
      return fail(error_description ?? oauthError ?? 'Missing code or state');
    }

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || (stateData.platform !== 'facebook' && stateData.platform !== 'instagram')) {
      return fail('Invalid state parameter');
    }

    try {
      let expiresAt: Date;
      let fbUser: { id: string; name: string; email?: string };
      let pages: ManagedPage[];
      let pagesTruncated = false;

      if (process.env['NODE_ENV'] !== 'production' && (code.startsWith('mock_') || code === 'test')) {
        expiresAt = new Date(Date.now() + 60 * DAY_MS);
        fbUser = { id: 'mock_fb_user_id', name: 'Mock FB User', email: 'mock@facebook.com' };
        pages = MOCK_PAGES;
      } else {
        // 1. Exchange the code for a short-lived user token, then for a long-lived one (60 days)
        const tokenRes = await axios.get<{ access_token: string }>('https://graph.facebook.com/v19.0/oauth/access_token', {
          params: {
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            redirect_uri: META_CALLBACK_URI,
            code,
          },
        });
        const { access_token: longLivedToken, expires_in } = await exchangeForLongLivedToken(tokenRes.data.access_token);
        expiresAt = new Date(Date.now() + expires_in * 1000);

        // 2. The user, and every Page they manage with its Page token
        const [meRes, managed] = await Promise.all([
          axios.get<{ id: string; name: string; email?: string }>('https://graph.facebook.com/v19.0/me', {
            params: { fields: 'id,name,email', access_token: longLivedToken },
          }),
          fetchManagedPages(longLivedToken, MAX_CONNECTED_ACCOUNTS),
        ]);
        fbUser = meRes.data;
        pages = managed.items;
        pagesTruncated = managed.truncated;
      }

      const firstPage = pages[0];
      if (!firstPage) {
        return fail(stateData.signin
          ? 'No Facebook Page found. Please create a Facebook Business Page first, then try again.'
          : 'No Facebook Page found. Create a Facebook Page first.');
      }

      // Social sign-in mode: create or find a dealer account
      let dealerId = stateData.dealer_id;
      let accessTokenForJwt: string | null = null;
      let refreshTokenForJwt: string | null = null;

      if (stateData.signin) {
        // Find existing dealer by FB user id, or create a new one
        const fbPhone = `fb_${fbUser.id}`;
        let dealer = await prisma.dealer.findFirst({ where: { phone: fbPhone } });
        if (!dealer) {
          dealer = await prisma.dealer.create({
            data: {
              phone: fbPhone,
              name: firstPage.name,
              city: '',
              contact_phone: '',
              onboarding_completed: false,
              onboarding_step: 2,
            },
          });
        }
        dealerId = dealer.id;

        // Create or find DealerUser
        const userPhone = `fb_user_${fbUser.id}`;
        let dealerUser = await prisma.dealerUser.findFirst({ where: { dealer_id: dealer.id } });
        if (!dealerUser) {
          dealerUser = await prisma.dealerUser.create({
            data: {
              phone: userPhone,
              name: fbUser.name,
              email: fbUser.email ?? null,
              role: 'admin',
              dealer_id: dealer.id,
              is_active: true,
            },
          });
        }

        // Generate JWT for this new session
        const { resolvePermissions } = await import('../lib/permissions.js');
        type JwtUserLocal = { dealer_user_id: string; dealer_id: string | null; role: 'owner' | 'admin' | 'user'; phone: string; permissions: Record<string, boolean> };
        const permissions = resolvePermissions(dealerUser.role);
        const jwtPayload: JwtUserLocal = {
          dealer_user_id: dealerUser.id,
          dealer_id: dealer.id,
          role: dealerUser.role as 'admin',
          phone: userPhone,
          permissions,
        };
        accessTokenForJwt = fastify.jwt.sign({ ...jwtPayload, typ: 'access' }, { expiresIn: '30d' });
        refreshTokenForJwt = fastify.jwt.sign({ ...jwtPayload, typ: 'refresh' }, { expiresIn: '90d' });
      }

      if (!dealerId) return fail('Session expired. Please try again.');

      // 3. Every Page, and the Instagram Business account linked to each. Pages beyond the cap can never be
      // saved, so their Instagram lookup is skipped; the rest run with bounded concurrency (a browser is
      // waiting on this redirect) but stay in Page order in the saved list.
      const pagesForDiscovery = pages.slice(0, MAX_CONNECTED_ACCOUNTS);
      const instagrams = await mapWithConcurrency(pagesForDiscovery, DISCOVERY_CONCURRENCY, async (page) => {
        try {
          return await discoverInstagram(page.id, page.access_token);
        } catch (err) {
          fastify.log.warn({ message: errorText(err) }, 'Could not read the Instagram account linked to a Facebook Page');
          return null;
        }
      });
      const accounts: ConnectionInput[] = [];
      pages.forEach((page, index) => {
        accounts.push({
          platform: 'facebook',
          platform_account_id: page.id,
          platform_account_name: page.name,
          access_token: page.access_token,
          token_expires_at: expiresAt,
        });
        const ig = instagrams[index];
        if (ig) accounts.push(instagramConnection(ig, page.access_token, expiresAt));
      });
      const { saved, limitReached } = await saveConnections(dealerId, accounts);
      const connected = [...new Set(saved.map((c) => c.platform))].join(',') || 'facebook';

      // For social sign-in: hand the JWTs to the frontend through a one-time code
      // (redeemed via POST /v1/auth/oauth/exchange) so they never appear in a URL
      if (stateData.signin && accessTokenForJwt) {
        const handoffCode = await issueHandoffCode('session', {
          token: accessTokenForJwt,
          refreshToken: refreshTokenForJwt ?? '',
        } satisfies SessionHandoff);
        return reply.redirect(
          `${FRONTEND_URL}/auth/callback?code=${handoffCode}&platform=${encodeURIComponent(connected)}&page_name=${encodeURIComponent(firstPage.name)}`
        );
      }

      if (limitReached || pagesTruncated) return fail(ACCOUNT_LIMIT_MESSAGE);
      return reply.redirect(
        `${frontendCallback}?success=1&platform=${encodeURIComponent(connected)}&page_name=${encodeURIComponent(firstPage.name)}&${savedCountQuery(saved)}`
      );
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'Meta OAuth callback failed');
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Connection failed';
      return fail(msg);
    }
  });

  // GET /v1/platforms/callback/google
  // Google redirects the browser here after consent: every Business Profile location is saved.
  fastify.get('/callback/google', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=google`);

    if (oauthError || !code || !state) return fail(oauthError ?? 'Google login cancelled');

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || stateData.platform !== 'gmb') return fail('Invalid state');

    try {
      const { access_token, refresh_token, expires_in } = await exchangeGoogleCode(code);
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Google user info (for sign-in mode)
      const googleUserRes = await axios.get<{ id: string; name: string; email?: string }>(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${access_token}` }, timeout: GOOGLE_TIMEOUT_MS },
      ).catch(() => ({ data: { id: '', name: 'Google User', email: undefined } }));
      const googleUser = googleUserRes.data;

      // Every location across the user's Business Profile accounts
      let locations: GmbLocation[] = [];
      let locationsTruncated = false;
      let lookupFailed = false;
      try {
        const result = await fetchGmbLocations(access_token, MAX_CONNECTED_ACCOUNTS);
        locations = result.items;
        locationsTruncated = result.truncated;
      } catch (err) {
        lookupFailed = true;
        fastify.log.warn({ message: errorText(err) }, 'Could not list Google Business Profile locations');
      }
      const displayName = locations[0]?.title ?? googleUser.name;

      // Social sign-in mode: create or find dealer account
      let dealerId = stateData.dealer_id;
      let jwtToken: string | null = null;
      let jwtRefresh: string | null = null;

      if (stateData.signin) {
        const gPhone = `google_${googleUser.id || Date.now()}`;
        let dealer = await prisma.dealer.findFirst({ where: { phone: gPhone } });
        if (!dealer) {
          dealer = await prisma.dealer.create({
            data: {
              phone: gPhone,
              name: displayName,
              city: '',
              contact_phone: '',
              onboarding_completed: false,
              onboarding_step: 2,
            },
          });
        }
        dealerId = dealer.id;

        let dealerUser = await prisma.dealerUser.findFirst({ where: { dealer_id: dealer.id } });
        if (!dealerUser) {
          dealerUser = await prisma.dealerUser.create({
            data: {
              phone: gPhone,
              name: googleUser.name,
              email: googleUser.email ?? null,
              role: 'admin',
              dealer_id: dealer.id,
              is_active: true,
            },
          });
        }

        const { resolvePermissions } = await import('../lib/permissions.js');
        const permissions = resolvePermissions(dealerUser.role);
        type JwtUserLocal = { dealer_user_id: string; dealer_id: string | null; role: 'owner' | 'admin' | 'user'; phone: string; permissions: Record<string, boolean> };
        const jwtPayload: JwtUserLocal = {
          dealer_user_id: dealerUser.id,
          dealer_id: dealer.id,
          role: 'admin',
          phone: gPhone,
          permissions,
        };
        jwtToken = fastify.jwt.sign({ ...jwtPayload, typ: 'access' }, { expiresIn: '30d' });
        jwtRefresh = fastify.jwt.sign({ ...jwtPayload, typ: 'refresh' }, { expiresIn: '90d' });
      }

      if (!dealerId) return fail('Session expired. Please try again.');

      const { saved, limitReached } = await saveConnections(dealerId, locations.map((location) => ({
        platform: 'gmb',
        platform_account_id: location.name,
        platform_account_name: location.title,
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
      })));

      if (stateData.signin && jwtToken) {
        const handoffCode = await issueHandoffCode('session', {
          token: jwtToken,
          refreshToken: jwtRefresh ?? '',
        } satisfies SessionHandoff);
        return reply.redirect(
          `${FRONTEND_URL}/auth/callback?code=${handoffCode}&platform=gmb&page_name=${encodeURIComponent(displayName)}`
        );
      }

      if (lookupFailed) return fail(GBP_READ_FAILED);
      if (locations.length === 0) return fail(NO_GBP_LOCATIONS);
      if (limitReached || locationsTruncated) return fail(ACCOUNT_LIMIT_MESSAGE);
      return reply.redirect(
        `${frontendCallback}?success=1&platform=google&page_name=${encodeURIComponent(displayName)}&${savedCountQuery(saved)}`
      );
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'Google OAuth callback failed');
      return fail('Google connection failed');
    }
  });

  // POST /v1/platforms/sync-instagram: links the Instagram Business accounts of the connected Facebook Pages
  fastify.post('/sync-instagram', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Sign in to a dealership account first.' } });
    }

    const pages = (await prisma.platformConnection.findMany({
      where: { dealer_id: dealerId, platform: 'facebook', is_connected: true },
    })).sort(byAge);
    const found: ConnectionInput[] = [];
    let failures = 0;
    for (const page of pages) {
      try {
        const ig = await discoverInstagram(page.platform_account_id, page.access_token);
        if (ig) found.push(instagramConnection(ig, page.access_token, page.token_expires_at));
      } catch (err) {
        failures++;
        request.log.warn({ message: errorText(err) }, '[platforms] Instagram discovery failed for a Page');
      }
    }
    if (found.length === 0) {
      // Every lookup threw (a bad Page token, a Graph outage): say so, rather than the wrong "not linked".
      if (pages.length > 0 && failures === pages.length) {
        return reply.code(502).send({ error: { code: 'INSTAGRAM_LOOKUP_FAILED', message: INSTAGRAM_LOOKUP_FAILED } });
      }
      return reply.code(404).send({ error: { code: 'NO_INSTAGRAM', message: NO_INSTAGRAM } });
    }

    // Instagram found here rides along with its already-connected Facebook Page, the same as the Meta
    // connect callback's auto-link above; no plan-limit check (only MAX_CONNECTED_ACCOUNTS applies).
    const { saved, limitReached } = await saveConnections(dealerId, found);
    if (saved.length === 0 && limitReached) {
      return reply.code(409).send({ error: { code: 'ACCOUNT_LIMIT', message: ACCOUNT_LIMIT_MESSAGE } });
    }
    return { found: saved.length, accountName: saved[0]?.platform_account_name ?? null };
  });

  // DELETE /v1/platforms/:platform: disconnect every account of a platform
  fastify.delete('/:platform', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const { platform } = request.params as { platform: string };
    await prisma.platformConnection.updateMany({
      where: { dealer_id, platform },
      data: { is_connected: false },
    });
    return { success: true, message: `${platform} disconnected` };
  });
}
