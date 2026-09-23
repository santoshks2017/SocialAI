import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { approvalRemark, firstCreative, metricTotals, pageList, parsePostTab, platformResults, postMediaLink, postThumbnail, postTimeline, toLocalInput } from './posts.js';

describe('parsePostTab', () => {
  it('accepts known statuses and falls back to all', () => {
    assert.equal(parsePostTab('pending_approval'), 'pending_approval');
    assert.equal(parsePostTab('publishing'), 'publishing');
    assert.equal(parsePostTab('bogus'), 'all');
    assert.equal(parsePostTab(null), 'all');
  });
});

describe('firstCreative', () => {
  it('finds the first URL in objects, arrays and strings', () => {
    assert.equal(firstCreative({ facebook: '', instagram: 'https://x.test/ig.jpg' }), 'https://x.test/ig.jpg');
    assert.equal(firstCreative(['', 'https://x.test/a.jpg']), 'https://x.test/a.jpg');
    assert.equal(firstCreative({ gmb: ['https://x.test/g.jpg'] }), 'https://x.test/g.jpg');
    assert.equal(firstCreative('https://x.test/s.jpg'), 'https://x.test/s.jpg');
    assert.equal(firstCreative(null), null);
    assert.equal(firstCreative({}), null);
  });
});

describe('postTimeline', () => {
  it('describes scheduled, published and other posts', () => {
    assert.match(postTimeline({ status: 'scheduled', created_at: '2026-09-01T10:00:00Z', scheduled_at: '2026-09-25T10:00:00Z' }), /^Scheduled for 25 Sep/);
    assert.match(postTimeline({ status: 'published', created_at: '2026-09-01T10:00:00Z', published_at: '2026-09-20T10:00:00Z' }), /^Published 20 Sep/);
    assert.match(postTimeline({ status: 'draft', created_at: '2026-09-01T10:00:00Z' }), /^Created 1 Sep\S* 2026$/);
    assert.match(postTimeline({ status: 'scheduled', created_at: '2026-09-01T10:00:00Z', scheduled_at: null }), /^Created /);
  });
});

describe('approvalRemark', () => {
  it('shows a rejection reason on drafts and a note on posts approved in-app only when there is one', () => {
    assert.deepEqual(approvalRemark({ status: 'draft', approval_decision: 'rejected', approver_note: ' Fix price ' }), { kind: 'rejected', text: 'Fix price' });
    assert.deepEqual(approvalRemark({ status: 'approved', approval_decision: 'approved', approver_note: 'Nice', approved_by: 'user-1' }), { kind: 'note', text: 'Nice' });
    assert.equal(approvalRemark({ status: 'draft', approval_decision: 'approved', approver_note: 'Nice' }), null);
    assert.equal(approvalRemark({ status: 'published', approval_decision: 'approved', approver_note: 'Nice' }), null);
    assert.equal(approvalRemark({ status: 'approved', approval_decision: 'approved', approver_note: '  ', approved_by: 'user-1' }), null);
  });

  it('shows a link callout for a post approved through the review link, with or without a note', () => {
    assert.deepEqual(
      approvalRemark({ status: 'approved', approval_decision: 'approved', approver_note: 'Looks great', approved_by: null }),
      { kind: 'link', text: 'Looks great' },
    );
    assert.deepEqual(
      approvalRemark({ status: 'approved', approval_decision: 'approved', approver_note: null, approved_by: null }),
      { kind: 'link', text: '' },
    );
    assert.deepEqual(
      approvalRemark({ status: 'approved', approval_decision: 'approved' }),
      { kind: 'link', text: '' },
    );
  });
});

describe('pageList', () => {
  it('lists every page up to 7, otherwise first, last and neighbours', () => {
    assert.deepEqual(pageList(1, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageList(1, 10), [1, 2, '...', 10]);
    assert.deepEqual(pageList(5, 10), [1, '...', 4, 5, 6, '...', 10]);
    assert.deepEqual(pageList(10, 10), [1, '...', 9, 10]);
  });
});

describe('toLocalInput', () => {
  it('formats a date for a datetime-local input in local time', () => {
    assert.equal(toLocalInput(new Date(2026, 8, 25, 15, 30)), '2026-09-25T15:30');
  });
});

describe('platformResults', () => {
  it('lists per-platform results and hides internal keys', () => {
    assert.deepEqual(platformResults({
      facebook: { post_id: '1', url: 'https://fb.test/1' },
      instagram: { error: 'Token expired' },
      _approval: { note: 'x' },
    }), [
      { platform: 'facebook', url: 'https://fb.test/1' },
      { platform: 'instagram', error: 'Token expired' },
    ]);
    assert.deepEqual(platformResults(null), []);
  });
});

describe('metricTotals', () => {
  it('sums per-platform metrics and accepts flat ones', () => {
    assert.deepEqual(metricTotals({ facebook: { reach: 100, likes: 5 }, instagram: { reach: 50, comments: 2 } }), { reach: 150, likes: 5, comments: 2 });
    assert.deepEqual(metricTotals({ reach: 7, likes: 1, comments: 0 }), { reach: 7, likes: 1, comments: 0 });
    assert.deepEqual(metricTotals(undefined), { reach: 0, likes: 0, comments: 0 });
  });
});

describe('post media', () => {
  it('uses a reel’s thumbnail and video, else the first creative', () => {
    const reel = { media_type: 'video', thumbnail_url: 'https://cdn.test/r.jpg', video_url: 'https://cdn.test/r.mp4', creative_urls: {} };
    const image = { media_type: 'image', creative_urls: { facebook: 'https://cdn.test/a.jpg' } };
    assert.equal(postThumbnail(reel), 'https://cdn.test/r.jpg');
    assert.equal(postMediaLink(reel), 'https://cdn.test/r.mp4');
    assert.equal(postThumbnail(image), 'https://cdn.test/a.jpg');
    assert.equal(postMediaLink(image), 'https://cdn.test/a.jpg');
    assert.equal(postThumbnail({ creative_urls: null }), null);
    assert.equal(postThumbnail({ media_type: 'video', thumbnail_url: null }), null);
  });
});
