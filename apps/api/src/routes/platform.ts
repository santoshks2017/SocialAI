import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import axios from 'axios';
import { exchangeForLongLivedToken, getPageAccessToken } from '../services/meta.js';

const META_APP_ID     = process.env['META_APP_ID']     ?? '';
const META_APP_SECRET = process.env['META_APP_SECRET'] ?? '';
const GOOGLE_CLIENT_ID     = process.env['GOOGLE_CLIENT_ID']     ?? '';
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] ?? '';

// API_BASE_URL must be set to the deployed API URL in production (e.g. https://xxx.vercel.app)
const API_BASE_URL      = process.env['API_BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3001}`;
const FRONTEND_URL      = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';

// Redirect URIs — these must be registered in Meta App Dashboard / Google Cloud Console
const META_CALLBACK_URI   = `${API_BASE_URL}/v1/platforms/callback/meta`;
const GOOGLE_CALLBACK_URI = `${API_BASE_URL}/v1/platforms/callback/google`;

export default async function platformRoutes(fastify: FastifyInstance) {
  // GET /v1/platforms  — list all connections for dealer
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const connections = await prisma.platformConnection.findMany({
      where: { dealer_id: request.user.dealer_id! },
    });
    return { success: true, platforms: connections };
  });

  // GET /v1/platforms/connect/:platform  — return OAuth URL as JSON
  // Supports two modes:
  //   - Default (requires auth JWT): links the platform to the existing dealer account
  //   - ?signin=1 (no auth required): creates a new account via social sign-in
  fastify.get('/connect/:platform', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const { signin } = request.query as { signin?: string };
    const isSignin = signin === '1';

    // For linking mode (not signin), require authentication
    let dealer_id: string | null = null;
    if (!isSignin) {
      try {
        await request.jwtVerify();
        dealer_id = request.user.dealer_id ?? null;
        
        // Enforce plan limits for platforms
        const planGateHook = fastify.checkPlanLimit('platforms');
        await planGateHook(request, reply);
        if (reply.sent) return;
      } catch (err: any) {
        if (reply.sent) return;
        return reply.code(err.statusCode || 401).send({
          error: {
            code: err.code || 'UNAUTHORIZED',
            message: err.message || 'Authentication required to link platforms',
          },
        });
      }
    }

    if (platform === 'facebook' || platform === 'instagram') {
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
      const state = Buffer.from(JSON.stringify({ dealer_id, platform, signin: isSignin })).toString('base64url');
      const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
      url.searchParams.set('client_id', META_APP_ID);
      url.searchParams.set('redirect_uri', META_CALLBACK_URI);
      url.searchParams.set('scope', scopes);
      url.searchParams.set('state', state);
      url.searchParams.set('response_type', 'code');
      return { success: true, redirect_url: url.toString() };
    }

    if (platform === 'gmb') {
      if (!GOOGLE_CLIENT_ID) {
        return reply.code(500).send({ error: { code: 'CONFIG_ERROR', message: 'GOOGLE_CLIENT_ID not configured' } });
      }
      const state = Buffer.from(JSON.stringify({ dealer_id, signin: isSignin })).toString('base64url');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      url.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage email profile');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return { success: true, redirect_url: url.toString() };
    }

    return reply.code(400).send({ error: { code: 'INVALID_PLATFORM', message: `Unknown platform: ${platform}` } });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/platforms/callback/meta
  // Facebook redirects the browser here after the user authorises the app.
  // We exchange the code for tokens, save them, then redirect back to the
  // frontend settings page with a success/error indicator.
  // ─────────────────────────────────────────────────────────────────────────────
  fastify.get('/callback/meta', async (request, reply) => {
    const { code, state, error: oauthError, error_description } = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const frontendSettings = `${FRONTEND_URL}/settings?tab=platforms`;

    if (oauthError || !code || !state) {
      const msg = oauthError ?? 'Missing code or state';
      fastify.log.warn({ oauthError, error_description }, 'Meta OAuth denied or missing params');
      return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent(error_description ?? msg)}&platform=facebook`);
    }

    let stateData: { dealer_id: string | null; platform?: string; signin?: boolean };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent('Invalid state parameter')}&platform=facebook`);
    }

    try {
      // 1. Exchange auth code for short-lived user access token
      const tokenRes = await axios.get<{ access_token: string }>('https://graph.facebook.com/v19.0/oauth/access_token', {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: META_CALLBACK_URI,
          code,
        },
      });
      const shortLivedToken = tokenRes.data.access_token;

      // 2. Exchange for long-lived token (60 days)
      const { access_token: longLivedToken, expires_in } = await exchangeForLongLivedToken(shortLivedToken);
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // 3. Fetch user info + Facebook Pages the user manages
      const [meRes, pagesRes] = await Promise.all([
        axios.get<{ id: string; name: string; email?: string }>('https://graph.facebook.com/v19.0/me', {
          params: { fields: 'id,name,email', access_token: longLivedToken },
        }),
        axios.get<{ data: Array<{ id: string; name: string }> }>('https://graph.facebook.com/v19.0/me/accounts', {
          params: { access_token: longLivedToken },
        }),
      ]);
      const fbUser = meRes.data;
      const page = pagesRes.data.data[0];

      if (!page) {
        const errMsg = stateData.signin
          ? 'No Facebook Page found. Please create a Facebook Business Page first, then try again.'
          : 'No Facebook Page found. Create a Facebook Page first.';
        return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent(errMsg)}&platform=facebook`);
      }

      // 4. Get non-expiring Page access token
      const pageToken = await getPageAccessToken(longLivedToken, page.id);

      // ── Social Sign-In Mode: create or find a dealer account ─────────────────
      let dealerId = stateData.dealer_id;
      let accessTokenForJwt: string | null = null;
      let refreshTokenForJwt: string | null = null;

      if (stateData.signin) {
        // Find existing dealer by FB user id or email, or create a new one
        const fbPhone = `fb_${fbUser.id}`;
        let dealer = await prisma.dealer.findFirst({ where: { phone: fbPhone } });
        if (!dealer) {
          dealer = await prisma.dealer.create({
            data: {
              phone: fbPhone,
              name: page.name,
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
        accessTokenForJwt = fastify.jwt.sign(jwtPayload, { expiresIn: '30d' });
        refreshTokenForJwt = fastify.jwt.sign(jwtPayload, { expiresIn: '90d' });
      }

      if (!dealerId) {
        return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent('Session expired. Please try again.')}&platform=facebook`);
      }

      // 5. Save Facebook connection
      await prisma.platformConnection.upsert({
        where: { dealer_id_platform: { dealer_id: dealerId, platform: 'facebook' } },
        create: {
          dealer_id: dealerId,
          platform: 'facebook',
          platform_account_id: page.id,
          platform_account_name: page.name,
          access_token: pageToken,
          token_expires_at: expiresAt,
          is_connected: true,
        },
        update: {
          platform_account_id: page.id,
          platform_account_name: page.name,
          access_token: pageToken,
          token_expires_at: expiresAt,
          is_connected: true,
        },
      });

      // 6. Check for connected Instagram Business account and save it too
      let igConnected = false;
      try {
        const igRes = await axios.get<{ instagram_business_account?: { id: string } }>(
          `https://graph.facebook.com/v19.0/${page.id}`,
          { params: { fields: 'instagram_business_account', access_token: pageToken } },
        );
        const igId = igRes.data.instagram_business_account?.id;
        if (igId) {
          const igNameRes = await axios.get<{ username: string }>(
            `https://graph.facebook.com/v19.0/${igId}`,
            { params: { fields: 'username', access_token: pageToken } },
          );
          await prisma.platformConnection.upsert({
            where: { dealer_id_platform: { dealer_id: dealerId, platform: 'instagram' } },
            create: {
              dealer_id: dealerId,
              platform: 'instagram',
              platform_account_id: igId,
              platform_account_name: `@${igNameRes.data.username}`,
              access_token: pageToken,
              token_expires_at: expiresAt,
              is_connected: true,
            },
            update: {
              platform_account_id: igId,
              platform_account_name: `@${igNameRes.data.username}`,
              access_token: pageToken,
              token_expires_at: expiresAt,
              is_connected: true,
            },
          });
          igConnected = true;
        }
      } catch (igErr) {
        fastify.log.warn(igErr, 'Could not fetch Instagram Business account');
      }

      const connected = igConnected ? 'facebook,instagram' : 'facebook';

      // For social sign-in: redirect to frontend with JWT so the user is logged in
      if (stateData.signin && accessTokenForJwt) {
        return reply.redirect(
          `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(accessTokenForJwt)}&refresh=${encodeURIComponent(refreshTokenForJwt ?? '')}&platform=${encodeURIComponent(connected)}&page_name=${encodeURIComponent(page.name)}`
        );
      }

      return reply.redirect(`${frontendSettings}&oauth_success=${encodeURIComponent(connected)}&page_name=${encodeURIComponent(page.name)}`);

    } catch (err) {
      fastify.log.error(err, 'Meta OAuth callback failed');
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Connection failed';
      return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent(msg)}&platform=facebook`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/platforms/callback/google
  // Google redirects the browser here after consent.
  // ─────────────────────────────────────────────────────────────────────────────
  fastify.get('/callback/google', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendSettings = `${FRONTEND_URL}/settings?tab=platforms`;

    if (oauthError || !code || !state) {
      return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent(oauthError ?? 'Google login cancelled')}&platform=gmb`);
    }

    let stateData: { dealer_id: string | null; signin?: boolean };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent('Invalid state')}&platform=gmb`);
    }

    try {
      const tokenRes = await axios.post<{ access_token: string; refresh_token?: string; expires_in: number }>(
        'https://oauth2.googleapis.com/token',
        {
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_CALLBACK_URI,
          grant_type: 'authorization_code',
        },
      );
      const { access_token, refresh_token, expires_in } = tokenRes.data;

      // Fetch Google user info (for sign-in mode)
      const googleUserRes = await axios.get<{ id: string; name: string; email?: string }>(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${access_token}` } },
      ).catch(() => ({ data: { id: '', name: 'Google User', email: undefined } }));
      const googleUser = googleUserRes.data;

      // Fetch GMB account
      const accountsRes = await axios.get<{ accounts: Array<{ name: string; accountName: string }> }>(
        'https://mybusiness.googleapis.com/v4/accounts',
        { headers: { Authorization: `Bearer ${access_token}` } },
      ).catch(() => ({ data: { accounts: [] } }));
      const account = accountsRes.data.accounts?.[0];

      // Fetch first location
      let locationName = account?.name ?? `google_${googleUser.id}`;
      let displayName = account?.accountName ?? googleUser.name;
      if (account) {
        try {
          const locRes = await axios.get<{ locations: Array<{ name: string; locationName: string }> }>(
            `https://mybusiness.googleapis.com/v4/${account.name}/locations`,
            { headers: { Authorization: `Bearer ${access_token}` } },
          );
          const loc = locRes.data.locations?.[0];
          if (loc) { locationName = loc.name; displayName = loc.locationName; }
        } catch { /* ignore — account-level fallback */ }
      }

      // ── Social Sign-In Mode: create or find dealer account ───────────────────
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
        jwtToken = fastify.jwt.sign(jwtPayload, { expiresIn: '30d' });
        jwtRefresh = fastify.jwt.sign(jwtPayload, { expiresIn: '90d' });
      }

      if (!dealerId) {
        return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent('Session expired. Please try again.')}&platform=gmb`);
      }

      if (account) {
        await prisma.platformConnection.upsert({
          where: { dealer_id_platform: { dealer_id: dealerId, platform: 'gmb' } },
          create: {
            dealer_id: dealerId, platform: 'gmb',
            platform_account_id: locationName, platform_account_name: displayName,
            access_token, refresh_token: refresh_token ?? null,
            token_expires_at: new Date(Date.now() + expires_in * 1000),
            is_connected: true,
          },
          update: {
            platform_account_id: locationName, platform_account_name: displayName,
            access_token, ...(refresh_token ? { refresh_token } : {}),
            token_expires_at: new Date(Date.now() + expires_in * 1000),
            is_connected: true,
          },
        });
      }

      if (stateData.signin && jwtToken) {
        return reply.redirect(
          `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(jwtToken)}&refresh=${encodeURIComponent(jwtRefresh ?? '')}&platform=gmb&page_name=${encodeURIComponent(displayName)}`
        );
      }

      return reply.redirect(`${frontendSettings}&oauth_success=${encodeURIComponent('gmb')}&page_name=${encodeURIComponent(displayName)}`);

    } catch (err) {
      fastify.log.error(err, 'Google OAuth callback failed');
      return reply.redirect(`${frontendSettings}&oauth_error=${encodeURIComponent('Google connection failed')}&platform=gmb`);
    }
  });

  // DELETE /v1/platforms/:platform  — disconnect
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
