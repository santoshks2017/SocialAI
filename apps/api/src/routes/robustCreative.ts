import type { FastifyInstance } from 'fastify';
import { runRobustCreativeEngine } from '../services/robustCreativeEngine.js';

export default async function robustCreativeRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/robust-generate',
    {
      preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')]
    },
    async (request, reply) => {
      const dealerId = request.user.dealer_id as string;
      const body = request.body as any;

      if (!body.prompt || !body.prompt.trim()) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_INPUT',
            message: 'prompt is required'
          }
        });
      }

      try {
        const result = await runRobustCreativeEngine({
          dealerId,
          prompt: body.prompt,
          deliveryPhotoUrl: body.deliveryPhotoUrl,
          deliveryPhotoId: body.deliveryPhotoId,
          recipientName: body.recipientName,
          platforms: body.platforms
        });
        return result;
      } catch (err: any) {
        request.log.error(err, 'Robust creative generation failed');
        return reply.code(500).send({
          error: {
            code: 'ENGINE_ERROR',
            message: err.message || 'An error occurred during creative generation'
          }
        });
      }
    }
  );
}
