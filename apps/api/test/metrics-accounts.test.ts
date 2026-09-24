import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { snapshotId, syncFollowerSnapshots, utcDay } from '../src/lib/followerSync.js';
import { addMetrics, syncPostMetrics } from '../src/lib/metricsSync.js';
import { totalReach } from '../src/lib/postMetrics.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const AT = '2026-09-20T10:00:00.000Z';
type StoredMetrics = Record<string, Record<string, unknown> | undefined>;

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Sum Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

const connect = (dealerId: string, platform: string, accountId: string, token: string, created = new Date()) => prisma.platformConnection.create({
  data: {
    dealer_id: dealerId, platform, platform_account_id: accountId, access_token: token, is_connected: true, created_at: created,
    // Google tokens refresh when stale; a valid one keeps these tests off the token endpoint.
    ...(platform === 'youtube' ? { refresh_token: '1//r', token_expires_at: new Date(Date.now() + HOUR) } : {}),
  },
});

const published = (dealerId: string, platforms: string[], results: Record<string, unknown>, metrics?: Record<string, unknown>) => prisma.post.create({
  data: {
    dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms, status: 'published',
    published_at: new Date(Date.now() - DAY), publish_results: results, ...(metrics ? { metrics } : {}),
  },
});

const account = (postId: string) => ({ account_name: 'Page', post_id: postId, url: 'u', published_at: AT });
const fbInsights = (reach: number, likes: number) => ({
  data: { insights: { data: [{ name: 'post_reach', values: [{ value: reach }] }] }, likes: { summary: { total_count: likes } }, shares: { count: 0 }, comments: { summary: { total_count: 0 } } },
});
const metricsOf = async (id: string) => (await prisma.post.findUnique({ where: { id } }))?.metrics as StoredMetrics;

describe('post metrics across accounts', () => {
  it('adds numbers key by key', () => {
    assert.deepEqual(addMetrics({ reach: 1, likes: 2 }, { reach: 3, shares: 4 }), { reach: 4, likes: 2, shares: 4 });
  });

  it('sums a platform over its accounts, each read with its own token', async (t) => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', `pa-${randomUUID()}`, 'token-a');
    const b = await connect(dealerId, 'facebook', `pb-${randomUUID()}`, 'token-b');
    const post = await published(dealerId, ['facebook'], { facebook: { ...account('fa-1'), accounts: { [a.id]: account('fa-1'), [b.id]: account('fb-2') } } });
    const tokens: Record<string, string> = {};
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      const id = url.split('/').at(-1) ?? '';
      tokens[id] = config.params['access_token'] ?? '';
      if (id === 'fa-1') return fbInsights(100, 10);
      if (id === 'fb-2') return fbInsights(50, 5);
      throw new Error(`unexpected GET ${url}`);
    });

    await syncPostMetrics(new Date());

    const metrics = await metricsOf(post.id);
    assert.deepEqual([metrics['facebook']?.['reach'], metrics['facebook']?.['likes']], [150, 15]);
    assert.deepEqual(tokens, { 'fa-1': 'token-a', 'fb-2': 'token-b' });
  });

  it('reads a result written before accounts with the primary account', async (t) => {
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', `old-${randomUUID()}`, 'token-old', new Date('2026-09-01T00:00:00Z'));
    await connect(dealerId, 'facebook', `new-${randomUUID()}`, 'token-new', new Date('2026-09-02T00:00:00Z'));
    await published(dealerId, ['facebook'], { facebook: account('legacy-1') });
    const tokens: string[] = [];
    t.mock.method(axios, 'get', async (_url: string, config: { params: Record<string, string> }) => {
      tokens.push(config.params['access_token'] ?? '');
      return fbInsights(10, 1);
    });

    await syncPostMetrics(new Date());

    assert.deepEqual(tokens, ['token-old']);
  });

  it('keeps the previous numbers when one account fails', async (t) => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', `pa-${randomUUID()}`, 'token-a');
    const b = await connect(dealerId, 'facebook', `pb-${randomUUID()}`, 'token-b');
    const post = await published(
      dealerId, ['facebook'],
      { facebook: { ...account('ok-1'), accounts: { [a.id]: account('ok-1'), [b.id]: account('down-2') } } },
      { facebook: { reach: 42 } },
    );
    t.mock.method(axios, 'get', async (url: string) => {
      if (url.endsWith('/ok-1')) return fbInsights(100, 10);
      throw new Error('(#100) Unsupported get request');
    });
    t.mock.method(console, 'error', () => {});

    await syncPostMetrics(new Date());

    assert.equal((await metricsOf(post.id))['facebook']?.['reach'], 42);
  });

  it('reads YouTube views, likes and comments with a Bearer token', async (t) => {
    const dealerId = await newDealer();
    const channel = await connect(dealerId, 'youtube', 'UC-apex', 'ya29.yt');
    const post = await published(dealerId, ['youtube'], { youtube: { ...account('vid-1'), accounts: { [channel.id]: account('vid-1') } } });
    const seen: Array<{ url: string; params: Record<string, string>; auth: string }> = [];
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string>; headers: Record<string, string> }) => {
      seen.push({ url, params: config.params, auth: config.headers['Authorization'] ?? '' });
      return { data: { items: [{ statistics: { viewCount: '1200', likeCount: '40', commentCount: '6' } }] } };
    });

    await syncPostMetrics(new Date());

    const metrics = await metricsOf(post.id);
    const yt = metrics['youtube'];
    assert.deepEqual([yt?.['views'], yt?.['reach'], yt?.['likes'], yt?.['comments']], [1200, 1200, 40, 6]);
    assert.equal(totalReach(metrics), 1200);
    assert.deepEqual(seen, [{ url: 'https://www.googleapis.com/youtube/v3/videos', params: { part: 'statistics', id: 'vid-1' }, auth: 'Bearer ya29.yt' }]);
  });
});

