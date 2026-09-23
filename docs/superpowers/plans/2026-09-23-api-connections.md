# API Connections (saved AI keys) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The platform owner can save, test and remove a Google Gemini/Veo API key in `/admin/apis` (the AI Video App "API connections" pattern). Every image, caption and reel generator then uses that key, falling back to the server's `GEMINI_API_KEY`.

**Architecture:**
- **Data.** Connections live in Firestore `api_connections`. Their keys live in a separate collection, `api_connection_secrets`, encrypted with AES-256-GCM (`lib/secretBox.ts`). The encryption key is the Secret Manager secret `credentials-key`, exposed to Cloud Run as `CREDENTIALS_KEY`.
- **Key lookup.** One resolver, `resolveGeminiKey()` in `lib/aiKeys.ts`, replaces all 13 direct reads of `process.env.GEMINI_API_KEY`. It is cached per instance for 60 s and invalidated whenever a key or connection changes.
- **Test.** "Test" is a free read of Google's model list (`lib/geminiKeyCheck.ts`).
- **Access.** The owner-only routes live under `/v1/admin/api-connections`. The web page follows the AV layout: a list on the left, an editor on the right.

**Tech Stack:** Fastify 5, the Prisma 5 schema with the Firestore adapter, Node `crypto` (web tests run with node:test via tsx), React 19, and Tailwind v4 (AV theme tokens).

**Design (approved in chat, 2026-09-23):**
- **Who manages keys:** the platform owner only.
- **Provider:** Google — Gemini / Veo.
- **Storage:** keys are encrypted in Firestore, never returned to the browser, and shown only as "•••• last4".
- **Test:** a real, free check of the key.
- **Fallback:** the server's `GEMINI_API_KEY`.

## Global Constraints

- **Owner only:** every route requires a global owner (`isGlobalOwner(request.user)`: role `owner` with no dealership).
  - Anonymous requests get 401.
  - Anyone else gets 403 `{ error: { code: 'FORBIDDEN', message: 'Global owner access required' } }`.
- **Keys are never returned.** No response body may ever contain a saved key. Responses expose only `hasKey`, `keyLast4`, `keyUpdatedAt` and `keyUpdatedBy`.
- **Keys are never logged.** Log lines name the action, the connection id and the user id only.
- **Encryption:** AES-256-GCM, a 12-byte random IV per save, and the auth tag stored. `CREDENTIALS_KEY` is 32 bytes, base64-encoded. Outside production only, a development key is derived from `JWT_SECRET`.
- **Provider id:** `google-gemini`, label `Google — Gemini / Veo`.
- **API conventions:** responses use camelCase, the database uses snake_case, and errors take the shape `{ error: { code, message } }`.
- **Tests:**
  - API: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`
  - Web: `npm test -w web`
  - Before a PR: `npm run build` from the repo root, which also type-checks `apps/api/test`.
- **After schema changes:** run `cd apps/api && npx prisma generate`.
- **Commits:** every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Do not commit** `AGENTS.md`, `CLAUDE.md`, `memory/`, `.superpowers/` or `apps/web/dist/`.

## File Map

**API**
- Create `apps/api/src/lib/secretBox.ts`: seal and open secrets.
- Modify `apps/api/prisma/schema.prisma`: add the `ApiConnection` and `ApiConnectionSecret` models.
- Modify `apps/api/src/db/prisma.ts`: register the typed collections.
- Create `apps/api/src/lib/aiKeys.ts`: `resolveGeminiKey`, `getGeminiApiKey`, `hasGeminiKey`, `invalidateAiKeyCache`.
- Create `apps/api/src/lib/geminiKeyCheck.ts`: `checkGeminiKey(key)`.
- Create `apps/api/src/routes/apiConnections.ts`; register it in `apps/api/src/index.ts`.
- Modify these to use the resolver: `services/geminiImage.ts`, `services/geminiService.ts`, `services/geminiVideo.ts`, `services/copyService.ts`, `routes/creative.ts`, `services/robustCreativeEngine.ts`.
- Tests: `test/secret-box.test.ts`, `test/ai-keys.test.ts`, `test/gemini-key-check.test.ts`, `test/api-connections.test.ts`.

**Web**
- Create `apps/web/src/services/apiConnections.ts`.
- Create `apps/web/src/pages/admin/ApiConnectionsPage.tsx`.
- Modify `apps/web/src/App.tsx`: add the `/admin/apis` route.
- Modify `apps/web/src/components/shell/Sidebar.tsx`: add "APIs & models" to the owner's Admin section.

---

### Task 1: `secretBox` (AES-256-GCM)

**Files:**
- Create: `apps/api/src/lib/secretBox.ts`
- Test: `apps/api/test/secret-box.test.ts`

**Interfaces:**
- Produces:
  - `interface SealedSecret { ciphertext: string; iv: string; tag: string }`, all base64.
  - `sealSecret(plaintext: string): SealedSecret`
  - `openSecret(sealed: SealedSecret): string`
  - `class KeyStorageUnavailableError extends Error`
  - `isKeyStorageReady(): boolean`
- In production without `CREDENTIALS_KEY`, `sealSecret` and `openSecret` throw `KeyStorageUnavailableError`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/secret-box.test.ts`:

