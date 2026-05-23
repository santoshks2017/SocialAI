import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { CARDEKHO_OEM_DATABASE } from '../data/cardekhoOemDb.js';
import { randomUUID } from 'crypto';

interface SyncJob {
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  brands: Record<string, 'pending' | 'syncing' | 'completed' | 'failed'>;
  progress: number;
  currentBrand: string;
  isCompleted: boolean;
}

// In-memory tracker for active sync processes per dealership
const activeSyncJobs = new Map<string, SyncJob>();

export default async function modelLibraryRoutes(fastify: FastifyInstance) {
  // GET /v1/model-library — get all synced models
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const dealer_id = request.user.dealer_id as string;
      const { brand, search } = request.query as Record<string, string>;

      const where: Record<string, any> = { dealer_id };

      if (brand) {
        where.brand = { equals: brand, mode: 'insensitive' };
      }

      if (search) {
        where.OR = [
          { model_name: { contains: search, mode: 'insensitive' } },
          { alias_names: { has: search.toLowerCase() } }
        ];
      }

      const models = await prisma.syncedModel.findMany({
        where,
        orderBy: [{ brand: 'asc' }, { model_name: 'asc' }],
      });

      return { success: true, models };
    }
  );

  // POST /v1/model-library/sync — trigger sync
  fastify.post(
    '/sync',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string;
      const { brands } = request.body as { brands: string[] };

      if (!brands || !Array.isArray(brands) || brands.length === 0) {
        return reply.code(400).send({
          error: { code: 'INVALID_INPUT', message: 'brands array is required' }
        });
      }

      // Check if there is already a sync in progress
      const existingJob = activeSyncJobs.get(dealer_id);
      if (existingJob && existingJob.status === 'in_progress') {
        return reply.code(409).send({
          error: { code: 'SYNC_IN_PROGRESS', message: 'A sync is already in progress' }
        });
      }

      // Initialize the sync job state
      const syncStatus: SyncJob = {
        status: 'in_progress',
        brands: brands.reduce((acc, b) => ({ ...acc, [b]: 'pending' }), {}),
        progress: 0,
        currentBrand: brands[0] || '',
        isCompleted: false,
      };

      activeSyncJobs.set(dealer_id, syncStatus);

      // Trigger the background async sync job
      // We don't await this so the request completes immediately, letting the user navigate away
      (async () => {
        try {
          // Update the dealer's profile with selected brands
          await prisma.dealer.update({
            where: { id: dealer_id },
            data: { brands },
          });

          for (let i = 0; i < brands.length; i++) {
            const brand = brands[i]!;
            syncStatus.currentBrand = brand;
            syncStatus.brands[brand] = 'syncing';
            activeSyncJobs.set(dealer_id, { ...syncStatus });

            // Simulate network latency (2 seconds per brand) to demonstrate step progress bar in UI
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Fetch models for this brand from our mock database
            const mockModels = CARDEKHO_OEM_DATABASE.filter(
              (m) => m.brand.toLowerCase() === brand.toLowerCase()
            );

            // Save matched models in database
            for (const model of mockModels) {
              await prisma.syncedModel.upsert({
                where: {
                  dealer_id_canonical_id: {
                    dealer_id,
                    canonical_id: model.canonical_id
                  }
                },
                update: {
                  model_name: model.model_name,
                  alias_names: model.alias_names,
                  variants: model.variants,
                  colours: model.colours as any,
                  images: model.images as any,
                  synced_at: new Date(),
                  source: 'cardekho_oem_db'
                },
                create: {
                  dealer_id,
                  brand: model.brand,
                  model_name: model.model_name,
                  canonical_id: model.canonical_id,
                  alias_names: model.alias_names,
                  variants: model.variants,
                  colours: model.colours as any,
                  images: model.images as any,
                  source: 'cardekho_oem_db'
                }
              });
            }

            syncStatus.brands[brand] = 'completed';
            syncStatus.progress = Math.round(((i + 1) / brands.length) * 100);
            activeSyncJobs.set(dealer_id, { ...syncStatus });
          }

          syncStatus.status = 'completed';
          syncStatus.isCompleted = true;
          activeSyncJobs.set(dealer_id, { ...syncStatus });
        } catch (error) {
          fastify.log.error(error, `Failed sync job for dealer: ${dealer_id}`);
          syncStatus.status = 'failed';
          syncStatus.isCompleted = true;
          activeSyncJobs.set(dealer_id, { ...syncStatus });
        }
      })();

      return { success: true, message: 'Sync started successfully in the background' };
    }
  );

  // GET /v1/model-library/sync/status — check progress
  fastify.get(
    '/sync/status',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const dealer_id = request.user.dealer_id as string;
      const job = activeSyncJobs.get(dealer_id) || {
        status: 'idle',
        brands: {},
        progress: 0,
        currentBrand: '',
        isCompleted: false
      };

      return { success: true, syncJob: job };
    }
  );

  // POST /v1/model-library — manually add a model
  fastify.post(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string;
      const body = request.body as {
        brand: string;
        model_name: string;
        variants: string[];
        colours: Array<{ name: string; hex: string; images: Array<{ angle: string; url: string }> }>;
        images: Array<{ angle: string; url: string }>;
      };

      if (!body.brand || !body.model_name) {
        return reply.code(400).send({
          error: { code: 'INVALID_INPUT', message: 'brand and model_name are required' }
        });
      }

      const canonical_id = `manual_${body.brand.toLowerCase().replace(/\s+/g, '_')}_${body.model_name.toLowerCase().replace(/\s+/g, '_')}_${randomUUID().slice(0, 8)}`;
      const alias_names = [
        body.model_name.toLowerCase(),
        `${body.brand.toLowerCase()} ${body.model_name.toLowerCase()}`
      ];

      const newModel = await prisma.syncedModel.create({
        data: {
          dealer_id,
          brand: body.brand,
          model_name: body.model_name,
          canonical_id,
          alias_names,
          variants: body.variants || [],
          colours: (body.colours || []) as any,
          images: (body.images || []) as any,
          source: 'manual_upload'
        }
      });

      return { success: true, model: newModel };
    }
  );
}
