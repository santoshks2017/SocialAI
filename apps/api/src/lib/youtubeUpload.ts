import axios from 'axios';
import { isMockId } from './platformMock.js';
import { safeFetchBuffer } from './safeUrl.js';
import { NO_YOUTUBE_CHANNEL, bearer } from '../services/youtube.js';

// A reel goes to YouTube as a Short through the Data API's resumable upload: start a session, then PUT the bytes.
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const INIT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const VIDEO_MAX_BYTES = 256 * 1024 * 1024;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;
const TAGS_MAX = 500;
const AUTOS_AND_VEHICLES = '2';

export const SHORTS_TAG = '#Shorts';
export const YOUTUBE_LIMIT_MESSAGE = "YouTube's daily upload limit was reached. Try again tomorrow.";
export const YOUTUBE_EXPIRED_MESSAGE = 'YouTube access expired. Reconnect YouTube on Accounts.';
export const YOUTUBE_UNCONFIRMED_MESSAGE = 'YouTube didn\u2019t confirm the upload. Check the channel before publishing again.';
const LIMIT_REASONS = new Set(['quotaExceeded', 'uploadLimitExceeded', 'dailyLimitExceeded']);

const stripAngles = (text: string) => text.replace(/[<>]/g, '');

// Unicode-code-point-aware length/truncation: `.length`/`.slice()` count UTF-16 code
// units, which can split an astral-plane character (most emoji) in half, leaving a
// lone surrogate that corrupts to U+FFFD once the title/description is UTF-8 encoded
// for the HTTP body. Iterating the string (`for...of` / `Array.from`) walks whole
// code points instead, so a cut never lands inside a surrogate pair.
const charLength = (text: string): number => Array.from(text).length;
const truncateChars = (text: string, max: number): string => Array.from(text).slice(0, max).join('');

/** The caption's first line without hashtags or angle brackets, cut so that "{title} #Shorts" fits in 100. */
export function shortsTitle(caption: string, dealerName: string): string {
  const clean = (text: string) => stripAngles(text.replace(/#[^\s#]+/g, ' ')).replace(/\s+/g, ' ').trim();
  const firstLine = caption.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const base = clean(firstLine) || clean(dealerName) || 'New video';
  const room = TITLE_MAX - SHORTS_TAG.length - 1;
  return `${charLength(base) > room ? truncateChars(base, room).trimEnd() : base} ${SHORTS_TAG}`;
}

/** The caption as other platforms get it (hashtags appended), without angle brackets, at most 5000 characters. */
export function shortsDescription(fullCaption: string): string {
  return truncateChars(stripAngles(fullCaption).trim(), DESCRIPTION_MAX);
}

/** The hashtags without "#", deduplicated, within YouTube's 500-character total. */
export function shortsTags(hashtags: readonly string[]): string[] {
  const tags: string[] = [];
  let used = 0;
  for (const raw of hashtags) {
    const tag = stripAngles(raw.trim().replace(/^#+/, '')).replace(/,/g, '').trim();
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    const cost = tag.length + (tags.length > 0 ? 1 : 0);
    if (used + cost > TAGS_MAX) break;
    tags.push(tag);
    used += cost;
  }
  return tags;
}

export function shortsMetadata(input: { captionText: string; fullCaption: string; hashtags: readonly string[]; dealerName: string }): {
  title: string;
  description: string;
  tags: string[];
} {
  return {
    title: shortsTitle(input.captionText, input.dealerName),
    description: shortsDescription(input.fullCaption),
    tags: shortsTags(input.hashtags),
  };
}

/** Plain copy for YouTube failures; otherwise the API's own message. */
export function youtubeErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: { message?: unknown; errors?: Array<{ reason?: unknown }> } } | undefined;
    const reasons = (body?.error?.errors ?? []).map((e) => e.reason).filter((r): r is string => typeof r === 'string');
    if (reasons.some((r) => LIMIT_REASONS.has(r))) return YOUTUBE_LIMIT_MESSAGE;
    if (reasons.includes('youtubeSignupRequired')) return NO_YOUTUBE_CHANNEL;
    if (err.response?.status === 401) return YOUTUBE_EXPIRED_MESSAGE;
    const message = body?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Where the MP4 comes from: our reels sit in the public media bucket. Tests replace `load`. */
export const reelSource = {
  load: async (url: string): Promise<Buffer> =>
    (await safeFetchBuffer(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS, maxBytes: VIDEO_MAX_BYTES })).buffer,
};

export interface ShortUpload {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const value = (headers as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : null;
}

/** Asks the resumable session whether it holds the whole video: the video id when it does, otherwise null. */
async function uploadedVideoId(location: string, length: number, accessToken: string): Promise<string | null> {
  try {
    const res = await axios.put<{ id?: unknown }>(location, Buffer.alloc(0), {
      headers: { ...bearer(accessToken), 'Content-Range': `bytes */${length}` },
      timeout: STATUS_TIMEOUT_MS,
      validateStatus: () => true,
    });
    const id = res.data?.id;
    return (res.status === 200 || res.status === 201) && typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * PUTs the bytes and returns the video id. A PUT that gets no answer (a timeout or a dropped connection) may
 * still have finished on YouTube's side, so the session is asked once; an upload it can't confirm fails with
 * copy that says to check the channel, since publishing again could post the Short twice.
 */
async function putVideo(location: string, video: Buffer, accessToken: string): Promise<string> {
  let id: unknown;
  try {
    const done = await axios.put<{ id?: unknown }>(location, video, {
      headers: { ...bearer(accessToken), 'Content-Type': 'video/mp4' },
      timeout: UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    id = done.data.id;
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response) throw err;
    const confirmed = await uploadedVideoId(location, video.length, accessToken);
    if (!confirmed) throw new Error(YOUTUBE_UNCONFIRMED_MESSAGE);
    return confirmed;
  }
  if (typeof id !== 'string' || !id) throw new Error('YouTube did not return a video id.');
  return id;
}

/** Uploads a reel as a public Short. A mock channel (local and demo) gets a mock Short and no API call. */
export async function uploadShort(input: ShortUpload): Promise<{ platform_post_id: string; url: string }> {
  if (isMockId(input.accessToken)) {
    const id = `mock_yt_short_${Date.now()}`;
    return { platform_post_id: id, url: `https://youtube.com/shorts/${id}` };
  }
  try {
    const video = await reelSource.load(input.videoUrl);
    const session = await axios.post(
      UPLOAD_URL,
      {
        snippet: { title: input.title, description: input.description, tags: input.tags, categoryId: AUTOS_AND_VEHICLES },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
      {
        headers: {
          ...bearer(input.accessToken),
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(video.length),
        },
        timeout: INIT_TIMEOUT_MS,
      },
    );
    const location = headerValue(session.headers, 'location');
    if (!location) throw new Error('YouTube did not return an upload address.');
    const id = await putVideo(location, video, input.accessToken);
    return { platform_post_id: id, url: `https://youtube.com/shorts/${id}` };
  } catch (err) {
    throw new Error(youtubeErrorMessage(err));
  }
}
