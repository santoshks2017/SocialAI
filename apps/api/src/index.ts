import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import type { IncomingMessage, ServerResponse } from 'http';

import { registerJwt } from './plugins/jwt.js';
import { registerActivityLog } from './plugins/activityLog.js';
import { registerPlanGate } from './plugins/planGate.js';
import { startPublishWorker } from './workers/publishWorker.js';
import { startMetricsWorker } from './workers/metricsWorker.js';

import authRoutes from './routes/auth.js';
import dealerRoutes from './routes/dealer.js';
import platformRoutes from './routes/platform.js';
import creativeRoutes from './routes/creative.js';
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
<<<<<<< HEAD
import analyticsRoutes from './routes/analytics.js';
import modelLibraryRoutes from './routes/modelLibrary.js';
=======
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
>>>>>>> razorpay-billing-integration-setup
import { UPLOADS_ROOT } from './routes/upload.js';

// Vercel sets this automatically in its environment
const IS_VERCEL = process.env['VERCEL'] === '1';

const fastify = Fastify({ logger: true });

const ALLOWED_ORIGINS = new Set([
  process.env['FRONTEND_URL'] ?? 'https://cardekho-social-ai-web.vercel.app',
  'https://cardekho-social-ai-web.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    // Allow exact matches + any *.vercel.app subdomain (covers preview + production deployments)
    if (
      ALLOWED_ORIGINS.has(origin)
      || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
      || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
    ) {
      return cb(null, true);
    }
    cb(new Error(`Origin ${origin} not allowed by CORS`), false);
  },
  credentials: true,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
});

await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB (images + videos)

// Serve uploaded files as static assets at /uploads/...
// Skip on Vercel — no persistent disk; files are stored in S3/R2 and served via their CDN URLs
if (!IS_VERCEL) {
  await fastify.register(staticPlugin, {
    root: UPLOADS_ROOT,
    prefix: '/uploads/',
    decorateReply: false,
  });
}

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
<<<<<<< HEAD
fastify.register(analyticsRoutes,       { prefix: '/v1/analytics' });
fastify.register(modelLibraryRoutes,    { prefix: '/v1/model-library' });
=======
fastify.register(billingRoutes,         { prefix: '/v1/billing' });
fastify.register(adminRoutes,           { prefix: '/v1/admin' });
>>>>>>> razorpay-billing-integration-setup

fastify.get('/v1/health', async () => ({
  status: 'ok',
  service: 'Cardeko Social AI - API',
  env: process.env['NODE_ENV'] ?? 'development',
}));

// ── Vercel serverless handler ─────────────────────────────────────────────────
// Vercel calls this export for every incoming request instead of binding a port.
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}

// ── Traditional server (local dev / Render) ───────────────────────────────────
// Skipped on Vercel — serverless functions don't call listen().
if (!IS_VERCEL) {
  try {
    const port = parseInt(process.env['PORT'] ?? '3001');
    await fastify.listen({ port, host: '0.0.0.0' });

    // Start background workers (only if Redis is reachable)
    if (process.env['NODE_ENV'] !== 'test') {
      startPublishWorker();
      startMetricsWorker();
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
