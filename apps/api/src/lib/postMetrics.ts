// Post.metrics holds one object per platform, written by the metrics sync (lib/metricsSync.ts):
// { facebook: { reach, likes, comments, shares }, instagram: { reach, likes, comments, saved }, gmb: { views, clicks } }.
// These helpers turn it into comparable numbers. Nothing is invented: a missing value is 0.

export const METRIC_FIELDS = [
  'reach', 'impressions', 'likes', 'comments', 'shares', 'saved',
  'videoViews', 'plays', 'clicks', 'views', 'engagedUsers', 'engagement',
] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];
export type MetricsBag = Record<MetricField, number>;

export const METRIC_PLATFORMS = ['facebook', 'instagram', 'gmb'] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];

export function isMetricPlatform(value: unknown): value is MetricPlatform {
  return typeof value === 'string' && (METRIC_PLATFORMS as readonly string[]).includes(value);
}

export function emptyBag(): MetricsBag {
  return Object.fromEntries(METRIC_FIELDS.map((field) => [field, 0])) as MetricsBag;
}

export function addBags(a: MetricsBag, b: MetricsBag): MetricsBag {
  const out = emptyBag();
  for (const field of METRIC_FIELDS) out[field] = a[field] + b[field];
  return out;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

type StoredField = Exclude<MetricField, 'engagement'>;

// Stored names (snake_case from the fetchers; camelCase accepted too) for each bag field.
const STORED_NAMES: Record<StoredField, string[]> = {
  reach: ['reach'],
  impressions: ['impressions'],
  likes: ['likes'],
  comments: ['comments'],
  shares: ['shares'],
  saved: ['saved'],
  videoViews: ['video_views', 'videoViews'],
  plays: ['plays'],
  clicks: ['clicks'],
  views: ['views'],
  engagedUsers: ['engaged_users', 'engagedUsers'],
};

/** One platform's stored metrics as a bag. Google Business Profile reports views, which count as reach. */
export function platformBag(platform: string, raw: unknown): MetricsBag {
  const bag = emptyBag();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bag;
  const stored = raw as Record<string, unknown>;
  for (const [field, names] of Object.entries(STORED_NAMES) as Array<[StoredField, string[]]>) {
    bag[field] = Math.max(0, ...names.map((name) => count(stored[name])));
  }
  if (platform === 'gmb' && bag.reach === 0) bag.reach = bag.views;
  bag.engagement = bag.likes + bag.comments + bag.shares + bag.saved;
  return bag;
}

export interface PostBags {
  byPlatform: Partial<Record<MetricPlatform, MetricsBag>>;
  total: MetricsBag;
}

/** Per-platform bags for one post plus their total. With `only`, just that platform. */
export function postMetricsBags(metrics: unknown, only?: MetricPlatform): PostBags {
  const byPlatform: Partial<Record<MetricPlatform, MetricsBag>> = {};
  let total = emptyBag();
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return { byPlatform, total };
  const stored = metrics as Record<string, unknown>;
  for (const platform of METRIC_PLATFORMS) {
    if (only && platform !== only) continue;
    if (stored[platform] === undefined) continue;
    const bag = platformBag(platform, stored[platform]);
    byPlatform[platform] = bag;
    total = addBags(total, bag);
  }
  return { byPlatform, total };
}

/** Reach across Facebook, Instagram and Google Business Profile (views). */
export function totalReach(metrics: unknown): number {
  return postMetricsBags(metrics).total.reach;
}
