import type { FollowerSnapshot, InboxMessage, Post } from '../generated/client/index.js';
import { firstCreativeUrl } from './inboxView.js';
import { addBags, emptyBag, postMetricsBags, type MetricPlatform, type MetricsBag } from './postMetrics.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ANALYTICS_DAYS = [7, 30, 90] as const;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Engagement by post type ─────────────────────────────────────────────────

export interface EngagementByTypeRow { type: 'image' | 'reel'; posts: number; reach: number; engagementRate: number }

/**
 * Published posts grouped by format (video posts are reels), rate = engagement ÷ reach × 100 (1 decimal).
 * Formats whose posts have no reach yet are left out, so the page shows its empty state instead of 0% bars.
 */
export function engagementByType(posts: Array<Pick<Post, 'media_type' | 'metrics'>>): EngagementByTypeRow[] {
  const groups = new Map<'image' | 'reel', { posts: number; bag: MetricsBag }>();
  for (const post of posts) {
    const type = post.media_type === 'video' ? 'reel' : 'image';
    const group = groups.get(type) ?? { posts: 0, bag: emptyBag() };
    group.posts += 1;
    group.bag = addBags(group.bag, postMetricsBags(post.metrics).total);
    groups.set(type, group);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.bag.reach > 0)
    .map(([type, g]) => ({ type, posts: g.posts, reach: g.bag.reach, engagementRate: round1((g.bag.engagement / g.bag.reach) * 100) }))
    .sort((a, b) => b.engagementRate - a.engagementRate);
}

// ─── Followers ───────────────────────────────────────────────────────────────

export interface FollowerTrendRow { platform: string; current: number; delta: number | null }

const PLATFORM_ORDER = ['facebook', 'instagram'];

/** The latest count per platform, and its change since the oldest snapshot in the window (null with only one). */
export function followerTrend(snapshots: Array<Pick<FollowerSnapshot, 'platform' | 'followers' | 'captured_on'>>): FollowerTrendRow[] {
  const byPlatform = new Map<string, Array<Pick<FollowerSnapshot, 'followers' | 'captured_on'>>>();
  for (const s of snapshots) byPlatform.set(s.platform, [...(byPlatform.get(s.platform) ?? []), s]);
  const rank = (platform: string) => (PLATFORM_ORDER.indexOf(platform) + 1) || PLATFORM_ORDER.length + 1;
  return [...byPlatform.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([platform, rows]) => {
      const sorted = [...rows].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
      const oldest = sorted[0]!;
      const latest = sorted[sorted.length - 1]!;
      return { platform, current: latest.followers, delta: sorted.length > 1 ? latest.followers - oldest.followers : null };
    });
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface ReviewSummary { avgRating: number | null; responseRate: number | null; avgResponseMinutes: number | null; totalReviews: number }
export interface ReviewTrendRow { label: string; month: string; avgRating: number | null; totalReviews: number; responded: number }

type ReviewRow = Pick<InboxMessage, 'rating' | 'received_at' | 'replied_at'>;

/** Average stars (1 decimal), share replied (%), mean minutes to reply, and the count. */
export function reviewSummary(reviews: ReviewRow[]): ReviewSummary {
  const rated = reviews.filter((r) => typeof r.rating === 'number' && r.rating > 0);
  const minutes = reviews
    .filter((r): r is ReviewRow & { replied_at: Date } => r.replied_at !== null)
    .map((r) => Math.max(0, (r.replied_at.getTime() - r.received_at.getTime()) / 60_000));
  return {
    avgRating: rated.length ? round1(rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) : null,
    responseRate: reviews.length ? Math.round((minutes.length / reviews.length) * 100) : null,
    avgResponseMinutes: minutes.length ? Math.round(minutes.reduce((sum, m) => sum + m, 0) / minutes.length) : null,
    totalReviews: reviews.length,
  };
}

/** The first day (UTC) of the month two months before `now`: the start of the 3-month trend. */
export function trendStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
}

/** This calendar month and the two before it (UTC), oldest first. Empty when none of them has a review. */
export function reviewTrend(reviews: ReviewRow[], now: Date): ReviewTrendRow[] {
  const rows: ReviewTrendRow[] = [];
  for (let back = 2; back >= 0; back--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const inMonth = reviews.filter((r) => r.received_at >= start && r.received_at < end);
    rows.push({
      label: start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      avgRating: reviewSummary(inMonth).avgRating,
      totalReviews: inMonth.length,
      responded: inMonth.filter((r) => r.replied_at).length,
    });
  }
  return rows.some((r) => r.totalReviews > 0) ? rows : [];
}

// ─── Post performance ────────────────────────────────────────────────────────

export type PerformanceBag = MetricsBag & { inboxMessages: number };

export interface PostMetricRow extends PerformanceBag {
  id: string;
  caption: string;
  platforms: string[];
  thumbnail: string | null;
  publishedAt: string | null;
}

export interface PostPerformance {
  posts: PostMetricRow[];
  byPlatform: Partial<Record<MetricPlatform, PerformanceBag>>;
  totals: PerformanceBag;
}

type PerformancePost = Pick<Post, 'id' | 'caption_text' | 'prompt_text' | 'platforms' | 'thumbnail_url' | 'creative_urls' | 'published_at' | 'metrics'>;
type LinkedMessage = Pick<InboxMessage, 'post_id' | 'platform'>;

const zeroPerformance = (): PerformanceBag => ({ ...emptyBag(), inboxMessages: 0 });

/**
 * Per-post numbers (sorted by reach, highest first), per-platform totals and overall totals.
 * With `platform`, each post counts that platform's numbers and inbox messages only.
 */
export function postPerformance(posts: PerformancePost[], messages: LinkedMessage[], platform?: MetricPlatform): PostPerformance {
  const inboxByPost = new Map<string, Map<string, number>>();
  for (const m of messages) {
    if (!m.post_id) continue;
    const perPlatform = inboxByPost.get(m.post_id) ?? new Map<string, number>();
    perPlatform.set(m.platform, (perPlatform.get(m.platform) ?? 0) + 1);
    inboxByPost.set(m.post_id, perPlatform);
  }

  const byPlatform: Partial<Record<MetricPlatform, PerformanceBag>> = {};
  let totals = zeroPerformance();
  const rows = posts.map((post): PostMetricRow => {
    const bags = postMetricsBags(post.metrics, platform);
    const inbox = inboxByPost.get(post.id) ?? new Map<string, number>();
    const inboxMessages = platform ? inbox.get(platform) ?? 0 : [...inbox.values()].reduce((sum, n) => sum + n, 0);
    for (const [name, bag] of Object.entries(bags.byPlatform) as Array<[MetricPlatform, MetricsBag]>) {
      const previous = byPlatform[name] ?? zeroPerformance();
      byPlatform[name] = { ...addBags(previous, bag), inboxMessages: previous.inboxMessages + (inbox.get(name) ?? 0) };
    }
    totals = { ...addBags(totals, bags.total), inboxMessages: totals.inboxMessages + inboxMessages };
    return {
      id: post.id,
      caption: post.caption_text || post.prompt_text || '',
      platforms: post.platforms ?? [],
      thumbnail: post.thumbnail_url || firstCreativeUrl(post.creative_urls) || null,
      publishedAt: post.published_at ? post.published_at.toISOString() : null,
      ...bags.total,
      inboxMessages,
    };
  });
  rows.sort((a, b) => b.reach - a.reach);
  return { posts: rows, byPlatform, totals };
}
