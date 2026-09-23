import { firestore, isUsingMemoryStore } from '../db/firestore.js';

export type DocGuard = (doc: Record<string, unknown>) => boolean;
export type DocPatch = Record<string, unknown> | ((doc: Record<string, unknown>) => Record<string, unknown>);

interface GuardedDelegate {
  findUnique(args: { where: { id: string } }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The in-memory store has no transactions; run guarded writes one at a time instead.
let memoryQueue: Promise<unknown> = Promise.resolve();
function withMemoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = memoryQueue.then(fn, fn);
  memoryQueue = run.catch(() => undefined);
  return run;
}

// Applies `patch` (or deletes the document when null) only if `guard` accepts the current
// document, atomically with respect to other guarded writes. A function patch is built from
// the document the guard saw (e.g. to increment a counter).
export async function guardedWrite(
  collection: string,
  delegate: GuardedDelegate,
  id: string,
  guard: DocGuard,
  patch: DocPatch | null,
): Promise<boolean> {
  const dataFor = (doc: Record<string, unknown>) => (typeof patch === 'function' ? patch(doc) : patch ?? {});

  if (isUsingMemoryStore()) {
    return withMemoryLock(async () => {
      const doc = (await delegate.findUnique({ where: { id } })) as Record<string, unknown> | null;
      if (!doc || !guard(doc)) return false;
      if (patch) await delegate.update({ where: { id }, data: dataFor(doc) });
      else await delegate.delete({ where: { id } });
      return true;
    });
  }

  const ref = firestore.collection(collection).doc(id);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.data() ?? {};
    if (!snap.exists || !guard(doc)) return false;
    if (patch) tx.update(ref, { ...dataFor(doc), updated_at: new Date() });
    else tx.delete(ref);
    return true;
  });
}
