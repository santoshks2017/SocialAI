import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { FirestoreCollection, isUsingMemoryStore, setQueryPushdown } from '../src/db/firestore.js';

const uid = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const ids = (docs: Array<{ id: string }>) => docs.map((d) => d.id);
const sortedIds = (docs: Array<{ id: string }>) => ids(docs).sort();

function makeDealer(extra: Record<string, unknown> = {}) {
  return prisma.dealer.create({ data: { name: uid('Dealer'), city: 'Pune', phone: uid('phone'), ...extra } });
}

function makePost(dealer_id: string, extra: Record<string, unknown> = {}) {
  return prisma.post.create({ data: { dealer_id, prompt_text: 'prompt', platforms: ['facebook'], ...extra } });
}

before(() => {
  assert.equal(isUsingMemoryStore(), true, 'tests must never reach real Firestore');
});

describe('DateTime fields', () => {
  it('come back as Date objects from create and every read path', async () => {
    const dealer = await makeDealer({ plan_expires_at: '2026-01-02T03:04:05.000Z' });
    assert.ok(dealer.created_at instanceof Date);
    assert.ok(dealer.updated_at instanceof Date);
    assert.equal(dealer.plan_expires_at!.toISOString(), '2026-01-02T03:04:05.000Z');

    const unique = await prisma.dealer.findUnique({ where: { id: dealer.id } });
    const [listed] = await prisma.dealer.findMany({ where: { id: dealer.id } });
    const first = await prisma.dealer.findFirst({ where: { phone: dealer.phone } });
    for (const doc of [unique, listed, first]) {
      assert.ok(doc!.created_at instanceof Date);
      assert.ok(doc!.plan_expires_at instanceof Date);
    }
    const updated = await prisma.dealer.update({ where: { id: dealer.id }, data: { plan_expires_at: new Date('2027-01-01T00:00:00Z') } });
    assert.equal(updated.plan_expires_at!.toISOString(), '2027-01-01T00:00:00.000Z');
  });

  it('converts ISO strings stored by older code, and returns Json dates as strings', async () => {
    const raw = new FirestoreCollection('dealers'); // schemaless view of the same collection
    const id = uid('legacy');
    await raw.create({
      data: {
        id, name: 'Legacy', city: 'X', phone: uid('p'),
        created_at: '2024-05-06T07:08:09.000Z',
        brands: { synced_at: new Date('2024-01-01T00:00:00Z') },
      },
    });
    const legacy = await prisma.dealer.findUnique({ where: { id } });
    assert.ok(legacy!.created_at instanceof Date);
    assert.equal(legacy!.created_at.toISOString(), '2024-05-06T07:08:09.000Z');
    assert.deepEqual(legacy!.brands, { synced_at: '2024-01-01T00:00:00.000Z' });
    assert.equal(await prisma.dealer.count({ where: { id, created_at: { lt: new Date('2025-01-01') } } }), 1);
  });

  it('accepts Date or ISO string bounds in filters and rejects invalid date input', async () => {
    const dealer = await makeDealer();
    await makePost(dealer.id, { scheduled_at: new Date('2026-03-01T10:00:00Z') });
    assert.equal(await prisma.post.count({ where: { dealer_id: dealer.id, scheduled_at: { gte: '2026-03-01T00:00:00Z' } } }), 1);
    assert.equal(await prisma.post.count({ where: { dealer_id: dealer.id, scheduled_at: new Date('2026-03-01T10:00:00Z') } }), 1);
    await assert.rejects(makeDealer({ plan_expires_at: 'not a date' }), /Invalid DateTime/);
  });
});

