import { createHash } from 'node:crypto';
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { ACCOUNT_PLATFORMS, MAX_CONNECTED_ACCOUNTS, platformLabel, primaryConnection } from './connections.js';
import { guardedWriteGroup } from './guardedWrite.js';
import { notify } from './notifications.js';

export interface ConnectionInput {
  platform: string;
  platform_account_id: string;
  platform_account_name: string | null;
  access_token: string;
  /** undefined keeps the stored refresh token (Google leaves it out on a reconnect); null clears it. */
  refresh_token?: string | null | undefined;
  token_expires_at: Date | null;
}

export type SaveOutcome = { status: 'saved'; connection: PlatformConnection } | { status: 'limit' };

/**
 * A stable id for (dealerId, platform, platformAccountId), so two concurrent saves of the same new
 * account collide on `create` (Firestore's `code: 'P2002'`) instead of the adapter's unenforced
 * compound-unique key letting both through as separate rows. `pc_` plus the first 32 hex chars of
 * the sha256 of the three fields, newline-joined.
 */
export function connectionDocId(dealerId: string, platform: string, platformAccountId: string): string {
  const hash = createHash('sha256').update(`${dealerId}\n${platform}\n${platformAccountId}`).digest('hex');
  return `pc_${hash.slice(0, 32)}`;
}

function findAccount(dealerId: string, input: Pick<ConnectionInput, 'platform' | 'platform_account_id'>) {
  return prisma.platformConnection.findUnique({
    where: {
      dealer_id_platform_platform_account_id: {
        dealer_id: dealerId,
        platform: input.platform,
        platform_account_id: input.platform_account_id,
      },
    },
  });
}

/** `asNewest` restamps `created_at`, so a returning account sorts after the platform's other accounts. */
async function writeAccount(
  dealerId: string,
  input: ConnectionInput,
  existing: PlatformConnection | null,
  asNewest: boolean,
): Promise<PlatformConnection> {
  const data = {
    platform_account_name: input.platform_account_name,
    access_token: input.access_token,
    token_expires_at: input.token_expires_at,
    is_connected: true,
    ...(input.refresh_token !== undefined ? { refresh_token: input.refresh_token } : {}),
    ...(asNewest ? { created_at: new Date() } : {}),
  };
  // A row found by the compound fields is updated in place; its id stays whatever it already is.
  if (existing) return prisma.platformConnection.update({ where: { id: existing.id }, data });

  // A new row gets a deterministic id, so a duplicate `create` (a concurrent save of the same new
  // account) collides instead of producing a second row for the same (dealer, platform, account).
  const id = connectionDocId(dealerId, input.platform, input.platform_account_id);
  try {
    return await prisma.platformConnection.create({
      data: {
        id,
        dealer_id: dealerId,
        platform: input.platform,
        platform_account_id: input.platform_account_id,
        ...data,
        refresh_token: input.refresh_token ?? null,
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: string } | null)?.code !== 'P2002') throw err;
    // Lost the race: the other save's row is already there. Update it with this call's data instead.
    const row = await prisma.platformConnection.findUniqueOrThrow({ where: { id } });
    return prisma.platformConnection.update({ where: { id: row.id }, data });
  }
}

/**
 * Saves the accounts a connect flow returned, one row per account. An account that is already connected is
 * always refreshed. A new one, or one the dealer disconnected, is added only while the dealership has fewer
 * than MAX_CONNECTED_ACCOUNTS connected accounts on the Accounts page's platforms (ACCOUNT_PLATFORMS);
 * `limitReached` says some were left out.
 *
 * A connect saves every account the provider returns, so it also brings back accounts the dealer disconnected.
 * One that returns while its platform still has a connected account comes back as the newest, so it can't
 * take over as primary (the oldest connected row) and receive posts that name no account. When the platform
 * has no connected account left (e.g. reconnecting after a revoked grant), it keeps its age, so the original
 * primary returns.
 */
