import type { FastifyInstance } from "fastify"
import { prisma } from "../db/prisma.js"
import { resolvePermissions, ROLES } from "../lib/permissions.js"
import type { Role, JwtUser } from "../lib/permissions.js"
import { setOtp, getOtp, deleteOtp } from "../lib/otpStore.js"
import { SEED_PAGES, scrapePublicPage, extractPatterns } from "../services/socialScraper.js"
import { saveAccount } from "../services/platformConnections.js"

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendOtp(phone: string, otp: string): Promise<void> {
  const provider = process.env["OTP_PROVIDER"]

  if (!provider || process.env["NODE_ENV"] === "development") {
    // Dev mode: accept '1234' as universal bypass code
    console.log(`[OTP] ${phone} → ****** (dev mode)`)
    return
  }

  if (provider === "twilio") {
    const { default: axios } = await import("axios")
    const sid = process.env["TWILIO_ACCOUNT_SID"]
    const token = process.env["TWILIO_AUTH_TOKEN"]
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      new URLSearchParams({
        Body: `Your Cardeko Social AI OTP is ${otp}. Valid for 10 minutes.`,
        From: process.env["TWILIO_PHONE_NUMBER"] ?? "",
        To: phone,
      }),
      { auth: { username: sid ?? "", password: token ?? "" } },
    )
    return
  }

  if (provider === "msg91") {
    const { default: axios } = await import("axios")
    await axios.post("https://api.msg91.com/api/v5/otp", {
      template_id: process.env["MSG91_TEMPLATE_ID"],
      mobile: phone.replace("+", ""),
      authkey: process.env["MSG91_AUTH_KEY"],
      otp,
    })
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /v1/auth/otp/send
  fastify.post("/otp/send", async (request, reply) => {
    const { phone } = request.body as { phone?: string }
    if (!phone || !/^\+?[0-9]{10,13}$/.test(phone.replace(/\s/g, ""))) {
      return reply.code(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "Valid phone number is required",
        },
      })
    }

    const otp = generateOtp()
    await setOtp(phone, otp)

    try {
      await sendOtp(phone, otp)
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({
        error: { code: "OTP_SEND_FAILED", message: "Failed to send OTP" },
      })
    }

    return { success: true, message: `OTP sent to ${phone}` }
  })

  // POST /v1/auth/otp/verify
  fastify.post("/otp/verify", async (request, reply) => {
    const { phone, otp } = request.body as { phone?: string; otp?: string }
    if (!phone || !otp) {
      return reply.code(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "phone and otp are required",
        },
      })
    }

    // Dev bypass
    const isDev = process.env["NODE_ENV"] === "development"
    const storedOtp = await getOtp(phone)
    const valid = (isDev && otp === "1234") || (storedOtp && storedOtp === otp)

    if (!valid) {
      return reply.code(400).send({
        error: { code: "INVALID_OTP", message: "Incorrect or expired OTP" },
      })
    }

    await deleteOtp(phone)

    const ownerPhone = process.env["OWNER_PHONE"]

    // ── Owner account ────────────────────────────────────────────────────────
    if (ownerPhone && phone === ownerPhone) {
      const ownerUser = await prisma.dealerUser.upsert({
        where: { phone },
        create: {
          phone,
          name: "Product Owner",
          role: ROLES.OWNER,
          dealer_id: null,
          is_active: true,
        },
        update: {},
      })
      const permissions = resolvePermissions(ownerUser.role)
      const payload: JwtUser = {
        dealer_user_id: ownerUser.id,
        dealer_id: null,
        role: ownerUser.role as Role,
        phone,
        permissions,
      }
      const token = fastify.jwt.sign(payload, {
        expiresIn: process.env["JWT_EXPIRES_IN"] ?? "15m",
      })
      const refreshToken = fastify.jwt.sign(payload, {
        expiresIn: process.env["JWT_REFRESH_EXPIRES_IN"] ?? "30d",
      })
      const crypto = await import("crypto")
      await prisma.userSession.create({
        data: {
          dealer_user_id: ownerUser.id,
          token_hash: crypto.createHash("sha256").update(token).digest("hex"),
          ip_address: request.ip,
          user_agent: request.headers["user-agent"] ?? null,
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        },
      })
      return {
        token,
        refreshToken,
        user: {
          id: ownerUser.id,
          name: ownerUser.name,
          role: ownerUser.role,
          dealer_id: null,
          permissions,
          onboarding_completed: true,
        },
      }
    }

    // ── Find existing DealerUser ─────────────────────────────────────────────
    const existingUser = await prisma.dealerUser.findUnique({
      where: { phone },
    })

    if (existingUser && !existingUser.is_active) {
      return reply.code(403).send({
        error: {
          code: "ACCOUNT_INACTIVE",
          message: "Your account is inactive. Ask your admin to re-enable it.",
        },
      })
    }

    let dealerUser = existingUser
    let dealer = existingUser?.dealer_id
      ? await prisma.dealer.findUnique({
          where: { id: existingUser.dealer_id },
        })
      : null

    // ── First-time registration: create Dealer org + admin user ──────────────
    if (!dealerUser) {
      dealer = await prisma.dealer.upsert({
        where: { phone },
        create: { phone, name: "New Dealer", city: "", onboarding_step: 1 },
        update: {},
      })
      dealerUser = await prisma.dealerUser.create({
        data: {
          phone,
          name: "Admin",
          role: ROLES.ADMIN,
          dealer_id: dealer.id,
          is_active: true,
        },
      })
    }

    const permissions = resolvePermissions(
      dealerUser.role,
      dealerUser.permissions as Record<string, boolean> | null,
    )
    const payload: JwtUser = {
      dealer_user_id: dealerUser.id,
      dealer_id: dealerUser.dealer_id,
      role: dealerUser.role as Role,
      phone,
      permissions,
    }
    const token = fastify.jwt.sign(payload, {
      expiresIn: process.env["JWT_EXPIRES_IN"] ?? "15m",
    })
    const refreshToken = fastify.jwt.sign(payload, {
      expiresIn: process.env["JWT_REFRESH_EXPIRES_IN"] ?? "30d",
    })

    // Store session
    const crypto = await import("crypto")
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
    await prisma.userSession.create({
      data: {
        dealer_user_id: dealerUser.id,
        token_hash: tokenHash,
        ip_address: request.ip,
        user_agent: request.headers["user-agent"] ?? null,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    })

    // Log login
    if (dealerUser.dealer_id) {
      await prisma.activityLog.create({
        data: {
          dealer_id: dealerUser.dealer_id,
          dealer_user_id: dealerUser.id,
          action: "auth.login",
          entity_type: "dealer_user",
          entity_id: dealerUser.id,
          ip_address: request.ip,
          user_agent: request.headers["user-agent"] ?? null,
        },
      })
    }

    return {
      token,
      refreshToken,
      user: {
        id: dealerUser.id,
        name: dealerUser.name,
        role: dealerUser.role,
        dealer_id: dealerUser.dealer_id,
        permissions,
        onboarding_completed: dealer?.onboarding_completed ?? false,
        onboarding_step: dealer?.onboarding_step ?? 1,
      },
    }
  })

  // POST /v1/auth/demo — issues a JWT for a sandboxed demo dealer, no OTP required
  fastify.post("/demo", async (_request, reply) => {
    const demoPhone = "+0000000001"
    try {
      // Track whether this is the very first creation so we can seed patterns
      const existing = await prisma.dealer.findUnique({ where: { phone: demoPhone } })

      const demoDealer = await prisma.dealer.upsert({
        where: { phone: demoPhone },
        create: {
          phone: demoPhone,
          name: "Demo Dealership",
          city: "Mumbai",
          brands: ["Maruti Suzuki", "Hyundai"],
          contact_phone: "+91-9999999999",
          whatsapp_number: "+91-9999999999",
          primary_color: "#f97316",
          onboarding_step: 4,
          onboarding_completed: true,
        },
        update: {},
      })

      // On first boot: seed inspiration patterns in the background (fire & forget)
      if (!existing) {
        const dealerId = demoDealer.id
        void (async () => {
          // Scrape a focused subset (3 pages) to keep startup fast
          const seedSubset = SEED_PAGES.slice(0, 3)
          for (const page of seedSubset) {
            try {
              const posts = await scrapePublicPage(page.url)
              const patterns = extractPatterns(posts)
              fastify.log.info(`[Demo seed] ${page.name}: ${posts.length} posts, types: ${patterns.detected_post_types.join(', ')}`)
              if (posts.length > 0) {
                await prisma.inspirationHandle.upsert({
                  where: { dealer_id_handle_url: { dealer_id: dealerId, handle_url: page.url } },
                  create: {
                    dealer_id: dealerId,
                    handle_url: page.url,
                    platform: page.platform,
                    handle_name: `${page.brand} — ${page.state}`,
                    posts_cache: posts,
                    last_scraped_at: new Date(),
                  },
                  update: { posts_cache: posts, last_scraped_at: new Date() },
                })
              }
            } catch (e) {
              fastify.log.warn(`[Demo seed] Failed to scrape ${page.name}: ${String(e)}`)
            }
          }
        })()
      }

      const demoUser = await prisma.dealerUser.upsert({
        where: { phone: demoPhone },
        create: {
          phone: demoPhone,
          name: "Demo User",
          role: ROLES.OWNER,
          dealer_id: demoDealer.id,
          is_active: true,
        },
        update: {},
      })

      const permissions = resolvePermissions(ROLES.OWNER)
      const payload: JwtUser = {
        dealer_user_id: demoUser.id,
        dealer_id: demoDealer.id,
        role: ROLES.OWNER as Role,
        phone: demoPhone,
        permissions,
      }
      const token = fastify.jwt.sign(payload, { expiresIn: "8h" })
      const refreshToken = fastify.jwt.sign(payload, {
        expiresIn: process.env["JWT_REFRESH_EXPIRES_IN"] ?? "30d",
      })

      return {
        token,
        refreshToken,
        user: {
          id: demoUser.id,
          name: demoUser.name,
          role: demoUser.role,
          dealer_id: demoDealer.id,
          permissions,
          onboarding_completed: true,
          onboarding_step: 4,
        },
      }
    } catch (err) {
      fastify.log.error(err, "Demo login failed")
      return reply.code(503).send({
        error: { code: "DEMO_UNAVAILABLE", message: "Demo service temporarily unavailable" },
      })
    }
  })

  // POST /v1/auth/refresh
  fastify.post("/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string }
    if (!refreshToken) {
      return reply.code(400).send({
        error: { code: "MISSING_TOKEN", message: "refreshToken is required" },
      })
    }

    try {
      const payload = fastify.jwt.verify<JwtUser>(refreshToken)
      const token = fastify.jwt.sign(
        {
          dealer_user_id: payload.dealer_user_id,
          dealer_id: payload.dealer_id,
          role: payload.role,
          phone: payload.phone,
          permissions: payload.permissions,
        },
        { expiresIn: process.env["JWT_EXPIRES_IN"] ?? "15m" },
      )
      return { token }
    } catch {
      return reply.code(401).send({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid or expired refresh token",
        },
      })
    }
  })

  // ─── Facebook OAuth ────────────────────────────────────────────────────────

  const FB_API_VERSION = 'v18.0';
  const FB_SCOPES = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'].join(',');

  // Encode dealer_id into the OAuth state so the callback knows which dealer to associate accounts with.
  function encodeOAuthState(dealerId: string): string {
    return Buffer.from(dealerId, 'utf8').toString('base64url');
  }
  function decodeOAuthState(state: string): string | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      // Basic sanity check — dealer IDs are UUIDs or similar short strings
      if (!decoded || decoded.length > 200) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  // Extract and verify dealer_id from the access_token query param sent by the frontend.
  function extractDealerFromToken(token: string | undefined): string | null {
    if (!token) return null;
    try {
      const payload = fastify.jwt.verify<JwtUser>(token);
      return payload.dealer_id ?? null;
    } catch {
      return null;
    }
  }

  fastify.get('/facebook', async (request, reply) => {
    const META_APP_ID = process.env['META_APP_ID'];
    const META_REDIRECT_URI = process.env['META_REDIRECT_URI'];
    const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://cardekho-social-ai-web.vercel.app';

    if (!META_APP_ID || !META_REDIRECT_URI) {
      fastify.log.error('[FB OAuth] Missing META_APP_ID or META_REDIRECT_URI');
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=server_config&platform=facebook`);
    }

    const { access_token } = request.query as { access_token?: string };
    const dealerId = extractDealerFromToken(access_token);
    if (!dealerId) {
      fastify.log.warn('[FB OAuth] No valid access_token in query — dealer cannot be identified');
    }
    const state = dealerId ? encodeOAuthState(dealerId) : 'anonymous';

    const authUrl = new URL(`https://www.facebook.com/${FB_API_VERSION}/dialog/oauth`);
    authUrl.searchParams.set('client_id', META_APP_ID);
    authUrl.searchParams.set('redirect_uri', META_REDIRECT_URI);
    authUrl.searchParams.set('scope', FB_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    fastify.log.info(`[FB OAuth] Initiating flow for dealer=${dealerId ?? 'unknown'}`);
    return reply.redirect(authUrl.toString());
  });

  fastify.get('/facebook/callback', async (request, reply) => {
    const { code, error: fbError, state } = request.query as { code?: string; error?: string; state?: string };
    const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://cardekho-social-ai-web.vercel.app';

    if (fbError || !code) {
      fastify.log.warn(`[FB OAuth] Callback error: ${fbError ?? 'no_code'}`);
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=${encodeURIComponent(fbError ?? 'no_code')}&platform=facebook`);
    }

    // Recover dealer_id from state
    const dealerId = (state && state !== 'anonymous') ? decodeOAuthState(state) : null;
    fastify.log.info(`[FB OAuth] Callback received for dealer=${dealerId ?? 'unknown'}`);

    const META_APP_ID = process.env['META_APP_ID'];
    const META_APP_SECRET = process.env['META_APP_SECRET'];
    const META_REDIRECT_URI = process.env['META_REDIRECT_URI'];

    if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
      fastify.log.error('[FB OAuth] Missing server config in callback');
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=server_config&platform=facebook`);
    }

    try {
      // Exchange code for short-lived user access token
      const tokenUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
      tokenUrl.searchParams.set('client_id', META_APP_ID);
      tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
      tokenUrl.searchParams.set('redirect_uri', META_REDIRECT_URI);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenData = await tokenRes.json() as { access_token?: string; error?: { message?: string } };

      if (!tokenData.access_token) {
        fastify.log.error({ tokenData }, '[FB OAuth] Token exchange failed — no access_token returned');
        return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=token_exchange_failed&platform=facebook`);
      }

      // Exchange short-lived user token for long-lived token (60-day expiry)
      const longTokenUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`);
      longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longTokenUrl.searchParams.set('client_id', META_APP_ID);
      longTokenUrl.searchParams.set('client_secret', META_APP_SECRET);
      longTokenUrl.searchParams.set('fb_exchange_token', tokenData.access_token);

      const longTokenRes = await fetch(longTokenUrl.toString());
      const longTokenData = await longTokenRes.json() as { access_token?: string; expires_in?: number };
      const userAccessToken = longTokenData.access_token ?? tokenData.access_token;
      const userTokenExpiry = longTokenData.expires_in
        ? new Date(Date.now() + longTokenData.expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      fastify.log.info(`[FB OAuth] Long-lived token obtained, expires: ${userTokenExpiry.toISOString()}`);

      // Fetch pages using long-lived user token
      const pagesUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token`;
      const pagesRes = await fetch(pagesUrl);
      const pagesData = await pagesRes.json() as { data?: Array<{ id: string; name: string; access_token: string }> };
      const pages = pagesData.data ?? [];

      fastify.log.info(`[FB OAuth] Found ${pages.length} pages for dealer=${dealerId ?? 'unknown'}`);

      const pagesToSelect = [];
      const instagramsToSelect = [];

      for (const page of pages) {
        pagesToSelect.push({
          id: page.id,
          name: page.name,
          access_token: page.access_token,
        });

        // Check for linked Instagram Business account
        const igUrl = `https://graph.facebook.com/${FB_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
        try {
          const igRes = await fetch(igUrl);
          const igData = await igRes.json() as { instagram_business_account?: { id: string } };

          if (igData.instagram_business_account?.id) {
            const igId = igData.instagram_business_account.id;
            const igDetailsRes = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${igId}?fields=id,username&access_token=${page.access_token}`);
            const igDetails = await igDetailsRes.json() as { id: string; username?: string };

            instagramsToSelect.push({
              id: igDetails.id,
              username: igDetails.username ?? `ig_${igDetails.id}`,
              page_id: page.id,
              page_access_token: page.access_token,
            });
            fastify.log.info(`[FB OAuth] Found linked IG account: ${igDetails.username ?? igDetails.id} for FB page ${page.name}`);
          }
        } catch (igErr) {
          fastify.log.warn(`[FB OAuth] Failed to check Instagram for page ${page.id}: ${String(igErr)}`);
        }
      }

      const payload = {
        pages: pagesToSelect,
        instagrams: instagramsToSelect,
        tokenExpiry: userTokenExpiry.toISOString(),
      };

      fastify.log.info(`[FB OAuth] Found ${pagesToSelect.length} FB pages, ${instagramsToSelect.length} IG accounts for selection`);
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?success=1&platform=facebook&data=${encodeURIComponent(JSON.stringify(payload))}`);

    } catch (err) {
      fastify.log.error(err, '[FB OAuth] Callback failed with unexpected error');
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=token_exchange_failed&platform=facebook`);
    }
  });

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/business.manage',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  fastify.get('/google', async (request, reply) => {
    const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'];
    const GOOGLE_REDIRECT_URI = process.env['GOOGLE_REDIRECT_URI'];
    const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://cardekho-social-ai-web.vercel.app';

    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      fastify.log.error('[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI');
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=server_config&platform=google`);
    }

    const { access_token } = request.query as { access_token?: string };
    const dealerId = extractDealerFromToken(access_token);
    if (!dealerId) {
      fastify.log.warn('[Google OAuth] No valid access_token in query — dealer cannot be identified');
    }
    const state = dealerId ? encodeOAuthState(dealerId) : 'anonymous';

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    fastify.log.info(`[Google OAuth] Initiating flow for dealer=${dealerId ?? 'unknown'}`);
    return reply.redirect(authUrl.toString());
  });

  fastify.get('/google/callback', async (request, reply) => {
    const { code, error: gError, state } = request.query as { code?: string; error?: string; state?: string };
    const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://cardekho-social-ai-web.vercel.app';

    if (gError || !code) {
      fastify.log.warn(`[Google OAuth] Callback error: ${gError ?? 'no_code'}`);
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=${encodeURIComponent(gError ?? 'no_code')}&platform=google`);
    }

    const dealerId = (state && state !== 'anonymous') ? decodeOAuthState(state) : null;
    fastify.log.info(`[Google OAuth] Callback received for dealer=${dealerId ?? 'unknown'}`);

    const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'];
    const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'];
    const GOOGLE_REDIRECT_URI = process.env['GOOGLE_REDIRECT_URI'];

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      fastify.log.error('[Google OAuth] Missing server config in callback');
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=server_config&platform=google`);
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; error?: string };

      if (!tokenData.access_token) {
        fastify.log.error({ tokenData }, '[Google OAuth] Token exchange failed — no access_token returned');
        return reply.redirect(`${FRONTEND_URL}/accounts?error=token_exchange_failed`);
      }
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      // Google access tokens expire in ~1 hour
      const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

      // Fetch Google Business Profile accounts
      const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const accountsData = await accountsRes.json() as { accounts?: Array<{ name: string; accountName?: string }> };
      const accounts = accountsData.accounts ?? [];

      fastify.log.info(`[Google OAuth] Found ${accounts.length} GBP accounts for dealer=${dealerId ?? 'unknown'}`);

      const userId = dealerId ?? 'anonymous';
      let savedCount = 0;

      for (const account of accounts) {
        const accountId = account.name.replace('accounts/', '');

        // Fetch locations under this account
        const locationsRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const locData = await locationsRes.json() as { locations?: Array<{ name: string; title?: string }> };
        const locations = locData.locations ?? [];

        for (const loc of locations) {
          const locId = loc.name.replace('locations/', '');
          await saveAccount({
            userId,
            platform: 'google',
            accountId: `${accountId}/${locId}`,
            accountName: loc.title || account.accountName || `Location ${locId}`,
            accessToken,
            refreshToken,
            tokenExpiry,
          });
          savedCount++;
          fastify.log.info(`[Google OAuth] Saved GMB location: ${loc.title ?? locId} → dealer=${userId}`);
        }

        // If no locations, save the account itself
        if (locations.length === 0) {
          await saveAccount({
            userId,
            platform: 'google',
            accountId,
            accountName: account.accountName || `Google Business ${accountId}`,
            accessToken,
            refreshToken,
            tokenExpiry,
          });
          savedCount++;
          fastify.log.info(`[Google OAuth] Saved GMB account (no locations): ${accountId} → dealer=${userId}`);
        }
      }

      fastify.log.info(`[Google OAuth] Complete: ${savedCount} locations saved for dealer=${userId}`);
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?success=1&google=${savedCount}&platform=google`);
    } catch (err) {
      fastify.log.error(err, '[Google OAuth] Callback failed with unexpected error');
      return reply.redirect(`${FRONTEND_URL}/oauth/callback?error=token_exchange_failed&platform=google`);
    }
  });
}
