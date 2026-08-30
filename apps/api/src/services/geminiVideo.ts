import axios from 'axios';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { uploadFile } from '../lib/storage.js';
import { UPLOADS_ROOT } from '../routes/upload.js';

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
}): Promise<{
  visualScene: string;
  overlays: VideoOverlayBeat[];
  headline: string;
  caption: string;
  hashtags: string[];
  audioSuggestion: string;
}> {
  const { rawPrompt, brand, model_name, dealerName, duration, apiKey } = params;
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

  const textModel = process.env['GEMINI_TEXT_MODEL'] || 'gemini-2.5-flash';
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
  "caption": "<Punchy 2-3 line Hinglish caption with emojis, hook, and booking CTA>",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5", "#Tag6"],
  "audioSuggestion": "<Short name of trending audio vibe e.g. 'Trending High-Octane Phonk'>"
}

Rules:
- scene: pure visual description only, no brand names, no text mentions, no prices
- overlays: extract the real offer/price from the prompt for beat-2 title/subtitle
- All overlay times must sum correctly to ${duration}s total
- Return valid JSON only, no surrounding text`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${apiKey}`;
    const res = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: batchPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      { timeout: 15000 }
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
  const apiKey = process.env['GEMINI_API_KEY'] || '';
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
 * Composites high-contrast, crisp typography overlays onto video frames using FFmpeg.
 */
export async function compositeVideoOverlays(
  inputVideoPath: string,
  outputVideoPath: string,
  overlays: VideoOverlayBeat[],
  aspectRatio: string = '9:16'
): Promise<boolean> {
  const font = getAvailableFontPath();
  if (!font) {
    console.warn('[Veo Compositor] No system font found for FFmpeg drawtext. Skipping burn-in.');
    return false;
  }

  const isWide = aspectRatio === '16:9';
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

    const badgeSize = isWide ? 18 : 22;
    const titleSize = isWide ? 28 : 34;
    const subSize = isWide ? 17 : 20;

    if (b.badge) {
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeFfmpegText(b.badge)}':fontcolor=white:fontsize=${badgeSize}:box=1:boxcolor=${badgeBg}:boxborderw=7:x=(w-text_w)/2:y=${badgeY}:enable='between(t,${s},${e})'`
      );
    }
    if (b.title) {
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeFfmpegText(b.title)}':fontcolor=white:fontsize=${titleSize}:box=1:boxcolor=black@0.75:boxborderw=10:x=(w-text_w)/2:y=${titleY}:enable='between(t,${s},${e})'`
      );
    }
    if (b.subtitle) {
      filters.push(
        `drawtext=fontfile='${font}':text='${escapeFfmpegText(b.subtitle)}':fontcolor=white@0.95:fontsize=${subSize}:box=1:boxcolor=black@0.65:boxborderw=6:x=(w-text_w)/2:y=${subY}:enable='between(t,${s},${e})'`
      );
    }
  }

  if (filters.length === 0) return false;

  try {
    const filterGraph = filters.join(',');
    console.log(`[Veo Compositor] Executing FFmpeg drawtext overlay on ${inputVideoPath}...`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputVideoPath,
      '-vf', filterGraph,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-c:a', 'copy',
      outputVideoPath
    ]);
    console.log(`[Veo Compositor] Successfully composited overlays to ${outputVideoPath}`);
    return true;
  } catch (err: any) {
    console.error(`[Veo Compositor] FFmpeg compositing error: ${err.message}`);
    return false;
  }
}

/**
 * Generates an automotive video reel using Google AI Studio Veo 3.1:
 * 1. Generates 100% clean, unbranded footage with strict negative text directives.
 * 2. Generates structured timed overlay beats using Gemini.
 * 3. Composites crisp text overlays onto the video stream via FFmpeg.
 * 4. Returns both cleanVideoUrl and videoUrl (with overlays).
 */
