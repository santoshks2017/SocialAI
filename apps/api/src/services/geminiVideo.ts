import axios from 'axios';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { setTimeout as sleep } from 'timers/promises';
import { uploadFile } from '../lib/storage.js';
import { UPLOADS_ROOT } from '../routes/upload.js';
import { getGeminiApiKey } from '../lib/aiKeys.js';
import { captionLanguage } from '../lib/languages.js';
import { resolveAiModels, type VideoResolution } from '../lib/aiModels.js';
import { GOOGLE_AI_BASE, generateContentUrl, googleAiHeaders } from '../lib/googleAi.js';
import { reelDimensions } from './kenBurns.js';

const execFileAsync = promisify(execFile);

export const REELS_DIR = path.join(UPLOADS_ROOT, 'reels');

export interface VideoOverlayBeat {
  id: string;
  startTime: number;
  endTime: number;
  badge?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  cta?: string | undefined;
  position: 'top' | 'center' | 'bottom';
  theme?: 'glass-dark' | 'amber-glow' | 'minimal-white' | undefined;
}

export interface VideoImageInput {
  data: Buffer;
  mimeType: string;
}

/** Output frame of an uploaded reel, in pixels. */
export interface VideoFrame {
  width: number;
  height: number;
}

export interface GenerateVideoParams {
  prompt: string;
  brand?: string | undefined;
  model_name?: string | undefined;
  camera_motion?: 'tracking' | 'drone' | 'sunset' | 'studio' | string | undefined;
  duration_seconds?: number | undefined;
  aspect_ratio?: '9:16' | '16:9' | undefined;
  dealerName?: string | undefined;
  city?: string | undefined;
  overlays?: VideoOverlayBeat[] | undefined;
  language?: string | undefined;
  image?: VideoImageInput | undefined;
}

export interface VideoGenerationResult {
  videoUrl: string;
  cleanVideoUrl: string;
  thumbnailUrl: string;
  duration: number;
  aspectRatio: string;
  promptUsed: string;
  overlays: VideoOverlayBeat[];
  // Caption metadata (included from the batched Gemini Flash call)
  headline?: string;
  caption?: string;
  hashtags?: string[];
  audioSuggestion?: string;
}

export interface ReelMetadataResult {
  headline: string;
  caption: string;
  hashtags: string[];
  audioSuggestion: string;
}

const MOTION_DESCRIPTIONS: Record<string, string> = {
  tracking: 'Dynamic tracking camera shot keeping pace with the vehicle as it drives smoothly forward along a picturesque open road, cinematic low-angle commercial perspective with natural motion blur in the background',
  drone: 'Cinematic aerial drone shot slowly descending and sweeping in a dynamic arc around the moving vehicle, wide panoramic vista, sweeping cinematic motion',
  sunset: 'Golden hour highway cruise, warm glowing sunlight reflecting off the vehicle metallic paint and windshield, realistic lens flare, serene automotive commercial atmosphere',
  studio: 'Dramatic luxury showroom 360-degree slow turntable pan, sleek moody spotlights tracing the body lines, grille, and headlights of the vehicle, ultra-premium commercial aesthetics',
};

/**
 * Detects an available system TrueType font for FFmpeg drawtext.
 */
