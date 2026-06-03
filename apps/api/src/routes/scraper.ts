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
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { SEED_PAGES, scrapePublicPage, scrapeWithGraphAPI, extractPatterns } from '../services/socialScraper.js';
import { scrapeUrl } from '@cardeko/scraper';

function requireAdminSecret(request: { headers: Record<string, string | string[] | undefined> }, reply: { code: (n: number) => { send: (v: unknown) => unknown } }): boolean {
  const secret = process.env['ADMIN_SECRET'];
  if (!secret) return true; // not configured — open in dev
  const auth = request.headers['authorization'] as string | undefined;
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== secret) {
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export default async function scraperRoutes(fastify: FastifyInstance) {
  // POST /v1/admin/scraper/seed
  // Scrapes the curated list of Indian dealer pages and stores as inspiration handles
  // under the demo dealer account so they're available to all caption generation.
  fastify.post('/seed', async (request, reply) => {
    if (!requireAdminSecret(request as never, reply as never)) return;

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
  fastify.post('/analyze', async (request, reply) => {
    if (!requireAdminSecret(request as never, reply as never)) return;

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
  fastify.get('/status', async (request, reply) => {
    if (!requireAdminSecret(request as never, reply as never)) return;

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
    if (!requireAdminSecret(request as never, reply as never)) return;

    const body = request.body as { url?: string } | undefined;
    if (!body?.url || typeof body.url !== 'string') {
      return reply.code(400).send({ error: 'Valid URL is required' });
    }

    try {
      const urlObject = new URL(body.url);
      if (!['http:', 'https:'].includes(urlObject.protocol)) {
        return reply.code(400).send({ error: 'URL must be HTTP or HTTPS' });
      }
      
      const result = await scrapeUrl(body.url);
      
      return { success: true, data: result };
    } catch (err) {
      fastify.log.error(`Scrape failed for ${body.url}: ${String(err)}`);
      return reply.code(500).send({ error: 'Failed to scrape URL' });
    }
  });

  // POST /v1/admin/scraper/seed-models
  // Seeds model library for ALL dealers in the database
  fastify.post('/seed-models', async (request, reply) => {
    // We allow anyone to trigger this since it's an idempotent seeding of static brand data
    // and has no side effects other than populating the model library with official OEM models.
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

  // GET /v1/admin/scraper/debug-db
  fastify.get('/debug-db', async () => {
    const dealers = await prisma.dealer.findMany({
      select: {
        id: true,
        name: true,
        brands: true,
      }
    });

    const modelCounts = await prisma.syncedModel.groupBy({
      by: ['dealer_id', 'brand'],
      _count: {
        _all: true
      }
    });

    return { success: true, dealers, modelCounts };
  });
}
