import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';

// Simple URL scraper: fetches page HTML and extracts visible text snippets as a
// best-effort post cache (works for publicly accessible pages, no Graph API needed).
async function scrapePublicPagePosts(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CarDekhoSocialAIBot/1.0; +http://localhost)',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Extract meaningful text blocks from common social page containers.
    // This captures caption-like text between tags by stripping HTML.
    const textBlocks: string[] = [];
    const stripped = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    const sentences = stripped
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40 && s.length < 800);

    textBlocks.push(...sentences.slice(0, 30));
    return textBlocks;
  } catch {
    return [];
  }
}

export default async function inspirationRoutes(fastify: FastifyInstance) {
  // GET /v1/dealer/inspiration-handles
  fastify.get('/inspiration-handles', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const handles = await prisma.inspirationHandle.findMany({
      where: { dealer_id },
      orderBy: { created_at: 'desc' },
    });
    return { success: true, handles };
  });

  // POST /v1/dealer/inspiration-handles
  fastify.post('/inspiration-handles', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealer_id = request.user.dealer_id!;
    const { handle_url, platform, handle_name } = request.body as {
      handle_url: string;
      platform: string;
      handle_name?: string;
    };

    if (!handle_url || !platform) {
      return reply.status(400).send({ error: 'handle_url and platform are required' });
    }
    if (!['facebook', 'instagram'].includes(platform)) {
      return reply.status(400).send({ error: 'platform must be "facebook" or "instagram"' });
    }

    // Upsert: if same dealer+url exists, update; otherwise create
    const handle = await prisma.inspirationHandle.upsert({
      where: { dealer_id_handle_url: { dealer_id, handle_url } },
      create: { dealer_id, handle_url, platform, handle_name: handle_name ?? null },
      update: { platform, ...(handle_name !== undefined ? { handle_name } : {}) },
    });

    // Kick off scrape in background (fire & forget — do not await)
    scrapePublicPagePosts(handle_url).then(async (posts) => {
      if (posts.length > 0) {
        await prisma.inspirationHandle.update({
          where: { id: handle.id },
          data: { posts_cache: posts, last_scraped_at: new Date() },
        });
      }
    }).catch(() => { /* scrape errors are non-fatal */ });

    return { success: true, handle };
  });

  // POST /v1/dealer/inspiration-handles/:id/refresh — re-scrape posts
  fastify.post('/inspiration-handles/:id/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealer_id = request.user.dealer_id!;
    const { id } = request.params as { id: string };

    const handle = await prisma.inspirationHandle.findFirst({ where: { id, dealer_id } });
    if (!handle) return reply.status(404).send({ error: 'Handle not found' });

    const posts = await scrapePublicPagePosts(handle.handle_url);
    const updated = await prisma.inspirationHandle.update({
      where: { id },
      data: {
        ...(posts.length > 0 ? { posts_cache: posts } : handle.posts_cache !== null ? { posts_cache: handle.posts_cache } : {}),
        last_scraped_at: new Date(),
      },
    });

    return { success: true, handle: updated, posts_found: posts.length };
  });

  // DELETE /v1/dealer/inspiration-handles/:id
  fastify.delete('/inspiration-handles/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealer_id = request.user.dealer_id!;
    const { id } = request.params as { id: string };

    const handle = await prisma.inspirationHandle.findFirst({ where: { id, dealer_id } });
    if (!handle) return reply.status(404).send({ error: 'Handle not found' });

    await prisma.inspirationHandle.delete({ where: { id } });
    return { success: true };
  });
}