export async function saveConnections(
  dealerId: string,
  inputs: readonly ConnectionInput[],
): Promise<{ saved: PlatformConnection[]; limitReached: boolean }> {
  const connectedRows = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, is_connected: true } });
  const livePlatforms = new Set(connectedRows.map((c) => c.platform));
  const capped = (platform: string) => ACCOUNT_PLATFORMS.includes(platform);
  let connected = connectedRows.filter((c) => capped(c.platform)).length;
  const saved: PlatformConnection[] = [];
  const seen = new Set<string>();
  let limitReached = false;
  for (const input of inputs) {
    const key = `${input.platform}:${input.platform_account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await findAccount(dealerId, input);
    const adds = !existing?.is_connected && capped(input.platform);
    if (adds && connected >= MAX_CONNECTED_ACCOUNTS) {
      limitReached = true;
      continue;
    }
    const returning = existing !== null && !existing.is_connected;
    saved.push(await writeAccount(dealerId, input, existing, returning && livePlatforms.has(input.platform)));
    if (adds) connected++;
  }
  return { saved, limitReached };
}

export async function saveConnection(dealerId: string, input: ConnectionInput): Promise<SaveOutcome> {
  const { saved } = await saveConnections(dealerId, [input]);
  const [connection] = saved;
  return connection ? { status: 'saved', connection } : { status: 'limit' };
}

/** Distinct platforms with a connected account: Google Business Profile counts once, however many locations. */
export async function connectedPlatformCount(dealerId: string): Promise<number> {
  const rows = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, is_connected: true } });
  return new Set(rows.map((r) => r.platform)).size;
}

/** The ids that are this dealership's own accounts (connected or not), in the order given. */
export async function ownConnectionIds(dealerId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const mine = new Set((await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } })).map((c) => c.id));
  return ids.filter((id) => mine.has(id));
}

/** The account a reply goes out from: the one that received the message while it is connected, else the platform's primary. */
export async function replyConnection(
  dealerId: string,
  message: { platform: string; connection_id?: string | null },
): Promise<PlatformConnection | null> {
  const conns = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, platform: message.platform } });
  const receiving = message.connection_id ? conns.find((c) => c.id === message.connection_id && c.is_connected) : undefined;
  return receiving ?? primaryConnection(conns, message.platform);
}

/**
 * Google answered invalid_grant for this account's refresh token: access was revoked, or the token expired.
 * Every location or channel of one Google sign-in shares that token, so this soft-disconnects the account and
 * the dealership's other connected accounts on it in one step, then tells the team once (bell, linking to
 * Accounts). Nothing happens when the account is already disconnected or has since been reconnected with a
 * new token. Returns whether this call disconnected it.
 */
export async function disconnectRevokedConnection(connectionId: string, revokedRefreshToken: string): Promise<boolean> {
  const conn = await prisma.platformConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return false;
  const siblings = (await prisma.platformConnection.findMany({ where: { dealer_id: conn.dealer_id, is_connected: true } }))
    .filter((c) => c.id !== conn.id && c.refresh_token === revokedRefreshToken)
    .map((c) => c.id);
  const flipped = await guardedWriteGroup(
    'platform_connections',
    prisma.platformConnection,
    conn.id,
    siblings,
    (doc) => doc['is_connected'] !== false && doc['refresh_token'] === revokedRefreshToken,
    { is_connected: false },
  );
  if (flipped.length === 0) return false;

  const label = platformLabel(conn.platform);
  await notify({
    dealerId: conn.dealer_id,
    type: 'platform_disconnected',
    title: `${label} disconnected`,
    body: flipped.length > 1
      ? `${flipped.length} ${label} accounts need reconnecting \u2014 access was revoked or expired.`
      : `${conn.platform_account_name || label} needs reconnecting \u2014 access was revoked or expired.`,
    link: '/accounts',
  });
  return true;
}