describe('follower snapshots across accounts', () => {
  it('sums a platform over its accounts and snapshots YouTube subscribers', async (t) => {
    // Connections from the tests above would otherwise take the batch's slots.
    await prisma.platformConnection.deleteMany({ where: { platform: { in: ['facebook', 'instagram', 'youtube'] } } });
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'fpage-1', 'token-1');
    await connect(dealerId, 'facebook', 'fpage-2', 'token-2');
    await connect(dealerId, 'youtube', 'UC-subs', 'ya29.subs');
    const hidden = await newDealer();
    await connect(hidden, 'youtube', 'UC-hidden', 'ya29.hidden');
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      if (url.endsWith('/fpage-1')) return { data: { fan_count: 1500 } };
      if (url.endsWith('/fpage-2')) return { data: { followers_count: 300 } };
      if (url === 'https://www.googleapis.com/youtube/v3/channels') {
        return config.params['id'] === 'UC-subs'
          ? { data: { items: [{ statistics: { subscriberCount: '820', hiddenSubscriberCount: false } }] } }
          : { data: { items: [{ statistics: { hiddenSubscriberCount: true } }] } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    assert.equal(await syncFollowerSnapshots(now), 2);

    const day = utcDay(now);
    const followers = async (d: string, platform: string) =>
      (await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(d, platform, day) } }))?.followers ?? null;
    assert.deepEqual([await followers(dealerId, 'facebook'), await followers(dealerId, 'youtube'), await followers(hidden, 'youtube')], [1800, 820, null]);
  });

  it('saves nothing for a platform until every one of its live accounts answers, then retries and sums', async (t) => {
    await prisma.platformConnection.deleteMany({ where: { platform: { in: ['facebook', 'instagram', 'youtube'] } } });
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'fpartial-1', 'token-1');
    await connect(dealerId, 'facebook', 'fpartial-2', 'token-2');
    const now = new Date();
    t.mock.method(axios, 'get', async (url: string) => {
      if (url.endsWith('/fpartial-1')) return { data: { fan_count: 1000 } };
      throw new Error('down');
    });
    t.mock.method(console, 'error', () => {});

    assert.equal(await syncFollowerSnapshots(now), 0);
    const day = utcDay(now);
    assert.equal(await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'facebook', day) } }), null);

    t.mock.method(axios, 'get', async (url: string) => {
      if (url.endsWith('/fpartial-1')) return { data: { fan_count: 1000 } };
      if (url.endsWith('/fpartial-2')) return { data: { fan_count: 500 } };
      throw new Error(`unexpected GET ${url}`);
    });

    assert.equal(await syncFollowerSnapshots(new Date(now.getTime() + 1000)), 1);
    const snap = await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'facebook', day) } });
    assert.equal(snap?.followers, 1500);
  });

  it('excludes an expired-token account from the requirement and the sum', async (t) => {
    await prisma.platformConnection.deleteMany({ where: { platform: { in: ['facebook', 'instagram', 'youtube'] } } });
    const dealerId = await newDealer();
    const now = new Date();
    const live = await connect(dealerId, 'youtube', 'yt-live', 'ya29.live');
    await prisma.platformConnection.update({ where: { id: live.id }, data: { token_expires_at: new Date(now.getTime() + HOUR) } });
    const expired = await connect(dealerId, 'youtube', 'yt-expired', 'ya29.expired');
    await prisma.platformConnection.update({ where: { id: expired.id }, data: { token_expires_at: new Date(now.getTime() - HOUR) } });
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      if (url === 'https://www.googleapis.com/youtube/v3/channels' && config.params['id'] === 'yt-live') {
        return { data: { items: [{ statistics: { subscriberCount: '400', hiddenSubscriberCount: false } }] } };
      }
      throw new Error(`unexpected GET ${url} ${JSON.stringify(config.params)}`);
    });

    assert.equal(await syncFollowerSnapshots(now), 1);
    const day = utcDay(now);
    const snap = await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'youtube', day) } });
    assert.equal(snap?.followers, 400);
  });
});