function getAvailableFontPath(): string {
  const candidates = [
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/noto/NotoSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial Bold.ttf',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

/**
 * Escapes text for FFmpeg drawtext filter syntax.
 */
function escapeFfmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

/**
 * Checks if an error is a rate limit (429) error from Google APIs.
 */
function isRateLimitError(err: any): boolean {
  return err?.response?.status === 429 || err?.status === 429 || String(err?.message).includes('429');
}

/**
 * SINGLE BATCHED Gemini Flash call that returns:
 * 1. A clean cinematic scene description (no promo text)
 * 2. Three structured timed text overlay beats
 * 3. Reel caption, headline, hashtags, and audio suggestion
 * This replaces THREE separate API calls with ONE call, cutting quota usage by ~66%.
 */
async function batchVideoCreativeData(params: {
  rawPrompt: string;
  brand?: string;
  model_name?: string;
  dealerName?: string;
  city?: string;
  duration: number;
  apiKey: string;
  language?: string;
}): Promise<{
  visualScene: string;
  overlays: VideoOverlayBeat[];
  headline: string;
  caption: string;
  hashtags: string[];
  audioSuggestion: string;
}> {
  const { rawPrompt, brand, model_name, dealerName, duration, apiKey, language } = params;
  const car = model_name ? `${brand ? `${brand} ` : ''}${model_name}` : 'NEW CAR';
  const dealer = dealerName || 'Authorized Dealership';

  // --- Pure JS fallbacks (zero API calls) ---
  const regexScene = rawPrompt
    .replace(/(discount|offer|sale|exchange|bonus|rs\.?|₹|booking|test drive|contact|call|price|best deal|hurry|limited|presenter|branch|phone|number|cash|emi|loan|finance|\d{10})/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Cruising along a picturesque open highway under cinematic golden hour lighting';

  const defaultOverlays: VideoOverlayBeat[] = [
    { id: 'beat-1', startTime: 0, endTime: Math.round(duration * 0.35 * 10) / 10, badge: 'ALL-NEW 2026', title: car.toUpperCase(), subtitle: 'Command Every Journey', position: 'bottom', theme: 'amber-glow' },
    { id: 'beat-2', startTime: Math.round(duration * 0.35 * 10) / 10, endTime: Math.round(duration * 0.72 * 10) / 10, badge: 'SPECIAL BENEFIT', title: 'LIMITED TIME OFFER', subtitle: 'Exclusive Exchange & Finance Benefits', position: 'bottom', theme: 'glass-dark' },
    { id: 'beat-3', startTime: Math.round(duration * 0.72 * 10) / 10, endTime: duration, badge: 'EXCLUSIVE AT', title: dealer.toUpperCase(), subtitle: 'Book Test Drive · Visit Showroom', cta: 'Book Now', position: 'bottom', theme: 'minimal-white' },
  ];

  const defaultCaption = {
    headline: `Experience the All-New ${car}`,
    caption: `Drivin' into luxury! 🔥 Book your test drive for the ${car} at ${dealer} today!`,
    hashtags: ['#CarReels', '#Automotive', '#DriveInStyle', '#NewCar', '#CarLover', '#ReelsInstagram'],
    audioSuggestion: 'Trending Phonk Beat · Speed & Luxury',
  };

  // Skip Gemini Flash entirely when flag is set or no key
  if (!apiKey || process.env['GEMINI_SKIP_SCENE_EXTRACTION'] === 'true') {
    return { visualScene: regexScene, overlays: defaultOverlays, ...defaultCaption };
  }

  const textModel = (await resolveAiModels()).text;
  const batchPrompt = `You are an automotive video ad creative director AND viral social media manager for Indian car dealerships.
Given this ad request for "${car}" at "${dealer}": "${rawPrompt}"

Return ONLY a single valid JSON object (no markdown, no preamble) with exactly this shape:
{
  "scene": "<10-15 word visual environment description — only physical scenery/road/lighting, NO text NO offers NO prices NO names>",
  "overlays": [
    { "id": "beat-1", "startTime": 0.0, "endTime": ${(duration * 0.35).toFixed(1)}, "badge": "ALL-NEW 2026", "title": "${car.toUpperCase()}", "subtitle": "Command Every Journey", "position": "bottom", "theme": "amber-glow" },
    { "id": "beat-2", "startTime": ${(duration * 0.35).toFixed(1)}, "endTime": ${(duration * 0.72).toFixed(1)}, "badge": "SPECIAL BENEFIT", "title": "<main offer from the prompt in uppercase>", "subtitle": "<key benefit detail>", "position": "bottom", "theme": "glass-dark" },
    { "id": "beat-3", "startTime": ${(duration * 0.72).toFixed(1)}, "endTime": ${duration}.0, "badge": "EXCLUSIVE AT", "title": "${dealer.toUpperCase()}", "subtitle": "Book Test Drive Today", "cta": "Book Now", "position": "bottom", "theme": "minimal-white" }
  ],
  "headline": "<Short impactful 4-6 word reel headline>",
  "caption": "<Punchy 2-3 line caption in ${captionLanguage(language ?? 'en')} with emojis, hook, and booking CTA>",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5", "#Tag6"],
  "audioSuggestion": "<Short name of trending audio vibe e.g. 'Trending High-Octane Phonk'>"
}

Rules:
- scene: pure visual description only, no brand names, no text mentions, no prices
- overlays: extract the real offer/price from the prompt for beat-2 title/subtitle
- All overlay times must sum correctly to ${duration}s total
- Return valid JSON only, no surrounding text`;

  try {
    const url = generateContentUrl(textModel);
    const res = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: batchPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      { headers: googleAiHeaders(apiKey), timeout: 15000 }
    );
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      const parsed = JSON.parse(text);
      const scene = (typeof parsed.scene === 'string' && parsed.scene.length > 5) ? parsed.scene : regexScene;
      const overlays: VideoOverlayBeat[] = Array.isArray(parsed.overlays) && parsed.overlays.length > 0
        ? parsed.overlays.map((item: any, idx: number) => ({
            id: item.id || `beat-${idx + 1}`,
            startTime: typeof item.startTime === 'number' ? item.startTime : Math.round((idx * (duration / 3)) * 10) / 10,
            endTime: typeof item.endTime === 'number' ? item.endTime : Math.round(((idx + 1) * (duration / 3)) * 10) / 10,
            badge: item.badge ? String(item.badge) : undefined,
            title: item.title ? String(item.title) : car.toUpperCase(),
            subtitle: item.subtitle ? String(item.subtitle) : undefined,
            cta: item.cta ? String(item.cta) : undefined,
            position: (['top', 'center', 'bottom'] as const).includes(item.position) ? item.position : 'bottom',
            theme: (['glass-dark', 'amber-glow', 'minimal-white'] as const).includes(item.theme) ? item.theme : 'glass-dark',
          }))
        : defaultOverlays;
      console.log('[Veo] ✅ 1 Gemini Flash call returned: scene + overlays + caption + hashtags');
      return {
        visualScene: scene,
        overlays,
        headline: typeof parsed.headline === 'string' ? parsed.headline : defaultCaption.headline,
        caption: typeof parsed.caption === 'string' ? parsed.caption : defaultCaption.caption,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : defaultCaption.hashtags,
        audioSuggestion: typeof parsed.audioSuggestion === 'string' ? parsed.audioSuggestion : defaultCaption.audioSuggestion,
      };
    }
  } catch (err: any) {
    if (isRateLimitError(err)) {
      console.warn('[Veo] Gemini Flash quota hit on batch call — using JS fallbacks (no extra API calls)');
    } else {
      console.warn(`[Veo] Batch creative data error — using fallbacks: ${err.message}`);
    }
  }

  return { visualScene: regexScene, overlays: defaultOverlays, ...defaultCaption };
}

/**
 * Generates structured, timed editorial text overlay beats.
 * Now delegates to batchVideoCreativeData so no extra API call is made when called during video generation.
 * Kept for backward compatibility with external callers.
 */
export async function generateReelOverlays(params: {
  prompt: string;
  brand?: string | undefined;
  model_name?: string | undefined;
  duration_seconds: number;
  dealerName?: string | undefined;
  city?: string | undefined;
}): Promise<VideoOverlayBeat[]> {
  const apiKey = (await getGeminiApiKey()) ?? '';
  const { overlays } = await batchVideoCreativeData({
    rawPrompt: params.prompt,
    ...(params.brand !== undefined && { brand: params.brand }),
    ...(params.model_name !== undefined && { model_name: params.model_name }),
    ...(params.dealerName !== undefined && { dealerName: params.dealerName }),
    ...(params.city !== undefined && { city: params.city }),
    duration: Math.max(4, Math.min(8, Number(params.duration_seconds) || 6)),
    apiKey,
  });
  return overlays;
}

/**
 * Scales any source (360p–4k) into exactly W×H: fit inside, pad the rest, square pixels.
 * Omni and Veo return different sizes per resolution; platforms get one reel size per aspect.
 */
export function fitFrameFilter({ width, height }: VideoFrame): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

// Instagram needs the moov atom first (+faststart) and 4:2:0 chroma, so every reel encode keeps both.
function reelEncodeArgs(inputVideoPath: string, outputVideoPath: string, videoFilter: string): string[] {
  return [
    '-y',
    '-i', inputVideoPath,
    '-vf', videoFilter,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputVideoPath,
  ];
}

/** FFmpeg arguments for fitting the video to the reel frame and burning in the overlay filter graph. */
export function compositeOverlayArgs(inputVideoPath: string, outputVideoPath: string, filterGraph: string, frame: VideoFrame): string[] {
  return reelEncodeArgs(inputVideoPath, outputVideoPath, `${fitFrameFilter(frame)},${filterGraph}`);
}

/** FFmpeg arguments for fitting the video to the reel frame only (no text to burn in). */
export function scaleVideoArgs(inputVideoPath: string, outputVideoPath: string, frame: VideoFrame): string[] {
  return reelEncodeArgs(inputVideoPath, outputVideoPath, fitFrameFilter(frame));
}

/** Re-encodes the video at exactly the reel frame. False (logged) when ffmpeg fails. */
export async function normalizeVideo(inputVideoPath: string, outputVideoPath: string, frame: VideoFrame): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', scaleVideoArgs(inputVideoPath, outputVideoPath, frame), { timeout: 120_000 });
    return true;
  } catch (err) {
    console.error(`[Video] Could not resize the video to ${frame.width}x${frame.height}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** The clip's length in seconds from ffprobe, or null when it can't be read. */
export async function probeDurationSeconds(videoPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath], { timeout: 15_000 });
    const seconds = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch (err) {
    console.warn(`[Video] Could not read the clip length: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Omni picks its own clip length, so beats planned for `plannedSeconds` are stretched onto the
 * real clip (clamped to it). Returns the beats unchanged when either length isn't usable.
 */
export function retimeOverlays(beats: VideoOverlayBeat[], plannedSeconds: number, actualSeconds: number): VideoOverlayBeat[] {
  if (!(plannedSeconds > 0 && actualSeconds > 0 && Number.isFinite(plannedSeconds) && Number.isFinite(actualSeconds))) return beats;
  const ratio = actualSeconds / plannedSeconds;
  const at = (t: number) => Math.min(actualSeconds, Math.max(0, Math.round(t * ratio * 1000) / 1000));
  return beats.map((b) => ({ ...b, startTime: at(b.startTime), endTime: at(b.endTime) }));
}

/**
 * drawtext filters for the overlay beats on a `frame`-sized video. Sizes and box borders scale
 * with the frame's short side (tuned at 720, so ×1.5 at 1080) so text looks the same at any size.
 */
export function overlayFilters(overlays: VideoOverlayBeat[], frame: VideoFrame, font: string): string[] {
  const isWide = frame.width > frame.height;
  const px = (base: number) => Math.round((base * Math.min(frame.width, frame.height)) / 720);
  const filters: string[] = [];

  for (const b of overlays) {
    const s = Math.max(0, b.startTime);
    const e = Math.max(s + 0.5, b.endTime);

    // Color theme
    let badgeBg = '0xE8590C@0.9'; // orange
    if (b.theme === 'amber-glow') badgeBg = '0xD97706@0.9';
    else if (b.theme === 'minimal-white') badgeBg = '0x059669@0.9'; // emerald

    // Vertical coordinates based on aspect ratio
    const badgeY = isWide ? 'h*0.68' : 'h*0.72';
    const titleY = isWide ? 'h*0.75' : 'h*0.77';
    const subY = isWide ? 'h*0.83' : 'h*0.83';

    const badgeSize = px(isWide ? 18 : 22);
    const titleSize = px(isWide ? 28 : 34);
    const subSize = px(isWide ? 17 : 20);

    if (b.badge) {
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeFfmpegText(b.badge)}':fontcolor=white:fontsize=${badgeSize}:box=1:boxcolor=${badgeBg}:boxborderw=${px(7)}:x=(w-text_w)/2:y=${badgeY}:enable='between(t,${s},${e})'`
      );
    }
    if (b.title) {
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeFfmpegText(b.title)}':fontcolor=white:fontsize=${titleSize}:box=1:boxcolor=black@0.75:boxborderw=${px(10)}:x=(w-text_w)/2:y=${titleY}:enable='between(t,${s},${e})'`
      );
    }
    if (b.subtitle) {
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeFfmpegText(b.subtitle)}':fontcolor=white@0.95:fontsize=${subSize}:box=1:boxcolor=black@0.65:boxborderw=${px(6)}:x=(w-text_w)/2:y=${subY}:enable='between(t,${s},${e})'`
      );
    }
  }
  return filters;
}

