// Inbox page logic: API messages → display items, stats, filters and labels.
// Pure, so it runs in the web tests (src/utils/**/*.test.ts).

export type ApiPlatform = 'facebook' | 'instagram' | 'gmb' | 'youtube' | 'email';
export type InboxPlatform = 'google' | 'facebook' | 'instagram' | 'youtube' | 'email';
export type InboxType = 'review' | 'comment' | 'dm' | 'email';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type InboxTag = 'lead' | 'complaint' | 'general' | 'spam';

/** A message as GET /v1/inbox returns it. */
export interface ApiInboxMessage {
  id: string;
  dealerId: string;
  platform: string;
  messageType: string;
  platformMessageId: string;
  postId?: string;
  customerName: string;
  customerAvatarUrl?: string;
  customerPlatformId?: string;
  emailSubject?: string;
  messageText: string;
  sentiment?: Sentiment;
  tag?: InboxTag;
  rating?: number;
  aiSuggestedReply?: string;
  replyText?: string;
  repliedAt?: string;
  isRead: boolean;
  requiresApproval: boolean;
  receivedAt: string;
  postContext?: string;
  postThumbnail?: string;
  postExternalUrl?: string;
  replies?: Array<{ id: string; text: string; createdAt: string; isDealerOwn?: boolean }>;
}

export interface InboxReplyItem {
  id: string;
  text: string;
  timestamp: string;
}

export interface InboxItem {
  id: string;
  platform: InboxPlatform;
  type: InboxType;
  customerName: string;
  customerInitials: string;
  text: string;
  receivedAt: string;
  timestamp: string;
  sentiment: Sentiment;
  tag: InboxTag;
  isRead: boolean;
  /** Has a dealer reply (repliedAt), not merely read. */
  responded: boolean;
  rating?: number;
  postContext?: string;
  postThumbnail?: string;
  postExternalUrl?: string;
  replies: InboxReplyItem[];
  aiSuggestedReply?: string;
  emailSubject?: string;
}

export function displayPlatform(platform: string): InboxPlatform {
  if (platform === 'gmb' || platform === 'google') return 'google';
  if (platform === 'facebook' || platform === 'instagram' || platform === 'youtube') return platform;
  return 'email';
}

export function apiPlatform(platform: InboxPlatform): ApiPlatform {
  return platform === 'google' ? 'gmb' : platform;
}

/** PlatformIcon's key: Google is "gmb"; email has no icon. */
export function iconPlatform(platform: InboxPlatform): 'gmb' | 'facebook' | 'instagram' | 'youtube' | null {
  if (platform === 'google') return 'gmb';
  return platform === 'email' ? null : platform;
}

export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase());
  return letters.slice(0, 2).join('') || '?';
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function toType(value: string): InboxType {
  return value === 'review' || value === 'comment' || value === 'dm' || value === 'email' ? value : 'comment';
}

export function toInboxItem(m: ApiInboxMessage): InboxItem {
  const name = m.customerName?.trim() || 'Customer';
  return {
    id: m.id,
    platform: displayPlatform(m.platform),
    type: toType(m.messageType),
    customerName: name,
    customerInitials: initials(name),
    text: m.messageText ?? '',
    receivedAt: m.receivedAt,
    timestamp: formatTimestamp(m.receivedAt),
    sentiment: m.sentiment ?? 'neutral',
    tag: m.tag ?? 'general',
    isRead: m.isRead,
    responded: !!m.repliedAt,
    rating: typeof m.rating === 'number' ? m.rating : undefined,
    postContext: m.postContext || undefined,
    postThumbnail: m.postThumbnail || undefined,
    postExternalUrl: m.postExternalUrl || undefined,
    replies: (m.replies ?? []).map((r) => ({ id: r.id, text: r.text, timestamp: formatTimestamp(r.createdAt) })),
    aiSuggestedReply: m.aiSuggestedReply || undefined,
    emailSubject: m.emailSubject || undefined,
  };
}

// ─── Stats and counts (always over the full list, never the filtered view) ───

export interface InboxStats {
  total: number;
  unread: number;
  replied: number;
  pending: number;
  avgRating: number;
  responseRate: number;
}

/** Spam needs no answer, so it counts in neither the response rate nor the pending replies. */
export function inboxStats(items: readonly InboxItem[]): InboxStats {
  const unread = items.filter((m) => !m.isRead).length;
  const replied = items.filter((m) => m.responded).length;
  const answerable = items.filter((m) => m.tag !== 'spam');
  const answered = answerable.filter((m) => m.responded).length;
  const rated = items.filter((m) => typeof m.rating === 'number');
  return {
    total: items.length,
    unread,
    replied,
    pending: answerable.length - answered,
    avgRating: rated.length ? rated.reduce((sum, m) => sum + (m.rating ?? 0), 0) / rated.length : 0,
    responseRate: answerable.length ? Math.round((answered / answerable.length) * 100) : 0,
  };
}

// ─── Paging (GET /v1/inbox pages of INBOX_PAGE_SIZE, newest first) ──────────

export const INBOX_PAGE_SIZE = 50;

/** The page after the loaded messages. New messages only shift older ones down, so overlaps are de-duplicated, never skipped. */
export function nextInboxPage(loaded: number, pageSize = INBOX_PAGE_SIZE): number {
  return Math.floor(loaded / pageSize) + 1;
}

/** "Load more": an older page's new messages go after the list; ones already on screen stay as they are. */
export function appendPage(current: readonly InboxItem[], older: readonly InboxItem[]): InboxItem[] {
  const seen = new Set(current.map((m) => m.id));
  const added: InboxItem[] = [];
  for (const m of older) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    added.push(m);
  }
  return [...current, ...added];
}

