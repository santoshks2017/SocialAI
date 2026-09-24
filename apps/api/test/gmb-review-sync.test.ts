import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { pickReviewConnections, REVIEW_SYNC_INTERVAL_MS, starRating, syncGoogleReviews } from '../src/lib/gmbReviewSync.js';

const HOUR = 3_600_000;

async function googleDealer() {
  const dealer = await prisma.dealer.create({ data: { name: 'Review Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const location = `accounts/1/locations/${randomUUID()}`;
  const connection = await prisma.platformConnection.create({
    data: {
      dealer_id: dealer.id, platform: 'gmb', platform_account_id: location, access_token: 'ya29.test-token',
      token_expires_at: new Date(Date.now() + 2 * HOUR), is_connected: true,
    },
  });
  return { dealerId: dealer.id, admin, location, connection };
}

const review = (location: string, n: number, extra: Record<string, unknown> = {}) => ({
  name: `${location}/reviews/r${n}`,
  reviewer: { displayName: `Customer ${n}` },
  starRating: 'FIVE',
  comment: 'Smooth delivery, thank you!',
  createTime: '2026-09-20T08:00:00Z',
  ...extra,
});

const byPlatformId = (id: string) => prisma.inboxMessage.findUnique({ where: { platform_message_id: id } });

describe('helpers', () => {
  it('maps star ratings', () => {
    assert.equal(starRating('FIVE'), 5);
    assert.equal(starRating('ONE'), 1);
    assert.equal(starRating('STAR_RATING_UNSPECIFIED'), null);
    assert.equal(starRating(undefined), null);
  });

  it('picks live, non-mock connections not synced for 30 minutes, never-synced first', () => {
    const now = new Date('2026-09-24T10:00:00Z');
    const conn = (id: string, last: Date | null, extra: Partial<{ is_connected: boolean; access_token: string }> = {}) => ({
      id, is_connected: true, access_token: 'tok', platform_account_id: `accounts/1/locations/${id}`, last_sync_at: last, ...extra,
    });
    const picked = pickReviewConnections([
      conn('recent', new Date(now.getTime() - 10 * 60_000)),
      conn('old', new Date(now.getTime() - 2 * HOUR)),
      conn('never', null),
      conn('off', null, { is_connected: false }),
      conn('mock', null, { access_token: 'mock_google' }),
      conn('older', new Date(now.getTime() - 5 * HOUR)),
    ], now, 3);
    assert.deepEqual(picked.map((c) => c.id), ['never', 'older', 'old']);
  });
});

describe('syncGoogleReviews', () => {
  it('imports reviews with stars, replies and a verdict, and notifies once', async (t) => {
    const g = await googleDealer();
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    t.mock.method(axios, 'get', async (url: string, config: { headers: Record<string, string> }) => {
      calls.push({ url, auth: config.headers['Authorization'] });
      if (url.endsWith(`${g.location}/reviews`)) {
        return {
          data: {
            reviews: [
              review(g.location, 1, { reviewReply: { comment: 'Thank you!', updateTime: '2026-09-20T09:30:00Z' } }),
              review(g.location, 2, { starRating: 'TWO', comment: 'Delivery was late' }),
            ],
          },
        };
      }
      return { data: { reviews: [] } };
    });
    const now = new Date();

    await syncGoogleReviews(now);

    const five = await byPlatformId(`${g.location}/reviews/r1`);
    assert.deepEqual(
      [five?.platform, five?.message_type, five?.rating, five?.sentiment, five?.tag, five?.reply_text, five?.customer_name],
      ['gmb', 'review', 5, 'positive', 'general', 'Thank you!', 'Customer 1'],
    );
    assert.equal(five?.replied_at?.toISOString(), '2026-09-20T09:30:00.000Z');
    assert.equal(five?.received_at.toISOString(), '2026-09-20T08:00:00.000Z');
    assert.equal(five?.needs_classification, null);
    const two = await byPlatformId(`${g.location}/reviews/r2`);
    assert.deepEqual([two?.rating, two?.sentiment, two?.tag, two?.reply_text], [2, 'negative', 'complaint', null]);
    assert.equal(calls.find((c) => c.url.includes(g.location))?.auth, 'Bearer ya29.test-token');
    assert.equal((await prisma.notification.findMany({ where: { user_id: g.admin.id } })).length, 1);
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: g.connection.id } }))?.last_sync_at?.getTime(), now.getTime());

    await syncGoogleReviews(new Date(now.getTime() + 60_000));
    assert.equal(calls.filter((c) => c.url.includes(g.location)).length, 1);
  });

  it('refreshes known reviews without notifying again or touching the tag', async (t) => {
    const g = await googleDealer();
    let withReply = false;
    t.mock.method(axios, 'get', async (url: string) => (url.endsWith(`${g.location}/reviews`)
      ? { data: { reviews: [review(g.location, 1, withReply ? { reviewReply: { comment: 'Thanks a lot!', updateTime: '2026-09-21T10:00:00Z' } } : {})] } }
      : { data: { reviews: [] } }));
    const now = new Date();
    await syncGoogleReviews(now);
    const stored = await byPlatformId(`${g.location}/reviews/r1`);
    await prisma.inboxMessage.update({ where: { id: stored!.id }, data: { tag: 'lead' } });

    withReply = true;
    await syncGoogleReviews(new Date(now.getTime() + REVIEW_SYNC_INTERVAL_MS + 60_000));

    const updated = await byPlatformId(`${g.location}/reviews/r1`);
    assert.deepEqual([updated?.reply_text, updated?.tag], ['Thanks a lot!', 'lead']);
    assert.equal((await prisma.notification.findMany({ where: { user_id: g.admin.id } })).length, 1);
  });

  it('stamps the sync time and logs only the message when Google fails', async (t) => {
    const g = await googleDealer();
    t.mock.method(axios, 'get', async (url: string) => {
      if (url.includes(g.location)) throw new Error('Request failed: 403 PERMISSION_DENIED');
      return { data: { reviews: [] } };
    });
    const errors = t.mock.method(console, 'error', () => {});
    const now = new Date();

    assert.equal(await syncGoogleReviews(now), 0);

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: g.connection.id } }))?.last_sync_at?.getTime(), now.getTime());
    const logged = errors.mock.calls.map((call) => call.arguments);
    assert.ok(logged.some((args) => args.some((a) => typeof a === 'string' && a.includes('PERMISSION_DENIED'))));
    assert.ok(logged.every((args) => args.every((a) => typeof a === 'string')));
  });
});