export async function generateGeminiVideo(params: GenerateVideoParams): Promise<VideoGenerationResult> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }

  const model = process.env['GEMINI_VIDEO_MODEL'] || 'gemini-omni-1.1-flash';
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
  });
  const { visualScene, overlays: precomputedOverlays, headline, caption: reelCaption, hashtags, audioSuggestion } = batchResult;
  const motionStyle = MOTION_DESCRIPTIONS[params.camera_motion || 'tracking'] || MOTION_DESCRIPTIONS['tracking']!;

  // Reconstruct the vehicle mention for the video prompt
  const vehicleMention = params.model_name
    ? `A pristine, immaculate ${params.brand ? `${params.brand} ` : ''}${params.model_name} car with no exterior text, no numbers, no logo badges, and clean unmarked bodywork`
    : 'A pristine, immaculate modern automobile with clean unmarked bodywork and zero text';

  // Strict negative prompting: Absolutely no typography, words, or distorted AI text
  const cleanCinematicPrompt = `${vehicleMention}. ${motionStyle}. Setting: ${visualScene}. 4k resolution, hyper-realistic, photorealistic, professional automotive commercial grade, cinematic lighting, 60fps smooth fluid motion, physically accurate wheel rotation and ground reflections. Absolutely no text, no words, no letters, no numbers, no typography, no watermarks, no logos, no subtitles, no graphic banners, no distorted badges, pristine clean video footage only.`;

  console.log(`[Video] Requesting generation with model: ${model} (${isGeminiOmni ? 'Gemini Omni' : 'Veo'}), duration: ${durationSeconds}s, aspect: ${aspectRatio}`);
  console.log(`[Video] Sanitized Visual Prompt: "${cleanCinematicPrompt}"`);

  let videoUri: string | null = null;

  if (isGeminiOmni) {
    // ── Gemini Omni path: POST /v1beta/interactions (text_to_video), then poll Files API ──
    // Note: Omni's duration is model-controlled (3-10s), not settable via the request.
    const resolution = process.env['GEMINI_OMNI_RESOLUTION'] || '720p';
    const interactionsUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
    const omniPayload = {
      model,
      input: cleanCinematicPrompt,
      response_format: {
        type: 'video',
        aspect_ratio: aspectRatio,
        resolution,
        delivery: 'uri',
      },
      generation_config: {
        video_config: { task: 'text_to_video' },
      },
    };

    let omniResponse: any;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        omniResponse = await axios.post(interactionsUrl, omniPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000, // Omni can be slow — 2 min timeout
        });
        break;
      } catch (err: any) {
        if (isRateLimitError(err) && attempt < maxRetries) {
          const waitSecs = 30 * (attempt + 1);
          console.warn(`[Gemini Omni] Rate limited (429) on attempt ${attempt + 1}. Retrying in ${waitSecs}s...`);
          await new Promise((r) => setTimeout(r, waitSecs * 1000));
        } else if (isRateLimitError(err)) {
          throw new Error(
            'Google Gemini Omni API rate limit reached (HTTP 429). Please wait 1–2 minutes and try again.'
          );
        } else {
          throw err;
        }
      }
    }

    // Extract the video file URI: either top-level output_video.uri, or a
    // { type: 'video', uri } item inside a model_output step's content array.
    const omniData = omniResponse?.data;
    let rawVideoUri: string | undefined = omniData?.output_video?.uri;
    if (!rawVideoUri) {
      for (const step of omniData?.steps ?? []) {
        if (step?.type !== 'model_output') continue;
        const videoPart = (step.content ?? []).find((c: any) => c?.type === 'video' && c?.uri);
        if (videoPart) {
          rawVideoUri = videoPart.uri;
          break;
        }
      }
    }

    if (!rawVideoUri) {
      throw new Error(`Gemini Omni did not return a video file URI. Response: ${JSON.stringify(omniData).slice(0, 400)}`);
    }

    // The file may still be processing — poll the Files API until ACTIVE.
    const fileId = rawVideoUri.match(/\/files\/([^/:?]+)/)?.[1];
    if (fileId) {
      const filePollUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`;
      const maxFilePolls = 30;
      for (let i = 0; i < maxFilePolls; i++) {
        try {
          const fileRes = await axios.get(filePollUrl, { timeout: 15000 });
          const state = fileRes.data?.state;
          if (state === 'ACTIVE') break;
          if (state === 'FAILED') {
            throw new Error(`Gemini Omni file processing failed: ${JSON.stringify(fileRes.data?.error ?? fileRes.data)}`);
          }
        } catch (err: any) {
          if (err.message?.startsWith('Gemini Omni file processing failed:')) throw err;
          console.warn(`[Gemini Omni] File poll attempt ${i + 1} warning: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    videoUri = rawVideoUri.includes('?') ? `${rawVideoUri}&alt=media` : `${rawVideoUri}?alt=media`;
    console.log(`[Gemini Omni] ✅ Video file ready: ${videoUri}`);

  } else {
    // ── Veo path: predictLongRunning + polling ──
    const veoUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${apiKey}`;
    const payload = {
      instances: [{ prompt: cleanCinematicPrompt }],
      parameters: { sampleCount: 1, aspectRatio, durationSeconds },
    };

    let initialResponse: any;
    const maxInitialRetries = 2;
    for (let attempt = 0; attempt <= maxInitialRetries; attempt++) {
      try {
        initialResponse = await axios.post(veoUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        });
        break;
      } catch (err: any) {
        if (isRateLimitError(err) && attempt < maxInitialRetries) {
          const waitSecs = 30 * (attempt + 1);
          console.warn(`[Veo] Rate limited (429) on attempt ${attempt + 1}. Retrying in ${waitSecs}s...`);
          await new Promise((r) => setTimeout(r, waitSecs * 1000));
        } else if (isRateLimitError(err)) {
          throw new Error(
            'Google Veo API rate limit reached (HTTP 429). The Veo video generation model has a limited number of requests per minute. Please wait 1–2 minutes and try again.'
          );
        } else {
          throw err;
        }
      }
    }

    const operationName = initialResponse?.data?.name;
    if (!operationName) {
      throw new Error(`Failed to initiate Veo video generation: ${JSON.stringify(initialResponse?.data)}`);
    }

    console.log(`[Veo] Operation started: ${operationName}. Polling for completion...`);
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
    const maxPolls = 40;
    const pollIntervalMs = 3000;

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      try {
        const pollRes = await axios.get(pollUrl, { timeout: 15000 });
        const opData = pollRes.data;
        if (opData.error) throw new Error(`Veo generation error: ${opData.error.message || JSON.stringify(opData.error)}`);
        if (opData.done) {
          console.log(`[Veo] Clean video synthesis complete after ${((i + 1) * pollIntervalMs) / 1000}s`);
          const samples = opData.response?.generateVideoResponse?.generatedSamples;
          if (samples && samples.length > 0 && samples[0].video?.uri) {
            videoUri = samples[0].video.uri;
          }
          break;
        }
        if (i % 3 === 0) console.log(`[Veo] Still synthesizing (${((i + 1) * pollIntervalMs) / 1000}s elapsed)...`);
      } catch (err: any) {
        if (err.message?.startsWith('Veo generation error:')) throw err;
        console.warn(`[Veo] Poll attempt ${i + 1} warning: ${err.message}`);
      }
    }

    if (!videoUri) throw new Error('Timed out waiting for Veo video generation to finish.');
  }

  // ── Common: download video → FFmpeg composite → upload ──
  console.log(`[Video] Downloading clean MP4 from URI: ${videoUri}`);
  const downloadUrl = videoUri.includes('?') ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`;
  const downloadResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });

  const cleanBuffer = Buffer.from(downloadResponse.data);
  await mkdir(REELS_DIR, { recursive: true });

  const reelId = randomUUID();
  const cleanFilename = `reel-${reelId}-clean.mp4`;
  const cleanLocalPath = path.join(REELS_DIR, cleanFilename);
  await writeFile(cleanLocalPath, cleanBuffer);

  const cleanVideoUrl = await uploadFile(cleanBuffer, `reels/${cleanFilename}`, 'video/mp4', REELS_DIR);

  // 2. Use the overlays already computed by the batched Gemini call above (no extra API call!)
  const overlays = (params.overlays && params.overlays.length > 0)
    ? params.overlays
    : precomputedOverlays;

  // 3. Composite overlays with FFmpeg
  const overlaidFilename = `reel-${reelId}-overlaid.mp4`;
  const overlaidLocalPath = path.join(REELS_DIR, overlaidFilename);

  let finalVideoUrl = cleanVideoUrl;
  const composited = await compositeVideoOverlays(cleanLocalPath, overlaidLocalPath, overlays, aspectRatio);
  if (composited && fs.existsSync(overlaidLocalPath)) {
    const overlaidBuffer = await fs.promises.readFile(overlaidLocalPath);
    finalVideoUrl = await uploadFile(overlaidBuffer, `reels/${overlaidFilename}`, 'video/mp4', REELS_DIR);
  }

  return {
    videoUrl: finalVideoUrl,
    cleanVideoUrl,
    thumbnailUrl: '',
    duration: durationSeconds,
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
}): Promise<ReelMetadataResult> {
  const apiKey = process.env['GEMINI_API_KEY'];
  const textModel = process.env['GEMINI_TEXT_MODEL'] || 'gemini-2.5-flash';

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

  const systemPrompt = `You are a viral social media manager for top Indian car dealerships creating high-engagement Instagram Reels and Facebook Reels.
Generate a reel headline, engaging Hinglish caption with clear hook and call-to-action, viral hashtags, and a trending audio track vibe.
Return strictly valid JSON matching this schema:
{
  "headline": "Short impactful 4-6 word headline for reel cover",
  "caption": "Punchy 2-3 line Hinglish caption with emojis, hook, and booking CTA",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5", "#Tag6"],
  "audioSuggestion": "Short name of trending vibe (e.g. 'Trending High-Octane Phonk', 'Luxury Ambient Chill')"
}`;

  const userContent = `Car: ${car}\nDealership: ${dealer}, ${city}\nPromotion / Concept: ${params.prompt}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${apiKey}`;
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
      { timeout: 20000 }
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
