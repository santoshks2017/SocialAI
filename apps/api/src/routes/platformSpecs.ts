import type { FastifyInstance } from 'fastify';
import { DEFAULT_PLATFORM_SPECS } from '../lib/platformSpecs.js';

export default async function platformSpecRoutes(fastify: FastifyInstance) {
  // GET /v1/platform-specs — aspect ratios, sizes and caption/hashtag limits per platform
  fastify.get('/', { preHandler: [fastify.authenticate] }, async () => ({ success: true, data: DEFAULT_PLATFORM_SPECS }));
}