```ts
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { KeyStorageUnavailableError, isKeyStorageReady, openSecret, sealSecret } from '../src/lib/secretBox.js';

const originalEnv = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

describe('secretBox', () => {
  it('round-trips a secret and never stores the plaintext', () => {
    const sealed = sealSecret('AIzaSy-test-key-1234');
    assert.equal(openSecret(sealed), 'AIzaSy-test-key-1234');
    assert.ok(!sealed.ciphertext.includes('AIzaSy'));
  });

  it('uses a fresh IV each time', () => {
    const a = sealSecret('same');
    const b = sealSecret('same');
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  it('rejects tampered ciphertext', () => {
    const sealed = sealSecret('secret-value');
    const bytes = Buffer.from(sealed.ciphertext, 'base64');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    assert.throws(() => openSecret({ ...sealed, ciphertext: bytes.toString('base64') }));
  });

  it('works with an explicit 32-byte CREDENTIALS_KEY and rejects a wrong-length one', () => {
    process.env['CREDENTIALS_KEY'] = randomBytes(32).toString('base64');
    assert.equal(openSecret(sealSecret('k')), 'k');
    process.env['CREDENTIALS_KEY'] = randomBytes(16).toString('base64');
    assert.throws(() => sealSecret('k'), /32 bytes/);
  });

  it('refuses to seal or open in production without CREDENTIALS_KEY', () => {
    const sealed = sealSecret('k');
    process.env['NODE_ENV'] = 'production';
    delete process.env['CREDENTIALS_KEY'];
    assert.equal(isKeyStorageReady(), false);
    assert.throws(() => sealSecret('k'), KeyStorageUnavailableError);
    assert.throws(() => openSecret(sealed), KeyStorageUnavailableError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/secret-box.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/secretBox.js'`

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/secretBox.ts`:

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export class KeyStorageUnavailableError extends Error {
  constructor() {
    super('Encrypted key storage is not configured (CREDENTIALS_KEY is missing)');
    this.name = 'KeyStorageUnavailableError';
  }
}

// CREDENTIALS_KEY comes from the Secret Manager secret `credentials-key` on Cloud Run.
// Outside production a key derived from JWT_SECRET is used, so local dev and tests need no setup.
function encryptionKey(): Buffer {
  const raw = process.env['CREDENTIALS_KEY']?.trim();
  if (raw) {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes, base64-encoded');
    return key;
  }
  if (process.env['NODE_ENV'] === 'production') throw new KeyStorageUnavailableError();
  return createHash('sha256').update(`dev-credentials:${process.env['JWT_SECRET'] ?? ''}`).digest();
}

export function isKeyStorageReady(): boolean {
  return !!process.env['CREDENTIALS_KEY']?.trim() || process.env['NODE_ENV'] !== 'production';
}

export function sealSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/secret-box.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/secretBox.ts apps/api/test/secret-box.test.ts
git commit -m "feat(api): AES-256-GCM secret box for saved API keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Connection models and the Gemini key resolver

**Files:**
- Modify: `apps/api/prisma/schema.prisma`: append two models.
- Modify: `apps/api/src/db/prisma.ts`: import the types and register the collections.
- Create: `apps/api/src/lib/aiKeys.ts`
- Test: `apps/api/test/ai-keys.test.ts`

**Interfaces:**
- Consumes: `sealSecret`/`openSecret` (Task 1).
- Produces:
  - `GEMINI_PROVIDER = 'google-gemini'`
  - `type GeminiKeySource = 'saved' | 'env' | 'none'`
  - `interface ResolvedGeminiKey { key: string | null; source: GeminiKeySource; connectionId: string | null }`
  - `resolveGeminiKey(): Promise<ResolvedGeminiKey>`
  - `getGeminiApiKey(): Promise<string | null>`
  - `hasGeminiKey(): Promise<boolean>`
  - `invalidateAiKeyCache(): void`
- Rule: use the saved key of the earliest-created **enabled** `google-gemini` connection that has one, otherwise `process.env.GEMINI_API_KEY`, otherwise none.

- [ ] **Step 1: Add the models**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model ApiConnection {
  id             String    @id @default(uuid())
  name           String
  provider       String    // 'google-gemini'
  notes          String?
  enabled        Boolean   @default(true)
  has_key        Boolean   @default(false)
  key_last4      String?
  key_updated_at DateTime?
  key_updated_by String?   // DealerUser.id of the platform owner who last saved or removed the key
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt
}

// Encrypted keys, kept apart from ApiConnection so listing connections never reads a key.
model ApiConnectionSecret {
  id            String   @id @default(uuid())
  connection_id String   @unique
  ciphertext    String
  iv            String
  tag           String
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
}
```

Run: `cd apps/api && npx prisma generate`
Expected: `✔ Generated Prisma Client`

In `apps/api/src/db/prisma.ts`:
- add `ApiConnection,` and `ApiConnectionSecret,` to the `import type { … } from '../generated/client/index.js'` list;
- add these two lines after the `notification = …` line:

```ts
  apiConnection = new FirestoreCollection<ApiConnection>('api_connections', 'ApiConnection');
  apiConnectionSecret = new FirestoreCollection<ApiConnectionSecret>('api_connection_secrets', 'ApiConnectionSecret');
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/ai-keys.test.ts`:

```ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.js';
import { sealSecret } from '../src/lib/secretBox.js';
import { getGeminiApiKey, hasGeminiKey, invalidateAiKeyCache, resolveGeminiKey } from '../src/lib/aiKeys.js';

const ENV_KEY = process.env['GEMINI_API_KEY'];

async function connectionWithKey(key: string, opts: { enabled?: boolean; createdAt?: Date } = {}) {
  const conn = await prisma.apiConnection.create({
    data: {
      name: 'Gemini', provider: 'google-gemini', enabled: opts.enabled ?? true,
      has_key: true, key_last4: key.slice(-4), ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    },
  });
  await prisma.apiConnectionSecret.create({ data: { connection_id: conn.id, ...sealSecret(key) } });
  return conn;
}

beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  delete process.env['GEMINI_API_KEY'];
  invalidateAiKeyCache();
});
afterEach(() => {
  if (ENV_KEY === undefined) delete process.env['GEMINI_API_KEY'];
  else process.env['GEMINI_API_KEY'] = ENV_KEY;
  invalidateAiKeyCache();
});

describe('resolveGeminiKey', () => {
  it('reports none when nothing is configured', async () => {
    assert.deepEqual(await resolveGeminiKey(), { key: null, source: 'none', connectionId: null });
    assert.equal(await hasGeminiKey(), false);
  });

  it('falls back to GEMINI_API_KEY', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    assert.deepEqual(await resolveGeminiKey(), { key: 'env-key-0001', source: 'env', connectionId: null });
  });

  it('prefers the saved key of an enabled connection over the env key', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    const conn = await connectionWithKey('saved-key-9999');
    assert.deepEqual(await resolveGeminiKey(), { key: 'saved-key-9999', source: 'saved', connectionId: conn.id });
    assert.equal(await getGeminiApiKey(), 'saved-key-9999');
  });

  it('ignores disabled connections', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    await connectionWithKey('saved-key-9999', { enabled: false });
    assert.equal((await resolveGeminiKey()).source, 'env');
  });

  it('uses the earliest-created enabled connection', async () => {
    const older = await connectionWithKey('older-key-1111', { createdAt: new Date('2026-01-01') });
    await connectionWithKey('newer-key-2222', { createdAt: new Date('2026-06-01') });
    assert.equal((await resolveGeminiKey()).connectionId, older.id);
  });

  it('caches until invalidated', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    assert.equal(await getGeminiApiKey(), 'env-key-0001');
    await connectionWithKey('saved-key-9999');
    assert.equal(await getGeminiApiKey(), 'env-key-0001');
    invalidateAiKeyCache();
    assert.equal(await getGeminiApiKey(), 'saved-key-9999');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/ai-keys.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/aiKeys.js'`

- [ ] **Step 4: Implement**

Create `apps/api/src/lib/aiKeys.ts`:

```ts
import { prisma } from '../db/prisma.js';
import { openSecret } from './secretBox.js';

export const GEMINI_PROVIDER = 'google-gemini';
const CACHE_MS = 60_000;

export type GeminiKeySource = 'saved' | 'env' | 'none';

export interface ResolvedGeminiKey {
  key: string | null;
  source: GeminiKeySource;
  connectionId: string | null;
}

let cached: { value: ResolvedGeminiKey; at: number } | null = null;

// The saved key of the earliest enabled Gemini connection that has one, else the server's
// GEMINI_API_KEY. Cached for a minute per instance; key or connection changes invalidate it.
export async function resolveGeminiKey(): Promise<ResolvedGeminiKey> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = await lookup();
  cached = { value, at: Date.now() };
  return value;
}

async function lookup(): Promise<ResolvedGeminiKey> {
  try {
    const connections = await prisma.apiConnection.findMany({
      where: { provider: GEMINI_PROVIDER, enabled: true, has_key: true },
      orderBy: { created_at: 'asc' },
    });
    for (const connection of connections) {
      const secret = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: connection.id } });
      if (secret) return { key: openSecret(secret), source: 'saved', connectionId: connection.id };
    }
  } catch (err) {
    // Generation must keep working if the saved key can't be read (store outage, key rotation):
    // fall back to the server key and say so in the logs.
    console.error('[aiKeys] Could not read the saved Gemini key; falling back to GEMINI_API_KEY', err);
  }
  const envKey = process.env['GEMINI_API_KEY']?.trim();
  return envKey
    ? { key: envKey, source: 'env', connectionId: null }
    : { key: null, source: 'none', connectionId: null };
}

export async function getGeminiApiKey(): Promise<string | null> {
  return (await resolveGeminiKey()).key;
}

export async function hasGeminiKey(): Promise<boolean> {
  return (await resolveGeminiKey()).key !== null;
}

export function invalidateAiKeyCache(): void {
  cached = null;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/ai-keys.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/db/prisma.ts apps/api/src/lib/aiKeys.ts apps/api/test/ai-keys.test.ts
git commit -m "feat(api): API connection models and the Gemini key resolver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `checkGeminiKey` (free key test)

**Files:**
- Create: `apps/api/src/lib/geminiKeyCheck.ts`
- Test: `apps/api/test/gemini-key-check.test.ts`

**Interfaces:**
- Produces:
  - `interface GeminiKeyCheck { ok: boolean; detail: string; canGenerateImages: boolean; canGenerateVideo: boolean }`
  - `checkGeminiKey(key: string): Promise<GeminiKeyCheck>`
- It calls `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000` with the header `x-goog-api-key`. This is a free read that generates nothing.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/gemini-key-check.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkGeminiKey } from '../src/lib/geminiKeyCheck.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('checkGeminiKey', () => {
  it('reports image and Veo access from the model list, sending the key as a header', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      jsonResponse(200, { models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-flash-image' }, { name: 'models/veo-3.1-fast-generate-preview' }] }));
    const result = await checkGeminiKey('good-key');
    assert.deepEqual(result, { ok: true, detail: 'Key works — image models available, Veo video available.', canGenerateImages: true, canGenerateVideo: true });
    const [url, init] = fetchMock.mock.calls[0]!.arguments as [string, RequestInit];
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models'));
    assert.ok(!url.includes('good-key'));
    assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], 'good-key');
  });

  it('says so when the key has no Veo access', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, { models: [{ name: 'models/gemini-2.5-flash' }] }));
    const result = await checkGeminiKey('k');
    assert.equal(result.ok, true);
    assert.equal(result.canGenerateVideo, false);
    assert.equal(result.detail, 'Key works — no image models, no Veo access.');
  });

  it('returns Google’s message for a rejected key', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    const result = await checkGeminiKey('bad');
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'API key not valid. Please pass a valid API key.');
  });

  it('reports a network failure without throwing', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    const result = await checkGeminiKey('k');
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'Could not reach Google: getaddrinfo ENOTFOUND');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/gemini-key-check.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/geminiKeyCheck.js'`

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/geminiKeyCheck.ts`:

```ts
const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';

