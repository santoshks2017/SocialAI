import { prisma } from '../db/prisma.js';
import { GEMINI_PROVIDER, resolveGeminiKey } from './aiKeys.js';

export type ModelKind = 'text' | 'image' | 'video';
export type ReelEngineChoice = 'ai' | 'quick';
export interface ModelOption { id: string; label: string }

// Google's current models (ai.google.dev/gemini-api/docs/models, checked 2026-09-24). Newest first.
export const MODEL_OPTIONS: Record<ModelKind, ModelOption[]> = {
  text: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
  ],
  image: [
    { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (Gemini 3.1 Flash Image)' },
    { id: 'gemini-3-pro-image', label: 'Nano Banana Pro (Gemini 3 Pro Image)' },
    { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite' },
  ],
  video: [
    { id: 'gemini-omni-1.1-flash', label: 'Gemini Omni 1.1 Flash' },
    { id: 'veo-3.1-generate-preview', label: 'Veo 3.1 (preview)' },
    { id: 'veo-3.1-lite-generate-preview', label: 'Veo 3.1 Lite (preview)' },
  ],
};

export const VIDEO_RESOLUTIONS = ['360p', '720p', '1080p', '4k'] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

export const DEFAULT_MODELS = {
  text: 'gemini-3.8-flash',
  image: 'gemini-3.1-flash-image',
  video: 'gemini-omni-1.1-flash',
  videoResolution: '720p' as VideoResolution,
  reelEngine: 'ai' as ReelEngineChoice,
};

/** Cheaper text model tried when the chosen one fails (quota, outage, no access). */
export const TEXT_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

export interface AiModels {
  text: string;
  textFallbacks: string[];
  image: string;
  video: string;
  videoResolution: VideoResolution;
  reelEngine: ReelEngineChoice;
}

export interface StoredModelChoices {
  text_model?: string | null;
  image_model?: string | null;
  video_model?: string | null;
  video_resolution?: string | null;
  reel_engine?: string | null;
}

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{2,79}$/;

export function isValidModelId(value: unknown): value is string {
  return typeof value === 'string' && MODEL_ID.test(value);
}

export function isVideoResolution(value: unknown): value is VideoResolution {
  return typeof value === 'string' && (VIDEO_RESOLUTIONS as readonly string[]).includes(value);
}

export function isReelEngine(value: unknown): value is ReelEngineChoice {
  return value === 'ai' || value === 'quick';
}

function firstValid<T extends string>(check: (v: unknown) => v is T, ...values: unknown[]): T | undefined {
  for (const value of values) {
    const v = typeof value === 'string' ? value.trim() : value;
    if (check(v)) return v;
  }
  return undefined;
}

function envEngine(value: string | undefined): ReelEngineChoice | undefined {
  if (value === 'veo') return 'ai';
  if (value === 'kenburns') return 'quick';
  return undefined;
}

/** A connection's saved choices beat env vars, which beat the latest defaults. Invalid values are skipped. */
export function pickModels(stored: StoredModelChoices | null, env: NodeJS.ProcessEnv = process.env): AiModels {
  const text = firstValid(isValidModelId, stored?.text_model, env['GEMINI_TEXT_MODEL']) ?? DEFAULT_MODELS.text;
  return {
    text,
    textFallbacks: text === TEXT_FALLBACK_MODEL ? [] : [TEXT_FALLBACK_MODEL],
    image: firstValid(isValidModelId, stored?.image_model, env['GEMINI_IMAGE_MODEL']) ?? DEFAULT_MODELS.image,
    video: firstValid(isValidModelId, stored?.video_model, env['GEMINI_VIDEO_MODEL']) ?? DEFAULT_MODELS.video,
    videoResolution: firstValid(isVideoResolution, stored?.video_resolution, env['GEMINI_OMNI_RESOLUTION']) ?? DEFAULT_MODELS.videoResolution,
    reelEngine: firstValid(isReelEngine, stored?.reel_engine) ?? envEngine(env['VIDEO_DEFAULT_ENGINE']) ?? DEFAULT_MODELS.reelEngine,
  };
}

export function modelLabel(kind: ModelKind, id: string): string {
  return MODEL_OPTIONS[kind].find((o) => o.id === id)?.label.replace(/ \(.*\)$/, '') ?? id;
}

const CACHE_MS = 60_000;
let cached: { value: AiModels; at: number } | null = null;

// The connection whose key is in use decides; with the server key in use, the earliest enabled
// Gemini connection (the seeded "deploy key" row) does.
export async function resolveAiModels(): Promise<AiModels> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value: AiModels;
  try {
    const [connections, active] = await Promise.all([
      prisma.apiConnection.findMany({ where: { provider: GEMINI_PROVIDER, enabled: true }, orderBy: { created_at: 'asc' } }),
      resolveGeminiKey(),
    ]);
    const chosen = connections.find((c) => c.id === active.connectionId) ?? connections[0] ?? null;
    value = pickModels(chosen);
  } catch (err) {
    console.error('[aiModels] Could not read model choices; using env/defaults', err instanceof Error ? err.message : String(err));
    value = pickModels(null);
  }
  cached = { value, at: Date.now() };
  return value;
}

export function invalidateAiModelCache(): void {
  cached = null;
}
