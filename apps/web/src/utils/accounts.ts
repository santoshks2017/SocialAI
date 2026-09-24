import type { ConnectPlatform } from './connectPlatform.js';

/** A row of GET /v1/platform-accounts (stored `gmb` arrives as `google`). */
export interface ConnectedAccount {
  id: string;
  platform: string;
  accountName: string;
  accountId: string;
  tokenExpiry: string | null;
  createdAt: string;
}

export type CatalogueId = 'facebook' | 'instagram' | 'google' | 'twitter' | 'linkedin' | 'youtube';
export type CatalogueStatus = 'live' | 'via-facebook' | 'planned';

export interface CatalogueEntry {
  id: CatalogueId;
  label: string;
  description: string;
  color: string;
  status: CatalogueStatus;
  capabilities: readonly string[];
  /** The connect flow the card starts; Instagram links through Facebook. Null for planned platforms. */
  connect: ConnectPlatform | null;
}

export const MAX_ACCOUNTS = 30;

// The reference's catalogue, in its order (sortedCatalogue puts planned platforms last).
export const CATALOGUE: readonly CatalogueEntry[] = [
  { id: 'facebook', label: 'Facebook', description: 'Publish posts, manage pages, and support boosted campaigns.', color: '#1877F2', status: 'live', capabilities: ['Posts', 'Pages', 'Inbox', 'Reviews'], connect: 'facebook' },
  { id: 'instagram', label: 'Instagram', description: 'Plan feed posts, reels, and carousel-style campaigns.', color: '#E1306C', status: 'via-facebook', capabilities: ['Posts', 'Reels', 'Carousels'], connect: 'facebook' },
  { id: 'google', label: 'Google Business', description: 'Publish local updates and respond to customer reviews.', color: '#4285F4', status: 'live', capabilities: ['Updates', 'Reviews', 'Locations'], connect: 'gmb' },
  { id: 'twitter', label: 'X / Twitter', description: 'Track conversations, trends, and quick business announcements.', color: '#0F172A', status: 'planned', capabilities: ['Posts', 'Mentions', 'Threads'], connect: null },
  { id: 'linkedin', label: 'LinkedIn', description: 'Share employer brand updates, events, and leadership posts.', color: '#0A66C2', status: 'planned', capabilities: ['Pages', 'Posts', 'Reports'], connect: null },
  { id: 'youtube', label: 'YouTube', description: 'Upload Shorts & videos, and manage comments, views and likes.', color: '#FF0000', status: 'live', capabilities: ['Shorts', 'Videos', 'Comments', 'Analytics'], connect: 'youtube' },
];

export function sortedCatalogue(): CatalogueEntry[] {
  return [...CATALOGUE.filter((c) => c.status !== 'planned'), ...CATALOGUE.filter((c) => c.status === 'planned')];
}

/** The header's "Live channels" pill counts the live connectors, as in the reference (not the connected accounts). */
export const LIVE_CHANNELS = CATALOGUE.filter((c) => c.status === 'live').length;

export const STATUS_LABELS: Record<CatalogueStatus, string> = { live: 'Live', 'via-facebook': 'Via Facebook', planned: 'Pipeline' };

export const INSTAGRAM_NEEDS_FACEBOOK = 'Connect Facebook first \u2014 your Instagram Business account auto-links from your FB Page.';
export const SEARCH_PLACEHOLDER = 'Search accounts\u2026';
export const NOTIFY_LABEL = 'Notify me when it\u2019s ready';

export type TokenHealth = 'ok' | 'warn' | 'expired';
export const TOKEN_WARN_MS = 7 * 24 * 60 * 60 * 1000;

/** Google tokens (Business Profile, YouTube) renew themselves, so they are always ok; Meta tokens warn in their last 7 days. */
export function tokenHealth(expiry: string | null, platform: string, now: number): TokenHealth {
  if (!expiry || platform === 'google' || platform === 'gmb' || platform === 'youtube') return 'ok';
  const left = new Date(expiry).getTime() - now;
  if (Number.isNaN(left)) return 'ok';
  if (left < 0) return 'expired';
  return left < TOKEN_WARN_MS ? 'warn' : 'ok';
}

const belongsTo = (account: ConnectedAccount, id: string) => account.platform === id || (id === 'google' && account.platform === 'gmb');

export function accountsFor(accounts: readonly ConnectedAccount[], id: string): ConnectedAccount[] {
  return accounts.filter((a) => belongsTo(a, id));
}

export interface CardAction {
  kind: 'connect' | 'add' | 'detect' | 'notify';
  label: string;
  platform: ConnectPlatform | null;
}

export function cardAction(entry: CatalogueEntry, accounts: readonly ConnectedAccount[]): CardAction {
  if (entry.status === 'planned') return { kind: 'notify', label: NOTIFY_LABEL, platform: null };
  if (accountsFor(accounts, entry.id).length > 0) return { kind: 'add', label: 'Add another account', platform: entry.connect };
  if (entry.id === 'instagram' && accountsFor(accounts, 'facebook').length > 0) {
    return { kind: 'detect', label: 'Detect Instagram on connected Page', platform: null };
  }
  return { kind: 'connect', label: `Connect ${entry.label}`, platform: entry.connect };
}

/** Instagram with nothing to link through yet: the card shows the "Connect Facebook first" note. */
export function needsFacebookFirst(entry: CatalogueEntry, accounts: readonly ConnectedAccount[]): boolean {
  return entry.id === 'instagram' && accountsFor(accounts, 'instagram').length === 0 && accountsFor(accounts, 'facebook').length === 0;
}

export type PlatformFilter = 'all' | 'facebook' | 'instagram' | 'google' | 'youtube';

export const FILTER_OPTIONS: ReadonlyArray<{ value: PlatformFilter; label: string }> = [
  { value: 'all', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google Business' },
  { value: 'youtube', label: 'YouTube' },
];

/** The library rows for a platform filter and a search over name, id and platform. */
export function filterAccounts(accounts: readonly ConnectedAccount[], query: string, filter: PlatformFilter): ConnectedAccount[] {
  const q = query.trim().toLowerCase();
  return accounts.filter((a) => (filter === 'all' || belongsTo(a, filter))
    && (!q || `${a.accountName} ${a.accountId} ${a.platform}`.toLowerCase().includes(q)));
}

export function shortAccountId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}\u2026` : id;
}

export function connectedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', google: 'Google Business', gmb: 'Google Business',
  youtube: 'YouTube', twitter: 'X / Twitter', linkedin: 'LinkedIn',
};

export function accountPlatformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

export function libraryCountText(count: number): string {
  return `${count}/${MAX_ACCOUNTS} accounts connected. Search, filter, and manage channel access.`;
}

/** Nothing sends an email yet, so the message only confirms the interest was recorded. */
export function notifyToast(label: string): { title: string; message: string } {
  return { title: 'We\u2019ll let you know', message: `Your interest in ${label} is noted.` };
}

export function syncInstagramToast(accountName: string | null | undefined): { title: string; message: string } {
  return { title: 'Instagram linked!', message: accountName ? `Connected as ${accountName}.` : 'Account added.' };
}
