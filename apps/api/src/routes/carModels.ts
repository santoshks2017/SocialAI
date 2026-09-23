import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { matchCarModels } from '../lib/carModels.js';

export default async function carModelRoutes(fastify: FastifyInstance) {
  // GET /v1/creatives/car-models?q=<text> — the dealer's cars mentioned in the text
  fastify.get('/car-models', { preHandler: [fastify.authenticate] }, async (request) => {
    const q = String((request.query as { q?: string }).q ?? '').trim();
    if (q.length < 2 || !request.user.dealer_id) return { success: true, models: [] };
    const models = await prisma.syncedModel.findMany({ where: { dealer_id: request.user.dealer_id } });
    return { success: true, models: matchCarModels(models, q) };
  });
}