/**
 * Composites high-contrast, crisp typography overlays onto video frames using FFmpeg, after
 * fitting the video to `frame`.
 */
export async function compositeVideoOverlays(
  inputVideoPath: string,
  outputVideoPath: string,
  overlays: VideoOverlayBeat[],
  frame: VideoFrame,
): Promise<boolean> {
  const font = getAvailableFontPath();
  if (!font) {
    console.warn('[Veo Compositor] No system font found for FFmpeg drawtext. Skipping burn-in.');
    return false;
  }

  const filters = overlayFilters(overlays, frame, font);
  if (filters.length === 0) return false;

  try {
    const filterGraph = filters.join(',');
    console.log(`[Veo Compositor] Executing FFmpeg drawtext overlay on ${inputVideoPath}...`);
    await execFileAsync('ffmpeg', compositeOverlayArgs(inputVideoPath, outputVideoPath, filterGraph, frame));
    console.log(`[Veo Compositor] Successfully composited overlays to ${outputVideoPath}`);
    return true;
  } catch (err: any) {
    console.error(`[Veo Compositor] FFmpeg compositing error: ${err.message}`);
    return false;
  }
}

/** Builds the video-generation prompt: keeps the real car when a photo is supplied, else describes one. */
export function videoPrompt(p: { hasImage: boolean; vehicleMention: string; motionStyle: string; visualScene: string }): string {
  const clean = 'Absolutely no text, no words, no letters, no numbers, no typography, no watermarks, no logos, no subtitles, no graphic banners, pristine clean video footage only.';
  if (p.hasImage) {
    return `Turn this photo into realistic cinematic footage of the same car. Keep its body shape, colour, grille, lights and badges exactly as in the photo. ${p.motionStyle}. Setting: ${p.visualScene}. Physically accurate wheel rotation, reflections and shadows. ${clean}`;
  }
  return `${p.vehicleMention}. ${p.motionStyle}. Setting: ${p.visualScene}. 4k resolution, hyper-realistic, photorealistic, professional automotive commercial grade, cinematic lighting, 60fps smooth fluid motion, physically accurate wheel rotation and ground reflections. ${clean}`;
}

