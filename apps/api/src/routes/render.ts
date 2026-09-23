import type { FastifyInstance } from 'fastify';
import { renderCreative } from '@cardeko/render-engine';
import { loadImageFromUrl } from '../lib/uploadPaths.js';
import { UnsafeUrlError } from '../lib/safeUrl.js';

interface RenderRequestBody {
  title?: string;
  offer?: string;
  imageUrl?: string;
}

export default async function renderRoutes(fastify: FastifyInstance) {
  // POST /v1/render
  fastify.post('/render', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as RenderRequestBody | undefined;

    if (!body || typeof body.title !== 'string' || typeof body.offer !== 'string' || typeof body.imageUrl !== 'string') {
      return reply.code(400).send({ 
        error: 'Invalid request body. Expected { title: string, offer: string, imageUrl: string }' 
      });
    }

    // The render engine's loader also opens local file paths, so it only ever
    // gets image bytes fetched here, as a data URI.
    let imageDataUri: string;
    try {
      const image = await loadImageFromUrl(body.imageUrl, { timeoutMs: 15000 });
      imageDataUri = `data:${image.contentType ?? 'image/png'};base64,${image.buffer.toString('base64')}`;
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return reply.code(400).send({ error: err.message });
      }
      fastify.log.warn(`Render image fetch failed: ${String(err)}`);
      return reply.code(400).send({ error: 'imageUrl could not be loaded' });
    }

    try {
      const buffer = await renderCreative({
        title: body.title,
        offer: body.offer,
        imageUrl: imageDataUri
      });

      // Return the image as image/png
      return reply
        .code(200)
        .header('Content-Type', 'image/png')
        .send(buffer);
    } catch (err) {
      fastify.log.error(`Creative render failed: ${String(err)}`);
      return reply.code(500).send({ error: 'Failed to render creative' });
    }
  });
}
