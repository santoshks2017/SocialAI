import axios from 'axios';
import { isMockId } from '../lib/platformMock.js';

// YouTube Data API v3 reads. OAuth access tokens go in the Authorization header, never in a URL.
export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
export const NO_YOUTUBE_CHANNEL = 'This Google account has no YouTube channel. Create one on YouTube, then connect again.';
const TIMEOUT_MS = 15_000;

export const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

/** A YouTube count (the API sends them as strings); null when absent, blank or not a number. */
export function youtubeCount(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface YouTubeChannel {
  id: string;
  title: string;
}

/** The channels the signed-in Google account owns (channels.list with mine=true). */
export async function fetchYouTubeChannels(accessToken: string): Promise<YouTubeChannel[]> {
  const res = await axios.get<{ items?: Array<{ id?: string; snippet?: { title?: string } }> }>(
    `${YOUTUBE_API_BASE}/channels`,
    { params: { part: 'snippet,statistics', mine: 'true' }, headers: bearer(accessToken), timeout: TIMEOUT_MS },
  );
  return (res.data.items ?? []).flatMap((item) => (item.id ? [{ id: item.id, title: item.snippet?.title?.trim() || item.id }] : []));
}

/**
 * A video's public numbers: views also count as reach (as Google Business Profile views do), plus likes and
 * comments. Null when the video isn't in the response (deleted, made private, or otherwise inaccessible),
 * not a zeroed answer, so the caller keeps the post's last-known-good numbers instead of overwriting them.
 */
export async function fetchYouTubeVideoMetrics(videoId: string, accessToken: string): Promise<Record<string, number> | null> {
  if (isMockId(videoId) || isMockId(accessToken)) return {};
  const res = await axios.get<{ items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> }>(
    `${YOUTUBE_API_BASE}/videos`,
    { params: { part: 'statistics', id: videoId }, headers: bearer(accessToken), timeout: TIMEOUT_MS },
  );
  if (!res.data.items?.length) return null;
  const stats = res.data.items[0]?.statistics;
  const views = youtubeCount(stats?.viewCount) ?? 0;
  return { views, reach: views, likes: youtubeCount(stats?.likeCount) ?? 0, comments: youtubeCount(stats?.commentCount) ?? 0 };
}

/** A channel's subscribers; null when the channel hides the count. */
export async function fetchYouTubeSubscribers(channelId: string, accessToken: string): Promise<number | null> {
  if (isMockId(channelId) || isMockId(accessToken)) return null;
  const res = await axios.get<{ items?: Array<{ statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }> }>(
    `${YOUTUBE_API_BASE}/channels`,
    { params: { part: 'statistics', id: channelId }, headers: bearer(accessToken), timeout: TIMEOUT_MS },
  );
  const stats = res.data.items?.[0]?.statistics;
  if (!stats || stats.hiddenSubscriberCount) return null;
  return youtubeCount(stats.subscriberCount);
}
