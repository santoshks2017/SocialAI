/**
 * Admin scraper routes — seed and refresh the creative knowledge base
 * from real Indian auto dealer social media pages.
 *
 * Routes:
 *   POST /v1/admin/scraper/seed      — scrape all curated seed pages, store patterns
 *   POST /v1/admin/scraper/analyze   — re-analyze stored handles with pattern extractor
 *   GET  /v1/admin/scraper/status    — show scrape status per handle
 *
 * Protected by ADMIN_SECRET env var (simple bearer token for internal use).
 * Without it the routes are open outside production and closed in production.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'crypto';
import { prisma } from '../db/prisma.js';
import { SEED_PAGES, scrapePublicPage, scrapeWithGraphAPI, extractPatterns } from '../services/socialScraper.js';
import { scrapeUrl } from '@cardeko/scraper';
import { assertSafeFetchUrl, UnsafeUrlError } from '../lib/safeUrl.js';

function sameSecret(a: string, b: string): boolean {
  // Hashing first gives equal-length inputs, as timingSafeEqual requires.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

async function requireAdminSecret(request: FastifyRequest, reply: FastifyReply) {
  const secret = process.env['ADMIN_SECRET'];
  if (!secret) {
    if (process.env['NODE_ENV'] !== 'production') return;
    return reply.code(503).send({ error: { code: 'ADMIN_DISABLED', message: 'ADMIN_SECRET is not configured' } });
  }
  const auth = request.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Admin secret required' } });
  }
  if (!sameSecret(auth.slice(7), secret)) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
}

export default async function scraperRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdminSecret);

  // POST /v1/admin/scraper/seed
  // Scrapes the curated list of Indian dealer pages and stores as inspiration handles
  // under the demo dealer account so they're available to all caption generation.
  fastify.post('/seed', async (request, reply) => {
    const metaToken = process.env['META_USER_ACCESS_TOKEN']; // optional — enables Graph API

    // Find the demo dealer (created by /auth/demo endpoint)
    const demoDealer = await prisma.dealer.findFirst({
      where: { phone: '+0000000001' },
    });
    if (!demoDealer) {
      return reply.code(404).send({ error: 'Demo dealer not found — call POST /auth/demo first' });
    }

    const results: Array<{ name: string; posts_found: number; patterns: ReturnType<typeof extractPatterns> }> = [];

    for (const page of SEED_PAGES) {
      try {
        let posts: string[] = [];

        // Prefer Graph API when token + page ID available
        if (metaToken && page.fb_page_id) {
          posts = await scrapeWithGraphAPI(page.fb_page_id, metaToken);
        }

        // Fall back to HTML scraping
        if (posts.length < 3) {
          const htmlPosts = await scrapePublicPage(page.url);
          posts = [...posts, ...htmlPosts];
        }

        const patterns = extractPatterns(posts);

        // Upsert into inspiration handles for the demo dealer
        await prisma.inspirationHandle.upsert({
          where: {
            dealer_id_handle_url: { dealer_id: demoDealer.id, handle_url: page.url },
          },
          create: {
            dealer_id: demoDealer.id,
            handle_url: page.url,
            platform: page.platform,
            handle_name: `${page.brand} — ${page.state} (${page.name})`,
            posts_cache: posts,
            last_scraped_at: new Date(),
          },
          update: {
            posts_cache: posts,
            last_scraped_at: new Date(),
          },
        });

        results.push({ name: page.name, posts_found: posts.length, patterns });
        fastify.log.info(`Scraped ${page.name}: ${posts.length} posts`);
      } catch (err) {
        fastify.log.error(`Failed to scrape ${page.name}: ${String(err)}`);
      }
    }

    return {
      success: true,
      pages_scraped: results.length,
      total_posts: results.reduce((s, r) => s + r.posts_found, 0),
      results,
    };
  });

  // POST /v1/admin/scraper/analyze
  // Re-runs pattern extraction on all existing handles for the demo dealer
  fastify.post('/analyze', async () => {
    const handles = await prisma.inspirationHandle.findMany({
      where: { dealer: { phone: '+0000000001' } },
    });

    const summaries = handles.map((h) => {
      const posts = Array.isArray(h.posts_cache) ? h.posts_cache as string[] : [];
      return {
        handle: h.handle_name ?? h.handle_url,
        posts_count: posts.length,
        patterns: extractPatterns(posts),
      };
    });

    return { success: true, handles_analyzed: summaries.length, summaries };
  });

  // GET /v1/admin/scraper/status
  fastify.get('/status', async () => {
    const handles = await prisma.inspirationHandle.findMany({
      where: { dealer: { phone: '+0000000001' } },
      select: {
        handle_name: true,
        handle_url: true,
        platform: true,
        last_scraped_at: true,
        posts_cache: true,
      },
      orderBy: { last_scraped_at: 'desc' },
    });

    return {
      success: true,
      total_handles: handles.length,
      handles: handles.map((h) => ({
        name: h.handle_name,
        platform: h.platform,
        url: h.handle_url,
        posts_cached: Array.isArray(h.posts_cache) ? (h.posts_cache as unknown[]).length : 0,
        last_scraped: h.last_scraped_at,
      })),
    };
  });

  // POST /v1/admin/scraper/scrape
  // Scrapes any arbitrary URL and returns extracted text and images
  fastify.post('/scrape', async (request, reply) => {
    const body = request.body as { url?: string } | undefined;
    if (!body?.url || typeof body.url !== 'string') {
      return reply.code(400).send({ error: 'Valid URL is required' });
    }

    try {
      await assertSafeFetchUrl(body.url);
      const result = await scrapeUrl(body.url);
      
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return reply.code(400).send({ error: err.message });
      }
      fastify.log.error(`Scrape failed for ${body.url}: ${String(err)}`);
      return reply.code(500).send({ error: 'Failed to scrape URL' });
    }
  });

  // POST /v1/admin/scraper/seed-models
  // Seeds model library for ALL dealers in the database
  fastify.post('/seed-models', async (request) => {
    const body = (request.body || {}) as { brands?: string[]; dealerId?: string };
    
    let dealers;
    if (body.dealerId) {
      const dealer = await prisma.dealer.findUnique({ where: { id: body.dealerId } });
      dealers = dealer ? [dealer] : [];
    } else {
      dealers = await prisma.dealer.findMany();
    }

    if (dealers.length === 0) {
      return { success: false, message: 'No dealers found in database to seed models for.' };
    }

    const { syncDealerModels } = await import('../services/modelSync.js');
    const defaultBrands = [
      'Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra',
      'MG', 'Renault', 'Volkswagen', 'Skoda', 'Jeep', 'Citroën', 'BMW', 'Mercedes-Benz', 'Audi', 'Ford', 'Nissan'
    ];

    let successCount = 0;
    const errors: any[] = [];
    const summary: Record<string, string[]> = {};

    for (const dealer of dealers) {
      try {
        const dealerBrands = (dealer.brands as string[] | null) || [];
        // If specific brands are requested, use them; otherwise use dealer's brands, or fallback to all brands
        const brandsToSync = body.brands && body.brands.length > 0 
          ? body.brands 
          : (dealerBrands.length > 0 ? dealerBrands : defaultBrands);

        await syncDealerModels(dealer.id, brandsToSync);
        successCount++;
        summary[dealer.name || dealer.id] = brandsToSync;
      } catch (err: any) {
        fastify.log.error(err, `Failed to seed models for dealer ${dealer.id}`);
        errors.push({ dealerId: dealer.id, name: dealer.name, error: err.message || String(err) });
      }
    }

    return {
      success: true,
      dealers_found: dealers.length,
      dealers_seeded: successCount,
      summary,
      errors: errors.length > 0 ? errors : undefined
    };
  });
}
