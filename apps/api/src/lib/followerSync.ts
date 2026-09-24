import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchInstagramFollowers, fetchPageFollowers } from '../services/meta.js';
import { isMockConnection } from './platformMock.js';
import { resolveAccessToken } from './publishDirect.js';

export const FOLLOWER_BATCH = 5;
export const FOLLOWER_TTL_DAYS = 400;
const FOLLOWER_PLATFORMS = ['facebook', 'instagram'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day, YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function snapshotId(dealerId: string, platform: string, day: string): string {
  return `${dealerId}_${platform}_${day}`;
}

/**
 * Cron step: today's follower count for up to 5 live Facebook/Instagram connections that have none yet.
 * Uses the connection's own (page) token. Each attempt first claims the connection (stamps last_sync_at),
 * and the least recently tried go first, so a failing or hanging connection cannot starve the others.
 * Returns snapshots saved.
 */
export async function syncFollowerSnapshots(now: Date): Promise<number> {
  const day = utcDay(now);
  const live = (await prisma.platformConnection.findMany({ where: { platform: { in: FOLLOWER_PLATFORMS } } }))
    .filter((c) => c.is_connected && !isMockConnection(c));
  if (live.length === 0) return 0;

  const idOf = (c: PlatformConnection) => snapshotId(c.dealer_id, c.platform, day);
  const taken = new Set((await prisma.followerSnapshot.findMany({ where: { id: { in: live.map(idOf) } } })).map((s) => s.id));
  const due = live
    .filter((c) => !taken.has(idOf(c)))
    .sort((a, b) => (a.last_sync_at?.getTime() ?? 0) - (b.last_sync_at?.getTime() ?? 0))
    .slice(0, FOLLOWER_BATCH);

  let saved = 0;
  for (const conn of due) {
    try {
      await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
    } catch (err) {
      console.error(`[followers] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
      continue;
    }
    try {
      const token = await resolveAccessToken(conn);
      const followers = conn.platform === 'facebook'
        ? await fetchPageFollowers(conn.platform_account_id, token)
        : await fetchInstagramFollowers(conn.platform_account_id, token);
      if (followers !== null) {
        const id = idOf(conn);
        await prisma.followerSnapshot.upsert({
          where: { id },
          create: {
            id, dealer_id: conn.dealer_id, platform: conn.platform, followers, captured_on: day,
            expires_at: new Date(now.getTime() + FOLLOWER_TTL_DAYS * DAY_MS),
          },
          update: { followers },
        });
        saved++;
      }
    } catch (err) {
      console.error(`[followers] ${conn.platform} follower count failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return saved;
}
