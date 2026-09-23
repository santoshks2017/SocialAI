import { firestore, isUsingMemoryStore } from '../db/firestore.js';
import { prisma } from '../db/prisma.js';

// Collection backing prisma.post (see db/prisma.ts); documents are keyed by post id.
const POSTS_COLLECTION = 'posts';

export interface PostState {
  dealer_id: string | null;
  status: string | null;
  scheduled_at: Date | null;
  updated_at: Date | null;
}

export type PostGuard = (post: PostState) => boolean;

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toState(doc: Record<string, unknown>): PostState {
  return {
    dealer_id: typeof doc['dealer_id'] === 'string' ? doc['dealer_id'] : null,
    status: typeof doc['status'] === 'string' ? doc['status'] : null,
    scheduled_at: toDate(doc['scheduled_at']),
    updated_at: toDate(doc['updated_at']),
  };
}

// The in-memory store has no transactions; run guarded writes one at a time instead.
let memoryQueue: Promise<unknown> = Promise.resolve();
function withMemoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = memoryQueue.then(fn, fn);
  memoryQueue = run.catch(() => undefined);
  return run;
}

// Applies `data` (or deletes the post when null) only if `guard` accepts the post's
// current state, atomically with respect to other guarded writes.
async function guardedWrite(
  id: string,
  guard: PostGuard,
  data: Record<string, unknown> | null,
): Promise<boolean> {
  if (isUsingMemoryStore()) {
    return withMemoryLock(async () => {
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post || !guard(toState(post))) return false;
      if (data) await prisma.post.update({ where: { id }, data });
      else await prisma.post.delete({ where: { id } });
      return true;
    });
  }

  const ref = firestore.collection(POSTS_COLLECTION).doc(id);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !guard(toState(snap.data() ?? {}))) return false;
    if (data) tx.update(ref, { ...data, updated_at: new Date() });
    else tx.delete(ref);
    return true;
  });
}

/** Updates the post only if `guard` passes; false means another writer got there first. */
export function transitionPost(id: string, guard: PostGuard, data: Record<string, unknown>): Promise<boolean> {
  return guardedWrite(id, guard, data);
}

/** Deletes the post only if `guard` passes. */
export function deletePostIf(id: string, guard: PostGuard): Promise<boolean> {
  return guardedWrite(id, guard, null);
}
