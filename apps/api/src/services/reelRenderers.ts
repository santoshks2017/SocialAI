import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import { generateGeminiImage } from './geminiImage.js';
import { compositeVideoOverlays, generateGeminiVideo, generateReelCaptionAndMetadata, REELS_DIR, type VideoImageInput, type VideoOverlayBeat } from './geminiVideo.js';
import { extractThumbnail, reelDimensions, renderKenBurns } from './kenBurns.js';
import { uploadFile } from '../lib/storage.js';
import { loadImageFromUrl } from '../lib/uploadPaths.js';
import { hasGeminiKey } from '../lib/aiKeys.js';
import type { RenderedReel } from '../lib/videoJobs.js';

export interface ReelRenderInput {
  prompt: string;
  imageUrl: string | null;
  aspectRatio: string;
  durationSeconds: number;
  language: string;
  dealerName: string;
  city: string;
}

export class ReelRenderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReelRenderError';
  }
}

const NOT_CONFIGURED = 'Video generation isn’t configured on the server.';
const SHOTS = ['front three-quarter view', 'side profile view', 'close-up of the front grille and headlights'];

// Three AI scenes around the car (the attached photo, if any, is the reference).
async function sceneImages(input: ReelRenderInput): Promise<Buffer[]> {
  const car = input.imageUrl ? (await loadImageFromUrl(input.imageUrl, { timeoutMs: 20_000 })).buffer : undefined;
  if (!(await hasGeminiKey())) {
    if (car) return [car];
    throw new ReelRenderError('GEMINI_NOT_CONFIGURED', NOT_CONFIGURED);
  }
  const settled = await Promise.allSettled(SHOTS.map((shot) => generateGeminiImage(
    `${input.prompt}. Cinematic automotive advertising photograph, ${shot}, vertical composition. No text, no logos, no watermarks.`,
    car,
  )));
  const images = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (images.length > 0) return images;
  if (car) return [car];
  throw new ReelRenderError('IMAGE_GENERATION_FAILED', 'Could not create the scenes for this reel.');
}

// On-screen text beats. English only: the render fonts cover Latin and Devanagari, not every script.
export function kenBurnsOverlays(headline: string, dealerName: string, duration: number, language: string): VideoOverlayBeat[] {
  const title = language === 'en' && headline.trim() ? headline.toUpperCase() : 'NEW OFFER';
  return [
    { id: 'beat-1', startTime: 0, endTime: Number((duration * 0.4).toFixed(1)), badge: 'NOW AVAILABLE', title, position: 'bottom', theme: 'amber-glow' },
    { id: 'beat-2', startTime: Number((duration * 0.65).toFixed(1)), endTime: duration, badge: 'EXCLUSIVE AT', title: dealerName.toUpperCase(), subtitle: 'Book a test drive today', cta: 'Book Now', position: 'bottom', theme: 'minimal-white' },
  ];
}

export async function renderKenBurnsReel(input: ReelRenderInput): Promise<RenderedReel> {
  const images = await sceneImages(input);
  const meta = await generateReelCaptionAndMetadata({ prompt: input.prompt, dealerName: input.dealerName, city: input.city, language: input.language });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reel-'));
  try {
    const imagePaths = await Promise.all(images.map(async (buffer, i) => {
      const file = path.join(dir, `scene-${i}.jpg`);
      await writeFile(file, buffer);
      return file;
    }));
    const { width, height } = reelDimensions(input.aspectRatio);
    const clean = path.join(dir, 'clean.mp4');
    await renderKenBurns({ imagePaths, outputPath: clean, width, height, durationSeconds: input.durationSeconds });

    const final = path.join(dir, 'final.mp4');
    const overlays = kenBurnsOverlays(meta.headline, input.dealerName, input.durationSeconds, input.language);
    const withText = await compositeVideoOverlays(clean, final, overlays, { width, height });
    const videoPath = withText ? final : clean;
    const thumbPath = path.join(dir, 'thumb.jpg');
    await extractThumbnail(videoPath, thumbPath);

    await mkdir(REELS_DIR, { recursive: true });
    const id = randomUUID();
    const [videoUrl, thumbnailUrl] = await Promise.all([
      readFile(videoPath).then((buf) => uploadFile(buf, `reels/reel-${id}.mp4`, 'video/mp4', REELS_DIR)),
      readFile(thumbPath).then((buf) => uploadFile(buf, `reels/reel-${id}.jpg`, 'image/jpeg', REELS_DIR)),
    ]);
    return { videoUrl, thumbnailUrl, caption: meta.caption, hashtags: meta.hashtags };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function veoError(err: unknown): ReelRenderError {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 403 || /permission|access denied/i.test(message)) {
    return new ReelRenderError('VEO_ACCESS_DENIED', 'Your Google project doesn’t have access to the selected video model yet.');
  }
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return new ReelRenderError('VEO_QUOTA_EXCEEDED', 'Video generation quota reached. Try again later.');
  }
  return new ReelRenderError('VEO_GENERATION_FAILED', 'AI video generation failed.');
}

/**
 * The dealer's photo as the video model's reference: upright (EXIF orientation applied), transparent
 * areas on white, at most 1280 px, JPEG. Null (message logged) when it can't be decoded — e.g. a HEIC
 * this sharp build can't read — so the reel carries on as text-to-video.
 */
export async function prepareReferenceImage(buffer: Buffer): Promise<VideoImageInput | null> {
  try {
    const data = await sharp(buffer)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data, mimeType: 'image/jpeg' };
  } catch (err) {
    console.warn(`[reels] Could not decode the reference photo; continuing without it: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Loads and prepares the attached photo; undefined when it can't be read, so the reel still renders. */
export async function referenceImage(imageUrl: string): Promise<VideoImageInput | undefined> {
  let buffer: Buffer;
  try {
    ({ buffer } = await loadImageFromUrl(imageUrl, { timeoutMs: 20_000 }));
  } catch (err) {
    console.warn(`[reels] Could not load the reference photo; continuing without it: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
  return (await prepareReferenceImage(buffer)) ?? undefined;
}

export async function renderVeoReel(input: ReelRenderInput): Promise<RenderedReel> {
  if (!(await hasGeminiKey())) throw new ReelRenderError('GEMINI_NOT_CONFIGURED', NOT_CONFIGURED);
  const image = input.imageUrl ? await referenceImage(input.imageUrl) : undefined;
  try {
    const result = await generateGeminiVideo({
      prompt: input.prompt, duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio === '16:9' ? '16:9' : '9:16',
      dealerName: input.dealerName, city: input.city, language: input.language,
      ...(image ? { image } : {}),
    });
    return { videoUrl: result.videoUrl, thumbnailUrl: result.thumbnailUrl || null, caption: result.caption ?? '', hashtags: result.hashtags ?? [] };
  } catch (err) {
    throw veoError(err);
  }
}
