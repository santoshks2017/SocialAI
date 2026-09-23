import type { FastifyInstance } from 'fastify';
import { scrapeUrl } from '@cardeko/scraper';
import { extractPatterns } from '@cardeko/pattern-engine';
import { recommendTemplate } from '@cardeko/template-engine';
import { renderCreative } from '@cardeko/render-engine';
import { generateCreativeContent } from '../services/aiService.js';
import { prisma } from '../db/prisma.js';
import { assertSafeFetchUrl, UnsafeUrlError } from '../lib/safeUrl.js';
import { loadImageFromUrl } from '../lib/uploadPaths.js';

interface GenerateFromUrlRequest {
  url?: string;
  car?: string;
  offer?: string;
  festival?: string;
  city?: string;
}

export default async function generateFromUrlRoutes(fastify: FastifyInstance) {
  fastify.post('/generate-from-url', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as GenerateFromUrlRequest | undefined;

    // Validate inputs
    if (!body || !body.url || !body.car || !body.offer || !body.festival || !body.city) {
      return reply.code(400).send({ 
        error: 'Invalid request body. Expected { url, car, offer, festival, city }' 
      });
    }

    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return reply.code(403).send({ error: 'Only dealer accounts can generate creatives' });
    }

    const { url, car, offer, festival, city } = body;

    try {
      await assertSafeFetchUrl(url);
    } catch (err) {
      if (err instanceof UnsafeUrlError) return reply.code(400).send({ error: err.message });
      throw err;
    }

    // Default stock image fallback
    const DEFAULT_STOCK_IMAGE = 'https://dummyimage.com/900x600/ccc/000.png&text=Stock+Car';

    let scrapedImages: string[] = [];
    let scrapedText = '';
    let selectedImage = DEFAULT_STOCK_IMAGE;

    // STEP 1: Scrape URL
    try {
      fastify.log.info(`[GenerateFromUrl] Scraping URL: ${url}`);
      
      // We will wrap the scraper call in a Promise.race for timeout, just in case scraper doesn't timeout itself
      const scraperPromise = scrapeUrl(url);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Scraper timeout')), 25000));
      
      const scrapeResult = await Promise.race([scraperPromise, timeoutPromise]) as { images: string[], text: string };
      
      scrapedImages = scrapeResult.images;
      scrapedText = scrapeResult.text;
      
      if (scrapedImages && scrapedImages.length > 0) {
        // STEP 5 logic: Pick first valid image
        selectedImage = scrapedImages[0] ?? DEFAULT_STOCK_IMAGE;
      }
    } catch (err) {
      fastify.log.warn(`[GenerateFromUrl] Scraping failed or timed out, using fallback: ${String(err)}`);
    }

    // STEP 2: Extract patterns and save
    let patterns = null;
    try {
      fastify.log.info(`[GenerateFromUrl] Extracting patterns`);
      patterns = extractPatterns({ images: scrapedImages, text: scrapedText });
      
      await prisma.dealerStyle.create({
        data: {
          dealerId: dealerId,
          festivals: patterns.detectedFestivals,
          imageCount: patterns.imageCount,
          hasPhone: patterns.hasPhone,
        }
      });
      fastify.log.info(`[GenerateFromUrl] Saved patterns to DealerStyle table for dealer ${dealerId}`);
    } catch (err) {
      fastify.log.error(`[GenerateFromUrl] Pattern extraction or DB save failed: ${String(err)}`);
      // We don't fail the whole request just because DB save failed
    }

    // STEP 3: Call AI
    let content;
    try {
      fastify.log.info(`[GenerateFromUrl] Generating AI content`);
      content = await generateCreativeContent({ car, offer, festival, city });
    } catch (err) {
      fastify.log.warn(`[GenerateFromUrl] AI generation failed, using fallback: ${String(err)}`);
      content = {
        headline: "Limited Time Offer",
        caption: "Check out this amazing offer at our dealership today!",
        cta: "Book Now"
      };
    }

    // STEP 4: Recommend template
    fastify.log.info(`[GenerateFromUrl] Recommending template for festival: ${festival}`);
    const template = recommendTemplate({ festival });

    // STEP 6: Render creative
    // Scraped image URLs come from an arbitrary page, so they are fetched through
    // the SSRF guard and handed to the renderer as bytes.
    let imageDataUri = '';
    try {
      const image = await loadImageFromUrl(selectedImage, { timeoutMs: 15000 });
      imageDataUri = `data:${image.contentType ?? 'image/png'};base64,${image.buffer.toString('base64')}`;
    } catch (err) {
      fastify.log.warn(`[GenerateFromUrl] Could not load image ${selectedImage}: ${String(err)}`);
    }

    let imageBase64 = '';
    try {
      fastify.log.info(`[GenerateFromUrl] Rendering creative`);
      const imageBuffer = await renderCreative({
        title: content.headline,
        offer: offer, // Using raw offer string per instructions
        imageUrl: imageDataUri
      });

      // STEP 7: Convert to base64
      imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      fastify.log.info(`[GenerateFromUrl] Creative successfully rendered`);
    } catch (err) {
      fastify.log.error(`[GenerateFromUrl] Render creative failed: ${String(err)}`);
      return reply.code(500).send({ error: 'Failed to render final creative image' });
    }

    // Output
    return {
      success: true,
      data: {
        content,
        patterns: patterns || {},
        template,
        image: imageBase64
      }
    };
  });
}
