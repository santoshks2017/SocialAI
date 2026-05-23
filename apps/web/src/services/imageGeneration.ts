/// <reference path="../types/puter.d.ts" />

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)
  ?? (import.meta.env.DEV ? 'http://127.0.0.1:3001/v1' : '');

/**
 * Builds a short headline from caption text (mirrors extractHeadline on the backend).
 * Used as the template overlay text and as context for image generation.
 */
export function buildHeadline(captionText: string, userPrompt: string): string {
  const first = captionText.split(/[.!?\n]/)[0]?.trim() ?? '';
  const source = first || userPrompt;
  if (source.length <= 70) return source;
  const cut = source.slice(0, 70);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 30 ? `${cut.slice(0, lastSpace)}...` : `${cut}...`;
}

/**
 * Builds an image generation prompt from the caption text and original user prompt.
 * The result is kept short and visual — no text overlays, clean automotive scene.
 */
export function buildImagePrompt(captionText: string, userPrompt: string): string {
  const captionSnippet = captionText.split(/[.!?\n]/)[0]?.trim().slice(0, 120) ?? '';
  const context = captionSnippet || userPrompt.slice(0, 100);
  return `Professional automotive photography for Indian car dealership. ${context}. Photorealistic, cinematic lighting, 4K quality, no text overlay, clean background, showroom setting.`;
}

/**
 * Primary: Puter.js client-side image generation — no API key, no billing.
 * Returns a data URL or blob URL from the generated HTMLImageElement.
 */
async function generateWithPuter(imagePrompt: string): Promise<string> {
  if (!window.puter?.ai?.txt2img) throw new Error('Puter.js not loaded');

  const imgEl = await window.puter.ai.txt2img(imagePrompt);

  if (imgEl.complete && imgEl.src) return imgEl.src;

  return new Promise<string>((resolve, reject) => {
    imgEl.onload = () => resolve(imgEl.src);
    imgEl.onerror = () => reject(new Error('Puter image load failed'));
    setTimeout(() => reject(new Error('Puter image timeout')), 30_000);
  });
}

/**
 * Pollinations.ai — completely free image generation, no API key.
 * Returns a stable URL (CDN-cached by prompt hash).
 * Automotive-tuned: adds negative prompt and quality modifiers.
 */
async function generateWithPollinations(imagePrompt: string): Promise<string> {
  // Add automotive quality modifiers for better results
  const enhancedPrompt = `${imagePrompt}, professional automotive photography, showroom quality, cinematic lighting, 8k, photorealistic`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1080&height=1080&model=flux&nologo=true&enhance=true`;

  // Just verify the URL resolves — Pollinations returns the image directly
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Pollinations failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Fallback: Cloudflare Workers AI via our backend (keeps API token server-side).
 * Returns a base64 data URL.
 */
async function generateWithCloudflare(imagePrompt: string): Promise<string> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/creatives/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt: imagePrompt }),
    signal: AbortSignal.timeout(50_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Image generation failed (${res.status})`);
  }

  const data = await res.json() as { image: string };
  return `data:image/png;base64,${data.image}`;
}

/**
 * 3-layer backend creative: AI background + optional subject isolation + SVG branding overlay.
 * This is the highest quality path — uses sharp for precise layer compositing.
 */
async function generateLayeredWithBackend(
  headline: string,
  subjectImageId?: string,
  subjectImageUrl?: string,
): Promise<string> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/creatives/generate-layered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      headline,
      ...(subjectImageId ? { subject_image_id: subjectImageId } : {}),
      ...(subjectImageUrl ? { subject_image_url: subjectImageUrl } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    throw new Error(err.error?.message ?? `Layered generation failed (${res.status})`);
  }

  const data = await res.json() as { url: string };
  if (!data.url) throw new Error('No URL returned from layered generation');
  return data.url;
}

