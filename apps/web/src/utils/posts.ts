export type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type PostTab = 'all' | PostStatus;

export const POST_TABS: ReadonlyArray<{ id: PostTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'pending_approval', label: 'Approvals' },
  { id: 'approved', label: 'Ready' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'failed', label: 'Failed' },
];

const TAB_IDS: ReadonlySet<string> = new Set(['all', 'draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed']);

export function parsePostTab(value: string | null | undefined): PostTab {
  return value && TAB_IDS.has(value) ? (value as PostTab) : 'all';
}

/** First usable image URL in a post's creatives: a per-platform object, an array or a single URL. */
export function firstCreative(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const url = firstCreative(item);
      if (url) return url;
    }
  }
  return null;
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function postTimeline(post: { status: string; created_at: string; scheduled_at?: string | null; published_at?: string | null }): string {
  if (post.status === 'scheduled' && post.scheduled_at) return `Scheduled for ${dateTime(post.scheduled_at)}`;
  if (post.status === 'published' && post.published_at) return `Published ${dateTime(post.published_at)}`;
  return `Created ${dateOnly(post.created_at)}`;
}

/**
 * The approver's words for a post row: the rejection reason on a draft, the note on a post
 * approved in-app, or (for one approved through the public review link, which has no
 * `approved_by`) a callout even when there is no note.
 */
export function approvalRemark(post: { status: string; approver_note?: string | null; approval_decision?: string | null; approved_by?: string | null }): { kind: 'rejected' | 'note' | 'link'; text: string } | null {
  if (post.status === 'draft' && post.approval_decision === 'rejected') {
    const text = post.approver_note?.trim();
    return text ? { kind: 'rejected', text } : null;
  }
  if (post.status === 'approved' && post.approval_decision === 'approved') {
    const text = post.approver_note?.trim() ?? '';
    if (post.approved_by == null) return { kind: 'link', text };
    return text ? { kind: 'note', text } : null;
  }
  return null;
}

/** Page buttons: every page up to 7, otherwise the first, the last and the current page's neighbours. */
export function pageList(current: number, total: number): Array<number | '...'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  const pages: Array<number | '...'> = [1];
  if (start > 2) pages.push('...');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

/** Value for <input type="datetime-local">, in the browser's time zone. */
export function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Per-platform publish results, without internal keys such as `_rejection`. */
export function platformResults(results: unknown): Array<{ platform: string; url?: string; error?: string }> {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return [];
  return Object.entries(results as Record<string, unknown>)
    .filter(([key, value]) => !key.startsWith('_') && !!value && typeof value === 'object')
    .map(([platform, value]) => {
      const r = value as { url?: unknown; error?: unknown };
      return {
        platform,
        ...(typeof r.url === 'string' ? { url: r.url } : {}),
        ...(typeof r.error === 'string' ? { error: r.error } : {}),
      };
    });
}

/** Reach, likes and comments summed over platforms (`{ facebook: {...}, instagram: {...} }`), or read from a flat object. */
export function metricTotals(metrics: unknown): { reach: number; likes: number; comments: number } {
  const totals = { reach: 0, likes: 0, comments: 0 };
  if (!metrics || typeof metrics !== 'object') return totals;
  const add = (m: Record<string, unknown>) => {
    for (const key of ['reach', 'likes', 'comments'] as const) {
      const value = m[key];
      if (typeof value === 'number') totals[key] += value;
    }
  };
  const values = Object.values(metrics as Record<string, unknown>);
  if (values.some((v) => typeof v === 'number')) add(metrics as Record<string, unknown>);
  else for (const v of values) if (v && typeof v === 'object') add(v as Record<string, unknown>);
  return totals;
}
