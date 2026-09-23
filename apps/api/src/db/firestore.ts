import { FieldPath, FieldValue, Firestore, Timestamp, type Query } from '@google-cloud/firestore';
import { randomUUID } from 'crypto';
import {
  always, and3, fieldPredicate, isPlainObject, isTimestampLike, not2, not3, or3, sortDocs,
  type Pred, type PushdownSink,
} from './filters.js';
import { defaultCollectionName, getModel, type FieldDef, type ModelDef, type RelationDef } from './schema.js';

const PROJECT_ID = process.env['GOOGLE_CLOUD_PROJECT']
  || process.env['GCP_PROJECT']
  || 'gen-lang-client-0078524499';

const DATABASE_ID = process.env['FIRESTORE_DATABASE_ID'] || '(default)';

export const firestore = new Firestore({
  projectId: PROJECT_ID,
  databaseId: DATABASE_ID,
  ignoreUndefinedProperties: true,
});

console.log(`[Firestore] Initialized Firestore client for project: ${PROJECT_ID}, database: ${DATABASE_ID}`);

export type QueryWhere = Record<string, any>;
export type QueryOrderBy = Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;

export interface FirestoreQueryOptions {
  where?: QueryWhere | undefined;
  orderBy?: QueryOrderBy | undefined;
  take?: number | undefined;
  skip?: number | undefined;
  include?: any;
  select?: any;
}

const env = process.env;
const onManagedRuntime = Boolean(env['K_SERVICE'] || env['GAE_SERVICE']);
const isProduction = onManagedRuntime || env['NODE_ENV'] === 'production';
const forceFirestore = env['FORCE_FIRESTORE'] === 'true';
const hasFirestoreTarget = Boolean(env['GOOGLE_APPLICATION_CREDENTIALS'] || env['FIRESTORE_EMULATOR_HOST'] || forceFirestore);

// Production always uses Firestore and never falls back to memory. Tests, local dev without
// credentials, and an explicit FIRESTORE_MEMORY=true use a per-process in-memory store.
const useMemoryStore = !isProduction && !forceFirestore
  && (env['FIRESTORE_MEMORY'] === 'true' || env['NODE_ENV'] === 'test' || !hasFirestoreTarget);

if (isProduction && env['FIRESTORE_MEMORY'] === 'true') {
  console.error('[Firestore] FIRESTORE_MEMORY=true is ignored in production.');
}
if (useMemoryStore) {
  console.log('[Firestore] Local/test environment detected: Running with local in-memory store.');
} else {
  console.log(`[Firestore] Connecting live to Google Cloud Firestore ${DATABASE_ID}.`);
}

/** True when the adapter is serving from per-process memory instead of Firestore. */
export function isUsingMemoryStore(): boolean {
  return useMemoryStore;
}

type DbErrorCode = 'P2002' | 'P2025';

function dbError(code: DbErrorCode, message: string, cause?: unknown): Error & { code: DbErrorCode } {
  const err = new Error(message, cause === undefined ? undefined : { cause }) as Error & { code: DbErrorCode };
  err.name = 'PrismaClientKnownRequestError';
  err.code = code;
  return err;
}

// gRPC status codes returned by Firestore.
const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;

type Row = [id: string, data: Record<string, any>];
type Patch = Record<string, unknown>;

class Increment {
  constructor(readonly by: number) {}
}

interface BackendQuery {
  eq: Array<[string, unknown]>;
  in?: [string, unknown[]] | undefined;
  limit?: number | undefined;
}

interface Backend {
  getMany(ids: string[]): Promise<Row[]>;
  query(q: BackendQuery): Promise<Row[]>;
  count(q: BackendQuery): Promise<number>;
  create(rows: Row[]): Promise<void>;
  /** Writes only the patched fields. Strict mode throws P2025 for a missing doc; otherwise it is skipped. */
  update(rows: Array<[string, Patch]>, strict: boolean): Promise<number>;
  delete(ids: string[]): Promise<void>;
}

function isValidDocId(id: string): boolean {
  return id !== '' && id !== '.' && id !== '..' && !id.includes('/') && !/^__.*__$/.test(id);
}