/**
 * Backend branded creative: Cloudflare SDXL image → Sharp template composite.
 * Returns a CDN/storage URL to the fully branded creative (with dealer overlay).
 * Throws if the backend returns 503 (CF not configured) so callers can fall back.
 */
async function generateBrandedWithBackend(
  headline: string,
  templateIndex: 0 | 1 | 2,
): Promise<string> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/creatives/generate-branded`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ headline, template_index: templateIndex }),
    signal: AbortSignal.timeout(65_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    throw new Error(err.error?.message ?? `Branded generation failed (${res.status})`);
  }

  const data = await res.json() as { url: string };
  if (!data.url) throw new Error('No URL returned from branded generation');
  return data.url;
}

/**
 * Generates an inline SVG data URL as a branded placeholder.
 * Used when all other generation options fail so the UI always shows something.
 */
function generateSvgPlaceholder(captionText: string, variantIndex: number): string {
  const headline = captionText.split(/[.!?\n]/)[0]?.trim().slice(0, 52) ?? 'Special Offer';
  // Rotate accent colours per variant
  const accents = ['#f97316', '#14b8a6', '#8b5cf6'];
  const accent = accents[variantIndex % accents.length] ?? '#f97316';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0c14"/>
        <stop offset="60%" stop-color="#141824"/>
        <stop offset="100%" stop-color="#1e1030"/>
      </linearGradient>
      <radialGradient id="glow" cx="70%" cy="35%" r="55%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#bg)"/>
    <rect width="1080" height="1080" fill="url(#glow)"/>
    <!-- Diagonal accent bar -->
    <line x1="0" y1="1080" x2="1080" y2="0" stroke="${accent}" stroke-opacity="0.07" stroke-width="180"/>
    <!-- Car icon placeholder -->
    <text x="540" y="430" font-family="Arial,sans-serif" font-size="96" text-anchor="middle" fill="${accent}" opacity="0.7">🚗</text>
    <!-- Headline -->
    <text x="540" y="560" font-family="Arial,sans-serif" font-size="44" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle"
      style="white-space:pre">${headline.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text>
    <!-- Sub-label -->
    <text x="540" y="630" font-family="Arial,sans-serif" font-size="28" fill="rgba(255,255,255,0.45)" text-anchor="middle">Your Dealership · CarDekho Social AI</text>
    <!-- Bottom accent line -->
    <rect x="390" y="680" width="300" height="4" rx="2" fill="${accent}" opacity="0.8"/>
  </svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
}

/**
 * Generates a fully branded creative for a given caption variant.
 *
 * Priority chain:
 *   0. 3-layer backend (AI background + subject isolation + SVG branding) — highest quality
 *   1. Backend branded (Cloudflare SDXL + Sharp template) — good quality, fully branded
 *   2. Pollinations.ai (free, no API key, high quality) — primary free fallback
 *   3. Puter.js (client-side DALL-E) — secondary free fallback
 *   4. Cloudflare raw (backend SDXL, base64) — requires backend token
 *   5. SVG placeholder — always works, no network required
 *
 * @param subjectImageId - filename from /v1/upload/image to use as Layer 1 subject
 * @param subjectImageUrl - external URL to use as Layer 1 subject
 */
export async function generateBrandedCreative(
  captionText: string,
  userPrompt: string,
  variantIndex: number,
  subjectImageId?: string,
  subjectImageUrl?: string,
): Promise<string> {
  const headline = buildHeadline(captionText, userPrompt);
  const templateIndex = Math.min(variantIndex, 2) as 0 | 1 | 2;

  // 0. 3-layer compositor (AI background + optional subject + SVG branding overlay)
  try {
    return await generateLayeredWithBackend(headline, subjectImageId, subjectImageUrl);
  } catch (e) {
    console.warn('[ImageGen] Layered generation failed, trying branded:', e);
  }

  // 1. Try backend branded (CF SDXL + template overlay)
  try {
    return await generateBrandedWithBackend(headline, templateIndex);
  } catch (e) {
    console.warn('[ImageGen] Backend branded failed, trying Pollinations:', e);
  }

  const imagePrompt = buildImagePrompt(captionText, userPrompt);

  // 2. Pollinations.ai — free, no API key
  try {
    return await generateWithPollinations(imagePrompt);
  } catch (e) {
    console.warn('[ImageGen] Pollinations failed, trying Puter.js:', e);
  }

  // 3. Try Puter.js (client-side DALL-E)
  try {
    return await generateWithPuter(imagePrompt);
  } catch (e) {
    console.warn('[ImageGen] Puter.js failed, trying raw Cloudflare:', e);
  }

  // 4. Raw Cloudflare via backend
  try {
    return await generateWithCloudflare(imagePrompt);
  } catch (e) {
    console.warn('[ImageGen] Cloudflare failed, using SVG placeholder:', e);
  }

  // 5. SVG placeholder — always succeeds
  return generateSvgPlaceholder(captionText, variantIndex);
}

/**
 * Legacy export — kept for any existing callers.
 * Tries Puter.js first, then Cloudflare raw backend.
 */
export async function generateImage(captionText: string, userPrompt: string): Promise<string> {
  const imagePrompt = buildImagePrompt(captionText, userPrompt);

  try {
    return await generateWithPuter(imagePrompt);
  } catch (e) {
    console.warn('[ImageGen] Puter.js failed, trying Cloudflare fallback:', e);
  }

  return await generateWithCloudflare(imagePrompt);
}

// ── Canvas Studio: scene background generation ────────────────────────────────
import type { CarPose, SceneVariant } from '../components/CreatePost/CanvasStudio/types';
import { extractSceneMetadata } from '../components/CreatePost/CanvasStudio/sceneAnalysis';
import { generateProceduralScene, pickSceneStyle } from '../components/CreatePost/CanvasStudio/proceduralScene';

export async function generateSceneBackgrounds(
  brief: string,
  model: string,
  poses: CarPose[],
): Promise<SceneVariant[]> {
  const token = localStorage.getItem('access_token');

  let rawScenes: Array<{ url: string; pose: string }>;

  try {
    const res = await fetch(`${API_BASE_URL}/creatives/generate-scenes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ brief, model, poses }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`generate-scenes ${res.status}`);
    const data = await res.json() as { scenes: Array<{ url: string; pose: string }> };
    rawScenes = data.scenes;
  } catch (e) {
    console.warn('[SceneGen] Backend failed, using procedural fallback:', e);
    const style = pickSceneStyle(brief);
    rawScenes = await Promise.all(
      poses.map(async (pose) => ({ url: await generateProceduralScene(pose, style), pose }))
    );
  }

  return Promise.all(
    rawScenes.map(async ({ url, pose }) => {
      const p = pose as CarPose;
      const meta = await extractSceneMetadata(url, p);
      return { sceneUrl: url, pose: p, bounds: meta.bounds, lighting: meta.lighting, usedAI: true } satisfies SceneVariant;
    })
  );
}

export interface GeminiCreativeOption {
  creativeUrl: string;
  headline: string;
  copy: string;
  hashtags: string[];
  backgroundPrompt: string;
}

export interface GeminiCreativeResponse {
  success: boolean;
  promptBrief?: {
    car_details: string;
    angle: string;
    background: string;
    theme: string;
    lighting: string;
    text_placement: string;
    expanded_prompt?: string;
  };
  options: GeminiCreativeOption[];
}

export async function generateGeminiCreative(
  prompt: string,
  brand?: string,
  subjectImageIds?: string[],
  subjectImageUrls?: string[],
): Promise<GeminiCreativeResponse> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/creatives/generate-gemini`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      brand,
      subject_image_ids: subjectImageIds,
      subject_image_urls: subjectImageUrls,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Gemini creative generation failed (${res.status})`);
  }

  return await res.json() as GeminiCreativeResponse;
}

export function revokeSceneUrls(urls: string[]) {
  urls.forEach((url) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  });
}

