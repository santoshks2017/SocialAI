import type { PlatformConnection } from '../generated/client/index.js';

// A dealership can connect several accounts per platform: Facebook Pages, Instagram accounts, Google Business
// Profile locations (stored as `gmb`) and YouTube channels. A platform's primary account is its oldest connected
// row. A post goes to the accounts it names in Post.connection_ids, otherwise to each platform's primary.

export const MAX_CONNECTED_ACCOUNTS = 30;
export const ACCOUNT_LIMIT_MESSAGE = `Account limit reached (${MAX_CONNECTED_ACCOUNTS}). Disconnect an account to add another.`;

/** Platforms GET /v1/platform-accounts lists; stored `gmb` is shown as `google`. */
export const ACCOUNT_PLATFORMS: readonly string[] = ['facebook', 'instagram', 'gmb', 'youtube'];

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  gmb: 'Google Business Profile',
  youtube: 'YouTube',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export type ConnectionRef = Pick<PlatformConnection, 'id' | 'platform' | 'is_connected' | 'created_at'>;

/** Oldest first; a tie goes to the smaller id. */
export function byAge(a: Pick<ConnectionRef, 'id' | 'created_at'>, b: Pick<ConnectionRef, 'id' | 'created_at'>): number {
  const diff = a.created_at.getTime() - b.created_at.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The platform's primary account: its oldest connected row. */
export function primaryConnection<T extends ConnectionRef>(conns: readonly T[], platform: string): T | null {
  return conns.filter((c) => c.platform === platform && c.is_connected).sort(byAge)[0] ?? null;
}

export function noConnectedAccountMessage(platform: string): string {
  return `No connected ${platformLabel(platform)} account. Connect it in Settings, then publish again.`;
}

export function selectedAccountGoneMessage(platform: string): string {
  return `The selected ${platformLabel(platform)} account is no longer connected. Reconnect it or pick another account, then publish again.`;
}

export interface TargetPost {
  platforms: readonly string[];
  connection_ids?: readonly string[] | null | undefined;
}

export interface PlatformTargets<T> {
  platform: string;
  /** Connected accounts to publish to, oldest first. Empty when `error` is set. */
  targets: T[];
  error: string | null;
}

/**
 * Where each platform of a post goes. `conns` are all of the dealership's rows, connected or not.
 * - The post names accounts of this platform: those still connected; none left is an error.
 * - It names none: the primary account; no connected account is the "No connected ... account" error.
 */
export function resolveTargets<T extends ConnectionRef>(post: TargetPost, conns: readonly T[]): Array<PlatformTargets<T>> {
  const named = new Set(post.connection_ids ?? []);
  return post.platforms.map((platform) => {
    const chosen = conns.filter((c) => c.platform === platform && named.has(c.id));
    if (chosen.length > 0) {
      const live = chosen.filter((c) => c.is_connected).sort(byAge);
      return live.length > 0
        ? { platform, targets: live, error: null }
        : { platform, targets: [], error: selectedAccountGoneMessage(platform) };
    }
    const primary = primaryConnection(conns, platform);
    return primary
      ? { platform, targets: [primary], error: null }
      : { platform, targets: [], error: noConnectedAccountMessage(platform) };
  });
}

export const CONNECTION_IDS_MESSAGE = `connectionIds must be a list of up to ${MAX_CONNECTED_ACCOUNTS} account ids`;

/** A post's target account ids from a request body: distinct non-empty strings, at most 30; null when invalid. */
export function parseConnectionIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CONNECTED_ACCOUNTS) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)) return null;
  return [...new Set(value as string[])];
}