function chunks<V>(list: V[], size: number): V[][] {
  const out: V[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function byId(a: { id: string } | Row, b: { id: string } | Row): number {
  const x = Array.isArray(a) ? a[0] : a.id;
  const y = Array.isArray(b) ? b[0] : b.id;
  return x < y ? -1 : x > y ? 1 : 0;
}

class FirestoreBackend implements Backend {
  constructor(private readonly db: Firestore, private readonly name: string) {}

  private get col() {
    return this.db.collection(this.name);
  }

  private build(q: BackendQuery): Query {
    let query: Query = this.col;
    for (const [field, value] of q.eq) query = query.where(field, '==', value);
    if (q.in) query = query.where(q.in[0], 'in', q.in[1]);
    if (q.limit !== undefined) query = query.limit(q.limit);
    return query;
  }

  async getMany(ids: string[]): Promise<Row[]> {
    const rows: Row[] = [];
    // A string that can't be a document id can't match one; doc() would throw on it (→ 500, not 404)
    const valid = [...new Set(ids)].filter(isValidDocId);
    for (const chunk of chunks(valid, 100)) {
      const snaps = await this.db.getAll(...chunk.map((id) => this.col.doc(id)));
      for (const snap of snaps) if (snap.exists) rows.push([snap.id, snap.data()!]);
    }
    return rows;
  }

  async query(q: BackendQuery): Promise<Row[]> {
    const snap = await this.build(q).get();
    return snap.docs.map((d) => [d.id, d.data()]);
  }

  async count(q: BackendQuery): Promise<number> {
    const snap = await this.build(q).count().get();
    return snap.data().count;
  }

  async create(rows: Row[]): Promise<void> {
    try {
      for (const chunk of chunks(rows, 500)) {
        const batch = this.db.batch();
        for (const [id, data] of chunk) batch.create(this.col.doc(id), data);
        await batch.commit();
      }
    } catch (err: any) {
      if (err?.code === ALREADY_EXISTS) throw dbError('P2002', `Unique constraint failed on ${this.name}.id`, err);
      throw err;
    }
  }

  private updateArgs(patch: Patch): [FieldPath, unknown, ...unknown[]] {
    const args: unknown[] = [];
    for (const [field, value] of Object.entries(patch)) {
      args.push(new FieldPath(field), value instanceof Increment ? FieldValue.increment(value.by) : value);
    }
    return args as [FieldPath, unknown, ...unknown[]];
  }

  private async updateOne(id: string, patch: Patch, strict: boolean): Promise<number> {
    try {
      await this.col.doc(id).update(...this.updateArgs(patch));
      return 1;
    } catch (err: any) {
      if (err?.code !== NOT_FOUND) throw err;
      if (strict) throw dbError('P2025', `Record to update not found in ${this.name}`, err);
      return 0;
    }
  }

  async update(rows: Array<[string, Patch]>, strict: boolean): Promise<number> {
    if (strict || rows.length === 1) {
      let n = 0;
      for (const [id, patch] of rows) n += await this.updateOne(id, patch, strict);
      return n;
    }
    let n = 0;
    for (const chunk of chunks(rows, 500)) {
      const batch = this.db.batch();
      for (const [id, patch] of chunk) batch.update(this.col.doc(id), ...this.updateArgs(patch));
      try {
        await batch.commit();
        n += chunk.length;
      } catch (err: any) {
        // A doc deleted since it was read fails the whole batch; retry the rest one by one.
        if (err?.code !== NOT_FOUND) throw err;
        for (const [id, patch] of chunk) n += await this.updateOne(id, patch, false);
      }
    }
    return n;
  }

  async delete(ids: string[]): Promise<void> {
    for (const chunk of chunks(ids, 500)) {
      const batch = this.db.batch();
      for (const id of chunk) batch.delete(this.col.doc(id));
      await batch.commit();
    }
  }
}

function cloneStored(v: unknown): any {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(cloneStored);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = cloneStored(x);
    return out;
  }
  return v;
}

/** Mimics the Firestore calls above, including document-id ordering and `==`/`in` matching. */
class MemoryBackend implements Backend {
  constructor(private readonly store: Map<string, Record<string, any>>) {}

  async getMany(ids: string[]): Promise<Row[]> {
    return [...new Set(ids)].filter((id) => this.store.has(id)).map((id) => [id, cloneStored(this.store.get(id))]);
  }

  async query(q: BackendQuery): Promise<Row[]> {
    let rows = [...this.store.entries()].sort(byId).filter(([, d]) =>
      q.eq.every(([f, v]) => d[f] === v) && (!q.in || q.in[1].some((v) => d[q.in![0]] === v)));
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    return rows.map(([id, d]) => [id, cloneStored(d)]);
  }

  async count(q: BackendQuery): Promise<number> {
    return (await this.query({ ...q, limit: undefined })).length;
  }

  async create(rows: Row[]): Promise<void> {
    for (const [id] of rows) if (this.store.has(id)) throw dbError('P2002', `Unique constraint failed on id ${id}`);
    for (const [id, data] of rows) this.store.set(id, cloneStored(data));
  }

  async update(rows: Array<[string, Patch]>, strict: boolean): Promise<number> {
    let n = 0;
    for (const [id, patch] of rows) {
      const current = this.store.get(id);
      if (!current) {
        if (strict) throw dbError('P2025', `Record to update not found (id ${id})`);
        continue;
      }
      const next = { ...current };
      for (const [k, v] of Object.entries(patch)) {
        next[k] = v instanceof Increment ? (typeof current[k] === 'number' ? current[k] : 0) + v.by : cloneStored(v);
      }
      this.store.set(id, next);
      n++;
    }
    return n;
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) this.store.delete(id);
  }
}