export interface GeminiKeyCheck {
  ok: boolean;
  detail: string;
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
}

const failed = (detail: string): GeminiKeyCheck => ({ ok: false, detail, canGenerateImages: false, canGenerateVideo: false });

// A free read: lists the models the key can use and generates nothing.
export async function checkGeminiKey(key: string): Promise<GeminiKeyCheck> {
  let res: Response;
  try {
    res = await fetch(MODELS_URL, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return failed(`Could not reach Google: ${err instanceof Error ? err.message : String(err)}`);
  }

  const body = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }>; error?: { message?: string } };
  if (!res.ok) return failed(body.error?.message ?? `Google rejected the key (HTTP ${res.status})`);

  const names = (body.models ?? []).map((m) => m.name ?? '');
  const canGenerateImages = names.some((n) => n.includes('image') || n.includes('imagen'));
  const canGenerateVideo = names.some((n) => n.includes('veo'));
  return {
    ok: true,
    detail: `Key works — ${canGenerateImages ? 'image models available' : 'no image models'}, ${canGenerateVideo ? 'Veo video available' : 'no Veo access'}.`,
    canGenerateImages,
    canGenerateVideo,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/gemini-key-check.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/geminiKeyCheck.ts apps/api/test/gemini-key-check.test.ts
git commit -m "feat(api): free Gemini key check via the model list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `/v1/admin/api-connections` routes

**Files:**
- Create: `apps/api/src/routes/apiConnections.ts`
- Modify: `apps/api/src/index.ts`. Add `import apiConnectionRoutes from './routes/apiConnections.js';`, and register it **before** `adminRoutes` with `fastify.register(apiConnectionRoutes, { prefix: '/v1/admin/api-connections' });`.
- Test: `apps/api/test/api-connections.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (HTTP; owner only; all responses camelCase):
  - `GET /` returns `{ items: ApiConnectionView[]; providers: [{ id: 'google-gemini', label: 'Google — Gemini / Veo' }]; activeKey: { source: 'saved'|'env'|'none'; connectionId: string|null }; envKeyPresent: boolean; keyStorageReady: boolean }`.
    - When there are no connections, it first creates one: `{ name: 'Gemini (deploy key)', provider: 'google-gemini', notes: 'Uses the GEMINI_API_KEY set on the Cloud Run service.' }`.
  - `POST /` with `{ name, provider, notes? }` returns 201 `ApiConnectionView`.
  - `PATCH /:id` with `{ name?, notes?, enabled? }` returns `ApiConnectionView`.
  - `DELETE /:id` returns `{ success: true }`.
  - `PUT /:id/key` with `{ key }` returns `ApiConnectionView`, or 503 `KEY_STORAGE_UNAVAILABLE`.
  - `DELETE /:id/key` returns `ApiConnectionView`.
  - `POST /:id/test` returns `{ ok, detail, source: 'saved'|'env', canGenerateImages, canGenerateVideo }`, or 400 `NO_KEY`.
- `ApiConnectionView = { id, name, provider, providerLabel, notes: string|null, enabled, hasKey, keyLast4: string|null, keyUpdatedAt: string|null, keyUpdatedBy: string|null, inUse: boolean }`
- Validation:
  - `name`: 1–80 characters after trimming.
  - `notes`: 1000 characters at most.
  - `provider` must be a known id.
  - `key`: 10–400 characters after trimming, with no whitespace.
  - Unknown ids return 404 `NOT_FOUND`.
  - Bad input returns 400 `INVALID_INPUT`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/api-connections.test.ts`:

```ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache, resolveGeminiKey } from '../src/lib/aiKeys.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

const BASE = '/v1/admin/api-connections';
const KEY = 'AIzaSyTESTkey-abcdef-1234';

function token(role: Role, dealerId: string | null, userId = 'owner-user-1'): string {
  const payload: JwtUser = { dealer_user_id: userId, dealer_id: dealerId, role, phone: '+910000000000', permissions: resolvePermissions(role), typ: 'access' };
  return fastify.jwt.sign(payload);
}
const owner = { authorization: `Bearer ${token('owner', null)}` };

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  delete process.env['GEMINI_API_KEY'];
  invalidateAiKeyCache();
});

async function firstConnectionId(): Promise<string> {
  const res = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
  return (res.json() as { items: Array<{ id: string }> }).items[0]!.id;
}

describe('API connections access', () => {
  it('refuses dealership admins, dealer-scoped owners and anonymous callers', async () => {
    for (const headers of [{ authorization: `Bearer ${token('admin', 'd1')}` }, { authorization: `Bearer ${token('owner', 'd1')}` }]) {
      assert.equal((await fastify.inject({ method: 'GET', url: BASE, headers })).statusCode, 403);
    }
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.equal((await fastify.inject({ method: 'GET', url: BASE })).statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });
});

describe('API connections', () => {
  it('seeds the deploy-key connection once and reports the env key in use', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    const first = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
    assert.equal(first.statusCode, 200);
    const body = first.json() as { items: Array<{ name: string; hasKey: boolean; inUse: boolean }>; activeKey: { source: string }; envKeyPresent: boolean; providers: unknown[] };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0]!.name, 'Gemini (deploy key)');
    assert.equal(body.items[0]!.hasKey, false);
    assert.equal(body.activeKey.source, 'env');
    assert.equal(body.envKeyPresent, true);
    assert.deepEqual(body.providers, [{ id: 'google-gemini', label: 'Google — Gemini / Veo' }]);
    const second = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
    assert.equal((second.json() as { items: unknown[] }).items.length, 1);
  });

  it('saves a key write-only: encrypted at rest, never returned, used by the resolver', async () => {
    const id = await firstConnectionId();
    const saved = await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    assert.equal(saved.statusCode, 200);
    assert.ok(!saved.body.includes(KEY));
    const view = saved.json() as { hasKey: boolean; keyLast4: string; keyUpdatedBy: string; inUse: boolean };
    assert.equal(view.hasKey, true);
    assert.equal(view.keyLast4, '1234');
    assert.equal(view.keyUpdatedBy, 'owner-user-1');
    assert.equal(view.inUse, true);

    const secret = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: id } });
    assert.ok(secret && !secret.ciphertext.includes(KEY));

    const list = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
    assert.ok(!list.body.includes(KEY));
    assert.deepEqual((list.json() as { activeKey: unknown }).activeKey, { source: 'saved', connectionId: id });
    assert.equal((await resolveGeminiKey()).key, KEY);
  });

  it('removing the key falls back to the env key', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    const id = await firstConnectionId();
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    const removed = await fastify.inject({ method: 'DELETE', url: `${BASE}/${id}/key`, headers: owner });
    assert.equal(removed.statusCode, 200);
    assert.equal((removed.json() as { hasKey: boolean }).hasKey, false);
    assert.equal(await prisma.apiConnectionSecret.count({ where: { connection_id: id } }), 0);
    assert.equal((await resolveGeminiKey()).source, 'env');
  });

  it('tests the saved key with a free model-list read', async (t) => {
    const id = await firstConnectionId();
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ models: [{ name: 'models/veo-3.1-fast-generate-preview' }, { name: 'models/gemini-2.5-flash-image' }] }), { status: 200 }));
    const res = await fastify.inject({ method: 'POST', url: `${BASE}/${id}/test`, headers: owner });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, detail: 'Key works — image models available, Veo video available.', source: 'saved', canGenerateImages: true, canGenerateVideo: true });
    assert.equal(((fetchMock.mock.calls[0]!.arguments[1] as RequestInit).headers as Record<string, string>)['x-goog-api-key'], KEY);
  });

  it('refuses to test when neither a saved nor an env key exists', async () => {
    const id = await firstConnectionId();
    const res = await fastify.inject({ method: 'POST', url: `${BASE}/${id}/test`, headers: owner });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, 'NO_KEY');
  });

  it('creates, edits, disables and deletes connections with validation', async () => {
    assert.equal((await fastify.inject({ method: 'POST', url: BASE, headers: owner, payload: { name: '', provider: 'google-gemini' } })).statusCode, 400);
    assert.equal((await fastify.inject({ method: 'POST', url: BASE, headers: owner, payload: { name: 'X', provider: 'openai' } })).statusCode, 400);
    const created = await fastify.inject({ method: 'POST', url: BASE, headers: owner, payload: { name: 'Gemini (team key)', provider: 'google-gemini', notes: 'Billing account B' } });
    assert.equal(created.statusCode, 201);
    const id = (created.json() as { id: string }).id;
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });

    const disabled = await fastify.inject({ method: 'PATCH', url: `${BASE}/${id}`, headers: owner, payload: { enabled: false } });
    assert.equal((disabled.json() as { enabled: boolean }).enabled, false);
    assert.notEqual((await resolveGeminiKey()).connectionId, id);

    assert.equal((await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: 'has spaces in it ok' } })).statusCode, 400);
    assert.equal((await fastify.inject({ method: 'DELETE', url: `${BASE}/${id}`, headers: owner })).statusCode, 200);
    assert.equal(await prisma.apiConnectionSecret.count({ where: { connection_id: id } }), 0);
    assert.equal((await fastify.inject({ method: 'PATCH', url: `${BASE}/${id}`, headers: owner, payload: { name: 'Y' } })).statusCode, 404);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/api-connections.test.ts`
Expected: FAIL. The routes return 404.

- [ ] **Step 3: Implement**

Create `apps/api/src/routes/apiConnections.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { ApiConnection } from '../generated/client/index.js';
import { isGlobalOwner } from '../lib/permissions.js';
import { GEMINI_PROVIDER, invalidateAiKeyCache, resolveGeminiKey, type ResolvedGeminiKey } from '../lib/aiKeys.js';
import { KeyStorageUnavailableError, isKeyStorageReady, openSecret, sealSecret } from '../lib/secretBox.js';
import { checkGeminiKey } from '../lib/geminiKeyCheck.js';

const PROVIDERS: Record<string, string> = { [GEMINI_PROVIDER]: 'Google — Gemini / Veo' };

function view(c: ApiConnection, active: ResolvedGeminiKey) {
  return {
    id: c.id,
    name: c.name,
    provider: c.provider,
    providerLabel: PROVIDERS[c.provider] ?? c.provider,
    notes: c.notes ?? null,
    enabled: c.enabled,
    hasKey: c.has_key,
    keyLast4: c.key_last4 ?? null,
    keyUpdatedAt: c.key_updated_at ? new Date(c.key_updated_at).toISOString() : null,
    keyUpdatedBy: c.key_updated_by ?? null,
    inUse: active.source === 'saved' && active.connectionId === c.id,
  };
}

const bad = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
const notFound = (reply: FastifyReply) =>
  reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'API connection not found' } });

// Platform-owner screen for the keys every image, caption and reel generator uses.
// Keys are write-only: stored encrypted in api_connection_secrets and never sent back.
export default async function apiConnectionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGlobalOwner(request.user)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Global owner access required' } });
    }
  });

  const load = (id: string) => prisma.apiConnection.findUnique({ where: { id } });

  fastify.get('/', async () => {
    if ((await prisma.apiConnection.count({})) === 0) {
      await prisma.apiConnection.create({
        data: { name: 'Gemini (deploy key)', provider: GEMINI_PROVIDER, notes: 'Uses the GEMINI_API_KEY set on the Cloud Run service.' },
      });
    }
    const [connections, active] = await Promise.all([
      prisma.apiConnection.findMany({ orderBy: { created_at: 'asc' } }),
      resolveGeminiKey(),
    ]);
    return {
      items: connections.map((c) => view(c, active)),
      providers: Object.entries(PROVIDERS).map(([id, label]) => ({ id, label })),
      activeKey: { source: active.source, connectionId: active.connectionId },
      envKeyPresent: !!process.env['GEMINI_API_KEY']?.trim(),
      keyStorageReady: isKeyStorageReady(),
    };
  });

  fastify.post('/', async (request, reply) => {
    const { name, provider, notes } = (request.body ?? {}) as { name?: string; provider?: string; notes?: string };
    const cleanName = name?.trim() ?? '';
    if (!cleanName || cleanName.length > 80) return bad(reply, 'name must be 1–80 characters');
    if (!provider || !PROVIDERS[provider]) return bad(reply, 'unknown provider');
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) return bad(reply, 'notes must be at most 1000 characters');
    const created = await prisma.apiConnection.create({ data: { name: cleanName, provider, notes: notes?.trim() || null } });
    return reply.code(201).send(view(created, await resolveGeminiKey()));
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, notes, enabled } = (request.body ?? {}) as { name?: string; notes?: string | null; enabled?: boolean };
    if (!(await load(id))) return notFound(reply);
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const cleanName = name.trim();
      if (!cleanName || cleanName.length > 80) return bad(reply, 'name must be 1–80 characters');
      data['name'] = cleanName;
    }
    if (notes !== undefined) {
      if (notes !== null && (typeof notes !== 'string' || notes.length > 1000)) return bad(reply, 'notes must be at most 1000 characters');
      data['notes'] = notes?.trim() || null;
    }
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') return bad(reply, 'enabled must be true or false');
      data['enabled'] = enabled;
    }
    const updated = await prisma.apiConnection.update({ where: { id }, data });
    invalidateAiKeyCache();
    return view(updated, await resolveGeminiKey());
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await load(id))) return notFound(reply);
    await prisma.apiConnectionSecret.deleteMany({ where: { connection_id: id } });
    await prisma.apiConnection.delete({ where: { id } });
    invalidateAiKeyCache();
    request.log.info({ action: 'api_connection.deleted', connectionId: id, by: request.user.dealer_user_id });
    return { success: true };
  });

  fastify.put('/:id/key', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { key } = (request.body ?? {}) as { key?: string };
    const cleanKey = typeof key === 'string' ? key.trim() : '';
    if (cleanKey.length < 10 || cleanKey.length > 400 || /\s/.test(cleanKey)) return bad(reply, 'key must be 10–400 characters with no spaces');
    if (!(await load(id))) return notFound(reply);

    let sealed;
    try {
      sealed = sealSecret(cleanKey);
    } catch (err) {
      if (err instanceof KeyStorageUnavailableError) {
        return reply.code(503).send({ error: { code: 'KEY_STORAGE_UNAVAILABLE', message: 'Key storage is not configured on the server.' } });
      }
      throw err;
    }

    const existing = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: id } });
    if (existing) await prisma.apiConnectionSecret.update({ where: { id: existing.id }, data: sealed });
    else await prisma.apiConnectionSecret.create({ data: { connection_id: id, ...sealed } });

    const updated = await prisma.apiConnection.update({
      where: { id },
      data: { has_key: true, key_last4: cleanKey.slice(-4), key_updated_at: new Date(), key_updated_by: request.user.dealer_user_id },
    });
    invalidateAiKeyCache();
    request.log.info({ action: 'api_key.saved', connectionId: id, by: request.user.dealer_user_id });
    return view(updated, await resolveGeminiKey());
  });

  fastify.delete('/:id/key', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await load(id))) return notFound(reply);
    await prisma.apiConnectionSecret.deleteMany({ where: { connection_id: id } });
    const updated = await prisma.apiConnection.update({
      where: { id },
      data: { has_key: false, key_last4: null, key_updated_at: new Date(), key_updated_by: request.user.dealer_user_id },
    });
    invalidateAiKeyCache();
    request.log.info({ action: 'api_key.removed', connectionId: id, by: request.user.dealer_user_id });
    return view(updated, await resolveGeminiKey());
  });

  fastify.post('/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const connection = await load(id);
    if (!connection) return notFound(reply);

    let key: string | null = null;
    let source: 'saved' | 'env' = 'env';
    if (connection.has_key) {
      const secret = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: id } });
      if (secret) {
        key = openSecret(secret);
        source = 'saved';
      }
    }
    key ??= process.env['GEMINI_API_KEY']?.trim() || null;
    if (!key) return reply.code(400).send({ error: { code: 'NO_KEY', message: 'No key saved here and no GEMINI_API_KEY on the server.' } });

    const result = await checkGeminiKey(key);
    request.log.info({ action: 'api_key.tested', connectionId: id, by: request.user.dealer_user_id, ok: result.ok });
    return { ...result, source };
  });
}
```

Register it in `apps/api/src/index.ts`: add the import with the other route imports, and insert the registration line directly **above** `fastify.register(adminRoutes, …)`.

- [ ] **Step 4: Run the tests, then the full API suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/api-connections.test.ts`
Expected: PASS (7 tests)

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/apiConnections.ts apps/api/src/index.ts apps/api/test/api-connections.test.ts
git commit -m "feat(api): owner-only API connections with write-only encrypted keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Every Gemini generator uses the resolver

**Files (modify):**
- `apps/api/src/services/geminiImage.ts`, around lines 9 and 120
- `apps/api/src/services/geminiService.ts`, around lines 438, 511, 587, 598 and 714
- `apps/api/src/services/geminiVideo.ts`, around lines 240, 337 and 593
- `apps/api/src/services/copyService.ts`, around line 20
- `apps/api/src/routes/creative.ts`:
  - around line 712 (a route handler);
  - around line 1420 (`describeUrl` builds `?key=${process.env.GEMINI_API_KEY}` into the URL);
  - every `isGeminiTextAvailable()` / `isGeminiImageAvailable()` call (around lines 94, 497, 614, 830, 969, 1026, 1039, 1347).
- `apps/api/src/services/robustCreativeEngine.ts`, the `isGeminiImageAvailable()` call around line 336.

**Interfaces:**
- Consumes `getGeminiApiKey()` and `hasGeminiKey()` from `../lib/aiKeys.js`.
- Changes `isGeminiImageAvailable()` and `isGeminiTextAvailable()` to `async … : Promise<boolean>` (`return hasGeminiKey();`).
- Every caller must `await` them. All callers are already inside async functions.

- [ ] **Step 1: Replace each read**

At every site listed above:
- Replace `process.env.GEMINI_API_KEY` or `process.env['GEMINI_API_KEY']` with `await getGeminiApiKey()`.
- Keep each site's existing behaviour when there is no key: the same throw, the same 400, or `|| ''` becoming `?? ''`.
- Update the user-facing "not configured" messages to name both options: "Gemini API key is not configured. Save one in Admin → APIs & models or set GEMINI_API_KEY on the server."
- For `describeUrl` in `creative.ts`, read the key into a `const describeKey = await getGeminiApiKey();` before building the request. Send it as the header `'x-goog-api-key': describeKey ?? ''` in that request's `headers` instead of the `?key=` query parameter. Keys in URLs end up in logs.
- Add `import { getGeminiApiKey, hasGeminiKey } from '../lib/aiKeys.js';` (or `'./…'` / `'../…'` as the file's location requires) to each file, importing only what the file uses.

Change the two availability checks to:

```ts
export async function isGeminiImageAvailable(): Promise<boolean> {
  return hasGeminiKey();
}
```

```ts
export async function isGeminiTextAvailable(): Promise<boolean> {
  return hasGeminiKey();
}
```

Then add `await` at every call site: `if (await isGeminiImageAvailable())`, and `if (!(await isGeminiImageAvailable()) && …)` for the negated call around line 1026.

- [ ] **Step 2: Prove nothing reads the env key directly any more**

Run: `grep -rn "GEMINI_API_KEY" apps/api/src | grep -v "lib/aiKeys.ts" | grep -v "routes/apiConnections.ts"`
Expected: only string literals in user-facing messages, no `process.env` reads.

- [ ] **Step 3: Type-check and run the full suite**

Run: `cd apps/api && npx tsc --noEmit && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'`
Expected: `tsc` clean; every test passes. A missed `await` shows up here: a `Promise` is always truthy, so tsc flags the `if (promise)` in strict mode, or a test fails.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/geminiImage.ts apps/api/src/services/geminiService.ts apps/api/src/services/geminiVideo.ts apps/api/src/services/copyService.ts apps/api/src/routes/creative.ts apps/api/src/services/robustCreativeEngine.ts
git commit -m "feat(api): every Gemini generator uses the saved key, falling back to GEMINI_API_KEY

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web — "APIs & models" page

**Files:**
- Create: `apps/web/src/services/apiConnections.ts`
- Create: `apps/web/src/pages/admin/ApiConnectionsPage.tsx`
- Modify: `apps/web/src/App.tsx`. Add `import ApiConnectionsPage from './pages/admin/ApiConnectionsPage';` and, next to the `/admin` route:
  `<Route path="/admin/apis" element={<RequireAuth><RequireGlobalOwner><AppLayout><ApiConnectionsPage /></AppLayout></RequireGlobalOwner></RequireAuth>} />`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`.
  - In the owner-only "Admin" section, after the "Console" `NavLink`, add a second item: `<NavLink to="/admin/apis" …>` with the `KeyRound` icon from `lucide-react` and the label `APIs & models`, using the same `itemClass`/`iconClass`.
  - Give the "Console" link `end` so it isn't active on `/admin/apis`.

**Interfaces:**
- Consumes the Task 4 HTTP contract.
- The page follows the AV screenshot:
  - The left card "API connections", with a count and an "Add API" button, a short explainer, and selectable rows showing the name, provider label and a "key saved" / "no key" chip.
  - The right card "Edit API connection", with:
    - Name and Platform (a select of `providers`);
    - a status banner;
    - "Replace API key" (a password input with the placeholder `•••••••• (a key is saved)` when `hasKey`), with Save key / Test / Remove;
    - the helper "Test is a free read — it checks the key without generating anything.";
    - Notes;
    - Save connection / Close.
- Banner copy:
  - When the connection is `inUse`: "Using the key saved here — for captions, AI images and every reel. Remove it to go back to the server's GEMINI_API_KEY."
  - When it has no key and `activeKey.source === 'env'`: "Using the server's GEMINI_API_KEY. Save a key here to override it."
  - When nothing is configured: "No Gemini key is configured — image and reel generation is off until you save one."
  - When the connection has a key but another is in use: "A key is saved here, but another connection's key is in use."
- If `keyStorageReady` is false, show a warning "Key storage isn't configured on the server yet" and disable Save key.

- [ ] **Step 1: Create the service**

```ts
import api from './api';

export interface ApiConnectionView {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  notes: string | null;
  enabled: boolean;
  hasKey: boolean;
  keyLast4: string | null;
  keyUpdatedAt: string | null;
  keyUpdatedBy: string | null;
  inUse: boolean;
}

export interface ApiConnectionsList {
  items: ApiConnectionView[];
  providers: Array<{ id: string; label: string }>;
  activeKey: { source: 'saved' | 'env' | 'none'; connectionId: string | null };
  envKeyPresent: boolean;
  keyStorageReady: boolean;
}

export interface KeyTestResult {
  ok: boolean;
  detail: string;
  source: 'saved' | 'env';
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
}

const BASE = '/admin/api-connections';

export const apiConnectionService = {
  list: () => api.get<ApiConnectionsList>(BASE),
  create: (body: { name: string; provider: string; notes?: string }) => api.post<ApiConnectionView>(BASE, body),
  update: (id: string, body: { name?: string; notes?: string | null; enabled?: boolean }) => api.patch<ApiConnectionView>(`${BASE}/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`${BASE}/${id}`),
  saveKey: (id: string, key: string) => api.put<ApiConnectionView>(`${BASE}/${id}/key`, { key }),
  removeKey: (id: string) => api.delete<ApiConnectionView>(`${BASE}/${id}/key`),
  test: (id: string) => api.post<KeyTestResult>(`${BASE}/${id}/test`),
};
```

(Check `apps/web/src/services/api.ts` for the exact `put`/`patch`/`delete` signatures and adapt only if they differ.)

- [ ] **Step 2: Create the page**

`apps/web/src/pages/admin/ApiConnectionsPage.tsx` is a single default-exported component. Behaviour:

**State and loading**
- On mount, call `apiConnectionService.list()`, store it in state, and select the first item.
- "Add API" opens a blank editor for a new connection: name empty, provider `google-gemini`.
  - Save connection calls `create`, then reloads and selects the new item.
- For an existing item, Save connection calls `update` with `{ name, notes }`, then reloads and shows the success toast "Connection saved".

**Key actions**
- **Save key:** calls `saveKey(id, key)`, clears the input, reloads, and toasts "Key saved". It is disabled while the input is empty or `!keyStorageReady`.
- **Test:** calls `test(id)`. It shows a success toast titled "Key works" with `detail` as the message, or an error toast titled "Key test failed" with `detail`.
- **Remove:** asks `window.confirm('Remove the saved key? Generation will fall back to the server key.')`, then calls `removeKey`, reloads, and toasts "Key removed".
- **Close:** clears the selection.
- API errors show an error toast with the `ApiError` message. Use `useToast()` from `../../components/ui/Toast`.

**Layout**
- Grid: `grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] max-w-6xl mx-auto`.
- Cards: `bg-white rounded-xl border border-zinc-200 shadow-sm`. Each card header is `px-5 py-4 border-b border-zinc-100` with an `<h2 className="text-lg font-semibold text-zinc-900">`; headings render serif via the global rule.
- Rows: `w-full text-left rounded-xl border p-3.5 transition-colors`. Selected rows use `border-orange-600 bg-orange-50 ring-1 ring-orange-600/20`; the others use `border-zinc-200 hover:bg-zinc-50`.
- Chip "key saved": `text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full`. The "no key" chip uses zinc.
- Banner: `flex gap-2 rounded-xl px-4 py-3 text-sm`. It is `bg-emerald-50 text-emerald-700` when a key is in use, and `bg-amber-50 text-amber-800` when there is none.
- Buttons: use the `Button` component (`../../components/ui/Button`) with `variant="primary"` for Save connection and `variant="secondary"` for Save key / Test / Remove / Close / Add API.
- Inputs: `w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-600/30`.
- Show `keyLast4` as `•••• {keyLast4}` beside the chip, plus "Updated {formatRelativeTime(keyUpdatedAt)}" from `../../utils/helpers` when present.
- Mobile (below `lg`): the list stacks above the editor.

- [ ] **Step 3: Wire the route and the sidebar link** (as described under **Files** above)

- [ ] **Step 4: Verify**

Run: `npm run build -w web && npm test -w web && cd apps/web && npx eslint src/pages/admin/ApiConnectionsPage.tsx src/services/apiConnections.ts src/components/shell/Sidebar.tsx`
Expected: build exits 0; tests pass; no eslint problems in those files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/apiConnections.ts apps/web/src/pages/admin/ApiConnectionsPage.tsx apps/web/src/App.tsx apps/web/src/components/shell/Sidebar.tsx
git commit -m "feat(web): APIs & models page for saving, testing and removing AI keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verify and ship

- [ ] **Step 1: Full gate.** Run `npm run build` from the repo root; `JWT_SECRET=dummy npm test`; and `cd apps/web && npx eslint . | tail -1`, which must show no more than 78 problems.

- [ ] **Step 2: Local check (controller)** with the in-memory API (`.claude/launch.json` → `api-local`, `web-local`):
  1. Sign in as the platform owner. Locally, the dev bypass or an owner token works; use a signed owner JWT placed in `localStorage` for the session.
  2. Open `/admin/apis` and confirm the seeded "Gemini (deploy key)" appears.
  3. Save a dummy key. Confirm "key saved •••• last4" and the green banner.
  4. Remove it. Confirm the fallback banner.
  5. Do not run Test against Google with a real key.

- [ ] **Step 3: PR, then deploy after the owner approves.** Deploy the API with the secret wired:
  `gcloud run deploy cardekho-api --source . --region asia-south1 --project gen-lang-client-0078524499 --update-secrets=CREDENTIALS_KEY=credentials-key:latest --quiet`
  Build from a clean export of the merged `main`.

  Smoke test:
  - As the owner, `GET /v1/admin/api-connections` returns `keyStorageReady: true` and `activeKey.source: 'env'`.
  - As a dealer, it returns 403.
  - Existing generation still uses the env key.
