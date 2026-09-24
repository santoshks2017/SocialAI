import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { EVENT_TTL_DAYS, eventMeta, isEventAction } from '../lib/events.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Per signed-in user (the global keyGenerator in src/index.ts).
const EVENT_RATE_LIMIT = { rateLimit: { max: 60, timeWindow: '1 minute' } };
const invalid = (message: string) => ({ error: { code: 'INVALID_INPUT', message } });

export default async function eventRoutes(fastify: FastifyInstance) {
  // POST /v1/events { action, ...meta } — product usage events, sent fire-and-forget by the web app
  fastify.post('/', { preHandler: [fastify.authenticate], config: EVENT_RATE_LIMIT }, async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply.code(400).send(invalid('Send a JSON object with an action'));
    const { action, ...fields } = body as Record<string, unknown>;
    if (!isEventAction(action)) return reply.code(400).send(invalid('Unknown action'));
    const parsed = eventMeta(fields);
    if (!parsed.ok) return reply.code(400).send(invalid(parsed.message));

    const { dealer_id, dealer_user_id } = request.user;
    // The platform owner has no dealership, so there is nothing to attribute the event to.
    if (dealer_id) {
      await prisma.event.create({
        data: { dealer_id, user_id: dealer_user_id, action, meta: parsed.meta, expires_at: new Date(Date.now() + EVENT_TTL_DAYS * DAY_MS) },
      });
    }
    return reply.code(204).send();
  });
}