describe('where filters', () => {
  let dealerId: string;
  let p1: any;
  let p2: any;
  let p3: any;
  const find = async (where: Record<string, unknown>) => sortedIds(await prisma.post.findMany({ where: { dealer_id: dealerId, ...where } }));

  before(async () => {
    dealerId = (await makeDealer()).id;
    p1 = await makePost(dealerId, {
      status: 'scheduled', scheduled_at: new Date('2026-01-10'), caption_text: 'Diwali Offer on SUVs',
      caption_hashtags: ['diwali', 'suv'], selected_variant_index: 1,
    });
    p2 = await makePost(dealerId, { status: 'draft', caption_hashtags: ['sale'], selected_variant_index: 2 });
    p3 = await makePost(dealerId, {
      status: 'published', scheduled_at: new Date('2026-01-20'), caption_text: 'new arrivals', caption_hashtags: [],
    });
  });

  it('applies every operator in one field filter', async () => {
    assert.deepEqual(await find({ scheduled_at: { gte: new Date('2026-01-05'), lt: new Date('2026-01-15') } }), [p1.id]);
    assert.deepEqual(await find({ caption_text: { startsWith: 'Diwali', endsWith: 'SUVs' } }), [p1.id]);
    assert.deepEqual(await find({ caption_text: { startsWith: 'Diwali', endsWith: 'nope' } }), []);
  });

  it('never matches null or missing fields with range, not, in or string operators', async () => {
    assert.deepEqual(await find({ scheduled_at: { lt: new Date('2026-01-15') } }), [p1.id]);
    assert.deepEqual(await find({ caption_text: { not: 'new arrivals' } }), [p1.id]);
    assert.deepEqual(await find({ selected_variant_index: { not: 1 } }), [p2.id]);
    assert.deepEqual(await find({ caption_text: { contains: 'x' } }), []);
    assert.deepEqual(await find({ NOT: { caption_text: { contains: 'Diwali' } } }), [p3.id]);
  });

  it('matches missing fields with null', async () => {
    assert.deepEqual(await find({ caption_text: null }), [p2.id]);
    assert.deepEqual(await find({ scheduled_at: { equals: null } }), [p2.id]);
    assert.deepEqual(await find({ scheduled_at: { not: null } }), [p1.id, p3.id].sort());
  });

  it('supports mode insensitive on equals and contains', async () => {
    assert.deepEqual(await find({ status: { equals: 'SCHEDULED', mode: 'insensitive' } }), [p1.id]);
    assert.deepEqual(await find({ caption_text: { contains: 'offer', mode: 'insensitive' } }), [p1.id]);
    assert.deepEqual(await find({ caption_text: { contains: 'offer' } }), []);
  });

  it('supports in, notIn and nested not', async () => {
    assert.deepEqual(await find({ status: { in: ['draft', 'published'] } }), [p2.id, p3.id].sort());
    assert.deepEqual(await find({ status: { notIn: ['draft'] } }), [p1.id, p3.id].sort());
    assert.deepEqual(await find({ status: { not: { in: ['draft'] } } }), [p1.id, p3.id].sort());
    assert.deepEqual(await find({ status: { in: [] } }), []);
  });

  it('supports scalar list operators', async () => {
    assert.deepEqual(await find({ caption_hashtags: { has: 'suv' } }), [p1.id]);
    assert.deepEqual(await find({ caption_hashtags: { hasSome: ['sale', 'suv'] } }), [p1.id, p2.id].sort());
    assert.deepEqual(await find({ caption_hashtags: { hasEvery: ['diwali', 'suv'] } }), [p1.id]);
    assert.deepEqual(await find({ caption_hashtags: { isEmpty: true } }), [p3.id]);
  });

  it('combines AND, OR and NOT', async () => {
    assert.deepEqual(await find({ OR: [{ status: 'published' }, { selected_variant_index: { gte: 2 } }] }), [p2.id, p3.id].sort());
    assert.deepEqual(await find({ AND: [{ status: { not: 'draft' } }, { scheduled_at: { gt: new Date('2026-01-15') } }] }), [p3.id]);
    assert.deepEqual(await find({ NOT: [{ status: 'draft' }, { status: 'published' }] }), [p1.id]);
    assert.deepEqual(await find({ OR: [] }), []);
  });

  it('throws on operators it does not implement instead of matching everything', async () => {
    await assert.rejects(prisma.post.findMany({ where: { status: { regex: 'x' } } }), /Unsupported filter operator 'regex'/);
    await assert.rejects(prisma.dealer.findMany({ where: { posts: { any: {} } } }), /Unsupported filter on relation 'posts'/);
  });
});

