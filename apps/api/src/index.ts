import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';

import { registerJwt, isAccessToken } from './plugins/jwt.js';
import type { JwtUser } from './lib/permissions.js';
import { registerActivityLog } from './plugins/activityLog.js';
import { registerPlanGate } from './plugins/planGate.js';
import { createOriginChecker } from './lib/corsOrigins.js';
import { startWorkers } from './workers/index.js';

import authRoutes from './routes/auth.js';
import dealerRoutes from './routes/dealer.js';
import platformRoutes from './routes/platform.js';
import creativeRoutes from './routes/creative.js';
import robustCreativeRoutes from './routes/robustCreative.js';
import publisherRoutes from './routes/publisher.js';
import inventoryRoutes from './routes/inventory.js';
import inboxRoutes from './routes/inbox.js';
import boostRoutes from './routes/boost.js';
import leadsRoutes from './routes/leads.js';
import usersRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import inspirationRoutes from './routes/inspiration.js';
import scraperRoutes from './routes/scraper.js';
import analyzeRoutes from './routes/analyze.js';
import renderRoutes from './routes/render.js';
import generatePostRoutes from './routes/generatePost.js';
import generateFromUrlRoutes from './routes/generateFromUrl.js';
import platformAccountRoutes from './routes/platformAccounts.js';
import cronRoutes from './routes/cron.js';
import analyticsRoutes from './routes/analytics.js';
import modelLibraryRoutes from './routes/modelLibrary.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import { UPLOADS_ROOT } from './routes/upload.js';
import { getFrontendUrl } from './lib/frontendUrl.js';

// Cloud Run's front end proxies every request, so the socket address is its own
// (169.254.169.126); trustProxy makes req.ip the client from X-Forwarded-For.
const fastify = Fastify({ logger: true, trustProxy: true });

if (process.env['NODE_ENV'] === 'production' && !process.env['FRONTEND_URL']?.trim()) {
  fastify.log.warn(`FRONTEND_URL is not set; OAuth redirects will use ${getFrontendUrl()}`);
}

const isAllowedOrigin = createOriginChecker(getFrontendUrl());
await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin || isAllowedOrigin(origin)) return cb(null, true);
    // 403, not the default 500: a foreign origin is a client error, not a server fault
    cb(Object.assign(new Error(`Origin ${origin} not allowed by CORS`), { statusCode: 403 }), false);
  },
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
});

// Signed-in requests are limited per user, anonymous ones per client IP, so users
// don't share a bucket. fastify.jwt is registered below but exists by request time.
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = fastify.jwt.verify<JwtUser>(auth.slice(7));
        if (isAccessToken(payload) && payload.dealer_user_id) return `user:${payload.dealer_user_id}`;
      } catch {
        // invalid or expired: fall through to the IP bucket
      }
    }
    return `ip:${req.ip}`;
  },
});

await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB (images + videos)

// Serve uploaded files as static assets at /uploads/... and /v1/uploads/...
await fastify.register(staticPlugin, {
  root: UPLOADS_ROOT,
  prefix: '/uploads/',
  decorateReply: false,
});

await registerJwt(fastify);
await registerActivityLog(fastify);
await registerPlanGate(fastify);

// Support raw body for webhook signature validation
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
  if (request.url.includes('/webhook')) {
    (request as any).rawBody = body;
  }
  try {
    if (body.length === 0) {
      done(null, null);
      return;
    }
    const json = JSON.parse(body.toString());
    done(null, json);
  } catch (err: any) {
    err.statusCode = 400;
    done(err, null);
  }
});

// Routes
fastify.register(authRoutes,      { prefix: '/v1/auth' });
fastify.register(dealerRoutes,    { prefix: '/v1/dealer' });
fastify.register(platformRoutes,  { prefix: '/v1/platforms' });
fastify.register(creativeRoutes,  { prefix: '/v1/creatives' });
fastify.register(robustCreativeRoutes, { prefix: '/v1/creatives' });
fastify.register(publisherRoutes, { prefix: '/v1/publisher' });
fastify.register(inventoryRoutes, { prefix: '/v1/inventory' });
fastify.register(inboxRoutes,     { prefix: '/v1/inbox' });
fastify.register(boostRoutes,     { prefix: '/v1/boost' });
fastify.register(leadsRoutes,     { prefix: '/v1/leads' });
fastify.register(usersRoutes,       { prefix: '/v1/users' });
fastify.register(uploadRoutes,      { prefix: '/v1/upload' });
fastify.register(inspirationRoutes, { prefix: '/v1/dealer' });
fastify.register(scraperRoutes,     { prefix: '/v1/admin/scraper' });
fastify.register(analyzeRoutes,     { prefix: '/v1' });
fastify.register(renderRoutes,      { prefix: '/v1' });
fastify.register(generatePostRoutes,{ prefix: '/v1' });
fastify.register(generateFromUrlRoutes, { prefix: '/v1' });
fastify.register(platformAccountRoutes, { prefix: '/v1/platform-accounts' });
fastify.register(cronRoutes,            { prefix: '/v1/cron' });
fastify.register(analyticsRoutes,       { prefix: '/v1/analytics' });
fastify.register(modelLibraryRoutes,    { prefix: '/v1/model-library' });
fastify.register(billingRoutes,         { prefix: '/v1/billing' });
fastify.register(adminRoutes,           { prefix: '/v1/admin' });

fastify.get('/v1/health', async () => ({
  status: 'ok',
  service: 'CarDekho Social AI - API',
  env: process.env['NODE_ENV'] ?? 'development',
}));

export { fastify };

// ── Server (local dev / Cloud Run) ────────────────────────────────────────────
// Skipped in test mode — tests use fastify.inject() in memory.
if (process.env['NODE_ENV'] !== 'test') {
  try {
    const port = parseInt(process.env['PORT'] ?? '3001');
    await fastify.listen({ port, host: '0.0.0.0' });

    startWorkers(fastify.log);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
