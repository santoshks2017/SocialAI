import { platformResults } from './posts.js';
import type { ConnectedAccount } from './accounts.js';

export type CreateType = 'image' | 'reel';
export type VisualSource = 'generate_scratch' | 'add_inspiration' | 'add_creative';

export const LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'en', label: 'English' }, { id: 'hi', label: 'Hindi' }, { id: 'mr', label: 'Marathi' }, { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' }, { id: 'kn', label: 'Kannada' }, { id: 'gu', label: 'Gujarati' }, { id: 'bn', label: 'Bengali' },
];

export function initialLanguage(prefs?: readonly string[] | null): string {
  const first = prefs?.[0];
  return first && LANGUAGES.some((l) => l.id === first) ? first : 'en';
}

export const IMAGE_PLATFORMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'facebook', label: 'Facebook' }, { id: 'instagram', label: 'Instagram' }, { id: 'gmb', label: 'Google' },
];
export const REEL_PLATFORMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'youtube', label: 'YouTube' }, { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' },
];

export interface PlatformOption {
  id: string;
  label: string;
  /** Shown but not selectable; `hint` says why (YouTube on image posts). */
  disabled?: boolean;
  hint?: string;
}

export const YOUTUBE_VIDEO_ONLY_HINT = 'YouTube takes video (Shorts) only';

export function platformOptions(type: CreateType, connected: readonly string[]): PlatformOption[] {
  const options: PlatformOption[] = (type === 'reel' ? REEL_PLATFORMS : IMAGE_PLATFORMS)
    .filter((p) => connected.includes(p.id))
    .map((p) => ({ ...p }));
  if (type === 'image' && connected.includes('youtube')) {
    options.push({ id: 'youtube', label: 'YouTube', disabled: true, hint: YOUTUBE_VIDEO_ONLY_HINT });
  }
  return options;
}

export function defaultPlatforms(type: CreateType, connected: readonly string[]): string[] {
  return platformOptions(type, connected).filter((p) => !p.disabled).map((p) => p.id);
}

export function togglePlatform(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
}

export function platformLabel(id: string): string {
  return [...IMAGE_PLATFORMS, ...REEL_PLATFORMS].find((p) => p.id === id)?.label ?? id;
}

export type StudioAccount = Pick<ConnectedAccount, 'id' | 'platform' | 'accountName' | 'createdAt'>;

/** Posts call Google Business Profile `gmb`; the account list calls it `google`. */
export function postPlatform(platform: string): string {
  return platform === 'google' ? 'gmb' : platform;
}

/** The platforms with a connected account, in the list's order. */
export function connectedPlatformIds(accounts: readonly StudioAccount[]): string[] {
  return [...new Set(accounts.map((a) => postPlatform(a.platform)))];
}

