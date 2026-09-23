import type { FieldDef } from './schema.js';

// Prisma/Postgres filter semantics for documents already read into memory. Predicates
// use three-valued logic: comparing against a null or missing field is "unknown" (null),
// which fails the filter and also fails its NOT, like SQL.

export type Tri = boolean | null;
export type Pred = (doc: Record<string, any>) => Tri;

/** Receives the top-level conditions a backend query could apply before in-memory filtering. */
export interface PushdownSink {
  eq(field: string, value: unknown, def: FieldDef | undefined): void;
  in(field: string, values: unknown[], def: FieldDef | undefined): void;
  residual(): void;
}

export const always: Pred = () => true;

export function and3(preds: Pred[]): Pred {
  if (preds.length === 0) return always;
  if (preds.length === 1) return preds[0]!;
  return (d) => {
    let unknown = false;
    for (const p of preds) {
      const r = p(d);
      if (r === false) return false;
      if (r === null) unknown = true;
    }
    return unknown ? null : true;
  };
}

export function or3(preds: Pred[]): Pred {
  return (d) => {
    let unknown = false;
    for (const p of preds) {
      const r = p(d);
      if (r === true) return true;
      if (r === null) unknown = true;
    }
    return unknown ? null : false;
  };
}

export function not3(p: Pred): Pred {
  return (d) => {
    const r = p(d);
    return r === null ? null : !r;
  };
}

/** Two-valued NOT, for relation filters where "no related record" is a definite answer. */
export function not2(p: Pred): Pred {
  return (d) => p(d) !== true;
}

export function isPlainObject(v: unknown): v is Record<string, any> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function isTimestampLike(v: unknown): v is { toDate(): Date; toMillis(): number } {
  return !!v && typeof v === 'object' && typeof (v as any).toDate === 'function' && typeof (v as any).toMillis === 'function';
}

function isDateLike(v: unknown): boolean {
  return v instanceof Date || isTimestampLike(v);
}

function asMillis(v: unknown): number | undefined {
  let ms: number;
  if (v instanceof Date) ms = v.getTime();
  else if (isTimestampLike(v)) ms = v.toMillis();
  else if (typeof v === 'string') ms = Date.parse(v);
  else if (typeof v === 'number') ms = v;
  else return undefined;
  return Number.isNaN(ms) ? undefined : ms;
}

/** Ordering of two non-null values, or null when they are not comparable. */
export function compareValues(a: unknown, b: unknown): number | null {
  if (isDateLike(a) || isDateLike(b)) {
    const x = asMillis(a);
    const y = asMillis(b);
    return x === undefined || y === undefined ? null : Math.sign(x - y);
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return null;
}

export function valuesEqual(a: unknown, b: unknown, insensitive = false): boolean {
  if (isDateLike(a) || isDateLike(b)) return compareValues(a, b) === 0;
  if (insensitive && typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => valuesEqual(x, b[i], insensitive));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && valuesEqual(a[k], b[k], insensitive));
  }
  return a === b;
}

function prepare(v: unknown, def: FieldDef | undefined): unknown {
  if (def?.type === 'DateTime' && typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? v : new Date(ms);
  }
  return v;
}

function equalsPred(field: string, target: unknown, insensitive: boolean): Pred {
  return (d) => {
    const x = d[field];
    return x == null ? null : valuesEqual(x, target, insensitive);
  };
}

function badArg(field: string, op: string): Error {
  return new Error(`Invalid argument for '${op}' on field '${field}'`);
}

const RANGE_OPS = new Set(['lt', 'lte', 'gt', 'gte']);
const STRING_OPS = new Set(['contains', 'startsWith', 'endsWith']);
const LIST_OPS = new Set(['has', 'hasSome', 'hasEvery', 'isEmpty']);

