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

async function importReview(conn: PlatformConnection, review: GmbReview): Promise<boolean> {
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
  });
  return created;
}

/**
 * Cron step: brings Google reviews into the inbox for up to 3 due connections (first page, newest reviews).
 * New reviews notify the team (coalesced). last_sync_at is stamped even when Google fails, so a broken
 * connection waits its turn instead of blocking the others. Returns how many reviews were new.
 */
export async function syncGoogleReviews(now: Date): Promise<number> {
  const conns = pickReviewConnections(await prisma.platformConnection.findMany({ where: { platform: 'gmb' } }), now);
  let created = 0;
  for (const conn of conns) {
    try {
      const token = await resolveAccessToken(conn);
      const { reviews } = await fetchGmbReviews(conn.platform_account_id, token);
      for (const review of reviews) {
        if (review.name && (await importReview(conn, review))) created++;
      }
    } catch (err) {
      console.error(`[reviews] Google review sync failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
    } finally {
      try {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
      } catch (err) {
        console.error(`[reviews] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
  return created;
}
