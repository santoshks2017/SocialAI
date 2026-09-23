import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue, Timestamp, type Firestore } from '@google-cloud/firestore';
import { FirestoreCollection } from '../src/db/firestore.js';

// A minimal stand-in for the Firestore client that records what the adapter sends.

type Filter = [string, string, unknown];
type Call = [string, ...unknown[]];

class FakeDb {
  stores = new Map<string, Map<string, Record<string, any>>>();
  calls: Call[] = [];
  failures = new Map<string, Error>();

  store(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return this.stores.get(name)!;
  }

  record(kind: string, ...args: unknown[]) {
    this.calls.push([kind, ...args]);
    const err = this.failures.get(kind);
    if (err) {
      this.failures.delete(kind);
      throw err;
    }
  }

  collection(name: string) {
    return new FakeQuery(this, name, []);
  }

  async getAll(...refs: FakeRef[]) {
    this.record('getAll', refs.map((r) => r.id));
    return refs.map((r) => r.snap());
  }

  batch() {
    const ops: Array<() => Promise<void>> = [];
    const db = this;
    return {
      create: (ref: FakeRef, data: Record<string, any>) => { ops.push(() => ref.create(data)); },
      update: (ref: FakeRef, ...args: unknown[]) => { ops.push(() => ref.update(...args)); },
      delete: (ref: FakeRef) => { ops.push(() => ref.delete()); },
      async commit() {
        db.record('commit', ops.length);
        for (const op of ops) await op();
      },
    };
  }
}

class FakeQuery {
  constructor(protected db: FakeDb, protected name: string, protected filters: Filter[], protected lim?: number) {}

  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.db, this.name, [...this.filters, [field, op, value]], this.lim);
  }

  limit(n: number) {
    return new FakeQuery(this.db, this.name, this.filters, n);
  }

  doc(id: string) {
    return new FakeRef(this.db, this.name, id);
  }

  private matches() {
    let rows = [...this.db.store(this.name).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).filter(([, d]) =>
      this.filters.every(([f, op, v]) => (op === '==' ? d[f] === v : op === 'in' ? (v as unknown[]).includes(d[f]) : false)));
    if (this.lim !== undefined) rows = rows.slice(0, this.lim);
    return rows;
  }

  async get() {
    this.db.record('query', this.filters, this.lim);
    return { docs: this.matches().map(([id, d]) => ({ id, data: () => ({ ...d }) })) };
  }

  count() {
    return {
      get: async () => {
        this.db.record('count', this.filters);
        return { data: () => ({ count: this.matches().length }) };
      },
    };
  }
}

class FakeRef {
  constructor(private db: FakeDb, private name: string, readonly id: string) {}

  snap() {
    const d = this.db.store(this.name).get(this.id);
    return { id: this.id, exists: !!d, data: () => (d ? { ...d } : undefined) };
  }