// ─── Value conversion ────────────────────────────────────────────────────────

function toDate(v: unknown): unknown {
  if (v instanceof Date) return new Date(v.getTime());
  if (isTimestampLike(v)) return v.toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d;
  }
  return v;
}

/** Json values: nested dates become ISO strings, as Prisma would return them. */
function toJson(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (isTimestampLike(v)) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toJson);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = toJson(x);
    return out;
  }
  return v;
}

function readValue(v: unknown, f: FieldDef | undefined): unknown {
  if (v === null || v === undefined) return null;
  if (f?.type === 'DateTime') return Array.isArray(v) ? v.map(toDate) : toDate(v);
  if (f?.type === 'Json') return toJson(v);
  if (v instanceof Date || isTimestampLike(v)) return toDate(v);
  if (Array.isArray(v) || isPlainObject(v)) return toJson(v);
  return v;
}

function toTimestamp(v: unknown, field: string): Timestamp {
  if (v instanceof Timestamp) return v;
  if (isTimestampLike(v)) return Timestamp.fromMillis(v.toMillis());
  const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : undefined;
  if (!d || Number.isNaN(d.getTime())) throw new Error(`Invalid DateTime value for '${field}': ${String(v)}`);
  return Timestamp.fromDate(d);
}

function storeValue(v: unknown): unknown {
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (Array.isArray(v)) return v.map(storeValue);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = storeValue(x);
    return out;
  }
  return v;
}

function literalDefault(f: FieldDef): unknown {
  if (!f.hasDefaultValue || f.default === undefined || isPlainObject(f.default)) return undefined;
  return cloneStored(f.default);
}

/**
 * Equality filters that Firestore can apply with its automatic single-field indexes.
 * A filter on a field's schema default stays in memory: older docs lack the field, and
 * reads fill the default in, so Firestore alone would miss them.
 */
function pushable(f: FieldDef | undefined, value: unknown): boolean {
  if (!f || f.isList || (f.kind !== 'scalar' && f.kind !== 'enum')) return false;
  const typed = f.kind === 'enum' || f.type === 'String' ? typeof value === 'string'
    : f.type === 'Int' || f.type === 'Float' ? typeof value === 'number' && Number.isFinite(value)
      : f.type === 'Boolean' ? typeof value === 'boolean'
        : false;
  return typed && !(f.hasDefaultValue && !isPlainObject(f.default) && f.default === value);
}

const ATOMIC_OPS = new Set(['set', 'increment', 'decrement', 'multiply', 'divide', 'push']);

function atomicOp(v: unknown, f: FieldDef | undefined): [string, unknown] | null {
  if (f?.type === 'Json' || !isPlainObject(v)) return null;
  const keys = Object.keys(v);
  if (keys.length === 0 || !keys.every((k) => ATOMIC_OPS.has(k))) return null;
  const defined = keys.filter((k) => v[k] !== undefined);
  if (defined.length > 1) throw new Error(`Only one update operator is allowed per field, got ${defined.join(', ')}`);
  return defined.length ? [defined[0]!, v[defined[0]!]] : ['noop', undefined];
}

function toNumber(v: unknown, op: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`'${op}' needs a finite number`);
  return v;
}

function keyOf(doc: Record<string, any>, fields: string[]): unknown {
  if (fields.length === 1) return doc[fields[0]!] ?? null;
  const values = fields.map((f) => doc[f]);
  return values.some((v) => v == null) ? null : JSON.stringify(values);
}

function validInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined;
}

