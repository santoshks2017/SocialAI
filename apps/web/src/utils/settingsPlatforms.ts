// Settings → Platforms: one row per platform, listing that platform's connected accounts
// (GET /v1/platform-accounts, several accounts per platform since Stage E1).

import { accountsFor, tokenHealth, type ConnectedAccount } from './accounts.js';

export type AccountPlatform = 'facebook' | 'instagram' | 'google' | 'youtube';
export type ConnectTarget = 'facebook' | 'gmb' | 'youtube';
export type RowStatus = 'connected' | 'expired' | 'disconnected';

/** A GET /v1/platform-accounts row — E1's ConnectedAccount, reused rather than redefined. */
export type PlatformAccount = ConnectedAccount;

export interface PlatformRowDef {
  id: AccountPlatform;
  label: string;
  icon: 'facebook' | 'instagram' | 'gmb' | 'youtube';
  /** Instagram connects through Facebook: its Business account links from the Facebook Page. */
  connect: ConnectTarget;
}

export const PLATFORM_ROWS: readonly PlatformRowDef[] = [
  { id: 'facebook', label: 'Facebook Page', icon: 'facebook', connect: 'facebook' },
  { id: 'instagram', label: 'Instagram Business', icon: 'instagram', connect: 'facebook' },
  { id: 'google', label: 'Google My Business', icon: 'gmb', connect: 'gmb' },
  { id: 'youtube', label: 'YouTube Channel', icon: 'youtube', connect: 'youtube' },
];

const DAY_MS = 86_400_000;

export interface AccountHealth {
  expired: boolean;
  /** Whole days until a Meta token expires; null unless E1's tokenHealth reports 'warn' (its 7-day rule). */
  daysLeft: number | null;
}

/** Built on E1's tokenHealth: Google/YouTube tokens refresh themselves and are always healthy;
 * a Meta token only carries a day count in its 7-day warn window, per the Platforms tab's brief. */
export function accountHealth(account: Pick<PlatformAccount, 'platform' | 'tokenExpiry'>, now: Date): AccountHealth {
  const status = tokenHealth(account.tokenExpiry, account.platform, now.getTime());
  if (status === 'expired') return { expired: true, daysLeft: 0 };
  if (status === 'ok' || !account.tokenExpiry) return { expired: false, daysLeft: null };
  const ms = new Date(account.tokenExpiry).getTime() - now.getTime();
  return { expired: false, daysLeft: Math.ceil(ms / DAY_MS) };
}

export interface PlatformRow extends PlatformRowDef {
  status: RowStatus;
  accounts: Array<PlatformAccount & AccountHealth>;
}

export function platformRows(accounts: readonly PlatformAccount[], now: Date): PlatformRow[] {
  return PLATFORM_ROWS.map((def) => {
    const mine = accountsFor(accounts, def.id).map((a) => ({ ...a, ...accountHealth(a, now) }));
    const status: RowStatus = mine.length === 0 ? 'disconnected' : mine.some((a) => a.expired) ? 'expired' : 'connected';
    return { ...def, status, accounts: mine };
  });
}

export function connectedPlatformCount(rows: readonly PlatformRow[]): number {
  return rows.filter((row) => row.status !== 'disconnected').length;
}

export function accountLine(account: PlatformAccount & AccountHealth): string {
  if (account.expired || account.daysLeft === null) return account.accountName;
  return `${account.accountName} · token expires in ${account.daysLeft} day${account.daysLeft === 1 ? '' : 's'}`;
}
