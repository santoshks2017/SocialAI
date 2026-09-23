import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { ApiConnection } from '../generated/client/index.js';
import { isGlobalOwner } from '../lib/permissions.js';
import { GEMINI_PROVIDER, invalidateAiKeyCache, resolveGeminiKey, type ResolvedGeminiKey } from '../lib/aiKeys.js';
import { KeyStorageUnavailableError, isKeyStorageReady, openSecret, sealSecret } from '../lib/secretBox.js';
import { checkGeminiKey } from '../lib/geminiKeyCheck.js';
import {
  MODEL_OPTIONS, VIDEO_RESOLUTIONS, invalidateAiModelCache, isReelEngine, isValidModelId, isVideoResolution, pickModels,
} from '../lib/aiModels.js';

const PROVIDERS: Record<string, string> = { [GEMINI_PROVIDER]: 'Google — Gemini / Omni' };

function view(c: ApiConnection, active: ResolvedGeminiKey) {
  return {
    id: c.id,
    name: c.name,
    provider: c.provider,
    providerLabel: PROVIDERS[c.provider] ?? c.provider,
    notes: c.notes ?? null,
    enabled: c.enabled,
    hasKey: c.has_key,
    keyLast4: c.key_last4 ?? null,
    keyUpdatedAt: c.key_updated_at ? new Date(c.key_updated_at).toISOString() : null,
    keyUpdatedBy: c.key_updated_by ?? null,
    inUse: active.source === 'saved' && active.connectionId === c.id,
    models: {
      text: c.text_model ?? null,
      image: c.image_model ?? null,
      video: c.video_model ?? null,
      videoResolution: c.video_resolution ?? null,
      reelEngine: c.reel_engine ?? null,
    },
  };
}

const bad = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
const notFound = (reply: FastifyReply) =>
  reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'API connection not found' } });

