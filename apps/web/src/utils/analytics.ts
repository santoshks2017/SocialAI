// Analytics and Report page logic. Pure, so it runs in the web tests.

export interface MetricsBag {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  videoViews: number;
  plays: number;
  clicks: number;
  views: number;
  engagedUsers: number;
  engagement: number;
}

export interface PerformanceBag extends MetricsBag {
  inboxMessages: number;
}

export type AnalyticsPlatform = 'facebook' | 'instagram' | 'gmb';

/** GET /v1/dealer/analytics/posts → posts[] */
export interface PostMetric extends PerformanceBag {
  id: string;
  caption: string;
  platforms: string[];
  thumbnail: string | null;
  publishedAt: string | null;
}

/** GET /v1/dealer/analytics/posts */
export interface PostPerformance {
  posts: PostMetric[];
  byPlatform: Partial<Record<AnalyticsPlatform, PerformanceBag>>;
  totals: PerformanceBag;
}

/** GET /v1/dealer/analytics */
export interface DealerAnalytics {
  engagementByType: Array<{ type: string; posts: number; reach: number; engagementRate: number }>;
  followerTrend: Array<{ platform: string; current: number; delta: number | null }>;
  reviewSummary: { avgRating: number | null; responseRate: number | null; avgResponseMinutes: number | null; totalReviews: number };
  reviewTrend: Array<{ label: string; month: string; avgRating: number | null; totalReviews: number; responded: number }>;
}

export type PostSort = 'reach' | 'engagement' | 'recent';

// In the reference's order (30 first).
export const PERIOD_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '90', label: 'Last 90 days' },
];

export const PLATFORM_PILLS: Array<{ id: 'all' | AnalyticsPlatform; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'gmb', label: 'GMB' },
];

export const POST_SORTS: Array<{ id: PostSort; label: string }> = [
  { id: 'reach', label: 'Reach' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'recent', label: 'Recent' },
];

export function emptyPerformance(): PostPerformance {
  return {
    posts: [],
    byPlatform: {},
    totals: {
      reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saved: 0, videoViews: 0, plays: 0,
      clicks: 0, views: 0, engagedUsers: 0, engagement: 0, inboxMessages: 0,
    },
  };
}

/** Engagement ÷ reach × 100, one decimal; null without reach. */
export function engagementRate(engagement: number, reach: number): number | null {
  return reach > 0 ? Math.round((engagement / reach) * 1000) / 10 : null;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1)}%`;
}

const NAMES: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', gmb: 'GMB', youtube: 'YouTube' };
const ABBREVIATIONS: Record<string, string> = { facebook: 'FB', instagram: 'IG', gmb: 'GMB' };

export function platformName(platform: string): string {
  return NAMES[platform] ?? platform.toUpperCase();
}

/** Text fallback where there is no PlatformIcon. */
export function platformAbbrev(platform: string): string {
  return ABBREVIATIONS[platform] ?? platform.toUpperCase();
}

export function topPlatform(byPlatform: PostPerformance['byPlatform']): { platform: string; reach: number } | null {
  const best = Object.entries(byPlatform)
    .map(([platform, bag]) => ({ platform, reach: bag?.reach ?? 0 }))
    .filter((p) => p.reach > 0)
    .sort((a, b) => b.reach - a.reach)[0];
  return best ?? null;
}

export function sortPosts(posts: readonly PostMetric[], sort: PostSort): PostMetric[] {
  const time = (p: PostMetric) => (p.publishedAt ? Date.parse(p.publishedAt) : 0);
  return [...posts].sort((a, b) => {
    if (sort === 'engagement') return b.engagement - a.engagement;
    if (sort === 'recent') return time(b) - time(a);
    return b.reach - a.reach;
  });
}

/** Top Performing Posts: the five with the most reach, leaving out posts that reached no one. */
export function topPosts(posts: readonly PostMetric[], limit = 5): PostMetric[] {
  return sortPosts(posts.filter((p) => p.reach > 0), 'reach').slice(0, limit);
}

export function topPostsSubtitle(platform: 'all' | AnalyticsPlatform): string {
  return platform === 'all' ? 'Ranked by reach across all platforms' : `Ranked by reach on ${platformName(platform)}`;
}

/** Top Performing Posts empty state: no posts at all vs. published posts that haven't gathered reach yet. */
export function topPostsEmptyCopy(postCount: number): { title: string; body: string } {
  return postCount > 0
    ? { title: 'No reach data yet', body: 'Top posts appear here once your published posts gather reach.' }
    : { title: 'No published posts yet', body: 'Your top posts will appear here once you start publishing.' };
}

/** Ad spend ÷ leads, rounded; null when either is missing. */
export function costPerLead(adSpend: number | null, leads: number): number | null {
  return adSpend !== null && adSpend > 0 && leads > 0 ? Math.round(adSpend / leads) : null;
}

/** — , 45m, 1.5h (under a day) or 1.5d. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/** "September 2026" */
export function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** "24 Sept" */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Bar width in % relative to the largest value in the set, capped at 100. */
export function relativeWidth(value: number, max: number): number {
  return max > 0 ? Math.min(100, (value / max) * 100) : 0;
}

export interface MetricPart {
  label: string;
  value: number;
}

/** The "Reach · Impressions · Likes · …" line of a post, only the metrics above zero. Google views already count as reach. */
export function metricParts(m: PerformanceBag): MetricPart[] {
  const parts: MetricPart[] = [
    { label: 'Reach', value: m.reach },
    { label: 'Impressions', value: m.impressions },
    { label: 'Likes', value: m.likes },
    { label: 'Comments', value: m.comments },
    { label: 'Shares', value: m.shares },
    { label: 'Saved', value: m.saved },
    { label: 'Video views', value: m.videoViews + m.plays },
    { label: 'Clicks', value: m.clicks },
    { label: 'Engaged', value: m.engagedUsers },
    { label: 'Engagement', value: m.engagement },
    { label: 'Inbox', value: m.inboxMessages },
  ];
  return parts.filter((p) => p.value > 0);
}

export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export type CaptionEvent = 'caption.accepted' | 'caption.edited';

/** Whether the saved caption is the AI's (accepted) or was changed (edited). Null when nothing was generated. */
export function captionEventFor(generated: string | null, final: string): CaptionEvent | null {
  if (generated === null) return null;
  return generated.trim() === final.trim() ? 'caption.accepted' : 'caption.edited';
}

/** Report response-rate bar: green from 80%, amber from 50%, else red. */
export function responseRateColor(rate: number): string {
  if (rate >= 80) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}