describe('relation filters', () => {
  it('filters through to-one and to-many relations', async () => {
    const phone = uid('phone');
    const a = await makeDealer({ phone });
    const b = await makeDealer();
    await prisma.inspirationHandle.create({ data: { dealer_id: a.id, platform: 'facebook', handle_url: 'https://fb/a' } });
    await prisma.inspirationHandle.create({ data: { dealer_id: b.id, platform: 'facebook', handle_url: 'https://fb/b' } });
    const handles = await prisma.inspirationHandle.findMany({ where: { dealer: { phone } } });
    assert.deepEqual(handles.map((h: any) => h.dealer_id), [a.id]);
    assert.equal((await prisma.inspirationHandle.findMany({ where: { dealer: { is: { phone: 'nobody' } } } })).length, 0);

    await makePost(a.id, { status: 'published' });
    await makePost(a.id, { status: 'draft' });
    await makePost(b.id, { status: 'published' });
    const scope = { id: { in: [a.id, b.id] } };
    const where = (posts: unknown) => prisma.dealer.findMany({ where: { ...scope, posts } });
    assert.deepEqual(sortedIds(await where({ some: { status: 'published' } })), [a.id, b.id].sort());
    assert.deepEqual(ids(await where({ none: { status: 'draft' } })), [b.id]);
    assert.deepEqual(ids(await where({ every: { status: 'published' } })), [b.id]);
  });

  it('handles optional relations on either side', async () => {
    const withSub = await makeDealer();
    const without = await makeDealer();
    await prisma.subscription.create({ data: { dealer_id: withSub.id, planId: 'plan_growth_monthly', status: 'active' } });
    const scope = { id: { in: [withSub.id, without.id] } };
    assert.deepEqual(ids(await prisma.dealer.findMany({ where: { ...scope, subscription: { is: { status: 'active' } } } })), [withSub.id]);
    assert.deepEqual(ids(await prisma.dealer.findMany({ where: { ...scope, subscription: null } })), [without.id]);
    assert.deepEqual(ids(await prisma.dealer.findMany({ where: { ...scope, subscription: { isNot: null } } })), [withSub.id]);

    const owner = await prisma.dealerUser.create({ data: { phone: uid('owner'), role: 'owner' } });
    const member = await prisma.dealerUser.create({ data: { phone: uid('member'), dealer_id: withSub.id } });
    const userScope = { id: { in: [owner.id, member.id] } };
    assert.deepEqual(ids(await prisma.dealerUser.findMany({ where: { ...userScope, dealer: null } })), [owner.id]);
    assert.deepEqual(ids(await prisma.dealerUser.findMany({ where: { ...userScope, dealer: { isNot: null } } })), [member.id]);
  });
});

describe('orderBy', () => {
  it('sorts by every key in array and object form', async () => {
    const category = uid('cat');
    const rows = [
      { text_en: 'a', usage_count: 5, sort_order: 2 },
      { text_en: 'b', usage_count: 9, sort_order: 1 },
      { text_en: 'c', usage_count: 5, sort_order: 1 },
      { text_en: 'd', usage_count: 0, sort_order: 0 },
    ];
    for (const r of rows) await prisma.prompt.create({ data: { category, ...r } });
    const texts = (list: any[]) => list.map((p) => p.text_en);
    assert.deepEqual(texts(await prisma.prompt.findMany({ where: { category }, orderBy: [{ usage_count: 'desc' }, { sort_order: 'asc' }] })), ['b', 'c', 'a', 'd']);
    assert.deepEqual(texts(await prisma.prompt.findMany({ where: { category }, orderBy: { usage_count: 'desc', sort_order: 'asc' } })), ['b', 'c', 'a', 'd']);
    assert.deepEqual(texts(await prisma.prompt.findMany({ where: { category }, orderBy: [{ usage_count: 'asc' }, { sort_order: 'desc' }], take: 3 })), ['d', 'a', 'c']);
  });

  it('puts nulls last for asc and first for desc, like Postgres', async () => {
    const dealer = await makeDealer();
    const early = await makePost(dealer.id, { scheduled_at: new Date('2026-01-01') });
    const none = await makePost(dealer.id);
    const late = await makePost(dealer.id, { scheduled_at: new Date('2026-02-01') });
    const order = async (orderBy: unknown) => ids(await prisma.post.findMany({ where: { dealer_id: dealer.id }, orderBy: orderBy as any }));
    assert.deepEqual(await order({ scheduled_at: 'asc' }), [early.id, late.id, none.id]);
    assert.deepEqual(await order({ scheduled_at: 'desc' }), [none.id, late.id, early.id]);
    assert.deepEqual(await order({ scheduled_at: { sort: 'asc', nulls: 'first' } }), [none.id, early.id, late.id]);
    assert.deepEqual(await order([{ scheduled_at: 'asc' }, { created_at: 'asc' }]), [early.id, late.id, none.id]);
  });
});

