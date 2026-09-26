import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUE, FILTER_OPTIONS, INSTAGRAM_NEEDS_FACEBOOK, LIVE_CHANNELS, NOTIFY_LABEL, SEARCH_PLACEHOLDER, STATUS_LABELS, TOKEN_WARN_MS,
  accountPlatformName, accountsFor, cardAction, connectedDate, filterAccounts, libraryCountText, needsFacebookFirst, notifyToast,
  shortAccountId, sortedCatalogue, syncInstagramToast, tokenHealth, type CatalogueId, type ConnectedAccount,
} from './accounts.js';

const NOW = Date.parse('2026-09-24T10:00:00Z');
const DAY = 86_400_000;
const account = (over: Partial<ConnectedAccount>): ConnectedAccount => ({
  id: 'a1', platform: 'facebook', accountName: 'Apex Motors', accountId: '1234567890', tokenExpiry: null, createdAt: '2026-09-01T00:00:00.000Z', ...over,
});
const entry = (id: CatalogueId) => CATALOGUE.find((c) => c.id === id)!;

describe('catalogue', () => {
  it('lists live platforms first and counts three live channels', () => {
    assert.deepEqual(sortedCatalogue().map((c) => c.id), ['facebook', 'instagram', 'google', 'youtube', 'twitter', 'linkedin']);
    assert.equal(LIVE_CHANNELS, 3);
    assert.deepEqual(entry('youtube').capabilities, ['Shorts', 'Videos', 'Comments', 'Analytics']);
    assert.deepEqual(STATUS_LABELS, { live: 'Live', 'via-facebook': 'Via Facebook', planned: 'Pipeline' });
  });

  it('keeps the reference copy byte for byte', () => {
    assert.equal(INSTAGRAM_NEEDS_FACEBOOK, 'Connect Facebook first \u2014 your Instagram Business account auto-links from your FB Page.');
    assert.equal(NOTIFY_LABEL, 'Notify me when it\u2019s ready');
    assert.equal(SEARCH_PLACEHOLDER, 'Search accounts\u2026');
    assert.deepEqual(notifyToast('LinkedIn'), { title: 'We\u2019ll let you know', message: 'Your interest in LinkedIn is noted.' });
    assert.equal(libraryCountText(4), '4/30 accounts connected. Search, filter, and manage channel access.');
    assert.equal(entry('facebook').description, 'Publish posts, manage pages, and support boosted campaigns.');
  });
});

describe('token health', () => {
  const inMs = (ms: number) => new Date(NOW + ms).toISOString();

  it('flags expired Meta tokens and warns in their last 7 days', () => {
    assert.equal(tokenHealth(inMs(-1000), 'facebook', NOW), 'expired');
    assert.equal(tokenHealth(inMs(TOKEN_WARN_MS - DAY), 'instagram', NOW), 'warn');
    assert.equal(tokenHealth(inMs(TOKEN_WARN_MS + DAY), 'facebook', NOW), 'ok');
    assert.equal(tokenHealth(null, 'facebook', NOW), 'ok');
  });

  it('never warns for Google tokens, which renew themselves', () => {
    for (const platform of ['google', 'gmb', 'youtube']) assert.equal(tokenHealth(inMs(-DAY), platform, NOW), 'ok');
  });
});

describe('card actions', () => {
  it('connects, adds another account, detects Instagram or asks to be notified', () => {
    const fb = account({ id: 'f1' });
    assert.deepEqual(cardAction(entry('facebook'), []), { kind: 'connect', label: 'Connect Facebook', platform: 'facebook' });
    assert.deepEqual(cardAction(entry('facebook'), [fb]), { kind: 'add', label: 'Add another account', platform: 'facebook' });
    assert.deepEqual(cardAction(entry('google'), []), { kind: 'connect', label: 'Connect Google Business', platform: 'gmb' });
    assert.deepEqual(cardAction(entry('youtube'), [account({ platform: 'youtube' })]), { kind: 'add', label: 'Add another account', platform: 'youtube' });
    assert.deepEqual(cardAction(entry('instagram'), [fb]), { kind: 'detect', label: 'Detect Instagram on connected Page', platform: null });
    assert.deepEqual(cardAction(entry('instagram'), []), { kind: 'connect', label: 'Connect Instagram', platform: 'facebook' });
    assert.deepEqual(cardAction(entry('linkedin'), [fb]), { kind: 'notify', label: NOTIFY_LABEL, platform: null });
  });

  it('asks for Facebook first only while neither Instagram nor Facebook is connected', () => {
    assert.equal(needsFacebookFirst(entry('instagram'), []), true);
    assert.equal(needsFacebookFirst(entry('instagram'), [account({})]), false);
    assert.equal(needsFacebookFirst(entry('instagram'), [account({ platform: 'instagram' })]), false);
    assert.equal(needsFacebookFirst(entry('facebook'), []), false);
  });
});

describe('library', () => {
  const list = [
    account({ id: '1', platform: 'facebook', accountName: 'Apex Motors', accountId: 'page-111' }),
    account({ id: '2', platform: 'google', accountName: 'Apex Bandra', accountId: 'accounts/1/locations/2' }),
    account({ id: '3', platform: 'youtube', accountName: 'Apex TV', accountId: 'UC-apex' }),
  ];

  it('filters by platform and searches name, id and platform', () => {
    assert.deepEqual(filterAccounts(list, '', 'google').map((a) => a.id), ['2']);
    assert.deepEqual(filterAccounts(list, 'apex t', 'all').map((a) => a.id), ['3']);
    assert.deepEqual(filterAccounts(list, 'LOCATIONS/2', 'all').map((a) => a.id), ['2']);
    assert.deepEqual(filterAccounts(list, 'youtube', 'all').map((a) => a.id), ['3']);
    assert.equal(filterAccounts([account({ platform: 'gmb' })], '', 'google').length, 1);
    assert.deepEqual(FILTER_OPTIONS.map((o) => o.label), ['All platforms', 'Facebook', 'Instagram', 'Google Business', 'YouTube']);
    assert.deepEqual(accountsFor(list, 'google').map((a) => a.id), ['2']);
  });

  it('shortens long ids, names platforms and formats dates', () => {
    assert.equal(shortAccountId('accounts/1234567890/locations/1'), 'accounts/1234567\u2026');
    assert.equal(shortAccountId('page-111'), 'page-111');
    assert.equal(accountPlatformName('google'), 'Google Business');
    assert.equal(accountPlatformName('youtube'), 'YouTube');
    assert.match(connectedDate('2026-09-24T10:00:00.000Z'), /2026/);
    assert.equal(connectedDate('not a date'), '');
    assert.deepEqual(syncInstagramToast('@apexmotors'), { title: 'Instagram linked!', message: 'Connected as @apexmotors.' });
    assert.equal(syncInstagramToast(null).message, 'Account added.');
  });
});