/** Gemini Omni 1.1 Flash request: text-to-video, or image-to-video when a reference photo is supplied. */
export function buildOmniRequest(p: { model: string; prompt: string; aspectRatio: '9:16' | '16:9'; resolution: VideoResolution; image?: VideoImageInput }): object {
  return {
    model: p.model,
    input: p.image
      ? [{ type: 'image', data: p.image.data.toString('base64'), mime_type: p.image.mimeType }, { type: 'text', text: p.prompt }]
      : p.prompt,
    response_format: { type: 'video', aspect_ratio: p.aspectRatio, resolution: p.resolution, delivery: 'uri' },
    generation_config: { video_config: { task: p.image ? 'image_to_video' : 'text_to_video' } },
  };
}

// Veo 3.1 renders 720p or 1080p only.
export function buildVeoRequest(p: { prompt: string; aspectRatio: '9:16' | '16:9'; durationSeconds: number; resolution: VideoResolution; image?: VideoImageInput }): object {
  const resolution = p.resolution === '1080p' || p.resolution === '4k' ? '1080p' : '720p';
  return {
    instances: [{ prompt: p.prompt, ...(p.image ? { image: { bytesBase64Encoded: p.image.data.toString('base64'), mimeType: p.image.mimeType } } : {}) }],
    parameters: { sampleCount: 1, aspectRatio: p.aspectRatio, durationSeconds: p.durationSeconds, resolution },
  };
}

