import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountHealth, accountLine, connectedPlatformCount, platformRows, type PlatformAccount } from './settingsPlatforms.js';

const NOW = new Date('2026-09-24T10:00:00Z');
const DAY = 86_400_000;
const account = (over: Partial<PlatformAccount>): PlatformAccount => ({
  id: over.id ?? 'a1', platform: 'facebook', accountName: 'Sharma Motors', accountId: '123', tokenExpiry: null, createdAt: '2026-09-01T00:00:00Z', ...over,
});

describe('platform accounts on the Settings tab', () => {
  it('flags an expired Meta token and counts days left', () => {
    assert.deepEqual(accountHealth(account({ tokenExpiry: new Date(NOW.getTime() - DAY).toISOString() }), NOW), { expired: true, daysLeft: 0 });
    assert.deepEqual(accountHealth(account({ tokenExpiry: new Date(NOW.getTime() + 2.5 * DAY).toISOString() }), NOW), { expired: false, daysLeft: 3 });
    assert.deepEqual(accountHealth(account({ tokenExpiry: null }), NOW), { expired: false, daysLeft: null });
  });

  it('treats Google and YouTube tokens as always healthy (they refresh)', () => {
    const past = new Date(NOW.getTime() - DAY).toISOString();
    assert.deepEqual(accountHealth(account({ platform: 'google', tokenExpiry: past }), NOW), { expired: false, daysLeft: null });
    assert.deepEqual(accountHealth(account({ platform: 'youtube', tokenExpiry: past }), NOW), { expired: false, daysLeft: null });
  });

  it('groups accounts into the four rows, several per platform', () => {
    const rows = platformRows([
      account({ id: 'fb1' }),
      account({ id: 'fb2', accountName: 'Sharma Motors Pune', tokenExpiry: new Date(NOW.getTime() - DAY).toISOString() }),
      account({ id: 'g1', platform: 'gmb', accountName: 'Sharma Motors, MG Road' }),
      account({ id: 'x1', platform: 'twitter' }),
    ], NOW);
    assert.deepEqual(rows.map((r) => [r.id, r.label, r.status, r.accounts.map((a) => a.id)]), [
      ['facebook', 'Facebook Page', 'expired', ['fb1', 'fb2']],
      ['instagram', 'Instagram Business', 'disconnected', []],
      ['google', 'Google My Business', 'connected', ['g1']],
      ['youtube', 'YouTube Channel', 'disconnected', []],
    ]);
    assert.equal(connectedPlatformCount(rows), 2);
    assert.deepEqual(rows.map((r) => r.connect), ['facebook', 'facebook', 'gmb', 'youtube']);
  });

  it('adds the days left to the account line', () => {
    const [row] = platformRows([account({ tokenExpiry: new Date(NOW.getTime() + 5 * DAY).toISOString() })], NOW);
    assert.equal(accountLine(row!.accounts[0]!), 'Sharma Motors · token expires in 5 days');
    const [one] = platformRows([account({ tokenExpiry: new Date(NOW.getTime() + DAY / 2).toISOString() })], NOW);
    assert.equal(accountLine(one!.accounts[0]!), 'Sharma Motors · token expires in 1 day');
    const [none] = platformRows([account({})], NOW);
    assert.equal(accountLine(none!.accounts[0]!), 'Sharma Motors');
  });
});
