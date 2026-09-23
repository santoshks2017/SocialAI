import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { consumeDailyQuota } from '../lib/dailyQuota.js';
import { hasGeminiKey } from '../lib/aiKeys.js';
import { resolveAiModels } from '../lib/aiModels.js';
import { normalizeLanguage } from '../lib/languages.js';
import { createVideoJob, inlineRenderEnabled, videoJobView, type VideoEngine } from '../lib/videoJobs.js';
import { runVideoJob } from '../lib/videoJobRunner.js';

const ASPECTS = new Set(['9:16', '1:1', '16:9']);
const DURATION: Record<VideoEngine, { min: number; max: number; fallback: number }> = {
  kenburns: { min: 6, max: 30, fallback: 15 },
  veo: { min: 4, max: 8, fallback: 8 },
};
const DAILY: Record<VideoEngine, { feature: string; env: string; fallback: number }> = {
  kenburns: { feature: 'generate_reel_quick', env: 'REEL_QUICK_DAILY_LIMIT', fallback: 30 },
  veo: { feature: 'generate_reel', env: 'REEL_DAILY_LIMIT', fallback: 10 },
};

const isMediaUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 2048 && /^(https?:\/\/|\/uploads\/)/i.test(value);

// The owner's "Reels use" setting (Admin → APIs & models); AI video needs a Gemini key, else quick render.
async function defaultEngine(): Promise<VideoEngine> {
  const { reelEngine } = await resolveAiModels();
  return reelEngine === 'ai' && (await hasGeminiKey()) ? 'veo' : 'kenburns';
}

function durationFor(engine: VideoEngine, value: unknown): number {
  const range = DURATION[engine];
  const seconds = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : range.fallback;
  return Math.min(range.max, Math.max(range.min, seconds));
}

function dailyLimit(engine: VideoEngine): number {
  const cfg = DAILY[engine];
  const limit = Number(process.env[cfg.env] ?? cfg.fallback);
  return Number.isFinite(limit) ? limit : cfg.fallback;
}

// Reels render in the background (Firebase Hosting cuts proxied requests at 60 s): the cron sweep
// (lib/videoJobRunner.ts) runs queued jobs, or this instance when VIDEO_RENDER_INLINE=true.
export default async function videoJobRoutes(fastify: FastifyInstance) {
  // POST /v1/creatives/generate-video — queue a reel render
  fastify.post('/generate-video', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Reels are made for a dealership.' } });

    const body = (request.body ?? {}) as { prompt?: unknown; image_url?: unknown; duration_seconds?: unknown; aspect_ratio?: unknown; language?: unknown; engine?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 3 || prompt.length > 500) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Describe your reel in 3–500 characters.' } });
    }
    if (body.image_url != null && !isMediaUrl(body.image_url)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'image_url must be an uploaded image URL.' } });
    }
    const engine: VideoEngine = body.engine === 'veo' || body.engine === 'kenburns' ? body.engine : await defaultEngine();
    if (engine === 'veo' && !(await hasGeminiKey())) {
      return reply.code(503).send({ error: { code: 'GEMINI_NOT_CONFIGURED', message: 'Video generation isn’t configured on the server.' } });
    }
    if (!(await consumeDailyQuota(DAILY[engine].feature, dealerId, dailyLimit(engine)))) {
      return reply.code(429).send({ error: { code: 'REEL_DAILY_LIMIT_REACHED', message: 'You’ve reached today’s reel limit. Try again tomorrow.' } });
    }

    const job = await createVideoJob({
      dealerId, userId: request.user.dealer_user_id, engine, prompt,
      imageUrl: isMediaUrl(body.image_url) ? body.image_url : null,
      aspectRatio: typeof body.aspect_ratio === 'string' && ASPECTS.has(body.aspect_ratio) ? body.aspect_ratio : '9:16',
      durationSeconds: durationFor(engine, body.duration_seconds),
      language: normalizeLanguage(body.language),
    });

    // The every-minute cron renders queued jobs. With VIDEO_RENDER_INLINE=true (instances with
    // always-allocated CPU) this instance starts right after replying; the cron takes over if it can't finish.
    if (inlineRenderEnabled()) {
      setImmediate(() => {
        void runVideoJob(job.id).catch((err) => request.log.error({ message: err instanceof Error ? err.message : String(err), jobId: job.id }, '[video-jobs] run failed'));
      });
    }
    return reply.code(202).send({ success: true, job_id: job.id, status: job.status, engine });
  });

  // GET /v1/creatives/generate-video/status?job=<id>
  fastify.get('/generate-video/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { job } = request.query as { job?: string };
    if (!job) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'job is required' } });
    const found = await prisma.videoJob.findFirst({ where: { id: job, dealer_id: request.user.dealer_id ?? '' } });
    if (!found) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Reel not found' } });
    return { success: true, ...videoJobView(found) };
  });
}
