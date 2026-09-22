import { createHash, randomBytes } from 'crypto';
import { Timestamp, type DocumentData } from '@google-cloud/firestore';
import { firestore, isUsingMemoryStore } from '../db/firestore.js';

// OAuth callbacks finish with a browser redirect to the web app, and anything in
// that URL lands in browser history, Referer headers and hosting/CDN logs. So the
// callbacks park their secrets (session JWTs, Meta page tokens) here and redirect
// with an opaque single-use code instead.
//
// Entries live in Firestore so a code issued on one Cloud Run instance can be
// redeemed on another. Production has no Redis, and the memory fallback in
// cache.ts is per instance. Local dev and tests follow the Firestore adapter onto
// process memory.

export const HANDOFF_CODE_TTL_SECONDS = 60;
export const META_PAGE_SELECTION_TTL_SECONDS = 10 * 60;

const COLLECTION = 'oauth_handoffs';
const memory = new Map<string, { value: unknown; expiresAt: number }>();

// Keys can embed the code itself, so documents are stored under a hash of the key.
function docId(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function liveValue<T>(data: DocumentData | undefined): T | null {
  if (!data) return null;
  return (data['expires_at'] as Timestamp).toMillis() > Date.now() ? (data['value'] as T) : null;
}

// Unredeemed entries still hold secrets, so expired ones are cleared as new ones arrive.
async function sweepExpired(): Promise<void> {
  try {
    const stale = await firestore.collection(COLLECTION)
      .where('expires_at', '<=', Timestamp.now())
      .limit(50)
      .get();
    if (stale.empty) return;
    const batch = firestore.batch();
    stale.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (err) {
    console.warn('[oauthHandoff] Failed to sweep expired entries:', err);
  }
}

async function putEntry(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  // Firestore rejects undefined fields; the JSON round-trip drops them and keeps
  // callers from mutating what was stored.
  const plain = JSON.parse(JSON.stringify(value));

  if (isUsingMemoryStore()) {
    for (const [k, entry] of memory) {
      if (entry.expiresAt <= Date.now()) memory.delete(k);
    }
    memory.set(key, { value: plain, expiresAt });
    return;
  }

  await firestore.collection(COLLECTION).doc(docId(key)).set({
    value: plain,
    expires_at: Timestamp.fromMillis(expiresAt),
  });
  await sweepExpired();
}

async function getEntry<T>(key: string): Promise<T | null> {
  if (isUsingMemoryStore()) {
    const entry = memory.get(key);
    return entry && entry.expiresAt > Date.now() ? (entry.value as T) : null;
  }
  const snap = await firestore.collection(COLLECTION).doc(docId(key)).get();
  return liveValue<T>(snap.data());
}

// Reads and deletes in one step, so an entry is handed out at most once even when
// two requests race for it.
async function takeEntry<T>(key: string): Promise<T | null> {
  if (isUsingMemoryStore()) {
    const entry = memory.get(key);
    memory.delete(key);
    return entry && entry.expiresAt > Date.now() ? (entry.value as T) : null;
  }
  const ref = firestore.collection(COLLECTION).doc(docId(key));
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    return liveValue<T>(snap.data());
  });
}

async function deleteEntry(key: string): Promise<void> {
  if (isUsingMemoryStore()) {
    memory.delete(key);
    return;
  }
  await firestore.collection(COLLECTION).doc(docId(key)).delete();
}

// ── One-time codes ──────────────────────────────────────────────────────────

export type HandoffKind = 'session' | 'meta_pages';

export interface SessionHandoff {
  token: string;
  refreshToken: string;
}

/** Parks `payload` for HANDOFF_CODE_TTL_SECONDS and returns the one-time code that redeems it. */
export async function issueHandoffCode(kind: HandoffKind, payload: unknown): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  await putEntry(`handoff:${code}`, { kind, payload }, HANDOFF_CODE_TTL_SECONDS);
  return code;
}

/**
 * Returns the payload behind `code` and burns the code. Null when the code is
 * unknown, expired, already used, or was issued for a different kind.
 */
export async function redeemHandoffCode<T>(kind: HandoffKind, code: unknown): Promise<T | null> {
  if (typeof code !== 'string' || code.length === 0 || code.length > 128) return null;
  const entry = await takeEntry<{ kind: HandoffKind; payload: T }>(`handoff:${code}`);
  return entry && entry.kind === kind ? entry.payload : null;
}

// ── Meta page selection ─────────────────────────────────────────────────────
// /v1/auth/facebook/callback collects every Page the user manages, with its token.
// The web app redeems the code for names and ids only. The tokens stay parked
// under the dealer until POST /v1/platform-accounts picks one by id.

export interface MetaPageSelection {
  pages: Array<{ id: string; name: string; access_token: string }>;
  // Instagram Business accounts publish with the token of their linked Page.
  instagrams: Array<{ id: string; username: string; page_id: string }>;
  tokenExpiry: string;
}

export interface ResolvedMetaAccount {
  accountName: string;
  accessToken: string;
  tokenExpiry: string;
}

const metaSelectionKey = (dealerId: string) => `meta_pages:${dealerId}`;

export async function stashMetaPageSelection(dealerId: string, selection: MetaPageSelection): Promise<void> {
  await putEntry(metaSelectionKey(dealerId), selection, META_PAGE_SELECTION_TTL_SECONDS);
}

export async function resolveMetaAccount(
  dealerId: string,
  platform: 'facebook' | 'instagram',
  accountId: string,
): Promise<ResolvedMetaAccount | null> {
  const selection = await getEntry<MetaPageSelection>(metaSelectionKey(dealerId));
  if (!selection) return null;

  if (platform === 'facebook') {
    const page = selection.pages.find((p) => p.id === accountId);
    return page
      ? { accountName: page.name, accessToken: page.access_token, tokenExpiry: selection.tokenExpiry }
      : null;
  }

  const ig = selection.instagrams.find((i) => i.id === accountId);
  const page = ig && selection.pages.find((p) => p.id === ig.page_id);
  return ig && page
    ? { accountName: ig.username, accessToken: page.access_token, tokenExpiry: selection.tokenExpiry }
    : null;
}

export async function clearMetaPageSelection(dealerId: string): Promise<void> {
  await deleteEntry(metaSelectionKey(dealerId));
}
