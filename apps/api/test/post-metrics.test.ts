import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { addBags, emptyBag, isMetricPlatform, platformBag, postMetricsBags, totalReach } from '../src/lib/postMetrics.js';

describe('platformBag', () => {
  it('reads Facebook and Instagram metrics and sums engagement', () => {
    const fb = platformBag('facebook', { reach: 120, likes: 10, comments: 2, shares: 1, fetched_at: '2026-09-24T00:00:00.000Z' });
    assert.equal(fb.reach, 120);
    assert.equal(fb.engagement, 13);
    const ig = platformBag('instagram', { reach: 80, likes: 5, comments: 1, saved: 4, video_views: 30, plays: 12 });
    assert.deepEqual([ig.engagement, ig.videoViews, ig.plays], [10, 30, 12]);
  });

  it('counts Google Business Profile views as reach', () => {
    const gmb = platformBag('gmb', { views: 40, clicks: 3, direction_requests: 1 });
    assert.deepEqual([gmb.reach, gmb.views, gmb.clicks, gmb.engagement], [40, 40, 3, 0]);
  });

  it('treats missing, negative and non-numeric values as zero', () => {
    assert.deepEqual(platformBag('facebook', { reach: '120', likes: -4, comments: Number.NaN }), emptyBag());
    assert.deepEqual(platformBag('facebook', null), emptyBag());
    assert.deepEqual(platformBag('facebook', [1, 2]), emptyBag());
  });
});

describe('postMetricsBags and totalReach', () => {
  const metrics = {
    facebook: { reach: 120, likes: 10, comments: 2, shares: 1 },
    instagram: { reach: 80, likes: 5, comments: 1, saved: 4 },
    gmb: { views: 40, clicks: 3 },
    twitter: { impressions: 999 },
  };

  it('totals Facebook, Instagram and Google and ignores other keys', () => {
    const { byPlatform, total } = postMetricsBags(metrics);
    assert.deepEqual(Object.keys(byPlatform), ['facebook', 'instagram', 'gmb']);
    assert.equal(total.reach, 240);
    assert.equal(total.engagement, 23);
    assert.equal(totalReach(metrics), 240);
  });

  it('keeps one platform when filtered', () => {
    const { byPlatform, total } = postMetricsBags(metrics, 'instagram');
    assert.deepEqual(Object.keys(byPlatform), ['instagram']);
    assert.equal(total.reach, 80);
  });

  it('handles posts without metrics', () => {
    assert.equal(totalReach(null), 0);
    assert.deepEqual(postMetricsBags(undefined).byPlatform, {});
  });

  it('adds bags field by field and knows the metric platforms', () => {
    const a = { ...emptyBag(), reach: 1, likes: 2 };
    assert.deepEqual(addBags(a, a), { ...emptyBag(), reach: 2, likes: 4 });
    assert.equal(isMetricPlatform('gmb'), true);
    assert.equal(isMetricPlatform('twitter'), false);
  });
});

describe('Stage D schema', () => {
  it('maps the new models to their Firestore collections', () => {
    assert.equal(prisma.event.collectionName, 'events');
    assert.equal(prisma.followerSnapshot.collectionName, 'follower_snapshots');
  });

  it('stores review ratings, the classification flag, events and snapshots', async () => {
    const message = await prisma.inboxMessage.create({
      data: {
        dealer_id: 'd-schema', platform: 'gmb', message_type: 'review', platform_message_id: `r-${randomUUID()}`,
        customer_name: 'Asha', message_text: 'Great', received_at: new Date(), rating: 5, needs_classification: true,
      },
    });
    assert.equal(message.rating, 5);
    assert.equal(message.needs_classification, true);
    const event = await prisma.event.create({ data: { dealer_id: 'd-schema', user_id: 'u1', action: 'report.downloaded', meta: { source: 'test' } } });
    assert.deepEqual(event.meta, { source: 'test' });
    const snapshot = await prisma.followerSnapshot.create({
      data: { id: 'd-schema_facebook_2026-09-24', dealer_id: 'd-schema', platform: 'facebook', followers: 1200, captured_on: '2026-09-24' },
    });
    assert.equal(snapshot.id, 'd-schema_facebook_2026-09-24');
  });
});