describe('unique lookups', () => {
  it('returns null instead of the first document when the selector is undefined', async () => {
    await makeDealer();
    assert.equal(await prisma.dealer.findUnique({ where: { id: undefined } as any }), null);
    assert.equal(await prisma.dealer.findUnique({ where: {} }), null);
    assert.equal(
      await prisma.platformConnection.findUnique({ where: { dealer_id_platform: { dealer_id: undefined, platform: 'facebook' } } as any }),
      null,
    );
  });

  it('never updates or deletes an arbitrary record for an undefined id', async () => {
    const dealer = await makeDealer();
    await assert.rejects(prisma.dealer.update({ where: { id: undefined } as any, data: { name: 'hijacked' } }), { code: 'P2025' });
    await assert.rejects(prisma.dealer.delete({ where: { id: undefined } as any }), { code: 'P2025' });
    assert.equal((await prisma.dealer.findUnique({ where: { id: dealer.id } }))!.name, dealer.name);
  });
});

describe('schema defaults', () => {
  it('fills literal, now() and uuid() defaults on create', async () => {
    const dealer = await makeDealer();
    assert.match(dealer.id, /^[0-9a-f-]{36}$/);
    assert.equal(dealer.plan, 'starter');
    assert.equal(dealer.font, 'Arial');
    assert.equal(dealer.onboarding_step, 1);
    assert.equal(dealer.onboarding_completed, false);
    assert.equal(dealer.is_active, true);
    assert.deepEqual(dealer.language_preferences, ['en']);
    assert.equal(dealer.state, null);

    const message = await prisma.inboxMessage.create({
      data: {
        dealer_id: dealer.id, platform: 'facebook', message_type: 'comment', platform_message_id: uid('m'),
        customer_name: 'C', message_text: 'hi', received_at: new Date(),
      },
    });
    assert.equal(message.is_read, false);
    assert.equal(message.requires_approval, false);

    const boost = await prisma.boostCampaign.create({ data: { dealer_id: dealer.id, post_id: 'p', daily_budget: 100, duration_days: 3 } });
    assert.equal(boost.total_spent, 0);
    assert.equal(boost.status, 'draft');
  });

  it('fills defaults in createMany and in the create branch of upsert', async () => {
    const dealer = await makeDealer();
    const base = { dealer_id: dealer.id, make: 'Tata', model: 'Nexon', year: 2024, price: 1, condition: 'new' };
    assert.deepEqual(await prisma.inventoryItem.createMany({ data: [{ ...base }, { ...base, stock_count: 4 }] }), { count: 2 });
    const items = await prisma.inventoryItem.findMany({ where: { dealer_id: dealer.id }, orderBy: { stock_count: 'asc' } });
    assert.deepEqual(items.map((i: any) => [i.stock_count, i.status, i.source]), [[1, 'in_stock', 'manual'], [4, 'in_stock', 'manual']]);

    const phone = uid('upsert');
    const created = await prisma.dealer.upsert({ where: { phone }, create: { phone, name: 'U', city: 'C' }, update: { name: 'U2' } });
    assert.equal(created.plan, 'starter');
    const updated = await prisma.dealer.upsert({ where: { phone }, create: { phone, name: 'U', city: 'C' }, update: { name: 'U2' } });
    assert.equal(updated.id, created.id);
    assert.equal(updated.name, 'U2');
  });

  it('reads defaults for fields missing from older documents, including in filters', async () => {
    const phone = uid('old');
    await new FirestoreCollection('dealers').create({ data: { name: 'Old', city: 'X', phone } });
    const old = await prisma.dealer.findFirst({ where: { phone } });
    assert.equal(old!.plan, 'starter');
    assert.equal(old!.logo_url, null);
    assert.deepEqual(old!.showroom_type, []);
    assert.equal(await prisma.dealer.count({ where: { phone, plan: 'starter' } }), 1);
  });

  it('bumps @updatedAt on update', async () => {
    const dealer = await makeDealer();
    await new Promise((r) => setTimeout(r, 5));
    const updated = await prisma.dealer.update({ where: { id: dealer.id }, data: { city: 'Goa' } });
    assert.ok(updated.updated_at.getTime() > dealer.updated_at.getTime());
    assert.equal(updated.created_at.getTime(), dealer.created_at.getTime());
  });
});