// Platform-owner screen for the keys every image, caption and reel generator uses.
// Keys are write-only: stored encrypted in api_connection_secrets and never sent back.
export default async function apiConnectionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGlobalOwner(request.user)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Global owner access required' } });
    }
  });

  const load = (id: string) => prisma.apiConnection.findUnique({ where: { id } });

  fastify.get('/', async () => {
    if ((await prisma.apiConnection.count({})) === 0) {
      await prisma.apiConnection.create({
        data: { name: 'Gemini (deploy key)', provider: GEMINI_PROVIDER, notes: 'Uses the GEMINI_API_KEY set on the Cloud Run service.' },
      });
    }
    const [connections, active] = await Promise.all([
      prisma.apiConnection.findMany({ orderBy: { created_at: 'asc' } }),
      resolveGeminiKey(),
    ]);
    return {
      items: connections.map((c) => view(c, active)),
      providers: Object.entries(PROVIDERS).map(([id, label]) => ({ id, label })),
      activeKey: { source: active.source, connectionId: active.connectionId },
      envKeyPresent: !!process.env['GEMINI_API_KEY']?.trim(),
      keyStorageReady: isKeyStorageReady(),
      modelOptions: { ...MODEL_OPTIONS, videoResolutions: [...VIDEO_RESOLUTIONS] },
      modelDefaults: pickModels(null),
    };
  });

  fastify.post('/', async (request, reply) => {
    const { name, provider, notes } = (request.body ?? {}) as { name?: string; provider?: string; notes?: string };
    const cleanName = name?.trim() ?? '';
    if (!cleanName || cleanName.length > 80) return bad(reply, 'name must be 1–80 characters');
    if (!provider || !PROVIDERS[provider]) return bad(reply, 'unknown provider');
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) return bad(reply, 'notes must be at most 1000 characters');
    const created = await prisma.apiConnection.create({ data: { name: cleanName, provider, notes: notes?.trim() || null } });
    return reply.code(201).send(view(created, await resolveGeminiKey()));
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, notes, enabled, textModel, imageModel, videoModel, videoResolution, reelEngine } = (request.body ?? {}) as {
      name?: string; notes?: string | null; enabled?: boolean;
      textModel?: string | null; imageModel?: string | null; videoModel?: string | null;
      videoResolution?: string | null; reelEngine?: string | null;
    };
    if (!(await load(id))) return notFound(reply);
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const cleanName = name.trim();
      if (!cleanName || cleanName.length > 80) return bad(reply, 'name must be 1–80 characters');
      data['name'] = cleanName;
    }
    if (notes !== undefined) {
      if (notes !== null && (typeof notes !== 'string' || notes.length > 1000)) return bad(reply, 'notes must be at most 1000 characters');
      data['notes'] = notes?.trim() || null;
    }
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') return bad(reply, 'enabled must be true or false');
      data['enabled'] = enabled;
    }
    if (textModel !== undefined) {
      if (textModel === null) data['text_model'] = null;
      else if (isValidModelId(textModel)) data['text_model'] = textModel;
      else return bad(reply, 'textModel must be a model id like gemini-3.8-flash');
    }
    if (imageModel !== undefined) {
      if (imageModel === null) data['image_model'] = null;
      else if (isValidModelId(imageModel)) data['image_model'] = imageModel;
      else return bad(reply, 'imageModel must be a model id like gemini-3.8-flash');
    }
    if (videoModel !== undefined) {
      if (videoModel === null) data['video_model'] = null;
      else if (isValidModelId(videoModel)) data['video_model'] = videoModel;
      else return bad(reply, 'videoModel must be a model id like gemini-3.8-flash');
    }
    if (videoResolution !== undefined) {
      if (videoResolution === null) data['video_resolution'] = null;
      else if (isVideoResolution(videoResolution)) data['video_resolution'] = videoResolution;
      else return bad(reply, 'videoResolution must be 360p, 720p, 1080p or 4k');
    }
    if (reelEngine !== undefined) {
      if (reelEngine === null) data['reel_engine'] = null;
      else if (isReelEngine(reelEngine)) data['reel_engine'] = reelEngine;
      else return bad(reply, 'reelEngine must be ai or quick');
    }
    const updated = await prisma.apiConnection.update({ where: { id }, data });
    invalidateAiKeyCache();
    invalidateAiModelCache();
    return view(updated, await resolveGeminiKey());
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await load(id))) return notFound(reply);
    await prisma.apiConnectionSecret.deleteMany({ where: { connection_id: id } });
    await prisma.apiConnection.delete({ where: { id } });
    invalidateAiKeyCache();
    invalidateAiModelCache();
    request.log.info({ action: 'api_connection.deleted', connectionId: id, by: request.user.dealer_user_id });
    return { success: true };
  });

  fastify.put('/:id/key', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { key } = (request.body ?? {}) as { key?: string };
    const cleanKey = typeof key === 'string' ? key.trim() : '';
    if (cleanKey.length < 10 || cleanKey.length > 400 || /\s/.test(cleanKey)) return bad(reply, 'key must be 10–400 characters with no spaces');
    if (!(await load(id))) return notFound(reply);

    let sealed;
    try {
      sealed = sealSecret(cleanKey);
    } catch (err) {
      if (err instanceof KeyStorageUnavailableError) {
        return reply.code(503).send({ error: { code: 'KEY_STORAGE_UNAVAILABLE', message: 'Key storage is not configured on the server.' } });
      }
      throw err;
    }

    const existing = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: id } });
    if (existing) await prisma.apiConnectionSecret.update({ where: { id: existing.id }, data: sealed });
    else await prisma.apiConnectionSecret.create({ data: { connection_id: id, ...sealed } });

    const updated = await prisma.apiConnection.update({
      where: { id },
      data: { has_key: true, key_last4: cleanKey.slice(-4), key_updated_at: new Date(), key_updated_by: request.user.dealer_user_id },
    });
    invalidateAiKeyCache();
    invalidateAiModelCache();
    request.log.info({ action: 'api_key.saved', connectionId: id, by: request.user.dealer_user_id });
    return view(updated, await resolveGeminiKey());
  });

  fastify.delete('/:id/key', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await load(id))) return notFound(reply);
    await prisma.apiConnectionSecret.deleteMany({ where: { connection_id: id } });
    const updated = await prisma.apiConnection.update({
      where: { id },
      data: { has_key: false, key_last4: null, key_updated_at: new Date(), key_updated_by: request.user.dealer_user_id },
    });
    invalidateAiKeyCache();
    invalidateAiModelCache();
    request.log.info({ action: 'api_key.removed', connectionId: id, by: request.user.dealer_user_id });
    return view(updated, await resolveGeminiKey());
  });

  fastify.post('/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const connection = await load(id);
    if (!connection) return notFound(reply);

    let key: string | null = null;
    let source: 'saved' | 'env' = 'env';
    if (connection.has_key) {
      const secret = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: id } });
      if (secret) {
        try {
          key = openSecret(secret);
        } catch (err) {
          if (err instanceof KeyStorageUnavailableError) {
            return reply.code(503).send({ error: { code: 'KEY_STORAGE_UNAVAILABLE', message: 'Key storage is not configured on the server.' } });
          }
          throw err;
        }
        source = 'saved';
      }
    }
    key ??= process.env['GEMINI_API_KEY']?.trim() || null;
    if (!key) return reply.code(400).send({ error: { code: 'NO_KEY', message: 'No key saved here and no GEMINI_API_KEY on the server.' } });

    const effective = pickModels(connection);
    const result = await checkGeminiKey(key, { text: effective.text, image: effective.image, video: effective.video });
    request.log.info({ action: 'api_key.tested', connectionId: id, by: request.user.dealer_user_id, ok: result.ok });
    return { ...result, source };
  });
}