const GOOGLE_AI_HOST = new URL(GOOGLE_AI_BASE).hostname;
const TIME_UP = 'Video generation did not finish in time.';
const timeUp = () => new Error(TIME_UP);
const OMNI_FILE_POLLS = 30;
const VEO_OPERATION_POLLS = 40;
const DEFAULT_RENDER_DEADLINE_MS = 230_000;

/** Overall budget for one AI render (VIDEO_RENDER_DEADLINE_MS), so a slow render ends before the job is picked up again. */
export function renderDeadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const ms = Math.floor(Number(env['VIDEO_RENDER_DEADLINE_MS'] || DEFAULT_RENDER_DEADLINE_MS));
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_RENDER_DEADLINE_MS;
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw timeUp();
  if (ms <= 0) return;
  try {
    await sleep(ms, undefined, { signal });
  } catch {
    throw timeUp();
  }
}

// A request cut off by the deadline reports "did not finish in time"; other errors (a 429 included) pass through untouched.
async function beforeDeadline<T>(signal: AbortSignal, call: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw timeUp();
  try {
    return await call();
  } catch (err) {
    if (signal.aborted) throw timeUp();
    throw err;
  }
}

/**
 * The file id in a Files API URI: a full URL on the Gemini API host, `/v1beta/files/{id}`,
 * `files/{id}`, with or without `:download?alt=media`. Throws for any other host.
 */