describe('include, select and _count', () => {
  let dealer: any;
  let empty: any;

  before(async () => {
    dealer = await makeDealer();
    empty = await makeDealer();
    await makePost(dealer.id, { status: 'published' });
    await makePost(dealer.id, { status: 'draft' });
    const u1 = await prisma.dealerUser.create({ data: { dealer_id: dealer.id, phone: uid('u'), name: 'Zed' } });
    await prisma.dealerUser.create({ data: { dealer_id: dealer.id, phone: uid('u'), name: 'Amy' } });
    await prisma.userSession.create({ data: { dealer_user_id: u1.id, token_hash: uid('t'), expires_at: new Date(Date.now() + 1000) } });
    await prisma.platformConnection.create({
      data: { dealer_id: dealer.id, platform: 'facebook', platform_account_id: 'pa', platform_account_name: 'Page', access_token: 't' },
    });
    await prisma.subscription.create({ data: { dealer_id: dealer.id, planId: 'plan_growth_monthly', status: 'active' } });
  });

  it('loads to-one, to-many and counts the way the admin dealer list asks for them', async () => {
    const rows = await prisma.dealer.findMany({
      where: { id: { in: [dealer.id, empty.id] } },
      include: {
        subscription: true,
        platform_connections: { select: { platform: true, platform_account_name: true, is_connected: true } },
        _count: { select: { posts: true, dealer_users: true } },
      },
      orderBy: { name: 'asc' },
    });
    const full = rows.find((r: any) => r.id === dealer.id)!;
    const bare = rows.find((r: any) => r.id === empty.id)!;
    assert.equal(full.name, dealer.name);
    assert.equal(full.subscription.status, 'active');
    assert.ok(full.subscription.createdAt instanceof Date);
    assert.deepEqual(full.platform_connections, [{ platform: 'facebook', platform_account_name: 'Page', is_connected: true }]);
    assert.deepEqual(full._count, { posts: 2, dealer_users: 2 });
    assert.equal(bare.subscription, null);
    assert.deepEqual(bare.platform_connections, []);
    assert.deepEqual(bare._count, { posts: 0, dealer_users: 0 });
  });

  it('returns only selected fields, including nested relation selects with where/orderBy/take', async () => {
    assert.deepEqual(await prisma.dealer.findUnique({ where: { id: dealer.id }, select: { name: true, city: true } }), { name: dealer.name, city: 'Pune' });
    const picked = await prisma.dealer.findUnique({
      where: { id: dealer.id },
      select: { id: true, dealer_users: { select: { name: true }, orderBy: { name: 'asc' }, take: 1 } },
    });
    assert.deepEqual(picked, { id: dealer.id, dealer_users: [{ name: 'Amy' }] });
    const published = await prisma.dealer.findUnique({ where: { id: dealer.id }, include: { posts: { where: { status: 'published' } } } });
    assert.equal(published!.posts.length, 1);
  });

  it('loads to-one relations from the foreign key side', async () => {
    const template = await prisma.autoReplyTemplate.create({ data: { dealer_id: dealer.id, name: 'Thanks', text: 'Thank you!' } });
    const withTemplate = await prisma.autoReplyRule.create({
      data: {
        dealer_id: dealer.id, platform: 'all', message_type: 'all', condition_type: 'always', condition_value: '',
        action_type: 'template', template_id: template.id,
      },
    });
    await prisma.autoReplyRule.create({
      data: { dealer_id: dealer.id, platform: 'all', message_type: 'all', condition_type: 'always', condition_value: '', action_type: 'ai' },
    });
    const rules = await prisma.autoReplyRule.findMany({ where: { dealer_id: dealer.id }, include: { template: true } });
    assert.equal(rules.length, 2);
    assert.equal(rules.find((r: any) => r.id === withTemplate.id)!.template.text, 'Thank you!');
    assert.equal(rules.find((r: any) => r.id !== withTemplate.id)!.template, null);

    const [post] = await prisma.post.findMany({ where: { dealer_id: dealer.id }, select: { id: true, dealer: { select: { name: true } } }, take: 1 });
    assert.deepEqual(post!.dealer, { name: dealer.name });
  });

  it('nests two levels deep, with _count: true', async () => {
    const found = await prisma.dealer.findUnique({
      where: { id: dealer.id },
      include: { dealer_users: { include: { sessions: true, _count: true }, orderBy: { name: 'asc' } } },
    });
    const [amy, zed] = found!.dealer_users;
    assert.deepEqual([amy.name, zed.name], ['Amy', 'Zed']);
    assert.equal(zed.sessions.length, 1);
    assert.ok(zed.sessions[0].expires_at instanceof Date);
    assert.deepEqual(zed._count, { sessions: 1, activity_logs: 0 });
    assert.deepEqual(amy.sessions, []);
  });

  it('rejects includes of fields that are not relations', async () => {
    await assert.rejects(prisma.dealer.findMany({ include: { nonsense: true } }), /not a relation/);
  });
});

