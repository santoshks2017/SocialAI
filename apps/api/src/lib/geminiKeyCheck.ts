const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';

export interface GeminiKeyCheck {
  ok: boolean;
  detail: string;
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
}

const failed = (detail: string): GeminiKeyCheck => ({ ok: false, detail, canGenerateImages: false, canGenerateVideo: false });

// A free read: lists the models the key can use and generates nothing.
export async function checkGeminiKey(key: string): Promise<GeminiKeyCheck> {
  let res: Response;
  try {
    res = await fetch(MODELS_URL, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return failed(`Could not reach Google: ${err instanceof Error ? err.message : String(err)}`);
  }

  const body = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }>; error?: { message?: string } };
  if (!res.ok) return failed(body.error?.message ?? `Google rejected the key (HTTP ${res.status})`);

  const names = (body.models ?? []).map((m) => m.name ?? '');
  const canGenerateImages = names.some((n) => n.includes('image') || n.includes('imagen'));
  const canGenerateVideo = names.some((n) => n.includes('veo'));
  return {
    ok: true,
    detail: `Key works — ${canGenerateImages ? 'image models available' : 'no image models'}, ${canGenerateVideo ? 'Veo video available' : 'no Veo access'}.`,
    canGenerateImages,
    canGenerateVideo,
  };
}
