export function greetingFor(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Indian short form: 2.5L for lakhs, 1.5K for thousands. */
export function compactIndian(n: number): string {
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Stacking order of the activity chart, bottom to top.
export const ACTIVITY_STATUSES = ['published', 'scheduled', 'approved', 'pending_approval', 'draft', 'failed'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export interface ActivityBucket {
  key: string;
  date: Date;
  label: string;
  total: number;
  byStatus: Record<ActivityStatus, number>;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// Posts going out right now count as scheduled; unknown statuses count as drafts.
function activityStatus(status: string): ActivityStatus {
  if (status === 'publishing') return 'scheduled';
  return (ACTIVITY_STATUSES as readonly string[]).includes(status) ? (status as ActivityStatus) : 'draft';
}

/** One bucket per local day for the last `days` days, oldest first, counting posts by creation day. */
export function buildBuckets(posts: Array<{ created_at: string; status: string }>, days: number, now: Date = new Date()): ActivityBucket[] {
  const buckets: ActivityBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      key: dayKey(date),
      date,
      label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      total: 0,
      byStatus: Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s, 0])) as Record<ActivityStatus, number>,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const post of posts) {
    const bucket = byKey.get(dayKey(new Date(post.created_at)));
    if (!bucket) continue;
    bucket.total += 1;
    bucket.byStatus[activityStatus(post.status)] += 1;
  }
  return buckets;
}

/** Posts in the last 7 days against the 7 before; null for ranges under 14 days or when both are 0. */
export function weekTrend(buckets: ActivityBucket[]): { last7: number; prev7: number; delta: number } | null {
  if (buckets.length < 14) return null;
  const sum = (list: ActivityBucket[]) => list.reduce((n, b) => n + b.total, 0);
  const last7 = sum(buckets.slice(-7));
  const prev7 = sum(buckets.slice(-14, -7));
  if (last7 === 0 && prev7 === 0) return null;
  return { last7, prev7, delta: last7 - prev7 };
}

export const PIPELINE = [
  { key: 'published', label: 'Published', color: '#10b981' },
  { key: 'scheduled', label: 'Scheduled', color: '#f59e0b' },
  { key: 'approved', label: 'Ready', color: '#14b8a6' },
  { key: 'pending_approval', label: 'In review', color: '#8b5cf6' },
  { key: 'draft', label: 'Drafts', color: '#a1a1aa' },
  { key: 'failed', label: 'Failed', color: '#ef4444' },
] as const;

export function pipelineSegments(counts: Record<string, number>): Array<{ key: string; label: string; color: string; value: number }> {
  return PIPELINE.map((s) => ({
    ...s,
    value: (counts[s.key] ?? 0) + (s.key === 'scheduled' ? counts['publishing'] ?? 0 : 0),
  }));
}