describe('updates', () => {
  it('write only the given fields, so concurrent updates do not clobber each other', async () => {
    const dealer = await makeDealer();
    const post = await makePost(dealer.id, { status: 'scheduled', caption_text: 'old' });
    await Promise.all([
      prisma.post.update({ where: { id: post.id }, data: { caption_text: 'edited' } }),
      prisma.post.update({ where: { id: post.id }, data: { status: 'published' } }),
    ]);
    const after = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(after!.caption_text, 'edited');
    assert.equal(after!.status, 'published');
  });

  it('ignores undefined values and supports atomic operators', async () => {
    const dealer = await makeDealer();
    const item = await prisma.inventoryItem.create({
      data: { dealer_id: dealer.id, make: 'M', model: 'X', year: 2024, price: 10, condition: 'new', image_urls: ['a'] },
    });
    const update = (data: Record<string, unknown>) => prisma.inventoryItem.update({ where: { id: item.id }, data });
    assert.equal((await update({ stock_count: { increment: 2 }, color: undefined })).stock_count, 3);
    assert.equal((await update({ stock_count: { decrement: 1 } })).stock_count, 2);
    assert.equal((await update({ stock_count: { multiply: 3 } })).stock_count, 6);
    assert.equal((await update({ stock_count: { divide: 4 } })).stock_count, 1);
    assert.equal((await update({ price: { set: 99 } })).price, 99);
    assert.deepEqual((await update({ image_urls: { push: 'b' } })).image_urls, ['a', 'b']);
    assert.deepEqual((await update({ image_urls: { push: ['c', 'd'] } })).image_urls, ['a', 'b', 'c', 'd']);
    assert.equal((await update({ variant: null })).variant, null);
  });

  it('updateMany returns a count and leaves other fields alone', async () => {
    const dealer = await makeDealer();
    const a = await makePost(dealer.id, { caption_text: 'keep-a' });
    await makePost(dealer.id, { caption_text: 'keep-b' });
    await makePost(dealer.id, { status: 'published' });
    const result = await prisma.post.updateMany({ where: { dealer_id: dealer.id, status: 'draft' }, data: { status: 'scheduled' } });
    assert.deepEqual(result, { count: 2 });
    const after = await prisma.post.findUnique({ where: { id: a.id } });
    assert.equal(after!.status, 'scheduled');
    assert.equal(after!.caption_text, 'keep-a');
  });

  it('throws P2025 for a missing record and rejects nested relation writes', async () => {
    await assert.rejects(prisma.post.update({ where: { id: 'missing' }, data: { status: 'x' } }), { code: 'P2025' });
    await assert.rejects(prisma.post.delete({ where: { id: 'missing' } }), { code: 'P2025' });
    await assert.rejects(
      prisma.post.create({ data: { prompt_text: 'p', dealer: { connect: { id: 'x' } } } }),
      /Nested writes on relation 'dealer'/,
    );
  });
});

