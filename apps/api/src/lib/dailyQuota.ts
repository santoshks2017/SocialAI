import { createHash } from 'crypto';
import { Timestamp } from '@google-cloud/firestore';
import { firestore, isUsingMemoryStore } from '../db/firestore.js';

// Per-day usage caps for paid AI features. Counters live in Firestore so the cap
// holds across Cloud Run instances; tests and local dev use process memory.
// Attempts count even when the provider call later fails, so failures cannot be
// used to get past the cap.

const COLLECTION = 'usage_quotas';
const memory = new Map<string, number>();

function dayKey(feature: string, subject: string): string {
  return `${feature}:${subject}:${new Date().toISOString().slice(0, 10)}`;
}

function docId(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Counts one use of `feature` by `subject` today (UTC). False, without counting, once `limit` is reached. */
export async function consumeDailyQuota(feature: string, subject: string, limit: number): Promise<boolean> {
  const key = dayKey(feature, subject);
  if (isUsingMemoryStore()) {
    const used = memory.get(key) ?? 0;
    if (used >= limit) return false;
    memory.set(key, used + 1);
    return true;
  }
  const ref = firestore.collection(COLLECTION).doc(docId(key));
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.['count'] as number | undefined) ?? 0;
    if (used >= limit) return false;
    tx.set(ref, {
      feature,
      subject,
      count: used + 1,
      // Lets a Firestore TTL policy on expires_at clear old counters.
      expires_at: Timestamp.fromMillis(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    return true;
  });
}