  async create(data: Record<string, any>) {
    this.db.record('create', this.id, data);
    if (this.db.store(this.name).has(this.id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    this.db.store(this.name).set(this.id, { ...data });
  }

  async update(...args: unknown[]) {
    const fields: Record<string, unknown> = {};
    for (let i = 0; i < args.length; i += 2) fields[String(args[i])] = args[i + 1];
    this.db.record('update', this.id, fields);
    const current = this.db.store(this.name).get(this.id);
    if (!current) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
    for (const [k, v] of Object.entries(fields)) {
      const operand = (v as any)?.operand;
      current[k] = typeof operand === 'number' ? (current[k] ?? 0) + operand : v;
    }
  }

  async delete() {
    this.db.record('delete', this.id);
    this.db.store(this.name).delete(this.id);
  }
}

describe('Firestore backend calls', () => {
  let db: FakeDb;
  let posts: FirestoreCollection;
  const lastOf = (kind: string) => [...db.calls].reverse().find((c) => c[0] === kind);
  const kinds = () => db.calls.map((c) => c[0]);

  beforeEach(() => {
    db = new FakeDb();
    posts = new FirestoreCollection('posts', 'Post', { db: db as unknown as Firestore });
  });

  it('stores dates as Timestamps, applies defaults and drops undefined fields', async () => {
    const post = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p', scheduled_at: '2026-05-01T00:00:00.000Z', caption_text: undefined } });
    const [, id, data] = lastOf('create') as [string, string, Record<string, any>];
    assert.equal(id, post.id);
    assert.ok(data['scheduled_at'] instanceof Timestamp);
    assert.ok(data['created_at'] instanceof Timestamp);
    assert.ok(data['updated_at'] instanceof Timestamp);
    assert.equal(data['status'], 'draft');
    assert.ok(!('caption_text' in data));
    assert.ok(Object.values(data).every((v) => v !== undefined));
    assert.ok(post.scheduled_at instanceof Date);
  });

  it('pushes top-level equality filters down and keeps range filters in memory', async () => {
    const past = new Date(Date.now() - 60_000);
    await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p', status: 'scheduled', scheduled_at: past } });
    await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p', status: 'scheduled', scheduled_at: new Date(Date.now() + 60_000) } });
    await posts.create({ data: { dealer_id: 'd2', prompt_text: 'p', status: 'scheduled', scheduled_at: past } });

    const due = await posts.findMany({ where: { dealer_id: 'd1', status: 'scheduled', scheduled_at: { lte: new Date() } } });
    assert.equal(due.length, 1);
    assert.deepEqual(lastOf('query'), ['query', [['dealer_id', '==', 'd1'], ['status', '==', 'scheduled']], undefined]);

    await posts.findMany({ where: { dealer_id: 'd1', status: 'draft' } });
    assert.deepEqual(lastOf('query'), ['query', [['dealer_id', '==', 'd1']], undefined], 'default values stay in memory');

    await posts.findMany({ where: { status: { in: ['scheduled', 'published'] } } });
    assert.deepEqual(lastOf('query'), ['query', [['status', 'in', ['scheduled', 'published']]], undefined]);

    await posts.findMany({ where: { OR: [{ dealer_id: 'd1' }, { dealer_id: 'd2' }] }, orderBy: { created_at: 'desc' } });
    assert.deepEqual(lastOf('query'), ['query', [], undefined]);
  });

  it('limits exact queries, counts with an aggregation, and reads ids directly', async () => {
    const a = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p', status: 'scheduled' } });
    await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p', status: 'scheduled' } });

    assert.ok(await posts.findFirst({ where: { dealer_id: 'd1', status: 'scheduled' } }));
    assert.deepEqual(lastOf('query'), ['query', [['dealer_id', '==', 'd1'], ['status', '==', 'scheduled']], 1]);

    db.calls = [];
    assert.equal(await posts.count({ where: { dealer_id: 'd1' } }), 2);
    assert.deepEqual(kinds(), ['count']);

    db.calls = [];
    assert.equal(await posts.count({ where: { dealer_id: 'd1', created_at: { gte: new Date(0) } } }), 2);
    assert.deepEqual(kinds(), ['query']);

    db.calls = [];
    assert.equal((await posts.findUnique({ where: { id: a.id } }))!.id, a.id);
    assert.deepEqual(kinds(), ['getAll']);
  });

  it('treats ids that cannot be document ids as no match instead of passing them to doc()', async () => {
    const a = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p' } });

    db.calls = [];
    for (const id of ['', 'a/b', '..', '__reserved__']) {
      assert.equal(await posts.findUnique({ where: { id } }), null);
    }
    const found = await posts.findMany({ where: { id: { in: ['a/b', a.id] } } });
    assert.deepEqual(found.map((p: { id: string }) => p.id), [a.id]);
    for (const call of db.calls.filter((c) => c[0] === 'getAll')) {
      assert.deepEqual(call[1], [a.id]);
    }
  });

  it('updates only the fields in data, with FieldValue.increment for increments', async () => {
    const post = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p', status: 'publishing', selected_variant_index: 1 } });
    db.calls = [];
    const updated = await posts.update({ where: { id: post.id }, data: { caption_text: 'new', selected_variant_index: { increment: 2 } } });
    const [, id, fields] = lastOf('update') as [string, string, Record<string, unknown>];
    assert.equal(id, post.id);
    assert.deepEqual(Object.keys(fields).sort(), ['caption_text', 'selected_variant_index', 'updated_at']);
    assert.ok((fields['selected_variant_index'] as FieldValue).isEqual(FieldValue.increment(2)));
    assert.equal(updated.selected_variant_index, 3);
    assert.equal(updated.status, 'publishing');

    const result = await posts.updateMany({ where: { dealer_id: 'd1' }, data: { status: 'published' } });
    assert.deepEqual(result, { count: 1 });
    const [, , batchFields] = lastOf('update') as [string, string, Record<string, unknown>];
    assert.deepEqual(Object.keys(batchFields).sort(), ['status', 'updated_at']);
  });

  it('propagates read and write errors instead of reporting success or switching to memory', async () => {
    const unavailable = () => Object.assign(new Error('UNAVAILABLE'), { code: 14 });
    const post = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p' } });

    db.failures.set('query', unavailable());
    await assert.rejects(posts.findMany({ where: { dealer_id: 'd1' } }), /UNAVAILABLE/);
    db.failures.set('getAll', unavailable());
    await assert.rejects(posts.findUnique({ where: { id: post.id } }), /UNAVAILABLE/);
    db.failures.set('create', unavailable());
    await assert.rejects(posts.create({ data: { dealer_id: 'd1', prompt_text: 'p' } }), /UNAVAILABLE/);
    db.failures.set('update', unavailable());
    await assert.rejects(posts.update({ where: { id: post.id }, data: { status: 'x' } }), /UNAVAILABLE/);

    // Still talking to Firestore afterwards.
    db.calls = [];
    assert.equal((await posts.findMany({ where: { dealer_id: 'd1' } })).length, 1);
    assert.deepEqual(kinds(), ['query']);
  });

  it('maps NOT_FOUND on update to P2025 and ALREADY_EXISTS on create to P2002', async () => {
    const post = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p' } });
    db.failures.set('update', Object.assign(new Error('NOT_FOUND'), { code: 5 }));
    await assert.rejects(posts.update({ where: { id: post.id }, data: { status: 'x' } }), { code: 'P2025' });
    await assert.rejects(posts.create({ data: { id: post.id, dealer_id: 'd1', prompt_text: 'p' } }), { code: 'P2002' });
  });

  it('keeps no copy of written documents', async () => {
    const post = await posts.create({ data: { dealer_id: 'd1', prompt_text: 'p' } });
    db.store('posts').delete(post.id);
    assert.equal(await posts.findUnique({ where: { id: post.id } }), null);
    assert.deepEqual(await posts.findMany({ where: { dealer_id: 'd1' } }), []);
  });
});
