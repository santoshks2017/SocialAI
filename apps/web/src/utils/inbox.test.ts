import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiPlatform, appendPage, avgRatingFor, canTurnIntoPost, DEFAULT_FILTERS, displayPlatform, draftFromSuggestions, filterMessages, iconPlatform,
  inboxStats, initials, markAllDescription, mergeFirstPage, nextInboxPage, platformCounts, quickActionFilters, REVIEW_REQUEST_PROMPT,
  selectDraftOption, sentimentCounts, toInboxItem, toneLabel, typeCounts, unreadByPlatform, weeklyPlatformCounts, type ApiInboxMessage,
} from './inbox.js';

const NOW = Date.parse('2026-09-24T10:00:00Z');
const DAY = 86_400_000;

const api = (over: Partial<ApiInboxMessage>): ApiInboxMessage => ({
  id: 'm1', dealerId: 'd1', platform: 'facebook', messageType: 'comment', platformMessageId: 'p1',
  customerName: 'Ravi Kumar', messageText: 'Price of Creta?', isRead: false, requiresApproval: false,
  receivedAt: new Date(NOW - DAY).toISOString(), ...over,
});

describe('toInboxItem', () => {
  it('maps API messages for display', () => {
    const item = toInboxItem(api({
      platform: 'gmb', messageType: 'review', rating: 5, repliedAt: '2026-09-23T11:00:00Z',
      replies: [{ id: 'm1-reply', text: 'Thanks!', createdAt: '2026-09-23T11:00:00Z', isDealerOwn: true }],
    }));
    assert.equal(item.platform, 'google');
    assert.equal(item.type, 'review');
    assert.equal(item.customerInitials, 'RK');
    assert.equal(item.sentiment, 'neutral');
    assert.equal(item.tag, 'general');
    assert.equal(item.responded, true);
    assert.equal(item.rating, 5);
    assert.deepEqual(item.replies.map((r) => [r.id, r.text]), [['m1-reply', 'Thanks!']]);
    assert.ok(item.replies[0]!.timestamp.length > 0);
    assert.ok(item.timestamp.length > 0);
    assert.equal(toInboxItem(api({ repliedAt: undefined })).responded, false);
  });

  it('maps platforms between the API, the page and PlatformIcon', () => {
    assert.equal(displayPlatform('gmb'), 'google');
    assert.equal(displayPlatform('email'), 'email');
    assert.equal(displayPlatform('whatever'), 'email');
    assert.equal(apiPlatform('google'), 'gmb');
    assert.equal(apiPlatform('instagram'), 'instagram');
    assert.equal(iconPlatform('google'), 'gmb');
    assert.equal(iconPlatform('email'), null);
    assert.equal(initials('  asha  '), 'A');
    assert.equal(initials(''), '?');
  });
});

describe('stats and counts', () => {
  const items = [
    toInboxItem(api({ id: 'a', platform: 'gmb', messageType: 'review', rating: 5, isRead: true, repliedAt: '2026-09-23T11:00:00Z', sentiment: 'positive' })),
    toInboxItem(api({ id: 'b', platform: 'gmb', messageType: 'review', rating: 2, isRead: true, sentiment: 'negative' })),
    toInboxItem(api({ id: 'c', platform: 'facebook', messageType: 'comment', receivedAt: new Date(NOW - 10 * DAY).toISOString() })),
    toInboxItem(api({ id: 'd', platform: 'instagram', messageType: 'dm' })),
  ];

  it('counts replies from repliedAt, not from reading', () => {
    assert.deepEqual(inboxStats(items), { total: 4, unread: 2, replied: 1, pending: 3, avgRating: 3.5, responseRate: 25 });
    assert.deepEqual(inboxStats([]), { total: 0, unread: 0, replied: 0, pending: 0, avgRating: 0, responseRate: 0 });
  });

  it('leaves spam out of the response rate and pending replies', () => {
    const spam = toInboxItem(api({ id: 's', tag: 'spam' }));
    assert.deepEqual(inboxStats([...items, spam]), { total: 5, unread: 3, replied: 1, pending: 3, avgRating: 3.5, responseRate: 25 });
    assert.deepEqual(inboxStats([spam]), { total: 1, unread: 1, replied: 0, pending: 0, avgRating: 0, responseRate: 0 });
  });

  it('counts types, platforms, sentiment and this week', () => {
    assert.deepEqual(typeCounts(items), { review: 2, comment: 1, dm: 1 });
    assert.deepEqual(platformCounts(items), { google: 2, facebook: 1, instagram: 1, youtube: 0, email: 0 });
    assert.deepEqual(weeklyPlatformCounts(items, NOW), { google: 2, facebook: 0, instagram: 1, youtube: 0, email: 0 });
    assert.deepEqual(unreadByPlatform(items), { google: 0, facebook: 1, instagram: 1, youtube: 0, email: 0 });
    assert.deepEqual(sentimentCounts(items), { positive: 1, neutral: 2, negative: 1 });
    assert.equal(avgRatingFor(items, 'google'), 3.5);
    assert.equal(avgRatingFor(items, 'facebook'), 0);
  });
});