export function googleFileId(uri: string): string {
  let pathPart = uri.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathPart)) {
    let parsed: URL;
    try {
      parsed = new URL(pathPart);
    } catch {
      throw new Error('The video model returned an unexpected file URI.');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== GOOGLE_AI_HOST) {
      throw new Error('The video model returned a file on an unexpected host.');
    }
    pathPart = parsed.pathname;
  }
  const fileId = /(?:^|\/)files\/([A-Za-z0-9_-]+)/.exec(pathPart.split(/[?#]/)[0] ?? '')?.[1];
  if (!fileId) throw new Error('The video model returned an unexpected file URI.');
  return fileId;
}

/**
 * Redirect hook for the download: HTTPS only, and the API key header is dropped whenever the next
 * hop is not the Gemini API host (follow-redirects only drops Authorization and Cookie itself).
 */
export function keepKeyOnGoogleHost(options: { protocol?: string | null; hostname?: string | null; headers?: Record<string, unknown> }): void {
  if (options.protocol !== 'https:') throw new Error('Refused a non-HTTPS redirect for the video download.');
  if (options.hostname === GOOGLE_AI_HOST || !options.headers) return;
  for (const name of Object.keys(options.headers)) {
    if (name.toLowerCase() === 'x-goog-api-key') delete options.headers[name];
  }
}

// Always built from the file id on the Gemini API host, so the key never goes anywhere else.
async function downloadGoogleFile(apiKey: string, fileId: string, signal: AbortSignal): Promise<Buffer> {
  console.log('[Video] Downloading generated video');
  const res = await beforeDeadline(signal, () => axios.get(`${GOOGLE_AI_BASE}/files/${encodeURIComponent(fileId)}:download?alt=media`, {
    headers: { 'x-goog-api-key': apiKey },
    responseType: 'arraybuffer',
    timeout: 60_000,
    signal,
    maxRedirects: 5,
    beforeRedirect: keepKeyOnGoogleHost,
  }));
  return Buffer.from(res.data);
}

export interface VideoFetchOptions {
  apiKey: string;
  /** Request body from buildOmniRequest / buildVeoRequest. */
  request: object;
  /** Overall render deadline; aborts in-flight calls and stops polling. */
  signal: AbortSignal;
  pollIntervalMs?: number;
}

// { output_video: { uri } }, or a { type: 'video', uri } item in a model_output step.
function omniVideoUri(data: any): string | undefined {
  if (typeof data?.output_video?.uri === 'string') return data.output_video.uri;
  for (const step of data?.steps ?? []) {
    if (step?.type !== 'model_output') continue;
    const videoPart = (step.content ?? []).find((c: any) => c?.type === 'video' && typeof c?.uri === 'string');
    if (videoPart) return videoPart.uri;
  }
  return undefined;
}

/**
 * Gemini Omni: POST /interactions (text- or image-to-video), poll the Files API until the file is
 * ACTIVE, then download it. A 429 fails at once (the job becomes VEO_QUOTA_EXCEEDED and the web
 * offers a quick render) rather than waiting inside the request.
 */
export async function fetchOmniVideo({ apiKey, request, signal, pollIntervalMs = 3000 }: VideoFetchOptions): Promise<Buffer> {
  // Note: Omni's duration is model-controlled (3-10s), not settable via the request.
  const res = await beforeDeadline(signal, () => axios.post(`${GOOGLE_AI_BASE}/interactions`, request, {
    headers: googleAiHeaders(apiKey),
    timeout: 120_000, // Omni can be slow — 2 min timeout
    signal,
  }));
  const uri = omniVideoUri(res.data);
  if (!uri) throw new Error('Gemini Omni did not return a video file URI.');
  const fileId = googleFileId(uri);

  let state: unknown;
  for (let i = 0; i < OMNI_FILE_POLLS && state !== 'ACTIVE'; i++) {
    if (i > 0) await pause(pollIntervalMs, signal);
    else if (signal.aborted) throw timeUp();
    try {
      const fileRes = await axios.get(`${GOOGLE_AI_BASE}/files/${encodeURIComponent(fileId)}`, { headers: googleAiHeaders(apiKey), timeout: 15_000, signal });
      state = fileRes.data?.state;
    } catch (err) {
      if (signal.aborted) throw timeUp();
      console.warn(`[Gemini Omni] File poll attempt ${i + 1} warning: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (state === 'FAILED') throw new Error('Gemini Omni file processing failed.');
  }
  if (state !== 'ACTIVE') throw timeUp();

  console.log('[Gemini Omni] Video file ready');
  return downloadGoogleFile(apiKey, fileId, signal);
}

/** Veo: predictLongRunning, poll the operation until done, then download the sample. A 429 fails at once. */
export async function fetchVeoVideo({ apiKey, model, request, signal, pollIntervalMs = 3000 }: VideoFetchOptions & { model: string }): Promise<Buffer> {
  const res = await beforeDeadline(signal, () => axios.post(`${GOOGLE_AI_BASE}/models/${encodeURIComponent(model)}:predictLongRunning`, request, {
    headers: googleAiHeaders(apiKey),
    timeout: 30_000,
    signal,
  }));
  const operationName = res.data?.name;
  if (typeof operationName !== 'string' || !operationName) {
    throw new Error('Failed to initiate Veo video generation.');
  }

  console.log('[Veo] Operation started. Polling for completion...');
  const pollUrl = `${GOOGLE_AI_BASE}/${operationName}`;
  for (let i = 0; i < VEO_OPERATION_POLLS; i++) {
    await pause(pollIntervalMs, signal);
    let opData: any;
    try {
      opData = (await axios.get(pollUrl, { headers: googleAiHeaders(apiKey), timeout: 15_000, signal })).data;
    } catch (err) {
      if (signal.aborted) throw timeUp();
      console.warn(`[Veo] Poll attempt ${i + 1} warning: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (opData?.error) throw new Error(`Veo generation error: ${opData.error.message || 'unknown error'}`);
    if (opData?.done) {
      console.log(`[Veo] Clean video synthesis complete after ${i + 1} polls`);
      const uri = opData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (typeof uri !== 'string' || !uri) throw new Error('Veo did not return a video file URI.');
      return downloadGoogleFile(apiKey, googleFileId(uri), signal);
    }
    if (i % 3 === 0) console.log(`[Veo] Still synthesizing (poll ${i + 1})...`);
  }
  throw timeUp();
}

/**
 * Generates an automotive video reel using the chosen video model (Gemini Omni 1.1 Flash by
 * default, or Veo 3.1):
 * 1. Generates 100% clean, unbranded footage with strict negative text directives.
 * 2. Generates structured timed overlay beats using Gemini.
 * 3. Fits the video to 1080×1920 (or 1920×1080) and composites crisp text overlays via FFmpeg,
 *    timed to the clip's real length.
 * 4. Returns both cleanVideoUrl (as the model returned it) and videoUrl (the reel).
 */
export async function generateGeminiVideo(params: GenerateVideoParams): Promise<VideoGenerationResult> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Save one in Admin → APIs & models or set GEMINI_API_KEY on the server.');
  }
  // One budget for the whole render: model calls, polling and the download.
  const deadline = AbortSignal.timeout(renderDeadlineMs());

  const models = await resolveAiModels();
  const model = models.video;
  const aspectRatio = params.aspect_ratio || '9:16';
  const isGeminiOmni = model.startsWith('gemini-omni');

  // Duration clamping: Gemini Omni supports 3-10s, Veo requires 4-8s integers
  let durationSeconds = Number(params.duration_seconds) || 6;
  if (isGeminiOmni) {
    if (durationSeconds < 3) durationSeconds = 3;
    if (durationSeconds > 10) durationSeconds = 10;
    durationSeconds = Math.round(durationSeconds);
  } else {
    if (durationSeconds < 4) durationSeconds = 4;
    if (durationSeconds > 8) durationSeconds = 8;
    durationSeconds = Math.round(durationSeconds);
  }

  // 1. ONE batched Gemini Flash call: scene description + overlays + caption/headline/hashtags
  // (Replaces 3 separate Gemini calls with 1 — cuts quota usage by ~66%)
  const batchResult = await batchVideoCreativeData({
    rawPrompt: params.prompt,
    ...(params.brand !== undefined && { brand: params.brand }),
    ...(params.model_name !== undefined && { model_name: params.model_name }),
    ...(params.dealerName !== undefined && { dealerName: params.dealerName }),
    ...(params.city !== undefined && { city: params.city }),
    duration: durationSeconds,
    apiKey,
    ...(params.language !== undefined && { language: params.language }),
  });
  const { visualScene, overlays: precomputedOverlays, headline, caption: reelCaption, hashtags, audioSuggestion } = batchResult;
  const motionStyle = MOTION_DESCRIPTIONS[params.camera_motion || 'tracking'] || MOTION_DESCRIPTIONS['tracking']!;

  // Reconstruct the vehicle mention for the video prompt
  const vehicleMention = params.model_name
    ? `A pristine, immaculate ${params.brand ? `${params.brand} ` : ''}${params.model_name} car with no exterior text, no numbers, no logo badges, and clean unmarked bodywork`
    : 'A pristine, immaculate modern automobile with clean unmarked bodywork and zero text';

  // Strict negative prompting: keeps the real car (when a photo is supplied) or describes a clean, unbranded one.
  const cleanCinematicPrompt = videoPrompt({ hasImage: !!params.image, vehicleMention, motionStyle, visualScene });

  console.log(`[Video] Requesting ${model} (${isGeminiOmni ? 'Gemini Omni' : 'Veo'})${params.image ? ' from the dealer’s photo' : ''}, duration: ${durationSeconds}s, aspect: ${aspectRatio}`);

  const image = params.image ? { image: params.image } : {};
  const cleanBuffer = isGeminiOmni
    ? await fetchOmniVideo({
      apiKey, signal: deadline,
      request: buildOmniRequest({ model, prompt: cleanCinematicPrompt, aspectRatio, resolution: models.videoResolution, ...image }),
    })
    : await fetchVeoVideo({
      apiKey, model, signal: deadline,
      request: buildVeoRequest({ prompt: cleanCinematicPrompt, aspectRatio, durationSeconds, resolution: models.videoResolution, ...image }),
    });

  // ── Common: fit to the reel frame → FFmpeg composite → upload ──
  await mkdir(REELS_DIR, { recursive: true });

  const reelId = randomUUID();
  const cleanFilename = `reel-${reelId}-clean.mp4`;
  const cleanLocalPath = path.join(REELS_DIR, cleanFilename);
  await writeFile(cleanLocalPath, cleanBuffer);

  const cleanVideoUrl = await uploadFile(cleanBuffer, `reels/${cleanFilename}`, 'video/mp4', REELS_DIR);

  // 2. Use the overlays already computed by the batched Gemini call above (no extra API call!),
  // stretched onto the clip's real length (Omni picks its own).
  const plannedOverlays = (params.overlays && params.overlays.length > 0)
    ? params.overlays
    : precomputedOverlays;
  const actualSeconds = await probeDurationSeconds(cleanLocalPath);
  const overlays = actualSeconds ? retimeOverlays(plannedOverlays, durationSeconds, actualSeconds) : plannedOverlays;

  // 3. Composite overlays with FFmpeg at exactly 1080×1920 / 1920×1080; without drawtext or a
  // font, still resize so every reel has the same frame.
  const frame = reelDimensions(aspectRatio);
  const finalFilename = `reel-${reelId}.mp4`;
  const finalLocalPath = path.join(REELS_DIR, finalFilename);

  let finalVideoUrl = cleanVideoUrl;
  const ready = (await compositeVideoOverlays(cleanLocalPath, finalLocalPath, overlays, frame))
    || (await normalizeVideo(cleanLocalPath, finalLocalPath, frame));
  if (ready && fs.existsSync(finalLocalPath)) {
    const finalBuffer = await fs.promises.readFile(finalLocalPath);
    finalVideoUrl = await uploadFile(finalBuffer, `reels/${finalFilename}`, 'video/mp4', REELS_DIR);
  }

  return {
    videoUrl: finalVideoUrl,
    cleanVideoUrl,
    thumbnailUrl: '',
    duration: actualSeconds ?? durationSeconds,
    aspectRatio,
    promptUsed: cleanCinematicPrompt,
    overlays,
    headline,
    caption: reelCaption,
    hashtags,
    audioSuggestion,
  };
}

/**
 * Generates viral reel caption, hashtags, and sound recommendation using Gemini.
 */
export async function generateReelCaptionAndMetadata(params: {
  prompt: string;
  brand?: string | undefined;
  model_name?: string | undefined;
  dealerName?: string | undefined;
  city?: string | undefined;
  language?: string | undefined;
}): Promise<ReelMetadataResult> {
  const apiKey = await getGeminiApiKey();

  const dealer = params.dealerName || 'Authorized Dealership';
  const city = params.city || 'your city';
  const car = params.model_name ? `${params.brand ? `${params.brand} ` : ''}${params.model_name}` : 'your dream car';

  if (!apiKey) {
    return {
      headline: `Experience the All-New ${car}`,
      caption: `Drivin' into luxury! 🔥 Book your test drive for the stunning ${car} at ${dealer} today! Limited festive benefits available. Visit our showroom or DM us now.`,
      hashtags: ['#CarReels', '#Automotive', '#DriveInStyle', '#NewCar', '#CarLover', '#ReelsInstagram', '#CarOfTheDay'],
      audioSuggestion: 'Trending Phonk Beat · Speed & Luxury',
    };
  }

  const textModel = (await resolveAiModels()).text;

  const systemPrompt = `You are a viral social media manager for top Indian car dealerships creating high-engagement Instagram Reels and Facebook Reels.
Generate a reel headline, an engaging caption in ${captionLanguage(params.language ?? 'en')} with a clear hook and call-to-action, viral hashtags, and a trending audio track vibe.
Return strictly valid JSON matching this schema:
{
  "headline": "Short impactful 4-6 word headline for reel cover",
  "caption": "Punchy 2-3 line caption in ${captionLanguage(params.language ?? 'en')} with emojis, hook, and booking CTA",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5", "#Tag6"],
  "audioSuggestion": "Short name of trending vibe (e.g. 'Trending High-Octane Phonk', 'Luxury Ambient Chill')"
}`;

  const userContent = `Car: ${car}\nDealership: ${dealer}, ${city}\nPromotion / Concept: ${params.prompt}`;

  try {
    const url = generateContentUrl(textModel);
    const res = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n${userContent}` }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      },
      { headers: googleAiHeaders(apiKey), timeout: 20000 }
    );

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      return {
        headline: parsed.headline || `The All-New ${car}`,
        caption: parsed.caption || `Unleash the beast! Book the new ${car} at ${dealer}.`,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#CarReels', '#Trending', '#NewCar'],
        audioSuggestion: parsed.audioSuggestion || 'Trending Phonk Beat · Speed & Luxury',
      };
    }
  } catch (err: any) {
    console.warn(`[Veo] Caption generation error (fallback applied): ${err.message}`);
  }

  return {
    headline: `Experience the All-New ${car}`,
    caption: `Drivin' into luxury! 🔥 Book your test drive for the stunning ${car} at ${dealer} today! Limited festive benefits available. Visit our showroom or DM us now.`,
    hashtags: ['#CarReels', '#Automotive', '#DriveInStyle', '#NewCar', '#CarLover', '#ReelsInstagram', '#CarOfTheDay'],
    audioSuggestion: 'Trending Phonk Beat · Speed & Luxury',
  };
}