/** A platform's accounts, primary first: the oldest, ties by id (as the API picks it). */
export function platformAccounts<T extends StudioAccount>(accounts: readonly T[], platform: string): T[] {
  return accounts
    .filter((a) => postPlatform(a.platform) === platform)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The chosen accounts of each selected platform that has several. Platforms with one account are left out
 * (the server sends those to their primary). With nothing chosen yet, the primary is preselected.
 */
export function accountSelection(
  accounts: readonly StudioAccount[],
  platforms: readonly string[],
  picked: readonly string[] | null,
): Record<string, string[]> {
  const selection: Record<string, string[]> = {};
  for (const platform of platforms) {
    const mine = platformAccounts(accounts, platform);
    const primary = mine[0];
    if (!primary || mine.length < 2) continue;
    const chosen = mine.filter((a) => picked?.includes(a.id)).map((a) => a.id);
    selection[platform] = chosen.length > 0 ? chosen : [primary.id];
  }
  return selection;
}

/** Toggles one account of a platform, keeping at least one selected; returns every chosen id. */
export function toggleAccount(selection: Readonly<Record<string, readonly string[]>>, platform: string, id: string): string[] {
  const current = selection[platform] ?? [];
  const next = current.includes(id)
    ? (current.length > 1 ? current.filter((x) => x !== id) : [...current])
    : [...current, id];
  return Object.entries({ ...selection, [platform]: next }).flatMap(([, ids]) => [...ids]);
}

export function selectedConnectionIds(selection: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.values(selection).flat();
}

export interface FormatSpec {
  supported: boolean;
  aspectRatio: string;
  size: string;
  maxDurationSec: number | null;
  maxFileMb: number | null;
  captionMaxChars: number | null;
  hashtagsMax: number | null;
  captionNote: string;
  hashtagsRecommended: string;
}

export type PlatformSpecs = Partial<Record<string, Partial<Record<'post' | 'story' | 'reel', FormatSpec>>>>;

export function parseAspect(value?: string | null): string | null {
  const first = value?.split(/[,/]/)[0]?.trim();
  return first && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(first) ? first : null;
}

export function outputFormat(type: CreateType, selected: readonly string[], specs: PlatformSpecs | null): string {
  const kind = type === 'reel' ? 'reel' : 'post';
  const common = parseAspect(specs?.['common']?.[kind]?.aspectRatio) ?? (type === 'reel' ? '9:16' : '1:1');
  const only = selected.length === 1 ? selected[0] : undefined;
  return (only && parseAspect(specs?.[only]?.[kind]?.aspectRatio)) || common;
}

export function outputFormatNote(selected: readonly string[]): string {
  return selected.length === 1 ? `— configured for ${platformLabel(selected[0]!)}.` : '— common format for the selected platforms.';
}

export interface LimitIssue {
  platform: string;
  label: string;
  captionOver: boolean;
  hashtagsOver: boolean;
}

export function limitIssues(type: CreateType, selected: readonly string[], specs: PlatformSpecs | null, caption: string, hashtags: readonly string[]): LimitIssue[] {
  if (!specs) return [];
  const kind = type === 'reel' ? 'reel' : 'post';
  // Platforms receive the caption, a blank line, then the hashtags (API captionWithHashtags).
  const sentLength = caption.length + (hashtags.length ? 2 + hashtags.join(' ').length : 0);
  return selected.flatMap((platform) => {
    const spec = specs[platform]?.[kind];
    if (!spec?.supported) return [];
    const captionOver = spec.captionMaxChars != null && sentLength > spec.captionMaxChars;
    const hashtagsOver = spec.hashtagsMax != null && hashtags.length > spec.hashtagsMax;
    return captionOver || hashtagsOver ? [{ platform, label: platformLabel(platform), captionOver, hashtagsOver }] : [];
  });
}

export function limitMessage(issue: LimitIssue): string {
  const problems = [issue.captionOver && 'caption too long', issue.hashtagsOver && 'too many hashtags'].filter(Boolean);
  return `${issue.label}: ${problems.join(' · ')}.`;
}

export function dealerInitials(name?: string | null): string {
  const letters = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join('');
  return letters || 'CD';
}

export function instagramHandle(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function reelHandle(name: string): string {
  return `@${name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 18)}`;
}

export function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').trim();
  return tag ? `#${tag}` : null;
}

export function addHashtag(tags: readonly string[], raw: string): string[] {
  const tag = normalizeHashtag(raw);
  if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return [...tags];
  return [...tags, tag];
}

export function mergeHashtags(existing: readonly string[], incoming: readonly string[], max = 30): string[] {
  return incoming.reduce<string[]>((tags, raw) => addHashtag(tags, raw), [...existing]).slice(0, max);
}

export function reelErrorMessage(code?: string | null): string {
  switch (code) {
    case 'FEATURE_NOT_IN_PLAN': return "Reels aren’t in your current plan. Upgrade in Settings → Billing.";
    case 'VEO_ACCESS_DENIED': return "Your Google project doesn’t have access to the selected video model yet.";
    case 'VEO_QUOTA_EXCEEDED': return 'Video generation quota reached. Try again later.';
    case 'GEMINI_NOT_CONFIGURED': return "Video generation isn’t configured on the server.";
    case 'REEL_DAILY_LIMIT_REACHED': return "You’ve reached today’s reel limit. Try again tomorrow.";
    default: return 'Could not generate. Please try again.';
  }
}

/** A failed premium (Veo) reel is retried with the quick Ken Burns engine. */
export function shouldFallBackToQuickRender(code?: string | null, engine?: string | null): boolean {
  return engine === 'veo' && !!code && code.startsWith('VEO_');
}

export type DeliveryStatus = 'live' | 'failed' | 'uploading';
export interface DeliveryRow { platform: string; status: DeliveryStatus; url: string | null }

/** Per-platform delivery of a video post that is still publishing (success screen). */
export function deliveryRows(platforms: readonly string[], post: { status: string; publish_results?: unknown } | null): DeliveryRow[] {
  const results = platformResults(post?.publish_results);
  return platforms.map((platform): DeliveryRow => {
    const r = results.find((x) => x.platform === platform);
    if (r?.error) return { platform, status: 'failed', url: null };
    if (r?.url) return { platform, status: 'live', url: r.url };
    return { platform, status: post?.status === 'published' ? 'live' : 'uploading', url: null };
  });
}

/**
 * Editing a draft that has a caption but no creative yet (Inbox "Turn into post"): the first generate keeps
 * that caption and its hashtags instead of the generated copy. Once there is a result, generating behaves as usual.
 */
export function keepPreloadedCaption({ editing, currentCaption, hasResult }: { editing: boolean; currentCaption: string; hasResult: boolean }): boolean {
  return editing && !hasResult && currentCaption.trim().length > 0;
}

/** `?date=YYYY-MM-DD&time=HH:mm` from the calendar as a `datetime-local` value (10:00 when the time is missing). */
export function scheduleFromQuery(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return `${date}T${time && /^\d{2}:\d{2}$/.test(time) ? time : '10:00'}`;
}
