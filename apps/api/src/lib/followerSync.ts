import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchInstagramFollowers, fetchPageFollowers } from '../services/meta.js';
import { fetchYouTubeSubscribers } from '../services/youtube.js';
import { isMockConnection } from './platformMock.js';
import { resolveAccessToken } from './publishDirect.js';

export const FOLLOWER_BATCH = 5;
export const FOLLOWER_TTL_DAYS = 400;
const FOLLOWER_PLATFORMS = ['facebook', 'instagram', 'youtube'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day, YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function snapshotId(dealerId: string, platform: string, day: string): string {
  return `${dealerId}_${platform}_${day}`;
}

function fetchFollowers(conn: PlatformConnection, token: string): Promise<number | null> {
  if (conn.platform === 'facebook') return fetchPageFollowers(conn.platform_account_id, token);
  if (conn.platform === 'instagram') return fetchInstagramFollowers(conn.platform_account_id, token);
  return fetchYouTubeSubscribers(conn.platform_account_id, token);
}

// "Live" for a follower snapshot: connected, not a mock connection, and its token is not known to be expired
// (token_expires_at null or in the future). An account outside this set is skipped entirely: it neither has to
// answer for the day's snapshot to save, nor contributes to the sum.
function isLive(conn: PlatformConnection, now: Date): boolean {
  return conn.is_connected && !isMockConnection(conn) && (!conn.token_expires_at || conn.token_expires_at.getTime() > now.getTime());
}

interface FollowerGroup {
  id: string;
  dealerId: string;
  platform: string;
  conns: PlatformConnection[];
  lastTried: number;
}

/**
 * Cron step: today's audience for up to 5 dealer + platform pairs that have none yet, summed over the
 * platform's live accounts (Pages, Instagram accounts, YouTube channels), each read with its own token.
 * A pair's snapshot is saved only once every one of its live accounts answers with a count; if any of them
 * fails (or, for YouTube, hides its count), nothing is saved for that pair today, so a later run retries it.
 * Every account is claimed (last_sync_at stamped) before it is asked, and the pairs tried least recently go
 * first, so a failing or hanging account cannot starve the others. Returns snapshots saved.
 */
export async function syncFollowerSnapshots(now: Date): Promise<number> {
  const day = utcDay(now);
  const live = (await prisma.platformConnection.findMany({ where: { platform: { in: FOLLOWER_PLATFORMS } } }))
    .filter((c) => isLive(c, now));
  if (live.length === 0) return 0;

  const groups = new Map<string, FollowerGroup>();
  for (const conn of live) {
    const id = snapshotId(conn.dealer_id, conn.platform, day);
    const group = groups.get(id) ?? { id, dealerId: conn.dealer_id, platform: conn.platform, conns: [], lastTried: Number.POSITIVE_INFINITY };
    group.conns.push(conn);
    group.lastTried = Math.min(group.lastTried, conn.last_sync_at?.getTime() ?? 0);
    groups.set(id, group);
  }
  const taken = new Set((await prisma.followerSnapshot.findMany({ where: { id: { in: [...groups.keys()] } } })).map((s) => s.id));
  const due = [...groups.values()]
    .filter((g) => !taken.has(g.id))
    .sort((a, b) => a.lastTried - b.lastTried)
    .slice(0, FOLLOWER_BATCH);

  let saved = 0;
  for (const group of due) {
    let followers = 0;
    let counted = 0;
    for (const conn of group.conns) {
      try {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
      } catch (err) {
        console.error(`[followers] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
        continue;
      }
      try {
        const count = await fetchFollowers(conn, await resolveAccessToken(conn));
        if (count !== null) {
          followers += count;
          counted++;
        }
      } catch (err) {
        console.error(`[followers] ${conn.platform} follower count failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
    // Every live account of this platform must have answered; a partial sum would misreport the day's audience,
    // and leaving the snapshot unwritten lets the next run retry (the row stays out of `taken`).
    if (counted !== group.conns.length) continue;
    await prisma.followerSnapshot.upsert({
      where: { id: group.id },
      create: {
        id: group.id, dealer_id: group.dealerId, platform: group.platform, followers, captured_on: day,
        expires_at: new Date(now.getTime() + FOLLOWER_TTL_DAYS * DAY_MS),
      },
      update: { followers },
    });
    saved++;
  }
  return saved;
}