/**
 * The refreshed first page replaces its messages and keeps the older pages already loaded after it.
 * A message replied to here (`localReplies`) keeps its reply until the server reports it.
 */
export function mergeFirstPage(current: readonly InboxItem[], fresh: readonly InboxItem[], localReplies: ReadonlySet<string> = new Set()): InboxItem[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  const first = fresh.map((m) => {
    const local = byId.get(m.id);
    return !m.responded && local?.responded && localReplies.has(m.id) ? local : m;
  });
  const shown = new Set(first.map((m) => m.id));
  return [...first, ...current.filter((m) => !shown.has(m.id))];
}

const PLATFORMS: readonly InboxPlatform[] = ['google', 'facebook', 'instagram', 'youtube', 'email'];

function countByPlatform(items: readonly InboxItem[]): Record<InboxPlatform, number> {
  const counts = Object.fromEntries(PLATFORMS.map((p) => [p, 0])) as Record<InboxPlatform, number>;
  for (const m of items) counts[m.platform] += 1;
  return counts;
}

export function platformCounts(items: readonly InboxItem[]): Record<InboxPlatform, number> {
  return countByPlatform(items);
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Messages received in the 7 days before `now`, per platform. */
export function weeklyPlatformCounts(items: readonly InboxItem[], now: number): Record<InboxPlatform, number> {
  return countByPlatform(items.filter((m) => now - Date.parse(m.receivedAt) <= WEEK_MS));
}

export function unreadByPlatform(items: readonly InboxItem[]): Record<InboxPlatform, number> {
  return countByPlatform(items.filter((m) => !m.isRead));
}

export function typeCounts(items: readonly InboxItem[]): { review: number; comment: number; dm: number } {
  return {
    review: items.filter((m) => m.type === 'review').length,
    comment: items.filter((m) => m.type === 'comment').length,
    dm: items.filter((m) => m.type === 'dm').length,
  };
}

export function sentimentCounts(items: readonly InboxItem[]): Record<Sentiment, number> {
  return {
    positive: items.filter((m) => m.sentiment === 'positive').length,
    neutral: items.filter((m) => m.sentiment === 'neutral').length,
    negative: items.filter((m) => m.sentiment === 'negative').length,
  };
}

/** Average stars of one platform's rated messages (0 when none). */
export function avgRatingFor(items: readonly InboxItem[], platform: InboxPlatform): number {
  return inboxStats(items.filter((m) => m.platform === platform)).avgRating;
}

// ─── Filters and quick actions ───────────────────────────────────────────────

export type TypeFilter = 'all' | 'review' | 'comment' | 'dm';
export type StatusFilter = 'all' | 'pending' | 'responded';

export interface InboxFilters {
  type: TypeFilter;
  platform: 'all' | InboxPlatform;
  sentiment: 'all' | Sentiment;
  status: StatusFilter;
  search: string;
}

export const DEFAULT_FILTERS: InboxFilters = { type: 'all', platform: 'all', sentiment: 'all', status: 'all', search: '' };

export function filterMessages(items: readonly InboxItem[], f: InboxFilters): InboxItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((m) =>
    (!q || m.customerName.toLowerCase().includes(q) || m.text.toLowerCase().includes(q))
    && (f.type === 'all' || m.type === f.type)
    && (f.platform === 'all' || m.platform === f.platform)
    && (f.sentiment === 'all' || m.sentiment === f.sentiment)
    && (f.status === 'all' || (f.status === 'pending' ? !m.responded : m.responded)));
}

export type QuickAction = 'reply-positive' | 'flag-complaints';

export function quickActionFilters(action: QuickAction): InboxFilters {
  return action === 'reply-positive'
    ? { ...DEFAULT_FILTERS, type: 'review', sentiment: 'positive', status: 'pending' }
    : { ...DEFAULT_FILTERS, sentiment: 'negative', status: 'pending' };
}

/** Create Studio prompt for "Request more Google reviews". */
export const REVIEW_REQUEST_PROMPT = 'Thank our happy customers and ask them to rate us on Google';

// ─── Labels and AI drafts ────────────────────────────────────────────────────

export function toneLabel(sentiment: Sentiment): 'POSITIVE TONE' | 'RECOVERY TONE' | 'NEUTRAL TONE' {
  if (sentiment === 'positive') return 'POSITIVE TONE';
  if (sentiment === 'negative') return 'RECOVERY TONE';
  return 'NEUTRAL TONE';
}

/** An AI reply being reviewed: the options, the chosen one, and its (editable) text. */
export interface DraftState {
  options: string[];
  index: number;
  text: string;
  editing: boolean;
}

export function draftFromSuggestions(options: readonly string[]): DraftState {
  const clean = options.map((o) => o.trim()).filter(Boolean);
  return { options: clean, index: 0, text: clean[0] ?? '', editing: false };
}

export function selectDraftOption(draft: DraftState, index: number): DraftState {
  const text = draft.options[index];
  return text === undefined ? draft : { ...draft, index, text, editing: false };
}

export function markAllDescription(count: number): string {
  return `This will mark all ${count} unread message${count === 1 ? '' : 's'} as read.`;
}

/** 4–5★ reviews, not marked spam, can become a thank-you post ("Turn into post"). */
export function canTurnIntoPost(item: InboxItem): boolean {
  return item.type === 'review' && item.tag !== 'spam' && (item.rating ?? 0) >= 4;
}
