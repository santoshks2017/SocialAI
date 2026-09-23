import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBuckets, compactIndian, greetingFor, pipelineSegments, weekTrend } from './dashboard.js';

const now = new Date(2026, 8, 23, 12, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 8, 23 - daysAgo, hour).toISOString();

describe('greetingFor', () => {
  it('greets by time of day', () => {
    assert.equal(greetingFor(9), 'Good morning');
    assert.equal(greetingFor(13), 'Good afternoon');
    assert.equal(greetingFor(20), 'Good evening');
  });
});

describe('compactIndian', () => {
  it('uses K for thousands and L for lakhs', () => {
    assert.equal(compactIndian(950), '950');
    assert.equal(compactIndian(1500), '1.5K');
    assert.equal(compactIndian(250000), '2.5L');
  });
});

describe('buildBuckets', () => {
  it('counts posts per local day and status, oldest first', () => {
    const buckets = buildBuckets([
      { created_at: at(0), status: 'published' },
      { created_at: at(0, 11), status: 'publishing' },
      { created_at: at(0, 8), status: 'mystery' },
      { created_at: at(1), status: 'approved' },
      { created_at: at(20), status: 'draft' },
    ], 14, now);

    assert.equal(buckets.length, 14);
    assert.equal(buckets[0]!.key, '2026-9-10');
    assert.equal(buckets[13]!.key, '2026-9-23');
    const today = buckets[13]!;
    assert.deepEqual([today.total, today.byStatus.published, today.byStatus.scheduled, today.byStatus.draft], [3, 1, 1, 1]);
    assert.equal(buckets[12]!.byStatus.approved, 1);
    assert.equal(buckets.reduce((n, b) => n + b.total, 0), 4);
  });
});

describe('weekTrend', () => {
  it('compares the last 7 days with the 7 before', () => {
    const posts = [at(1), at(1), at(1), at(9)].map((created_at) => ({ created_at, status: 'draft' }));
    assert.deepEqual(weekTrend(buildBuckets(posts, 14, now)), { last7: 3, prev7: 1, delta: 2 });
    assert.equal(weekTrend(buildBuckets(posts, 7, now)), null);
    assert.equal(weekTrend(buildBuckets([], 14, now)), null);
  });
});

describe('pipelineSegments', () => {
  it('adds posts being published to Scheduled and fills missing statuses with 0', () => {
    assert.deepEqual(
      pipelineSegments({ scheduled: 2, publishing: 1, draft: 4 }).map((s) => [s.key, s.value]),
      [['published', 0], ['scheduled', 3], ['approved', 0], ['pending_approval', 0], ['draft', 4], ['failed', 0]],
    );
  });
});
