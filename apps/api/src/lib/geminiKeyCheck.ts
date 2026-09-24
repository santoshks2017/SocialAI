import { modelLabel, type ModelKind } from './aiModels.js';
import { googleAiHeaders } from './googleAi.js';

const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';

export interface GeminiKeyCheck {
  ok: boolean;
  detail: string;
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
  models: Array<{ kind: ModelKind; id: string; label: string; available: boolean }>;
}

const failed = (detail: string): GeminiKeyCheck => ({ ok: false, detail, canGenerateImages: false, canGenerateVideo: false, models: [] });

// A free read: lists the models the key can use and generates nothing.
export async function checkGeminiKey(key: string, chosen: { text: string; image: string; video: string }): Promise<GeminiKeyCheck> {
  let res: Response;
  try {
    res = await fetch(MODELS_URL, { headers: googleAiHeaders(key), signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return failed(`Could not reach Google: ${err instanceof Error ? err.message : String(err)}`);
  }

  const body = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }>; error?: { message?: string } };
  if (!res.ok) return failed(body.error?.message ?? `Google rejected the key (HTTP ${res.status})`);

  const names = new Set((body.models ?? []).map((m) => m.name ?? ''));
  const kinds: ModelKind[] = ['text', 'image', 'video'];
  const models = kinds.map((kind) => {
    const id = chosen[kind];
    return { kind, id, label: modelLabel(kind, id), available: names.has(`models/${id}`) };
  });

  const canGenerateImages = models.find((m) => m.kind === 'image')?.available ?? false;
  const canGenerateVideo = models.find((m) => m.kind === 'video')?.available ?? false;
  const someUnavailable = models.some((m) => !m.available);
  const detail = `Key works — ${models.map((m) => `${m.label} ${m.available ? '✓' : '✗'}`).join(', ')}.`
    + (someUnavailable ? ' Models marked ✗ aren’t available to this key.' : '');

  return { ok: true, detail, canGenerateImages, canGenerateVideo, models };
}