describe('query pushdown', () => {
  after(() => setQueryPushdown(true));

  it('returns the same results with and without narrowing the backend query', async () => {
    const phone = uid('push');
    const dealer = await makeDealer({ phone });
    const other = await makeDealer();
    const p1 = await makePost(dealer.id, { status: 'scheduled', scheduled_at: new Date(Date.now() - 1000), selected_variant_index: 2 });
    const p2 = await makePost(dealer.id, { status: 'draft' });
    await makePost(dealer.id, { status: 'published', caption_text: 'Hello' });
    await makePost(other.id, { status: 'scheduled', scheduled_at: new Date(Date.now() - 1000) });

    const queries: any[] = [
      { where: { dealer_id: dealer.id } },
      { where: { dealer_id: dealer.id, status: 'scheduled' } },
      { where: { dealer_id: dealer.id, status: 'draft' } },
      { where: { status: 'scheduled', scheduled_at: { lte: new Date() } } },
      { where: { dealer_id: dealer.id, status: { in: ['draft', 'published'] } } },
      { where: { status: { in: ['draft', 'published'] } } },
      { where: { dealer_id: dealer.id, OR: [{ status: 'draft' }, { caption_text: { contains: 'hello', mode: 'insensitive' } }] } },
      { where: { dealer: { phone } } },
      { where: { dealer_id: dealer.id, selected_variant_index: 2 } },
      { where: { id: p1.id } },
      { where: { id: { in: [p1.id, p2.id, 'missing'] } } },
      { where: { id: p1.id, status: 'draft' } },
      { where: { dealer_id: dealer.id }, take: 1 },
      { where: { dealer_id: dealer.id }, skip: 1, take: 1 },
      { where: { dealer_id: dealer.id }, orderBy: { status: 'desc' }, take: 2 },
      { where: { AND: [{ dealer_id: dealer.id }, { dealer_id: other.id }] } },
    ];
    for (const q of queries) {
      setQueryPushdown(true);
      const narrowed = await prisma.post.findMany(q);
      const narrowedCount = await prisma.post.count({ where: q.where });
      setQueryPushdown(false);
      const scanned = await prisma.post.findMany(q);
      const scannedCount = await prisma.post.count({ where: q.where });
      assert.deepEqual(narrowed, scanned, JSON.stringify(q));
      assert.equal(narrowedCount, scannedCount, JSON.stringify(q));
    }
  });
});

describe('$transaction', () => {
  it('supports the array and callback forms', async () => {
    const dealer = await makeDealer();
    const [a, b] = await prisma.$transaction([
      prisma.dealer.update({ where: { id: dealer.id }, data: { city: 'Delhi' } }),
      prisma.post.create({ data: { dealer_id: dealer.id, prompt_text: 'tx' } }),
    ]);
    assert.equal(a.city, 'Delhi');
    assert.equal(b.status, 'draft');
    const count = await prisma.$transaction((tx) => tx.post.count({ where: { dealer_id: dealer.id } }));
    assert.equal(count, 1);
  });
});