function paginate<D>(docs: D[], skip: number | undefined, take: number | undefined): D[] {
  let out = skip ? docs.slice(skip) : docs;
  if (take !== undefined) out = take >= 0 ? out.slice(0, take) : out.slice(Math.max(0, out.length + take));
  return out;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[Firestore] ${message}`);
}

// ─── Collections ─────────────────────────────────────────────────────────────

interface Plan {
  eq: Map<string, unknown>;
  in?: [string, unknown[]];
  ids?: string[];
  /** True when the predicate checks more than the pushed-down equality filters. */
  residual: boolean;
  /** A top-level condition can never match. */
  none: boolean;
}

interface Compiled {
  plan: Plan;
  pred: Pred;
}

interface FetchOptions {
  orderBy?: unknown;
  skip?: number | undefined;
  take?: number | undefined;
  preferIn?: boolean;
}

const memoryStore = new Map<string, Map<string, Record<string, any>>>();
const collectionsByModel = new Map<string, FirestoreCollection>();
let pushdownEnabled = true;

/** Test hook: when off, every query reads the whole collection and filters in memory. */
export function setQueryPushdown(enabled: boolean): void {
  pushdownEnabled = enabled;
}

/** The collection registered for a Prisma model (the one `prisma.<model>` uses). */
export function collectionFor(modelName: string): FirestoreCollection {
  return collectionsByModel.get(modelName) ?? new FirestoreCollection(defaultCollectionName(modelName), modelName);
}

export interface FirestoreCollectionOptions {
  /** Talk to this Firestore instance even in memory mode (tests pass a fake). */
  db?: Firestore;
}

type Doc<T> = T & Record<string, any>;

export class FirestoreCollection<T extends { id?: string; [key: string]: any } = any> {
  readonly model: ModelDef | undefined;
  private readonly backend: Backend;

  constructor(public collectionName: string, modelName?: string, options: FirestoreCollectionOptions = {}) {
    this.model = getModel(modelName);
    if (modelName && !this.model) console.warn(`[Firestore] Unknown model '${modelName}' for ${collectionName}; running schemaless.`);

    if (options.db) {
      this.backend = new FirestoreBackend(options.db, collectionName);
    } else if (useMemoryStore) {
      if (!memoryStore.has(collectionName)) memoryStore.set(collectionName, new Map());
      this.backend = new MemoryBackend(memoryStore.get(collectionName)!);
    } else {
      this.backend = new FirestoreBackend(firestore, collectionName);
    }

    if (this.model && !options.db && !collectionsByModel.has(this.model.name)) {
      collectionsByModel.set(this.model.name, this);
    }
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async findUnique(options: { where: QueryWhere; include?: any; select?: any }): Promise<Doc<T> | null> {
    const doc = await this.findTarget(options.where);
    return doc ? (await this.project([doc], options))[0] : null;
  }

  async findUniqueOrThrow(options: { where: QueryWhere; include?: any; select?: any }): Promise<Doc<T>> {
    const doc = await this.findUnique(options);
    if (!doc) throw dbError('P2025', `No record found in ${this.collectionName}`);
    return doc;
  }

  async findFirst(options: FirestoreQueryOptions = {}): Promise<Doc<T> | null> {
    const list = await this.findMany({ ...options, take: 1 });
    return list[0] ?? null;
  }

  async findFirstOrThrow(options: FirestoreQueryOptions = {}): Promise<Doc<T>> {
    const doc = await this.findFirst(options);
    if (!doc) throw dbError('P2025', `No record found in ${this.collectionName}`);
    return doc;
  }

  async findMany(options: FirestoreQueryOptions = {}): Promise<Array<Doc<T>>> {
    const docs = await this.fetch(options.where, options);
    return this.project(docs, options);
  }

  async count(options: { where?: QueryWhere | undefined; skip?: number; take?: number; select?: any } = {}): Promise<any> {
    const compiled = await this.compile(options.where);
    const { plan } = compiled;
    let total: number;
    if (plan.none) {
      total = 0;
    } else if (pushdownEnabled && !plan.residual && !plan.ids && !options.select
      && options.skip === undefined && options.take === undefined) {
      total = await this.backend.count(this.backendQuery(plan, undefined, false));
    } else {
      const docs = await this.run(compiled, { skip: options.skip, take: options.take });
      if (isPlainObject(options.select)) {
        const out: Record<string, number> = {};
        for (const [field, on] of Object.entries(options.select)) {
          if (on) out[field] = field === '_all' ? docs.length : docs.filter((d) => d[field] != null).length;
        }
        return out;
      }
      total = docs.length;
    }
    if (isPlainObject(options.select)) {
      return Object.fromEntries(Object.keys(options.select).filter((k) => options.select[k]).map((k) => [k, total]));
    }
    return total;
  }

  async groupBy(options: { by: string[]; _count?: any; _sum?: any; where?: QueryWhere }): Promise<any[]> {
    const docs = await this.fetch(options.where);
    const groups = new Map<string, any>();
    const sumFields = isPlainObject(options._sum) ? Object.keys(options._sum).filter((k) => options._sum[k]) : [];
    const countFields = isPlainObject(options._count) ? Object.keys(options._count).filter((k) => k !== '_all' && options._count[k]) : [];

    for (const doc of docs) {
      const key = JSON.stringify(options.by.map((f) => (doc[f] instanceof Date ? doc[f].toISOString() : doc[f] ?? null)));
      if (!groups.has(key)) {
        const entry: any = { _count: { _all: 0 } };
        for (const f of options.by) entry[f] = doc[f] ?? null;
        for (const f of countFields) entry._count[f] = 0;
        if (sumFields.length) entry._sum = Object.fromEntries(sumFields.map((f) => [f, null]));
        groups.set(key, entry);
      }
      const g = groups.get(key);
      g._count._all += 1;
      for (const f of countFields) if (doc[f] != null) g._count[f] += 1;
      for (const f of sumFields) if (typeof doc[f] === 'number') g._sum[f] = (g._sum[f] ?? 0) + doc[f];
    }

    return Array.from(groups.values());
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  async create(options: { data: any; include?: any; select?: any }): Promise<Doc<T>> {
    const [id, stored] = this.prepareCreate(options.data ?? {});
    await this.backend.create([[id, stored]]);
    return (await this.project([this.normalize(id, stored)], options))[0];
  }

  async createMany(options: { data: any[] | any; skipDuplicates?: boolean }): Promise<{ count: number }> {
    let rows = asArray(options.data).map((item) => this.prepareCreate(item ?? {}));
    if (options.skipDuplicates && rows.length) {
      const existing = new Set((await this.backend.getMany(rows.map(([id]) => id))).map(([id]) => id));
      rows = rows.filter(([id]) => !existing.has(id));
    }
    if (rows.length) await this.backend.create(rows);
    return { count: rows.length };
  }

  async update(options: { where: QueryWhere; data: any; include?: any; select?: any }): Promise<Doc<T>> {
    const target = await this.findTarget(options.where);
    if (!target) throw dbError('P2025', `Record to update not found in ${this.collectionName}`);
    return this.applyUpdate(target, options.data ?? {}, options);
  }

  async updateMany(options: { where?: QueryWhere | undefined; data: any }): Promise<{ count: number }> {
    const docs = await this.fetch(options.where);
    const rows = docs
      .map((d): [string, Patch] => [d['id'], this.buildPatch(options.data ?? {}, d)])
      .filter(([, patch]) => Object.keys(patch).length > 0);
    const count = rows.length ? await this.backend.update(rows, false) : docs.length;
    return { count };
  }

  async upsert(options: { where: QueryWhere; create: any; update: any; include?: any; select?: any }): Promise<Doc<T>> {
    const existing = await this.findTarget(options.where);
    if (existing) return this.applyUpdate(existing, options.update ?? {}, options);
    return this.create({ data: options.create ?? {}, include: options.include, select: options.select });
  }

  async delete(options: { where: QueryWhere; include?: any; select?: any }): Promise<Doc<T>> {
    const target = await this.findTarget(options.where);
    if (!target) throw dbError('P2025', `Record to delete not found in ${this.collectionName}`);
    const [shaped] = await this.project([target], options);
    await this.backend.delete([target['id']]);
    return shaped;
  }

  async deleteMany(options: { where?: QueryWhere | undefined } = {}): Promise<{ count: number }> {
    const docs = await this.fetch(options.where);
    if (docs.length) await this.backend.delete(docs.map((d) => d['id']));
    return { count: docs.length };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /** Unique-lookup semantics: a selector with no defined values finds nothing instead of the first doc. */
  private async findTarget(where: QueryWhere | undefined): Promise<Record<string, any> | null> {
    if (!isPlainObject(where)) return null;
    const defined = Object.entries(where).filter(([, v]) => v !== undefined);
    if (defined.length === 0) return null;
    for (const [key, value] of defined) {
      if (this.compoundFields(key, value) && Object.values(value).some((v) => v === undefined || v === null)) return null;
    }
    const [doc] = await this.fetch(where, { take: 1 });
    return doc ?? null;
  }

  private async applyUpdate(target: Record<string, any>, data: Record<string, any>, shape: { include?: any; select?: any }): Promise<Doc<T>> {
    const id: string = target['id'];
    const patch = this.buildPatch(data, target);
    if (Object.keys(patch).length) await this.backend.update([[id, patch]], true);
    const [row] = await this.backend.getMany([id]);
    if (!row) throw dbError('P2025', `Record to update not found in ${this.collectionName}`);
    return (await this.project([this.normalize(...row)], shape))[0];
  }

  private prepareCreate(input: Record<string, any>): Row {
    const data: Record<string, any> = { ...input };
    const now = new Date();
    if (!this.model) {
      data['created_at'] ??= now;
      data['updated_at'] = now;
    } else {
      for (const f of this.model.scalars) {
        if (data[f.name] !== undefined) continue;
        if (f.isUpdatedAt) {
          data[f.name] = now;
        } else if (f.hasDefaultValue && isPlainObject(f.default)) {
          const fn = String(f.default['name']);
          if (fn === 'now') data[f.name] = now;
          else if (/^(uuid|cuid|nanoid)/.test(fn)) data[f.name] = randomUUID();
          else warnOnce(`${this.model.name}.${f.name}: default ${fn}() is not supported; leaving it unset.`);
        } else if (f.hasDefaultValue) {
          data[f.name] = literalDefault(f);
        }
      }
    }
    const id = String(data['id'] ?? randomUUID());
    data['id'] = id;
    return [id, this.toStored(data)];
  }

  private toStoredValue(v: unknown, f: FieldDef | undefined, field: string): unknown {
    if (v === null) return null;
    if (f?.type === 'DateTime') return Array.isArray(v) ? v.map((x) => toTimestamp(x, field)) : toTimestamp(v, field);
    if (f?.type === 'Json') return JSON.parse(JSON.stringify(v));
    if (f?.type === 'Decimal' && typeof (v as any)?.toNumber === 'function') return (v as any).toNumber();
    return storeValue(v);
  }

  private toStored(data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const f = this.model?.fields.get(k);
      if (f?.kind === 'object') throw this.nestedWriteError(k);
      out[k] = this.toStoredValue(v, f, k);
    }
    return out;
  }

  private nestedWriteError(field: string): Error {
    return new Error(`[Firestore:${this.collectionName}] Nested writes on relation '${field}' are not supported; set the foreign key instead.`);
  }

  /** Only the fields named in `data` (plus @updatedAt) are written, so concurrent writers don't clobber each other. */
  private buildPatch(data: Record<string, any>, current: Record<string, any>): Patch {
    const patch: Patch = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const f = this.model?.fields.get(k);
      if (f?.kind === 'object') throw this.nestedWriteError(k);
      if (k === 'id') {
        if (v !== current['id']) throw new Error(`[Firestore:${this.collectionName}] Changing a document id is not supported.`);
        continue;
      }
      const op = atomicOp(v, f);
      if (!op) {
        patch[k] = this.toStoredValue(v, f, k);
        continue;
      }
      const [name, arg] = op;
      const cur = current[k];
      if (name === 'set') {
        patch[k] = this.toStoredValue(arg, f, k);
      } else if (name === 'increment' || name === 'decrement') {
        const by = toNumber(arg, name);
        patch[k] = new Increment(name === 'increment' ? by : -by);
      } else if (name === 'multiply' || name === 'divide') {
        // Computed from the doc as read, so not atomic like increment.
        if (typeof cur !== 'number') continue;
        const by = toNumber(arg, name);
        const next = name === 'multiply' ? cur * by : cur / by;
        patch[k] = f?.type === 'Int' ? Math.trunc(next) : next;
      } else if (name === 'push') {
        const base = Array.isArray(cur) ? cur : [];
        patch[k] = this.toStoredValue([...base, ...asArray(arg)], f, k);
      }
    }
    const now = Timestamp.now();
    if (this.model) {
      for (const f of this.model.scalars) if (f.isUpdatedAt && data[f.name] === undefined) patch[f.name] = now;
    } else if (data['updated_at'] === undefined) {
      patch['updated_at'] = now;
    }
    return patch;
  }

  /** Stored doc -> Prisma-shaped record: real Dates, Json dates as strings, missing fields as default/null. */
  private normalize(id: string, data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) out[k] = readValue(v, this.model?.fields.get(k));
    out['id'] = id;
    if (this.model) {
      for (const f of this.model.scalars) {
        if (out[f.name] !== undefined) continue;
        const d = literalDefault(f);
        out[f.name] = d !== undefined ? d : f.isList ? [] : null;
      }
    }
    return out;
  }

  private compoundFields(key: string, value: unknown): string[] | undefined {
    if (!isPlainObject(value) || this.model?.fields.has(key)) return undefined;
    const named = this.model?.compoundUniques.get(key);
    if (named) return named;
    // Schemaless fallback: { dealer_id_platform: { dealer_id, platform } }.
    const keys = Object.keys(value);
    return keys.length > 0 && key === keys.join('_') ? keys : undefined;
  }

  private sink(plan: Plan | null): PushdownSink | null {
    if (!plan) return null;
    const addIds = (ids: unknown[]) => {
      const list = ids as string[];
      plan.ids = plan.ids ? plan.ids.filter((id) => list.includes(id)) : [...new Set(list)];
      if (plan.ids.length === 0) plan.none = true;
    };
    return {
      eq: (field, value, def) => {
        if (field === 'id' && typeof value === 'string') return addIds([value]);
        if (!pushable(def, value)) {
          plan.residual = true;
          return;
        }
        if (plan.eq.has(field) && plan.eq.get(field) !== value) plan.none = true;
        plan.eq.set(field, value);
      },
      in: (field, values, def) => {
        plan.residual = true;
        if (field === 'id' && values.every((v) => typeof v === 'string')) return addIds(values);
        if (values.length === 0) {
          plan.none = true;
          return;
        }
        const unique = [...new Set(values)];
        if (!plan.in && unique.length <= 30 && unique.every((v) => pushable(def, v))) plan.in = [field, unique];
      },
      residual: () => {
        plan.residual = true;
      },
    };
  }

  private async compile(where: unknown): Promise<Compiled> {
    const plan: Plan = { eq: new Map(), residual: !pushdownEnabled, none: false };
    const pred = await this.compileWhere(where, pushdownEnabled ? plan : null);
    return { plan, pred };
  }

  private async compileWhere(where: unknown, plan: Plan | null): Promise<Pred> {
    if (where === undefined || where === null) return always;
    if (!isPlainObject(where)) throw new Error(`[Firestore:${this.collectionName}] where must be an object`);
    const sink = this.sink(plan);
    const preds: Pred[] = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;
      if (key === 'AND') {
        for (const w of asArray(value)) preds.push(await this.compileWhere(w, plan));
        continue;
      }
      if (key === 'OR' || key === 'NOT') {
        sink?.residual();
        const parts = await Promise.all(asArray(value).map((w) => this.compileWhere(w, null)));
        preds.push(key === 'OR' ? or3(parts) : and3(parts.map(not3)));
        continue;
      }
      const rel = this.model?.relations.get(key);
      if (rel) {
        sink?.residual();
        preds.push(await this.relationFilter(rel, value, plan));
        continue;
      }
      if (this.compoundFields(key, value)) {
        preds.push(await this.compileWhere(value, plan));
        continue;
      }
      preds.push(fieldPredicate(key, value, this.model?.fields.get(key), sink));
    }
    return and3(preds);
  }

  /** Relation filters run the nested filter on the related collection, then match on the foreign key. */
  private async relationFilter(rel: RelationDef, value: unknown, plan: Plan | null): Promise<Pred> {
    const target = collectionFor(rel.target);
    const bad = () => new Error(`[Firestore:${this.collectionName}] Unsupported filter on relation '${rel.name}'`);
    const localKey = (d: Record<string, any>) => keyOf(d, rel.local);
    const matching = async (where: unknown): Promise<Set<unknown>> => {
      const notNull = Object.fromEntries(rel.remote.map((f) => [f, { not: null }]));
      const docs = await target.fetch({ AND: [notNull, where ?? {}] });
      return new Set(docs.map((d) => keyOf(d, rel.remote)));
    };
    const within = (keys: Set<unknown>): Pred => (d) => {
      const k = localKey(d);
      return k !== null && keys.has(k);
    };
    const withinHinted = (keys: Set<unknown>): Pred => {
      if (plan && rel.local.length === 1) this.sink(plan)!.in(rel.local[0]!, [...keys], this.model?.fields.get(rel.local[0]!));
      return within(keys);
    };

    if (!isPlainObject(value) && value !== null) throw bad();

    if (!rel.isList) {
      const noRelated = async (): Promise<Pred> =>
        rel.fkHere ? (d) => localKey(d) === null : not2(within(await matching(undefined)));
      if (value === null) return noRelated();
      if (!('is' in value) && !('isNot' in value)) return withinHinted(await matching(value));
      const parts: Pred[] = [];
      if (value['is'] === null) parts.push(await noRelated());
      else if (value['is'] !== undefined) parts.push(withinHinted(await matching(value['is'])));
      if (value['isNot'] === null) parts.push(not2(await noRelated()));
      else if (value['isNot'] !== undefined) parts.push(not2(within(await matching(value['isNot']))));
      return and3(parts);
    }

    if (value === null) throw bad();
    const parts: Pred[] = [];
    for (const [op, w] of Object.entries(value)) {
      if (w === undefined) continue;
      if (op === 'some') parts.push(withinHinted(await matching(w)));
      else if (op === 'none') parts.push(not2(within(await matching(w))));
      else if (op === 'every') parts.push(not2(within(await matching({ NOT: w }))));
      else throw bad();
    }
    return and3(parts);
  }

  private backendQuery(plan: Plan, limit: number | undefined, preferIn: boolean): BackendQuery {
    if (plan.in && (preferIn || plan.eq.size === 0)) return { eq: [], in: plan.in };
    return { eq: [...plan.eq], limit };
  }

  private async fetch(where: unknown, opts: FetchOptions = {}): Promise<Record<string, any>[]> {
    return this.run(await this.compile(where), opts);
  }

  private async run({ plan, pred }: Compiled, opts: FetchOptions): Promise<Record<string, any>[]> {
    if (plan.none) return [];
    const skip = validInt(opts.skip) ?? 0;
    const take = validInt(opts.take);
    // With nothing left to check in memory and no ordering, Firestore can stop early.
    const limit = !plan.residual && !plan.ids && !opts.orderBy && take !== undefined && take >= 0 ? skip + take : undefined;
    const rows = plan.ids
      ? await this.backend.getMany(plan.ids)
      : await this.backend.query(this.backendQuery(plan, limit, Boolean(opts.preferIn)));
    let docs = rows.map(([id, data]) => this.normalize(id, data)).filter((d) => pred(d) === true);
    docs = opts.orderBy ? sortDocs(docs, opts.orderBy) : docs.sort(byId as any);
    return paginate(docs, skip, take);
  }

  /** Docs whose `fields` hold one of `keys`, batched into Firestore `in` queries / getAll. */
  private async fetchRelated(fields: string[], keys: unknown[], where: unknown): Promise<Record<string, any>[]> {
    if (keys.length === 0) return [];
    if (fields.length !== 1) {
      const wanted = new Set(keys);
      return (await this.fetch(where)).filter((d) => wanted.has(keyOf(d, fields)));
    }
    const field = fields[0]!;
    if (field === 'id') return this.fetch({ AND: [{ id: { in: keys } }, where ?? {}] });
    const out: Record<string, any>[] = [];
    for (const chunk of chunks(keys, 30)) {
      out.push(...await this.fetch({ AND: [{ [field]: { in: chunk } }, where ?? {}] }, { preferIn: true }));
    }
    return out;
  }

  private async loadRelation(docs: Record<string, any>[], rel: RelationDef, args: Record<string, any>): Promise<unknown[]> {
    if (!isPlainObject(args)) throw new Error(`[Firestore:${this.collectionName}] Invalid include/select for '${rel.name}'`);
    const target = collectionFor(rel.target);
    const keys = docs.map((d) => keyOf(d, rel.local));
    const unique = [...new Set(keys.filter((k) => k !== null))];
    const children = await target.fetchRelated(rel.remote, unique, rel.isList ? args['where'] : undefined);
    const groups = new Map<unknown, Record<string, any>[]>();
    for (const child of children) {
      const k = keyOf(child, rel.remote);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(child);
    }

    if (!rel.isList) {
      const picked = keys.map((k) => (k === null ? undefined : groups.get(k)?.[0]));
      const distinct = [...new Set(picked.filter((p): p is Record<string, any> => !!p))];
      const shaped = await target.project(distinct, args);
      const byDoc = new Map(distinct.map((d, i) => [d, shaped[i]]));
      return picked.map((p) => (p ? { ...byDoc.get(p) } : null));
    }

    const lists = keys.map((k) => {
      const list = (k === null ? [] : groups.get(k) ?? []).slice();
      const sorted = args['orderBy'] ? sortDocs(list, args['orderBy']) : list.sort(byId as any);
      return paginate(sorted, validInt(args['skip']), validInt(args['take']));
    });
    const shaped = await target.project(lists.flat(), args);
    let i = 0;
    return lists.map((list) => list.map(() => shaped[i++]));
  }

  private async loadCounts(docs: Record<string, any>[], spec: unknown): Promise<Array<Record<string, number>>> {
    const listRelations = this.model ? [...this.model.relations.values()].filter((r) => r.isList) : [];
    let wanted: Array<[RelationDef, unknown]>;
    if (spec === true) {
      wanted = listRelations.map((r) => [r, undefined]);
    } else {
      const select = isPlainObject(spec) && isPlainObject(spec['select']) ? spec['select'] : {};
      wanted = Object.entries(select).filter(([, v]) => v).map(([name, v]) => {
        const rel = this.model?.relations.get(name);
        if (!rel?.isList) throw new Error(`[Firestore:${this.collectionName}] _count: '${name}' is not a to-many relation`);
        return [rel, isPlainObject(v) ? v['where'] : undefined];
      });
    }

    const out = docs.map(() => ({} as Record<string, number>));
    await Promise.all(wanted.map(async ([rel, where]) => {
      const target = collectionFor(rel.target);
      const keys = docs.map((d) => keyOf(d, rel.local));
      const unique = [...new Set(keys.filter((k) => k !== null))];
      const counts = new Map<unknown, number>();
      const field = rel.remote.length === 1 ? rel.remote[0]! : undefined;
      if (pushdownEnabled && field && where === undefined && unique.every((k) => pushable(target.model?.fields.get(field), k))) {
        // One count aggregation per parent is far cheaper than reading every child doc.
        await Promise.all(unique.map(async (k) => counts.set(k, await target.count({ where: { [field]: k } }))));
      } else {
        for (const child of await target.fetchRelated(rel.remote, unique, where)) {
          const k = keyOf(child, rel.remote);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      keys.forEach((k, i) => {
        out[i]![rel.name] = k === null ? 0 : counts.get(k) ?? 0;
      });
    }));
    return out;
  }

  /** Applies `select` / `include` (relations, `_count`) to records already read. */
  private async project(docs: Record<string, any>[], args: { select?: any; include?: any }): Promise<any[]> {
    const spec = args.select ?? args.include;
    if (!spec || docs.length === 0) return docs;
    if (!isPlainObject(spec)) throw new Error(`[Firestore:${this.collectionName}] select/include must be an object`);
    const selecting = Boolean(args.select);
    const out = docs.map((d) => (selecting ? {} : { ...d })) as Record<string, any>[];
    const jobs: Promise<void>[] = [];

    for (const [key, val] of Object.entries(spec)) {
      if (!val) continue;
      if (key === '_count') {
        jobs.push(this.loadCounts(docs, val).then((counts) => counts.forEach((c, i) => { out[i]!['_count'] = c; })));
        continue;
      }
      const rel = this.model?.relations.get(key);
      if (rel) {
        jobs.push(this.loadRelation(docs, rel, val === true ? {} : val).then((results) => results.forEach((r, i) => { out[i]![key] = r; })));
        continue;
      }
      if (selecting) {
        docs.forEach((d, i) => { if (key in d) out[i]![key] = d[key]; });
      } else if (this.model) {
        throw new Error(`[Firestore:${this.collectionName}] include: '${key}' is not a relation of ${this.model.name}`);
      }
    }

    await Promise.all(jobs);
    return out;
  }
}
