import { platformResults } from './posts.js';

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

export function platformOptions(type: CreateType, connected: readonly string[]): Array<{ id: string; label: string }> {
  return (type === 'reel' ? REEL_PLATFORMS : IMAGE_PLATFORMS).filter((p) => connected.includes(p.id));
}

export function defaultPlatforms(type: CreateType, connected: readonly string[]): string[] {
  return platformOptions(type, connected).map((p) => p.id);
}

export function togglePlatform(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
}

export function platformLabel(id: string): string {
  return [...IMAGE_PLATFORMS, ...REEL_PLATFORMS].find((p) => p.id === id)?.label ?? id;
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

/** `?date=YYYY-MM-DD&time=HH:mm` from the calendar as a `datetime-local` value (10:00 when the time is missing). */
export function scheduleFromQuery(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return `${date}T${time && /^\d{2}:\d{2}$/.test(time) ? time : '10:00'}`;
}
