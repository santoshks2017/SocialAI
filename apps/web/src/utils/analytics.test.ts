import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  captionEventFor, costPerLead, emptyPerformance, engagementRate, formatDuration, formatINR, formatPercent, metricParts,
  monthLabel, platformAbbrev, platformName, relativeWidth, responseRateColor, signed, sortPosts, topPlatform, topPosts, topPostsEmptyCopy, topPostsSubtitle, type PostMetric,
} from './analytics.js';

const post = (id: string, over: Partial<PostMetric> = {}): PostMetric => ({
  ...emptyPerformance().totals, id, caption: id, platforms: ['facebook'], thumbnail: null, publishedAt: null, ...over,
});

describe('rates and platforms', () => {
  it('computes and formats the engagement rate', () => {
    assert.equal(engagementRate(45, 1000), 4.5);
    assert.equal(engagementRate(1, 3), 33.3);
    assert.equal(engagementRate(5, 0), null);
    assert.equal(formatPercent(4.5), '4.5%');
    assert.equal(formatPercent(null), '—');
  });

  it('names platforms and picks the one with most reach', () => {
    assert.equal(platformName('gmb'), 'GMB');
    assert.equal(platformName('facebook'), 'Facebook');
    assert.equal(platformAbbrev('instagram'), 'IG');
    assert.equal(platformAbbrev('x'), 'X');
    const zero = emptyPerformance().totals;
    assert.deepEqual(topPlatform({ facebook: { ...zero, reach: 90 }, gmb: { ...zero, reach: 120 } }), { platform: 'gmb', reach: 120 });
    assert.equal(topPlatform({ facebook: zero }), null);
  });
});

describe('sortPosts', () => {
  it('sorts by reach, engagement or recency without changing the input', () => {
    const posts = [
      post('a', { reach: 10, engagement: 9, publishedAt: '2026-09-20T10:00:00Z' }),
      post('b', { reach: 30, engagement: 1, publishedAt: null }),
      post('c', { reach: 20, engagement: 5, publishedAt: '2026-09-22T10:00:00Z' }),
    ];
    assert.deepEqual(sortPosts(posts, 'reach').map((p) => p.id), ['b', 'c', 'a']);
    assert.deepEqual(sortPosts(posts, 'engagement').map((p) => p.id), ['a', 'c', 'b']);
    assert.deepEqual(sortPosts(posts, 'recent').map((p) => p.id), ['c', 'a', 'b']);
    assert.deepEqual(posts.map((p) => p.id), ['a', 'b', 'c']);
  });
});

describe('formatting', () => {
  it('formats money, cost per lead, durations, months and signs', () => {
    assert.equal(formatINR(150000), '₹1,50,000');
    assert.equal(costPerLead(3000, 4), 750);
    assert.equal(costPerLead(0, 4), null);
    assert.equal(costPerLead(3000, 0), null);
    assert.equal(costPerLead(null, 4), null);
    assert.equal(formatDuration(null), '—');
    assert.equal(formatDuration(45), '45m');
    assert.equal(formatDuration(90), '1.5h');
    assert.equal(formatDuration(2160), '1.5d');
    assert.equal(monthLabel(new Date(2026, 8, 24)), 'September 2026');
    assert.equal(signed(3), '+3');
    assert.equal(signed(0), '+0');
    assert.equal(signed(-2), '-2');
  });

  it('scales bars to the largest value and colours response rates', () => {
    assert.equal(relativeWidth(2, 8), 25);
    assert.equal(relativeWidth(9, 8), 100);
    assert.equal(relativeWidth(3, 0), 0);
    assert.equal(responseRateColor(85), 'bg-emerald-500');
    assert.equal(responseRateColor(60), 'bg-amber-500');
    assert.equal(responseRateColor(10), 'bg-red-500');
  });

  it('lists only the metrics that have a value, with Google views in reach, not clicks', () => {
    // Google views are already counted in reach, so Clicks are clicks only.
    const parts = metricParts({ ...emptyPerformance().totals, reach: 120, likes: 4, videoViews: 3, plays: 2, clicks: 1, views: 6, inboxMessages: 2 });
    assert.deepEqual(parts, [
      { label: 'Reach', value: 120 }, { label: 'Likes', value: 4 }, { label: 'Video views', value: 5 },
      { label: 'Clicks', value: 1 }, { label: 'Inbox', value: 2 },
    ]);
    assert.deepEqual(metricParts({ ...emptyPerformance().totals, reach: 40, views: 40 }), [{ label: 'Reach', value: 40 }]);
    assert.deepEqual(metricParts(emptyPerformance().totals), []);
  });
});

describe('top posts', () => {
  it('keeps the five best posts that reached anyone', () => {
    const posts = [post('a', { reach: 50 }), post('b', { reach: 0 }), post('c', { reach: 10 }), post('d', { reach: 9 }), post('e', { reach: 8 }), post('f', { reach: 7 }), post('g', { reach: 6 })];
    assert.deepEqual(topPosts(posts).map((p) => p.id), ['a', 'c', 'd', 'e', 'f']);
    assert.deepEqual(topPosts([post('z')]), []);
  });

  it('names the platform the ranking is for', () => {
    assert.equal(topPostsSubtitle('all'), 'Ranked by reach across all platforms');
    assert.equal(topPostsSubtitle('instagram'), 'Ranked by reach on Instagram');
    assert.equal(topPostsSubtitle('gmb'), 'Ranked by reach on GMB');
  });

  it('tells no posts yet from posts with no reach yet', () => {
    assert.deepEqual(topPostsEmptyCopy(0), {
      title: 'No published posts yet',
      body: 'Your top posts will appear here once you start publishing.',
    });
    assert.deepEqual(topPostsEmptyCopy(3), {
      title: 'No reach data yet',
      body: 'Top posts appear here once your published posts gather reach.',
    });
  });
});

describe('captionEventFor', () => {
  it('tells an accepted caption from an edited one', () => {
    assert.equal(captionEventFor(null, 'Anything'), null);
    assert.equal(captionEventFor('New Creta is here!', '  New Creta is here!\n'), 'caption.accepted');
    assert.equal(captionEventFor('New Creta is here!', 'New Creta is here! Book today.'), 'caption.edited');
  });
});