describe('filters and quick actions', () => {
  const items = [
    toInboxItem(api({ id: 'a', platform: 'gmb', messageType: 'review', sentiment: 'positive', customerName: 'Asha', messageText: 'Lovely' })),
    toInboxItem(api({ id: 'b', platform: 'gmb', messageType: 'review', sentiment: 'positive', repliedAt: '2026-09-23T11:00:00Z' })),
    toInboxItem(api({ id: 'c', platform: 'facebook', messageType: 'comment', sentiment: 'negative', messageText: 'Delivery DELAYED' })),
  ];
  const ids = (list: Array<{ id: string }>) => list.map((i) => i.id);

  it('filters by search, type, platform, sentiment and status', () => {
    assert.deepEqual(ids(filterMessages(items, DEFAULT_FILTERS)), ['a', 'b', 'c']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, search: 'delayed' })), ['c']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, search: 'asha' })), ['a']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, platform: 'facebook' })), ['c']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, status: 'responded' })), ['b']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, type: 'comment', sentiment: 'negative' })), ['c']);
  });

  it('turns quick actions into filters', () => {
    assert.deepEqual(ids(filterMessages(items, quickActionFilters('reply-positive'))), ['a']);
    assert.deepEqual(ids(filterMessages(items, quickActionFilters('flag-complaints'))), ['c']);
    assert.ok(REVIEW_REQUEST_PROMPT.length > 10);
  });
});

describe('labels and drafts', () => {
  it('names the reply tone', () => {
    assert.equal(toneLabel('positive'), 'POSITIVE TONE');
    assert.equal(toneLabel('negative'), 'RECOVERY TONE');
    assert.equal(toneLabel('neutral'), 'NEUTRAL TONE');
  });

  it('keeps AI options and the chosen one', () => {
    const draft = draftFromSuggestions([' First ', '', 'Second']);
    assert.deepEqual(draft, { options: ['First', 'Second'], index: 0, text: 'First', editing: false });
    assert.deepEqual(selectDraftOption({ ...draft, editing: true }, 1), { options: ['First', 'Second'], index: 1, text: 'Second', editing: false });
    assert.equal(selectDraftOption(draft, 5), draft);
  });

  it('words the mark-all dialog and offers posts for good reviews only', () => {
    assert.equal(markAllDescription(1), 'This will mark all 1 unread message as read.');
    assert.equal(markAllDescription(3), 'This will mark all 3 unread messages as read.');
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'review', rating: 4 }))), true);
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'review', rating: 3 }))), false);
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'comment', rating: 5 }))), false);
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'review', rating: 5, tag: 'spam' }))), false);
  });
});

describe('paging', () => {
  const item = (id: string, over: Partial<ApiInboxMessage> = {}) => toInboxItem(api({ id, ...over }));
  const ids = (list: Array<{ id: string }>) => list.map((i) => i.id);

  it('asks for the page after the loaded messages', () => {
    assert.equal(nextInboxPage(50, 50), 2);
    assert.equal(nextInboxPage(53, 50), 2);
    assert.equal(nextInboxPage(100, 50), 3);
    assert.equal(nextInboxPage(0, 50), 1);
  });

  it('appends an older page once per message, keeping what is on screen', () => {
    const current = [item('a'), item('b', { isRead: true })];
    const merged = appendPage(current, [item('b'), item('c')]);
    assert.deepEqual(ids(merged), ['a', 'b', 'c']);
    assert.equal(merged[1]!.isRead, true);
  });

  it('refreshes the first page without dropping older pages', () => {
    const current = [item('b'), item('c'), item('old1'), item('old2')];
    const merged = mergeFirstPage(current, [item('new'), item('b', { isRead: true }), item('c')]);
    assert.deepEqual(ids(merged), ['new', 'b', 'c', 'old1', 'old2']);
    assert.equal(merged[1]!.isRead, true);
  });

  it('keeps a reply sent here until the server reports it', () => {
    const replied = item('a', { repliedAt: '2026-09-24T09:00:00Z' });
    const stale = item('a');
    assert.equal(mergeFirstPage([replied], [stale], new Set(['a']))[0]!.responded, true);
    assert.equal(mergeFirstPage([replied], [stale])[0]!.responded, false);
  });
});