/** Compiles a Prisma scalar filter (`value` or `{ equals, not, in, lt, contains, has, ... }`) for one field. */
export function fieldPredicate(field: string, value: unknown, def: FieldDef | undefined, sink: PushdownSink | null): Pred {
  if (value === null) {
    sink?.residual();
    return (d) => d[field] == null;
  }
  if (!isPlainObject(value)) {
    sink?.eq(field, value, def);
    return equalsPred(field, prepare(value, def), false);
  }

  const mode = value['mode'];
  if (mode !== undefined && mode !== 'insensitive' && mode !== 'default') throw badArg(field, 'mode');
  const insensitive = mode === 'insensitive';
  const parts: Pred[] = [];

  for (const [op, arg] of Object.entries(value)) {
    if (arg === undefined || op === 'mode') continue;

    if (op === 'equals') {
      if (arg === null) {
        sink?.residual();
        parts.push((d) => d[field] == null);
      } else {
        if (insensitive) sink?.residual();
        else sink?.eq(field, arg, def);
        parts.push(equalsPred(field, prepare(arg, def), insensitive));
      }
    } else if (op === 'not') {
      sink?.residual();
      if (arg === null) {
        parts.push((d) => d[field] != null);
      } else if (isPlainObject(arg)) {
        const nested = insensitive && arg['mode'] === undefined ? { ...arg, mode } : arg;
        parts.push(not3(fieldPredicate(field, nested, def, null)));
      } else {
        parts.push(not3(equalsPred(field, prepare(arg, def), insensitive)));
      }
    } else if (op === 'in' || op === 'notIn') {
      if (!Array.isArray(arg)) throw badArg(field, op);
      const list = arg.map((v) => prepare(v, def));
      const hit = (x: unknown) => list.some((v) => valuesEqual(x, v, insensitive));
      if (op === 'in') {
        if (insensitive) sink?.residual();
        else sink?.in(field, arg, def);
        parts.push(list.length === 0 ? () => false : (d) => (d[field] == null ? null : hit(d[field])));
      } else {
        sink?.residual();
        parts.push(list.length === 0 ? always : (d) => (d[field] == null ? null : !hit(d[field])));
      }
    } else if (RANGE_OPS.has(op)) {
      sink?.residual();
      const lower = (v: unknown) => (insensitive && typeof v === 'string' ? v.toLowerCase() : v);
      const bound = lower(prepare(arg, def));
      parts.push((d) => {
        const x = d[field];
        if (x == null || bound == null) return null;
        const c = compareValues(lower(x), bound);
        if (c === null) return null;
        return op === 'lt' ? c < 0 : op === 'lte' ? c <= 0 : op === 'gt' ? c > 0 : c >= 0;
      });
    } else if (STRING_OPS.has(op)) {
      sink?.residual();
      if (typeof arg !== 'string') throw badArg(field, op);
      const needle = insensitive ? arg.toLowerCase() : arg;
      parts.push((d) => {
        const x = d[field];
        if (typeof x !== 'string') return null;
        const hay = insensitive ? x.toLowerCase() : x;
        return op === 'contains' ? hay.includes(needle) : op === 'startsWith' ? hay.startsWith(needle) : hay.endsWith(needle);
      });
    } else if (LIST_OPS.has(op)) {
      sink?.residual();
      if ((op === 'hasSome' || op === 'hasEvery') && !Array.isArray(arg)) throw badArg(field, op);
      parts.push((d) => {
        const x = d[field];
        if (!Array.isArray(x)) return null;
        if (op === 'has') return arg === null ? null : x.some((e) => valuesEqual(e, arg));
        if (op === 'hasSome') return (arg as unknown[]).some((v) => x.some((e) => valuesEqual(e, v)));
        if (op === 'hasEvery') return (arg as unknown[]).every((v) => x.some((e) => valuesEqual(e, v)));
        return (x.length === 0) === Boolean(arg);
      });
    } else {
      throw new Error(`Unsupported filter operator '${op}' on field '${field}'`);
    }
  }
  return and3(parts);
}

const TYPE_RANK: Record<string, number> = { boolean: 0, number: 1, string: 2, object: 3 };

function compareForSort(a: unknown, b: unknown): number {
  const c = compareValues(a, b);
  if (c !== null) return c;
  const ra = isDateLike(a) ? 4 : TYPE_RANK[typeof a] ?? 5;
  const rb = isDateLike(b) ? 4 : TYPE_RANK[typeof b] ?? 5;
  if (ra !== rb) return ra - rb;
  const sa = JSON.stringify(a) ?? '';
  const sb = JSON.stringify(b) ?? '';
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Stable multi-key sort for Prisma `orderBy` (object or array form, `{ sort, nulls }` allowed).
 * Nulls sort like Postgres: last for asc, first for desc.
 */
export function sortDocs<D extends Record<string, any>>(docs: D[], orderBy: unknown): D[] {
  const keys: Array<{ field: string; dir: number; nullsFirst: boolean }> = [];
  for (const entry of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    if (!entry) continue;
    if (!isPlainObject(entry)) throw new Error('orderBy entries must be objects');
    for (const [field, spec] of Object.entries(entry)) {
      if (spec === undefined) continue;
      let sort: unknown = spec;
      let nulls: unknown;
      if (isPlainObject(spec)) {
        if (typeof spec['sort'] !== 'string') {
          throw new Error(`orderBy on '${field}' is not supported by the Firestore adapter (relation or aggregate ordering)`);
        }
        sort = spec['sort'];
        nulls = spec['nulls'];
      }
      if (sort !== 'asc' && sort !== 'desc') throw new Error(`Invalid orderBy direction for '${field}'`);
      const dir = sort === 'desc' ? -1 : 1;
      keys.push({ field, dir, nullsFirst: nulls === undefined ? dir === -1 : nulls === 'first' });
    }
  }
  if (keys.length === 0) return docs;
  return docs.slice().sort((a, b) => {
    for (const { field, dir, nullsFirst } of keys) {
      const x = a[field];
      const y = b[field];
      const xNull = x == null;
      const yNull = y == null;
      if (xNull || yNull) {
        if (xNull && yNull) continue;
        return (xNull ? -1 : 1) * (nullsFirst ? 1 : -1);
      }
      const c = compareForSort(x, y);
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}
