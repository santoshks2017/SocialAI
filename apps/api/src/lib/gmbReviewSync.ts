import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchGmbReviews, type GmbReview } from '../services/gmb.js';
import { classifyFromRating } from './inboxClassifier.js';
import { ingestInboxMessage } from './inboxIngest.js';
import { isMockConnection } from './platformMock.js';
import { resolveAccessToken } from './publishDirect.js';

export const REVIEW_SYNC_BATCH = 3;
export const REVIEW_SYNC_INTERVAL_MS = 30 * 60 * 1000;

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function starRating(value: unknown): number | null {
  return typeof value === 'string' ? STARS[value] ?? null : null;
}

type SyncCandidate = Pick<PlatformConnection, 'is_connected' | 'access_token' | 'platform_account_id' | 'last_sync_at'>;

/** Live Google connections not synced in the last 30 minutes, never-synced and then oldest first. */
export function pickReviewConnections<T extends SyncCandidate>(conns: T[], now: Date, limit = REVIEW_SYNC_BATCH): T[] {
  const due = now.getTime() - REVIEW_SYNC_INTERVAL_MS;
  return conns
    .filter((c) => c.is_connected && !isMockConnection(c) && (!c.last_sync_at || c.last_sync_at.getTime() <= due))
    .sort((a, b) => (a.last_sync_at?.getTime() ?? 0) - (b.last_sync_at?.getTime() ?? 0))
    .slice(0, limit);
}

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Review sync needs a location ("accounts/{a}/locations/{l}"); an account alone has no reviews to list. */
export function isGoogleLocation(accountId: string): boolean {
  return accountId.includes('/locations/');
}

async function importReview(conn: PlatformConnection, review: GmbReview, initialImport: boolean): Promise<boolean> {
  const rating = starRating(review.starRating);
  const verdict = rating ? classifyFromRating(rating) : null;
  const receivedAt = validDate(review.createTime);
  const repliedAt = validDate(review.reviewReply?.updateTime);
  const { created } = await ingestInboxMessage({
    dealer_id: conn.dealer_id,
    platform: 'gmb',
    message_type: 'review',
    platform_message_id: review.name,
    message_text: review.comment ?? '',
    customer_name: review.reviewer?.displayName,
    rating,
    ...(receivedAt ? { received_at: receivedAt } : {}),
    ...(review.reviewReply?.comment ? { reply_text: review.reviewReply.comment, ...(repliedAt ? { replied_at: repliedAt } : {}) } : {}),
    ...(verdict ? { sentiment: verdict.sentiment, tag: verdict.tag } : {}),
  }, { initialImport });
  return created;
}

async function stamp(conn: PlatformConnection, now: Date): Promise<boolean> {
  try {
    await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
    return true;
  } catch (err) {
    console.error(`[reviews] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Cron step: brings Google reviews into the inbox for up to 3 due connections (first page, newest reviews).
 * Each connection is claimed (last_sync_at stamped) before Google is called, so a failing or hanging one
 * waits its turn instead of being picked first every tick. A connection's first sync brings its history in
 * as read, without notifications; later new reviews notify the team (coalesced). Accounts without a location
 * are skipped quietly. Returns how many reviews were new.
 */
export async function syncGoogleReviews(now: Date): Promise<number> {
  const conns = pickReviewConnections(await prisma.platformConnection.findMany({ where: { platform: 'gmb' } }), now);
  let created = 0;
  for (const conn of conns) {
    const firstSync = !conn.last_sync_at;
    if (!(await stamp(conn, now))) continue;
    if (!isGoogleLocation(conn.platform_account_id)) continue;
    try {
      const token = await resolveAccessToken(conn);
      const { reviews } = await fetchGmbReviews(conn.platform_account_id, token);
      for (const review of reviews) {
        if (review.name && (await importReview(conn, review, firstSync))) created++;
      }
    } catch (err) {
      console.error(`[reviews] Google review sync failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return created;
}
