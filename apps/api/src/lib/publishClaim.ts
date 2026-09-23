import { prisma } from '../db/prisma.js';
import { guardedWrite, toDate } from './guardedWrite.js';

// Collection backing prisma.post (see db/prisma.ts); documents are keyed by post id.
const POSTS_COLLECTION = 'posts';

export interface PostState {
  dealer_id: string | null;
  status: string | null;
  scheduled_at: Date | null;
  updated_at: Date | null;
}

export type PostGuard = (post: PostState) => boolean;

function toState(doc: Record<string, unknown>): PostState {
  return {
    dealer_id: typeof doc['dealer_id'] === 'string' ? doc['dealer_id'] : null,
    status: typeof doc['status'] === 'string' ? doc['status'] : null,
    scheduled_at: toDate(doc['scheduled_at']),
    updated_at: toDate(doc['updated_at']),
  };
}

/** Updates the post only if `guard` passes; false means another writer got there first. */
export function transitionPost(id: string, guard: PostGuard, data: Record<string, unknown>): Promise<boolean> {
  return guardedWrite(POSTS_COLLECTION, prisma.post, id, (doc) => guard(toState(doc)), data);
}

/** Deletes the post only if `guard` passes. */
export function deletePostIf(id: string, guard: PostGuard): Promise<boolean> {
  return guardedWrite(POSTS_COLLECTION, prisma.post, id, (doc) => guard(toState(doc)), null);
}
