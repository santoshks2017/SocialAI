import type { PlatformConnection, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchGmbPostMetrics } from '../services/gmb.js';
import { fetchFacebookPostMetrics, fetchInstagramPostMetrics } from '../services/meta.js';
import { fetchYouTubeVideoMetrics } from '../services/youtube.js';
import { forEachLimited } from './concurrency.js';
import { primaryConnection } from './connections.js';
import { isMockConnection, isMockId } from './platformMock.js';
import { isMetricPlatform, type MetricPlatform } from './postMetrics.js';
import { resolveAccessToken } from './publishDirect.js';
import { successfulPostRefs } from './publishResults.js';

export const METRICS_BATCH = 10;
export const METRICS_CONCURRENCY = 3;
export const METRICS_WINDOW_DAYS = 30;
export const METRICS_REFRESH_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = Pick<Post, 'published_at' | 'metrics_last_fetched'>;

/** Posts published in the last 30 days whose metrics are missing or 6+ hours old; never-fetched, then oldest, first. */
export function pickMetricsCandidates<T extends Candidate>(posts: T[], now: Date, limit = METRICS_BATCH): T[] {
  const windowStart = now.getTime() - METRICS_WINDOW_DAYS * DAY_MS;
  const staleBefore = now.getTime() - METRICS_REFRESH_MS;
  return posts
    .filter((p) => p.published_at && p.published_at.getTime() >= windowStart)
    .filter((p) => !p.metrics_last_fetched || p.metrics_last_fetched.getTime() <= staleBefore)
    .sort((a, b) =>
      (a.metrics_last_fetched?.getTime() ?? 0) - (b.metrics_last_fetched?.getTime() ?? 0)
      || (a.published_at?.getTime() ?? 0) - (b.published_at?.getTime() ?? 0))
    .slice(0, limit);
}

export async function fetchPlatformMetrics(platform: MetricPlatform, platformPostId: string, accessToken: string): Promise<Record<string, number>> {
  if (platform === 'facebook') return fetchFacebookPostMetrics(platformPostId, accessToken);
  if (platform === 'instagram') return fetchInstagramPostMetrics(platformPostId, accessToken);
  if (platform === 'youtube') return fetchYouTubeVideoMetrics(platformPostId, accessToken);
  return fetchGmbPostMetrics(platformPostId, accessToken);
}

/** Adds numbers key by key: several accounts' metrics for one platform. */
export function addMetrics(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

// One platform's numbers for a post, summed over the accounts that have it, each read with its own token.
// A result written before per-account publishing names no account, so the primary account reads it.
// Null when nothing could be measured (mock publishes, accounts no longer connected). A failing account
// throws, so the caller keeps the previous numbers instead of storing a partial sum.
async function platformMetrics(platform: MetricPlatform, entry: unknown, conns: readonly PlatformConnection[]): Promise<Record<string, number> | null> {
  let sum: Record<string, number> | null = null;
  for (const ref of successfulPostRefs(entry)) {
    if (isMockId(ref.post_id)) continue;
    const conn = ref.connection_id
      ? conns.find((c) => c.id === ref.connection_id && c.platform === platform) ?? null
      : primaryConnection(conns, platform);
    if (!conn || isMockConnection(conn)) continue;
    const token = await resolveAccessToken(conn);
    sum = addMetrics(sum ?? {}, await fetchPlatformMetrics(platform, ref.post_id, token));
  }
  return sum;
}

// Fetches each live platform's numbers into metrics[platform] (the metricsWorker merge pattern) and always
// stamps metrics_last_fetched, so a post that cannot be measured waits its turn instead of blocking the batch.
async function refreshPost(post: Post, conns: readonly PlatformConnection[], now: Date): Promise<void> {
  const results = (post.publish_results ?? {}) as Record<string, unknown>;
  const previous = post.metrics && typeof post.metrics === 'object' && !Array.isArray(post.metrics)
    ? (post.metrics as Record<string, unknown>)
    : {};
  const metrics: Record<string, unknown> = { ...previous };
  for (const platform of post.platforms ?? []) {
    if (!isMetricPlatform(platform)) continue;
    try {
      const numbers = await platformMetrics(platform, results[platform], conns);
      if (numbers) metrics[platform] = { ...numbers, fetched_at: now.toISOString() };
    } catch (err) {
      console.error(`[metrics] ${platform} metrics failed for post ${post.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  await prisma.post.update({ where: { id: post.id }, data: { metrics, metrics_last_fetched: now } });
}

/**
 * Cron step: refreshes platform metrics for up to 10 recently published posts, three at a time.
 * Mock publishes and posts without a live connection are stamped but not fetched. Returns how many posts it stamped.
 */
export async function syncPostMetrics(now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);
  const published = await prisma.post.findMany({ where: { status: 'published', published_at: { gte: windowStart } } });
  const due = pickMetricsCandidates(published, now);
  if (due.length === 0) return 0;

  const dealerIds = [...new Set(due.map((p) => p.dealer_id))];
  const connections = await prisma.platformConnection.findMany({ where: { dealer_id: { in: dealerIds }, is_connected: true } });
  const byDealer = new Map<string, PlatformConnection[]>();
  for (const conn of connections) byDealer.set(conn.dealer_id, [...(byDealer.get(conn.dealer_id) ?? []), conn]);

  let refreshed = 0;
  await forEachLimited(due, METRICS_CONCURRENCY, async (post) => {
    try {
      await refreshPost(post, byDealer.get(post.dealer_id) ?? [], now);
      refreshed++;
    } catch (err) {
      console.error(`[metrics] Could not refresh post ${post.id}:`, err instanceof Error ? err.message : String(err));
    }
  });
  return refreshed;
}
