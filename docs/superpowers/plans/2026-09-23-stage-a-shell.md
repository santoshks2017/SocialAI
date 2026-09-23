# Stage A: Design System, App Shell and Notifications, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole dealer app the DevOps "Social AI" look and shell:
- their tokens, grey palette and dark mode
- the sidebar, notifications bell and "disconnected" banner

Also add the Notification backend that the bell reads.

**Architecture:**
- **CSS (`apps/web/src/index.css`):**
  - Carries their Tailwind v4 theme.
  - Remaps the slate, stone, gray and neutral scales onto zinc, so every existing page adopts their greys with no per-page edits.
  - Holds their `.dark` block (extended to the remapped scales).
- **Shell:** moves out of `App.tsx` into `apps/web/src/components/shell/`.
- **Pure logic** (theme mode, disconnected platforms) lives in `apps/web/src/utils/`, where the web test runner looks. The bell reuses the existing `formatRelativeTime` from `utils/helpers.ts`.
- **API:** gains a `Notification` model (one row per recipient), `/v1/notifications` routes, a `notify()` helper for later stages, and a server-computed `needs_reconnect` flag on `GET /v1/platforms`.

**Tech Stack:** React 19, Tailwind CSS v4, lucide-react, react-router-dom 7 (web). Fastify 5, Prisma 5 schema with the Firestore adapter, and node:test via tsx (API and web tests).

**Spec:** `docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md` (Sections 4, 5, 7 and 8, Stage A)

**Reference:** `~/Documents/Coder/social-ai-reference-2026-09-23/` (their compiled bundle; never copy it into the repo). The decoded, readable excerpts used below were extracted from `app.js` and `app.css` in that snapshot.

## Global Constraints

- **Brand colour:** `#ea580c`; hover `#c2410c`; subtle `#fff7ed`. Canvas `#fafafa`. Font `"Inter", system-ui, -apple-system, sans-serif`.
- **Theme:** modes are `light | dark | system`, stored in `localStorage` key `themeMode`. **Default is `light` in Stage A**; Stage E switches the default to `system` once every page is ported.
- **Copy:** user-visible text copied from their app must be verbatim, including "—" and "…".
- **Public repo:** do not commit their bundle, and do not put credentials or exploit detail in commit messages.
- **API conventions:**
  - Every route is authenticated.
  - Handlers read `request.user` (`dealer_user_id`, `dealer_id`).
  - Responses use camelCase fields; the database uses snake_case.
  - Errors take the shape `{ error: { code, message } }`.
- **Tests:**
  - API: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`
  - Web: `npm test -w web` (runs `src/utils/**/*.test.ts`)
  - Before a PR: `npm run build` from the repo root (the API build also type-checks `apps/api/test/`).
- **After changing `apps/api/prisma/schema.prisma`:** run `cd apps/api && npx prisma generate`.
- **Commits:** each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

**API**
- Modify `apps/api/prisma/schema.prisma`: add the `Notification` model.
- Modify `apps/api/src/db/prisma.ts`: register the typed `notification` collection.
- Create `apps/api/src/lib/notifications.ts`: `notify()` fan-out helper.
- Create `apps/api/src/routes/notifications.ts`: list, mark read, mark all read.
- Modify `apps/api/src/index.ts`: register the routes under `/v1/notifications`.
- Create `apps/api/src/lib/platformHealth.ts`: `needsReconnect()`.
- Modify `apps/api/src/routes/platform.ts`: add `needs_reconnect` to each connection in `GET /v1/platforms`.
- Create tests `apps/api/test/notifications.test.ts` and `apps/api/test/platform-health.test.ts`.

**Web**
- Modify `apps/web/index.html`: apply the saved theme before first paint.
- Modify `apps/web/src/index.css`: tokens, one zinc grey palette, `.dark` block.
- Create `apps/web/src/utils/theme.ts` (+ test): theme-mode parsing and resolution.
- Create `apps/web/src/contexts/ThemeContext.tsx`: applies `.dark` and exposes `mode`/`setMode`.
- Create `apps/web/src/utils/disconnectedPlatforms.ts` (+ test).
- Create `apps/web/src/utils/roleLabel.ts` (+ test).
- Create `apps/web/src/services/notifications.ts`.
- Modify `apps/web/src/components/ui/Button.tsx`: reference styling (Toast already matches the reference; the grey remap fixes its colours).
- Create `apps/web/src/components/shell/`: `navConfig.ts`, `Logo.tsx`, `Sidebar.tsx`, `MobileTopBar.tsx`, `NotificationBell.tsx`, `DisconnectedBanner.tsx`, `AppLayout.tsx`.
- Modify `apps/web/src/App.tsx`: remove the old `Sidebar`, `MobileTopBar` and `AppLayout`; use the shell; wrap the app in `ThemeProvider`.
- Modify `apps/web/src/pages/SettingsPage.tsx`: theme selector on the Preferences tab.

**Deferred to the stage that first uses them (YAGNI):**
- StatCard, SectionCard, PageCard, PageHeader and EmptyState come in Stage B with the Dashboard and Posts.
- ThemedSelect comes with its first consumer.
- The server-synced `theme_mode` and dealer brand palette come in Stage E with the Preferences tab that switches them on.

---

### Task 1: Notification model and `notify()` helper

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (append a model)
- Modify: `apps/api/src/db/prisma.ts` (import type, add collection)
- Create: `apps/api/src/lib/notifications.ts`
- Test: `apps/api/test/notifications.test.ts`

**Interfaces:**
- Produces: `notify(input: NotifyInput): Promise<number>` (the number of rows created), and `type NotificationType`.
- `NotifyInput = { dealerId: string; type: NotificationType; title: string; body?: string; link?: string; userIds?: string[] }`
- Omitting `userIds` notifies every active user of the dealership.
- Later stages call `notify(...).catch((err) => log.warn(...))` so that a failed notification never fails the action that triggered it.

- [ ] **Step 1: Add the model to the schema**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model Notification {
  id         String   @id @default(uuid())
  dealer_id  String
  user_id    String   // recipient DealerUser.id: one row per recipient, so read state is per person
  type       String
  title      String
  body       String?
  link       String?
  is_read    Boolean  @default(false)
  created_at DateTime @default(now())

  @@index([user_id, created_at])
}
```

- [ ] **Step 2: Regenerate the client and register the collection**

Run: `cd apps/api && npx prisma generate`
Expected: `✔ Generated Prisma Client`

In `apps/api/src/db/prisma.ts`, add `Notification,` to the `import type { … } from '../generated/client/index.js'` list. Then add this line after `userSession = …`:

```ts
  notification = new FirestoreCollection<Notification>('notifications', 'Notification');
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/test/notifications.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { notify } from '../src/lib/notifications.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

async function newDealerWithUsers(activeUsers: number, inactiveUsers = 0) {
  const dealer = await prisma.dealer.create({ data: { name: 'Notify Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  const users = [];
  for (let i = 0; i < activeUsers + inactiveUsers; i++) {
    users.push(await prisma.dealerUser.create({
      data: { phone: `u-${randomUUID()}`, name: `User ${i}`, role: 'admin', dealer_id: dealer.id, is_active: i < activeUsers },
    }));
  }
  return { dealerId: dealer.id, users };
}

function tokenFor(userId: string, dealerId: string): string {
  const payload: JwtUser = {
    dealer_user_id: userId, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return fastify.jwt.sign(payload);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

describe('notify()', () => {
  it('creates one unread row per active user of the dealership', async () => {
    const { dealerId, users } = await newDealerWithUsers(2, 1);
    const other = await newDealerWithUsers(1);

    const created = await notify({ dealerId, type: 'post_published', title: 'Post published', link: '/posts' });

    assert.equal(created, 2);
    const rows = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(rows.map((r) => r.user_id).sort(), [users[0]!.id, users[1]!.id].sort());
    assert.ok(rows.every((r) => r.is_read === false && r.type === 'post_published' && r.link === '/posts'));
    assert.equal((await prisma.notification.findMany({ where: { dealer_id: other.dealerId } })).length, 0);
  });

  it('notifies only the given users when userIds is set', async () => {
    const { dealerId, users } = await newDealerWithUsers(3);
    const created = await notify({ dealerId, type: 'approval_decided', title: 'Post approved', userIds: [users[2]!.id] });
    assert.equal(created, 1);
    const rows = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(rows.map((r) => r.user_id), [users[2]!.id]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/notifications.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/notifications.js'`

- [ ] **Step 5: Implement `notify()`**

Create `apps/api/src/lib/notifications.ts`:

```ts
import { prisma } from '../db/prisma.js';

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'approval_requested'
  | 'approval_decided'
  | 'reel_ready'
  | 'platform_disconnected'
  | 'inbox_message';

export interface NotifyInput {
  dealerId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Recipients (DealerUser ids). Omit to notify every active user of the dealership. */
  userIds?: string[];
}

// One row per recipient so each person has their own read state.
export async function notify(input: NotifyInput): Promise<number> {
  const userIds = input.userIds ?? (
    await prisma.dealerUser.findMany({ where: { dealer_id: input.dealerId, is_active: true } })
  ).map((u) => u.id);
  if (userIds.length === 0) return 0;

  await prisma.notification.createMany({
    data: userIds.map((user_id) => ({
      dealer_id: input.dealerId,
      user_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  });
  return userIds.length;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/notifications.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/db/prisma.ts apps/api/src/lib/notifications.ts apps/api/test/notifications.test.ts
git commit -m "feat(api): Notification model and notify() fan-out helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `/v1/notifications` routes

**Files:**
- Create: `apps/api/src/routes/notifications.ts`
- Modify: `apps/api/src/index.ts` (import and register)
- Test: `apps/api/test/notifications.test.ts` (append)

**Interfaces:**
- Consumes: the `Notification` model and `notify()` from Task 1.
- Produces (HTTP):
  - `GET /v1/notifications?pageSize=15` → `{ items: Array<{ id: string; type: string; title: string; body: string | null; deepLink: string | null; isRead: boolean; createdAt: string }>, unreadCount: number }` (`deepLink` is the field name their bell reads; the DB column is `link`). Newest first; `pageSize` is clamped to 1–50 (default 15).
  - `POST /v1/notifications/:id/read` → `{ success: true }`, or 404 `{ error: { code: 'NOT_FOUND' } }` when the notification is not the caller's.
  - `POST /v1/notifications/read-all` → `{ success: true, count: number }`.
- All three routes return 401 without a valid access token.

- [ ] **Step 1: Write the failing tests**

Append to the end of `apps/api/test/notifications.test.ts`:

```ts
describe('GET/POST /v1/notifications', () => {
  it('lists only the caller’s notifications, newest first, with the unread count', async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    const [me, colleague] = [users[0]!, users[1]!];
    await prisma.notification.create({ data: { dealer_id: dealerId, user_id: me.id, type: 'post_published', title: 'Older', link: '/posts', created_at: new Date('2026-09-01T10:00:00Z') } });
    await prisma.notification.create({ data: { dealer_id: dealerId, user_id: me.id, type: 'post_failed', title: 'Newer', is_read: true, created_at: new Date('2026-09-02T10:00:00Z') } });
    await prisma.notification.create({ data: { dealer_id: dealerId, user_id: colleague.id, type: 'post_published', title: 'Not mine' } });

    const res = await fastify.inject({ method: 'GET', url: '/v1/notifications', headers: bearer(tokenFor(me.id, dealerId)) });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { items: Array<{ title: string; isRead: boolean; createdAt: string; deepLink: string | null }>; unreadCount: number };
    assert.deepEqual(body.items.map((i) => i.title), ['Newer', 'Older']);
    assert.equal(body.items[0]!.isRead, true);
    assert.equal(body.items[0]!.deepLink, null);
    assert.equal(body.items[1]!.deepLink, '/posts');
    assert.equal(body.items[1]!.createdAt, '2026-09-01T10:00:00.000Z');
    assert.equal(body.unreadCount, 1);
  });

  it('respects pageSize but still counts every unread notification', async () => {
    const { dealerId, users } = await newDealerWithUsers(1);
    for (let i = 0; i < 4; i++) {
      await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[0]!.id, type: 'inbox_message', title: `N${i}` } });
    }
    const res = await fastify.inject({ method: 'GET', url: '/v1/notifications?pageSize=2', headers: bearer(tokenFor(users[0]!.id, dealerId)) });
    const body = res.json() as { items: unknown[]; unreadCount: number };
    assert.equal(body.items.length, 2);
    assert.equal(body.unreadCount, 4);
  });

  it('marks one notification read, and refuses someone else’s', async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    const mine = await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[0]!.id, type: 'reel_ready', title: 'Reel ready' } });
    const theirs = await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[1]!.id, type: 'reel_ready', title: 'Reel ready' } });
    const headers = bearer(tokenFor(users[0]!.id, dealerId));

    const ok = await fastify.inject({ method: 'POST', url: `/v1/notifications/${mine.id}/read`, headers });
    assert.equal(ok.statusCode, 200);
    assert.equal((await prisma.notification.findUnique({ where: { id: mine.id } }))?.is_read, true);

    const denied = await fastify.inject({ method: 'POST', url: `/v1/notifications/${theirs.id}/read`, headers });
    assert.equal(denied.statusCode, 404);
    assert.equal((await prisma.notification.findUnique({ where: { id: theirs.id } }))?.is_read, false);
  });

  it('marks all of the caller’s notifications read and nobody else’s', async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    for (const u of users) {
      await prisma.notification.create({ data: { dealer_id: dealerId, user_id: u.id, type: 'inbox_message', title: 'Hi' } });
      await prisma.notification.create({ data: { dealer_id: dealerId, user_id: u.id, type: 'inbox_message', title: 'Hi again' } });
    }
    const res = await fastify.inject({ method: 'POST', url: '/v1/notifications/read-all', headers: bearer(tokenFor(users[0]!.id, dealerId)) });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { count: number }).count, 2);
    assert.equal(await prisma.notification.count({ where: { user_id: users[0]!.id, is_read: false } }), 0);
    assert.equal(await prisma.notification.count({ where: { user_id: users[1]!.id, is_read: false } }), 2);
  });

  it('requires a signed-in user', async () => {
    for (const [method, url] of [['GET', '/v1/notifications'], ['POST', '/v1/notifications/read-all'], ['POST', '/v1/notifications/x/read']] as const) {
      const res = await fastify.inject({ method, url });
      assert.equal(res.statusCode, 401, `${method} ${url}`);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/notifications.test.ts`
Expected: the new tests FAIL with 404s (the routes are not registered).

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/routes/notifications.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { Notification } from '../generated/client/index.js';

function mapNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    deepLink: n.link ?? null,
    isRead: n.is_read,
    createdAt: new Date(n.created_at).toISOString(),
  };
}

// Rows are per recipient, so scoping by the caller's user id is enough.
export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/notifications?pageSize=15
  fastify.get('/', async (request) => {
    const userId = request.user.dealer_user_id;
    const { pageSize = '15' } = request.query as { pageSize?: string };
    const take = Math.max(1, Math.min(50, parseInt(pageSize, 10) || 15));

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' }, take }),
      prisma.notification.count({ where: { user_id: userId, is_read: false } }),
    ]);
    return { items: items.map(mapNotification), unreadCount };
  });

  // POST /v1/notifications/read-all
  fastify.post('/read-all', async (request) => {
    const { count } = await prisma.notification.updateMany({
      where: { user_id: request.user.dealer_user_id, is_read: false },
      data: { is_read: true },
    });
    return { success: true, count };
  });

  // POST /v1/notifications/:id/read
  fastify.post('/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const notification = await prisma.notification.findFirst({
      where: { id, user_id: request.user.dealer_user_id },
    });
    if (!notification) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    }
    if (!notification.is_read) {
      await prisma.notification.update({ where: { id }, data: { is_read: true } });
    }
    return { success: true };
  });
}
```

In `apps/api/src/index.ts`, add the import next to the other route imports:

```ts
import notificationRoutes from './routes/notifications.js';
```

Then add the registration after `fastify.register(adminRoutes, … );`:

```ts
fastify.register(notificationRoutes,    { prefix: '/v1/notifications' });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/notifications.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/notifications.ts apps/api/src/index.ts apps/api/test/notifications.test.ts
git commit -m "feat(api): /v1/notifications list, mark read, mark all read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `needs_reconnect` on `GET /v1/platforms`

**Why:**
- The reconnect banner reads `GET /v1/platforms`, as theirs does. Unlike `/platform-accounts`, it lists every connection, including ones that have dropped.
- The banner must not rely on the raw token expiry. Google access tokens expire hourly by design and are refreshed on use (`lib/googleToken.ts`).
- A failed Meta health check sets `token_expires_at` to the epoch, which `needsReconnect` treats as expired.

**Files:**
- Create: `apps/api/src/lib/platformHealth.ts`
- Modify: `apps/api/src/routes/platform.ts`: `publicConnection()` (around lines 23–26), and the import list
- Test: `apps/api/test/platform-health.test.ts`

**Interfaces:**
- Produces: `needsReconnect(conn: { platform: string; is_connected?: boolean | null; token_expires_at: Date | string | null; refresh_token?: string | null }, now?: Date): boolean`
- Produces (HTTP): each item of `GET /v1/platforms` → `platforms[]` gains `needs_reconnect: boolean`. It is snake_case like the rest of that response. The `platform` value is the raw id (`gmb` for Google Business).

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/platform-health.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { needsReconnect } from '../src/lib/platformHealth.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const PAST = new Date('2026-09-23T11:00:00Z');
const FUTURE = new Date('2026-09-23T13:00:00Z');

describe('needsReconnect()', () => {
  it('is false for a live connection with no expiry or a future one', () => {
    assert.equal(needsReconnect({ platform: 'facebook', is_connected: true, token_expires_at: null }, NOW), false);
    assert.equal(needsReconnect({ platform: 'facebook', token_expires_at: FUTURE }, NOW), false);
  });

  it('is true when the connection is marked disconnected', () => {
    assert.equal(needsReconnect({ platform: 'facebook', is_connected: false, token_expires_at: null }, NOW), true);
  });

  it('is true for an expired Meta token, including the epoch set by a failed health check', () => {
    assert.equal(needsReconnect({ platform: 'facebook', token_expires_at: PAST }, NOW), true);
    assert.equal(needsReconnect({ platform: 'instagram', token_expires_at: new Date(0) }, NOW), true);
    assert.equal(needsReconnect({ platform: 'instagram', token_expires_at: '1970-01-01T00:00:00.000Z' }, NOW), true);
  });

  it('ignores an expired Google access token while a refresh token exists', () => {
    assert.equal(needsReconnect({ platform: 'gmb', token_expires_at: PAST, refresh_token: 'r' }, NOW), false);
    assert.equal(needsReconnect({ platform: 'youtube', token_expires_at: PAST, refresh_token: 'r' }, NOW), false);
    assert.equal(needsReconnect({ platform: 'gmb', token_expires_at: PAST, refresh_token: null }, NOW), true);
  });
});

describe('GET /v1/platforms needs_reconnect', () => {
  before(async () => { await fastify.ready(); });
  after(async () => { await fastify.close(); });

  it('flags only the connections that need the dealer to reconnect, without leaking tokens', async () => {
    const dealer = await prisma.dealer.create({ data: { name: 'Health Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform: 'facebook', platform_account_id: 'p1', access_token: 't1', token_expires_at: new Date(0) } });
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform: 'instagram', platform_account_id: 'i1', access_token: 't2', token_expires_at: new Date(Date.now() + 86_400_000) } });
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform: 'gmb', platform_account_id: 'g1', access_token: 't3', refresh_token: 'r', token_expires_at: new Date(Date.now() - 60_000) } });

    const payload: JwtUser = { dealer_user_id: `u-${dealer.id}`, dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
    const res = await fastify.inject({ method: 'GET', url: '/v1/platforms', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } });

    assert.equal(res.statusCode, 200);
    const platforms = (res.json() as { platforms: Array<Record<string, unknown>> }).platforms;
    const flags = Object.fromEntries(platforms.map((p) => [p['platform'], p['needs_reconnect']]));
    assert.deepEqual(flags, { facebook: true, instagram: false, gmb: false });
    assert.ok(platforms.every((p) => !('access_token' in p) && !('refresh_token' in p)));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/platform-health.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/platformHealth.js'`

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/platformHealth.ts`:

```ts
// Google access tokens last an hour and are refreshed on use (lib/googleToken.ts), so an
// expired Google access token only needs the dealer when there is no refresh token.
const REFRESHABLE_PLATFORMS = new Set(['gmb', 'google', 'youtube']);

export function needsReconnect(
  conn: {
    platform: string;
    is_connected?: boolean | null;
    token_expires_at: Date | string | null;
    refresh_token?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (conn.is_connected === false) return true;
  if (!conn.token_expires_at) return false;
  if (new Date(conn.token_expires_at).getTime() > now.getTime()) return false;
  return !(REFRESHABLE_PLATFORMS.has(conn.platform) && conn.refresh_token);
}
```

In `apps/api/src/routes/platform.ts`, add `import { needsReconnect } from '../lib/platformHealth.js';` after the other imports. Then replace `publicConnection` with:

```ts
function publicConnection(conn: Record<string, any>) {
  const { access_token: _a, refresh_token: _r, ...rest } = conn;
  return { ...rest, needs_reconnect: needsReconnect(conn as Parameters<typeof needsReconnect>[0]) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/platform-health.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/platformHealth.ts apps/api/src/routes/platform.ts apps/api/test/platform-health.test.ts
git commit -m "feat(api): flag platform connections that need reconnecting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Theme mode (light / dark / system)

**Files:**
- Create: `apps/web/src/utils/theme.ts`
- Test: `apps/web/src/utils/theme.test.ts`
- Create: `apps/web/src/contexts/ThemeContext.tsx`
- Modify: `apps/web/index.html` (apply the theme before first paint)
- Modify: `apps/web/src/App.tsx` (wrap in `ThemeProvider`)

**Interfaces:**
- Produces (`utils/theme.ts`):
  - `type ThemeMode = 'light' | 'dark' | 'system'`
  - `THEME_STORAGE_KEY = 'themeMode'`
  - `DEFAULT_THEME_MODE: ThemeMode = 'light'`
  - `parseThemeMode(value: string | null | undefined): ThemeMode`
  - `isDarkMode(mode: ThemeMode, systemPrefersDark: boolean): boolean`
- Produces (`contexts/ThemeContext.tsx`): `ThemeProvider` and `useTheme(): { mode: ThemeMode; isDark: boolean; setMode(mode: ThemeMode): void }`.
- The provider keeps `document.documentElement.classList` `dark` in sync, including live changes to the OS setting while `mode === 'system'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/theme.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, isDarkMode, parseThemeMode } from './theme';

describe('theme mode', () => {
  it('uses the themeMode storage key and defaults to light in Stage A', () => {
    assert.equal(THEME_STORAGE_KEY, 'themeMode');
    assert.equal(DEFAULT_THEME_MODE, 'light');
  });

  it('accepts only known modes', () => {
    assert.equal(parseThemeMode('dark'), 'dark');
    assert.equal(parseThemeMode('system'), 'system');
    assert.equal(parseThemeMode('light'), 'light');
    assert.equal(parseThemeMode('DARK'), 'light');
    assert.equal(parseThemeMode(null), 'light');
    assert.equal(parseThemeMode(undefined), 'light');
  });

  it('resolves dark for dark, and for system only when the OS prefers dark', () => {
    assert.equal(isDarkMode('dark', false), true);
    assert.equal(isDarkMode('light', true), false);
    assert.equal(isDarkMode('system', true), true);
    assert.equal(isDarkMode('system', false), false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web`
Expected: FAIL with `Cannot find module './theme'`

- [ ] **Step 3: Implement `utils/theme.ts`**

```ts
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'themeMode';

// Light until every page is ported to the new design; Stage E switches this to 'system'.
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME_MODE;
}

export function isDarkMode(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web`
Expected: PASS, with the theme tests included.

- [ ] **Step 5: Implement `contexts/ThemeContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEME_STORAGE_KEY, isDarkMode, parseThemeMode, type ThemeMode } from '../utils/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return parseThemeMode(null);
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(DARK_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const isDark = isDarkMode(mode, systemDark);

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage can be unavailable (private mode); the choice still applies for this visit
    }
  }, []);

  return <ThemeContext.Provider value={{ mode, isDark, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
```

- [ ] **Step 6: Apply the theme before first paint**

In `apps/web/index.html`, add this inside `<head>`, after the `<title>` line. Without it, a dark-mode user sees a white flash before React mounts.

```html
    <script>
      // Mirrors utils/theme.ts: apply the saved theme before first paint to avoid a white flash.
      try {
        var m = localStorage.getItem('themeMode');
        if (m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    </script>
```

- [ ] **Step 7: Wrap the app**

In `apps/web/src/App.tsx`:
- Add `import { ThemeProvider } from './contexts/ThemeContext';`.
- In the default `App` component, wrap the existing `<ToastProvider>` in `<ThemeProvider>`. The result:

```tsx
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          {/* …existing children unchanged… */}
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
```

- [ ] **Step 8: Build and commit**

Run: `npm run build -w web`
Expected: exits 0.

```bash
git add apps/web/src/utils/theme.ts apps/web/src/utils/theme.test.ts apps/web/src/contexts/ThemeContext.tsx apps/web/index.html apps/web/src/App.tsx
git commit -m "feat(web): light/dark/system theme mode, applied before first paint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Disconnected-platform detection

**Files:**
- Create: `apps/web/src/utils/disconnectedPlatforms.ts`
- Test: `apps/web/src/utils/disconnectedPlatforms.test.ts`

**Interfaces:**
- Consumes: `GET /v1/platforms` → `{ platforms: Array<{ platform: string; needs_reconnect?: boolean }> }` (Task 3).
- Produces:
  - `disconnectedPlatformNames(platforms: Array<{ platform: string; needs_reconnect?: boolean }>): string[]`. Returns display names, unique, in first-seen order.
  - `disconnectedVerb(count: number): 'is' | 'are'`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/disconnectedPlatforms.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { disconnectedPlatformNames, disconnectedVerb } from './disconnectedPlatforms';

describe('disconnectedPlatformNames', () => {
  it('lists display names of accounts that need reconnecting, once each, in order', () => {
    const names = disconnectedPlatformNames([
      { platform: 'youtube', needs_reconnect: true },
      { platform: 'facebook', needs_reconnect: false },
      { platform: 'instagram', needs_reconnect: true },
      { platform: 'instagram', needs_reconnect: true },
      { platform: 'gmb', needs_reconnect: true },
    ]);
    assert.deepEqual(names, ['YouTube', 'Instagram', 'Google Business Profile']);
  });

  it('ignores accounts without the flag (older API responses)', () => {
    assert.deepEqual(disconnectedPlatformNames([{ platform: 'facebook' }]), []);
  });

  it('falls back to the raw platform id for unknown platforms', () => {
    assert.deepEqual(disconnectedPlatformNames([{ platform: 'linkedin', needs_reconnect: true }]), ['linkedin']);
  });

  it('uses "is" for one platform and "are" for several', () => {
    assert.equal(disconnectedVerb(1), 'is');
    assert.equal(disconnectedVerb(2), 'are');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web`
Expected: FAIL with `Cannot find module './disconnectedPlatforms'`

- [ ] **Step 3: Implement**

Create `apps/web/src/utils/disconnectedPlatforms.ts`:

```ts
// Labels match the reference app's banner.
const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  gmb: 'Google Business Profile',
  google: 'Google',
  youtube: 'YouTube',
};

export function disconnectedPlatformNames(platforms: Array<{ platform: string; needs_reconnect?: boolean }>): string[] {
  const names: string[] = [];
  for (const p of platforms) {
    if (!p.needs_reconnect) continue;
    const name = PLATFORM_NAMES[p.platform] ?? p.platform;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function disconnectedVerb(count: number): 'is' | 'are' {
  return count === 1 ? 'is' : 'are';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/disconnectedPlatforms.ts apps/web/src/utils/disconnectedPlatforms.test.ts
git commit -m "feat(web): derive disconnected platforms for the reconnect banner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Theme CSS (tokens, one grey palette, dark mode)

**Files:**
- Modify (replace entirely): `apps/web/src/index.css`

**Interfaces:**
- Produces:
  - the Tailwind tokens `brand`, `brand-hover`, `brand-subtle` and `canvas`;
  - greys unified on zinc: `slate-*`, `stone-*`, `gray-*` and `neutral-*` resolve to `zinc-*`;
  - a `.dark` class on `<html>` that switches the whole palette (Task 4 toggles it).
- Visual only; there are no unit tests. Verification is a build plus the screenshots in Task 12.

**Notes:**
- `h1–h4 letter-spacing` and the `body` rules are deliberately **unlayered**, as in the reference, so they win over utilities exactly as they do there.
- The existing `spin-slow` animation (YouTube Shorts preview) is kept.
- The Outfit font import is dropped; `--font-display` now aliases Inter.

- [ ] **Step 1: Replace `apps/web/src/index.css` with:**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800;1,14..32,400&display=swap');
@import "tailwindcss";

/* Design tokens: match the reference Social AI app (spec §4). */
@theme {
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-display: "Inter", system-ui, -apple-system, sans-serif; /* legacy alias; the reference uses Inter only */
  --radius-lg: .625rem;
  --radius-xl: .875rem;
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / .04);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .04);
  --color-brand: #ea580c;
  --color-brand-hover: #c2410c;
  --color-brand-subtle: #fff7ed;
  --color-canvas: #fafafa;
  /* legacy aliases still referenced by older pages */
  --color-brand-light: #fff7ed;
  --color-brand-dark: #c2410c;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
}

/*
 * One grey palette. Older pages use slate/stone/gray/neutral; the reference uses zinc. Pointing
 * those scales at zinc gives every page the reference greys, and dark mode (which remaps zinc)
 * then reaches them too. zinc is declared here as well because Tailwind prunes unused theme
 * variables. Must stay before the .dark block: equal specificity, so source order decides.
 */
:root {
  --color-zinc-50: oklch(98.5% 0 0);
  --color-zinc-100: oklch(96.7% 0.001 286.375);
  --color-zinc-200: oklch(92% 0.004 286.32);
  --color-zinc-300: oklch(87.1% 0.006 286.286);
  --color-zinc-400: oklch(70.5% 0.015 286.067);
  --color-zinc-500: oklch(55.2% 0.016 285.938);
  --color-zinc-600: oklch(44.2% 0.017 285.786);
  --color-zinc-700: oklch(37% 0.013 285.805);
  --color-zinc-800: oklch(27.4% 0.006 286.033);
  --color-zinc-900: oklch(21% 0.006 285.885);
  --color-zinc-950: oklch(14.1% 0.005 285.823);
  --color-slate-50: var(--color-zinc-50); --color-slate-100: var(--color-zinc-100); --color-slate-200: var(--color-zinc-200); --color-slate-300: var(--color-zinc-300); --color-slate-400: var(--color-zinc-400); --color-slate-500: var(--color-zinc-500);
  --color-slate-600: var(--color-zinc-600); --color-slate-700: var(--color-zinc-700); --color-slate-800: var(--color-zinc-800); --color-slate-900: var(--color-zinc-900); --color-slate-950: var(--color-zinc-950);
  --color-stone-50: var(--color-zinc-50); --color-stone-100: var(--color-zinc-100); --color-stone-200: var(--color-zinc-200); --color-stone-300: var(--color-zinc-300); --color-stone-400: var(--color-zinc-400); --color-stone-500: var(--color-zinc-500);
  --color-stone-600: var(--color-zinc-600); --color-stone-700: var(--color-zinc-700); --color-stone-800: var(--color-zinc-800); --color-stone-900: var(--color-zinc-900); --color-stone-950: var(--color-zinc-950);
  --color-gray-50: var(--color-zinc-50); --color-gray-100: var(--color-zinc-100); --color-gray-200: var(--color-zinc-200); --color-gray-300: var(--color-zinc-300); --color-gray-400: var(--color-zinc-400); --color-gray-500: var(--color-zinc-500);
  --color-gray-600: var(--color-zinc-600); --color-gray-700: var(--color-zinc-700); --color-gray-800: var(--color-zinc-800); --color-gray-900: var(--color-zinc-900); --color-gray-950: var(--color-zinc-950);
  --color-neutral-50: var(--color-zinc-50); --color-neutral-100: var(--color-zinc-100); --color-neutral-200: var(--color-zinc-200); --color-neutral-300: var(--color-zinc-300); --color-neutral-400: var(--color-zinc-400); --color-neutral-500: var(--color-zinc-500);
  --color-neutral-600: var(--color-zinc-600); --color-neutral-700: var(--color-zinc-700); --color-neutral-800: var(--color-zinc-800); --color-neutral-900: var(--color-zinc-900); --color-neutral-950: var(--color-zinc-950);
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  background-color: var(--color-canvas);
  color: #18181b;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-family: Inter, system-ui, -apple-system, sans-serif;
}
h1, h2, h3, h4 { letter-spacing: -.014em; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #e4e4e7 padding-box; border: 2px solid transparent; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #d4d4d8 padding-box; }

/* Dark mode: verbatim from the reference. The zinc scale and white are inverted; everything
   written with light-mode classes follows automatically. */
.dark {
  color-scheme: dark;
  --color-canvas: #0f0f12;
  --color-surface: #18181b;
  --color-line: #2c2c33;
  --color-line-strong: #3a3a42;
  --color-white: #18181b;
  --color-zinc-50: #1c1c20;  --color-zinc-100: #232329; --color-zinc-200: #2c2c33;
  --color-zinc-300: #3a3a42; --color-zinc-400: #8b8b94; --color-zinc-500: #a1a1aa;
  --color-zinc-600: #b4b4bb; --color-zinc-700: #cfcfd4; --color-zinc-800: #e4e4e7;
  --color-zinc-900: #f4f4f5; --color-zinc-950: #fafafa;
}
.dark body { background-color: var(--color-canvas); color: #f4f4f5; }
.dark .text-white { color: #fafafa; }
.dark .border-white { border-color: #ffffff1f; }
.dark .ring-white { --tw-ring-color: #ffffff1f; }
.dark ::-webkit-scrollbar-thumb { background: #3a3a42; }
.dark ::-webkit-scrollbar-thumb:hover { background: #52525b; }

/* ── Vinyl disc spin animation (YouTube Shorts preview) ──────────────────── */
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.animate-spin-slow {
  animation: spin-slow 4s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animate-spin-slow {
    animation-duration: 20s;
  }
}
```

- [ ] **Step 2: Build**

Run: `npm run build -w web`
Expected: exits 0.

- [ ] **Step 3: Quick visual check**

Run: `npm run dev -w web`. Open `http://127.0.0.1:5173/login`:
- Greys are neutral zinc, not the blue-tinted slate.
- The page background is `#fafafa`.

In DevTools, run `document.documentElement.classList.add('dark')` and confirm:
- the page turns dark;
- light-grey text becomes readable light text.

Then stop the server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/index.css
git commit -m "style(web): reference design tokens, one zinc grey palette, dark mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Restyle `Button` to the reference

**Files:**
- Modify: `apps/web/src/components/ui/Button.tsx`, replacing the base and variant class strings only

**Interfaces:**
- The existing API is unchanged: `variant?: 'primary' | 'secondary' | 'ghost' | 'danger'`, `isLoading?: boolean`, plus native button props; `cn()` is still exported. All 32 existing call sites keep working.

- [ ] **Step 1: Replace the two class definitions inside `Button`**

In `apps/web/src/components/ui/Button.tsx`, replace the `baseStyle` and `variants` constants with the reference values:

```tsx
    const baseStyle = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none h-9 px-3.5';

    const variants = {
      primary: 'bg-gradient-to-r from-orange-600 to-amber-500 text-white hover:from-orange-700 hover:to-amber-600 shadow-sm shadow-orange-500/20',
      secondary: 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300',
      ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-xs'
    };
```

- [ ] **Step 2: Build and commit**

Run: `npm run build -w web`
Expected: exits 0.

```bash
git add apps/web/src/components/ui/Button.tsx
git commit -m "style(web): Button matches the reference design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Role labels, notifications service and `NotificationBell`

**Files:**
- Create: `apps/web/src/utils/roleLabel.ts`
- Test: `apps/web/src/utils/roleLabel.test.ts`
- Create: `apps/web/src/services/notifications.ts`
- Create: `apps/web/src/components/shell/NotificationBell.tsx`

**Interfaces:**
- Consumes: the Task 2 endpoints; `formatRelativeTime(date)` from `apps/web/src/utils/helpers.ts`; `cn` from `components/ui/Button`.
- Produces:
  - `roleLabel(role: string): string`: `user`→`Creator`, `admin`→`Manager`, `owner`→`Owner`, anything else unchanged (the reference sidebar's badge copy).
  - `notificationService.list(pageSize?)`, `.markRead(id)`, `.markAllRead()`.
  - `type AppNotification = { id: string; type: string; title: string; body: string | null; deepLink: string | null; isRead: boolean; createdAt: string }`
  - `<NotificationBell align?: 'left' | 'right' />`. The dropdown opens toward `align`, default `'right'` (the reference). The desktop sidebar uses `'left'` so the 320px panel isn't clipped at the screen edge.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/roleLabel.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roleLabel } from './roleLabel';

describe('roleLabel', () => {
  it('uses the reference badge copy', () => {
    assert.equal(roleLabel('user'), 'Creator');
    assert.equal(roleLabel('admin'), 'Manager');
    assert.equal(roleLabel('owner'), 'Owner');
  });

  it('shows unknown roles unchanged', () => {
    assert.equal(roleLabel('auditor'), 'auditor');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web`
Expected: FAIL with `Cannot find module './roleLabel'`

- [ ] **Step 3: Implement `utils/roleLabel.ts`**

```ts
const ROLE_LABELS: Record<string, string> = { user: 'Creator', admin: 'Manager', owner: 'Owner' };

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web`
Expected: PASS

- [ ] **Step 5: Create `services/notifications.ts`**

```ts
import api from './api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationService = {
  list: (pageSize = 15) =>
    api.get<{ items: AppNotification[]; unreadCount: number }>('/notifications', { pageSize }),
  markRead: (id: string) => api.post<{ success: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ success: boolean; count: number }>('/notifications/read-all'),
};
```

- [ ] **Step 6: Create `components/shell/NotificationBell.tsx`** (reference markup and copy, including `You're all caught up.` with its straight apostrophe)

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { cn } from '../ui/Button';
import { formatRelativeTime } from '../../utils/helpers';
import { notificationService, type AppNotification } from '../../services/notifications';

const POLL_MS = 60_000;

export function NotificationBell({ align = 'right' }: { align?: 'left' | 'right' }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    notificationService.list(15)
      .then((res) => { setItems(res.items); setUnread(res.unreadCount); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openItem = (n: AppNotification) => {
    if (!n.isRead) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
      notificationService.markRead(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.deepLink) navigate(n.deepLink);
  };

  const markAllRead = () => {
    setItems((list) => list.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    notificationService.markAllRead().catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-zinc-500" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-orange-600 rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={cn('absolute mt-2 w-80 max-h-[420px] overflow-y-auto bg-white rounded-xl border border-zinc-200 shadow-lg z-50', align === 'left' ? 'left-0' : 'right-0')}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 sticky top-0 bg-white">
            <span className="text-sm font-semibold text-zinc-900">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-zinc-50">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={cn('w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors flex gap-2.5', !n.isRead && 'bg-orange-50/40')}
                  >
                    {n.isRead
                      ? <span className="w-2 flex-shrink-0" />
                      : <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-600 flex-shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-zinc-900 truncate">{n.title}</span>
                      {n.body && <span className="block text-xs text-zinc-500 line-clamp-2">{n.body}</span>}
                      <span className="block text-[11px] text-zinc-400 mt-0.5">{formatRelativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Build and commit**

Run: `npm run build -w web`
Expected: exits 0. The bell is not mounted yet; Task 10 mounts it.

```bash
git add apps/web/src/utils/roleLabel.ts apps/web/src/utils/roleLabel.test.ts apps/web/src/services/notifications.ts apps/web/src/components/shell/NotificationBell.tsx
git commit -m "feat(web): notifications bell and service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `DisconnectedBanner`

**Files:**
- Create: `apps/web/src/components/shell/DisconnectedBanner.tsx`

**Interfaces:**
- Consumes:
  - `GET /v1/platforms` → `{ platforms: Array<{ platform: string; needs_reconnect?: boolean }> }` (Task 3)
  - `disconnectedPlatformNames` and `disconnectedVerb` (Task 5)
  - `useAuth`, and `isGlobalOwner` from `lib/permissions`
- Produces: `<DisconnectedBanner />`.
  - Renders nothing for the platform owner (no dealership), or when nothing needs reconnecting.
  - Dismissing lasts until reload (in-memory, as in the reference).

- [ ] **Step 1: Create the component** (reference markup and copy; the dash is U+2014 with a space on each side)

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TriangleAlert, X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { isGlobalOwner } from '../../lib/permissions';
import { disconnectedPlatformNames, disconnectedVerb } from '../../utils/disconnectedPlatforms';

export function DisconnectedBanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const skip = !user || isGlobalOwner(user);
  const [names, setNames] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (skip) return;
    api.get<{ platforms?: Array<{ platform: string; needs_reconnect?: boolean }> }>('/platforms')
      .then((res) => setNames(disconnectedPlatformNames(res.platforms ?? [])))
      .catch(() => setNames([]));
  }, [skip]);

  if (skip || dismissed || names.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-800">
      <TriangleAlert className="w-4 h-4 flex-shrink-0" />
      <p className="text-sm flex-1 min-w-0">
        <span className="font-semibold">{names.join(', ')}</span>{' '}{disconnectedVerb(names.length)}{' disconnected — reconnect to keep publishing and review sync running.'}
      </p>
      <button onClick={() => navigate('/accounts')} className="text-sm font-semibold underline hover:no-underline flex-shrink-0">Reconnect</button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex-shrink-0 p-1 hover:bg-red-100 rounded">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build and commit**

Run: `npm run build -w web`
Expected: exits 0.

```bash
git add apps/web/src/components/shell/DisconnectedBanner.tsx
git commit -m "feat(web): banner for platforms that need reconnecting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Sidebar, mobile top bar and `AppLayout`; swap them into `App.tsx`

**Files:**
- Create: `apps/web/src/components/shell/navConfig.ts`
- Create: `apps/web/src/components/shell/Logo.tsx`
- Create: `apps/web/src/components/shell/Sidebar.tsx`
- Create: `apps/web/src/components/shell/MobileTopBar.tsx`
- Create: `apps/web/src/components/shell/AppLayout.tsx`
- Modify: `apps/web/src/App.tsx`:
  - delete the `NavItem`/`NavSection` interfaces, `NAV_SECTIONS`, `Sidebar`, `MobileTopBar` and `AppLayout`;
  - import `AppLayout` from the shell;
  - remove any imports that become unused.

**Interfaces:**
- Consumes: `NotificationBell` (Task 8), `DisconnectedBanner` (Task 9), `roleLabel` (Task 8), `useAuth()` → `{ user, logout, loginWithToken }`, `isGlobalOwner(user)`, and `api`.
- Produces: `<AppLayout fullBleed?>{children}</AppLayout>`, with the same props as the component it replaces, so every route in `App.tsx` works unchanged.
- The inbox badge listens for a window `inbox:changed` event. Stage D's Inbox dispatches it after mark-read.

**Deviation from the reference (our extras):**
- The reference shows the bell only in the mobile top bar. We also show it in the desktop sidebar header (`hidden lg:block`, opening to the left), because approvers must see approval requests on desktop (spec §7).
- The impersonation banner from the current `AppLayout` is kept.
- The platform owner (`isGlobalOwner`) sees the reference's `super_admin` variant: an "Admin" section with a single "Console" link to `/admin`.

- [ ] **Step 1: Create `components/shell/navConfig.ts`**

```ts
import type { ComponentType } from 'react';
import { Calendar, ChartNoAxesColumn, LayoutDashboard, LayoutList, Link2, MessageSquare, Package, Video, Zap } from 'lucide-react';

export interface NavItem {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  exact?: boolean;
}

export const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Work', items: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/posts', icon: LayoutList, label: 'Posts' },
    { to: '/calendar', icon: Calendar, label: 'Calendar' },
  ] },
  { label: 'Engage', items: [
    { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
    { to: '/analytics', icon: ChartNoAxesColumn, label: 'Analytics' },
  ] },
  { label: 'Grow', items: [
    { to: '/boost', icon: Zap, label: 'Boost' },
    { to: '/accounts', icon: Link2, label: 'Accounts' },
  ] },
];

export const COMING_SOON: Array<{ icon: ComponentType<{ className?: string }>; label: string }> = [
  { icon: Package, label: 'Inventory' },
  { icon: Video, label: 'AI Video' },
];
```

- [ ] **Step 2: Create `components/shell/Logo.tsx`** (shared by the sidebar and the mobile bar)

```tsx
import { Sparkles } from 'lucide-react';

export function Logo() {
  return (
    <>
      <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-sm shadow-orange-500/30">
        <Sparkles className="w-[18px] h-[18px] text-white" />
      </div>
      <span className="font-semibold text-zinc-900 text-[15px] tracking-tight">
        Social <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">AI</span>
      </span>
    </>
  );
}
```

- [ ] **Step 3: Create `components/shell/Sidebar.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Plus, Settings, ShieldCheck, X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { isGlobalOwner } from '../../lib/permissions';
import { roleLabel } from '../../utils/roleLabel';
import { COMING_SOON, NAV_SECTIONS } from './navConfig';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

const ITEM_BASE = 'group relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors';
const ITEM_INACTIVE = 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900';
const ITEM_ACTIVE = 'bg-orange-50 text-zinc-900 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-orange-500 before:rounded-full';
const SECTION_LABEL = 'px-4 pt-1 pb-1 text-[10px] font-semibold text-zinc-400 tracking-[0.12em] uppercase';

const itemClass = ({ isActive }: { isActive: boolean }) => `${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_INACTIVE}`;
const iconClass = (isActive: boolean) =>
  `w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-orange-600' : 'text-zinc-400 group-hover:text-zinc-600'}`;

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const owner = isGlobalOwner(user);
  const [inboxPending, setInboxPending] = useState(0);
  const initials = user?.name ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : 'U';

  // Inbox badge: refreshed on mount, every minute, on window focus, and when the Inbox changes.
  useEffect(() => {
    if (owner) return;
    const load = () => {
      api.get<{ stats?: { inboxPending?: number } }>('/dealer/dashboard')
        .then((res) => setInboxPending(res.stats?.inboxPending ?? 0))
        .catch(() => {});
    };
    load();
    window.addEventListener('inbox:changed', load);
    window.addEventListener('focus', load);
    const id = setInterval(load, 60_000);
    return () => {
      window.removeEventListener('inbox:changed', load);
      window.removeEventListener('focus', load);
      clearInterval(id);
    };
  }, [owner]);

  const handleLogout = () => { logout(); navigate('/onboarding'); };

  const content = (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-5 shrink-0 border-b border-zinc-100">
        <NavLink to="/" className="flex items-center gap-2.5" onClick={onClose}>
          <Logo />
        </NavLink>
        <div className="hidden lg:block">
          <NotificationBell align="left" />
        </div>
        <button className="lg:hidden p-1 text-zinc-400 hover:text-zinc-700 transition-colors" onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {!owner && (
        <div className="px-3 pt-4 pb-1">
          <NavLink
            to="/create"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors shadow-sm shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" /> Create Post
          </NavLink>
        </div>
      )}

      <nav className="flex-1 px-3 overflow-y-auto py-2 space-y-3">
        {!owner && NAV_SECTIONS.map((section) => (
          <div key={section.label} className="space-y-0.5">
            <p className={SECTION_LABEL}>{section.label}</p>
            {section.items.map(({ to, icon: Icon, label, exact }) => (
              <NavLink key={to} to={to} end={exact} onClick={onClose} className={itemClass}>
                {({ isActive }) => (
                  <>
                    <Icon className={iconClass(isActive)} />
                    {label}
                    {label === 'Inbox' && inboxPending > 0 && (
                      <span className={`ml-auto text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${isActive ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'}`}>
                        {inboxPending}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        {owner && (
          <div className="space-y-0.5">
            <p className={SECTION_LABEL}>Admin</p>
            <NavLink to="/admin" onClick={onClose} className={itemClass}>
              {({ isActive }) => (<><ShieldCheck className={iconClass(isActive)} />Console</>)}
            </NavLink>
          </div>
        )}

        {!owner && (
          <div className="space-y-0.5">
            <p className={SECTION_LABEL}>Coming soon</p>
            <div className="px-4 flex flex-wrap gap-1.5">
              {COMING_SOON.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-50 text-zinc-400 text-[11px] font-medium cursor-default select-none">
                  <Icon className="w-3 h-3" />{label}
                </span>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="h-px bg-zinc-100 mx-3" />

      <div className="px-3 py-3 space-y-0.5">
        {!owner && (
          <NavLink to="/settings" onClick={onClose} className={itemClass}>
            {({ isActive }) => (<><Settings className={iconClass(isActive)} />Settings</>)}
          </NavLink>
        )}
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg mt-1 hover:bg-zinc-50 transition-colors group">
            <div className="w-8 h-8 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 ring-2 ring-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-zinc-900 truncate leading-tight">{user.name}</p>
              <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
                {roleLabel(user.role)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex w-[220px] bg-white border-r border-zinc-200 flex-col fixed inset-y-0 left-0 z-40 shrink-0">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-[220px] bg-white border-r border-zinc-200 flex flex-col shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Create `components/shell/MobileTopBar.tsx`**

```tsx
import { Menu } from 'lucide-react';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

export function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-zinc-200 h-14 flex items-center px-4 gap-3 shrink-0">
      <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors" onClick={onMenuOpen} aria-label="Open menu">
        <Menu className="w-5 h-5 text-zinc-600" />
      </button>
      <div className="flex items-center gap-2.5">
        <Logo />
      </div>
      <div className="flex-1" />
      <NotificationBell />
    </header>
  );
}
```

- [ ] **Step 5: Create `components/shell/AppLayout.tsx`**

This is the reference layout with the existing impersonation banner kept. The impersonation logic moves verbatim from the current `AppLayout` in `App.tsx`.

```tsx
import { useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';
import { DisconnectedBanner } from './DisconnectedBanner';

export function AppLayout({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loginWithToken } = useAuth();
  const isImpersonating = !!localStorage.getItem('admin_access_token');

  const handleStopImpersonation = () => {
    const token = localStorage.getItem('admin_access_token');
    const refresh = localStorage.getItem('admin_refresh_token');
    const userStr = localStorage.getItem('admin_user_info');
    if (token && userStr) {
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('admin_user_info');
      loginWithToken(token, refresh || '', JSON.parse(userStr));
      window.location.href = '/admin';
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50">
      {isImpersonating && (
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-md relative z-50">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-3.5 h-3.5 animate-pulse" />
            <span>Impersonation Active: You are acting as admin for <span className="underline">{user?.name}</span></span>
          </div>
          <button
            onClick={handleStopImpersonation}
            className="bg-white text-orange-700 hover:bg-orange-50 font-black px-3 py-1 rounded-md transition-colors shadow-sm text-[10px] uppercase tracking-wider"
          >
            Stop Impersonating
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex-1 flex flex-col lg:pl-[220px] min-w-0">
          <MobileTopBar onMenuOpen={() => setMobileOpen(true)} />
          <DisconnectedBanner />
          <main className={`flex-1 min-h-0 ${fullBleed ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-5 md:p-7'}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Swap the shell into `App.tsx`**

In `apps/web/src/App.tsx`:
1. Delete the `// ─── Grouped Sidebar Config` block (the `NavItem`/`NavSection` interfaces and `NAV_SECTIONS`), the whole `function Sidebar(…)`, the whole `function MobileTopBar(…)` and the whole `function AppLayout(…)`. Leave `Dashboard` and its helper components alone; Stage B replaces them.
2. Add `import { AppLayout } from './components/shell/AppLayout';` next to the other component imports.
3. Run `npm run build -w web`. `noUnusedLocals` is on, so `tsc` will list each import that is now unused (for example icons that only the old sidebar used, `NavLink`, `useLocation`). Remove exactly those names from the import lines, then build again until it exits 0.

- [ ] **Step 7: Run the web tests and build**

Run: `npm test -w web && npm run build -w web`
Expected: all tests PASS; the build exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/shell apps/web/src/App.tsx
git commit -m "feat(web): reference sidebar, mobile bar and layout shell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Theme selector on Settings → Preferences

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`: one hook plus one card at the top of the Preferences tab

**Interfaces:**
- Consumes: `useTheme()` (Task 4) and `type ThemeMode`.
- Stage E replaces this card with the reference Preferences UI (server-synced `theme_mode` and brand colours, spec §4). Until then it is a device-local choice.

- [ ] **Step 1: Add the imports and hook**

At the top of `SettingsPage.tsx`, add:

```tsx
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeMode } from '../utils/theme';
```

Inside `export default function SettingsPage()`, directly after `const { user } = useAuth();`, add:

```tsx
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
```

- [ ] **Step 2: Add the Appearance card**

Immediately after `{activeTab === 'preferences' && (` and its opening `<div className="space-y-5">`, insert:

```tsx
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h3 className="font-semibold text-zinc-900 text-sm mb-1">Appearance</h3>
            <p className="text-xs text-zinc-500 mb-3">Choose how Social AI looks on this device.</p>
            <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1">
              {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setThemeMode(m)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${themeMode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 3: Build and commit**

Run: `npm run build -w web`
Expected: exits 0.

```bash
git add apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): light/dark/system choice in Settings → Preferences

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verify, compare with the reference, ship

**Files:** none (verification and release).

- [ ] **Step 1: Full gate**

Run from the repo root:

```bash
npm run build
JWT_SECRET=dummy npm test
cd apps/web && npx eslint . 2>&1 | tail -1
```

Expected:
- The build exits 0.
- Every suite reports `fail 0`.
- ESLint reports **no more than 79 problems** (the baseline on `main`). Fix any new problem in the files this stage touched.

- [ ] **Step 2: Run the app locally**

Terminal 1: `npm run dev -w @cardeko/api` (listens on :3001; memory data store in development).
Terminal 2: `VITE_API_URL=http://127.0.0.1:3001/v1 npm run dev -w web`.
Open `http://127.0.0.1:5173/login` and choose the demo login.

- [ ] **Step 3: Compare with the reference and screenshot**

At 1440×900 and at 375×812 (mobile), capture Dashboard, Posts, Inbox and Settings. Compare each against the product owner's screenshots of `social.smartdealer.ai`, or against the live app if the owner is signed in there as a dealer in Chrome (view only). Check each of these matches:
- Sidebar: width 220px, white background, logo gradient.
- Create Post button: gradient.
- Section labels: `WORK` / `ENGAGE` / `GROW`.
- Active item: orange-50 background with a 3px orange bar.
- "Coming soon" chips.
- User card: initials, name, and a `MANAGER` badge for a demo login.
- Mobile: the top bar with the bell, and the drawer.
- Page greys are zinc.

Then switch Settings → Preferences → Dark and confirm the shell and pages are readable. Record any differences that are not our listed extras (desktop bell, impersonation banner) and fix them before continuing.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin design/dealer-app-redesign
gh pr create --repo santoshks2017/SocialAI --base main --head design/dealer-app-redesign \
  --title "Stage A: reference design system, app shell and notifications" \
  --body "Stage A of docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md — tokens, one zinc grey palette, dark mode (default light), reference sidebar/mobile bar/layout, notifications bell + API, reconnect banner. Plan: docs/superpowers/plans/2026-09-23-stage-a-shell.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Wait for the `build_and_preview` check to pass. Open the preview URL it posts and repeat the spot-check with the demo login. The bell and banner show empty there until the API is deployed. Ask the product owner to review the preview.

- [ ] **Step 5: After the owner approves: merge, deploy, smoke test**

```bash
gh pr merge "$(gh pr view design/dealer-app-redesign --repo santoshks2017/SocialAI --json number -q .number)" --squash --repo santoshks2017/SocialAI
git fetch origin && git log --oneline -1 origin/main
```

Deploy the API from a clean export of the merged `main`, and check that no other build is running first:

```bash
gcloud builds list --region asia-south1 --project gen-lang-client-0078524499 --ongoing
SHA=$(git rev-parse origin/main); D=$(mktemp -d); git archive "$SHA" | tar -x -C "$D"
cd "$D" && gcloud run deploy cardekho-api --source . --region asia-south1 --project gen-lang-client-0078524499 --quiet
```

Smoke test on `https://cardekho-social-ai.web.app` with the demo login:
- `GET /v1/notifications` returns 200 `{ items, unreadCount }`.
- `GET /v1/platforms` items include `needs_reconnect`.
- The sidebar, bell and dark mode work.
- There are no new errors in the Cloud Run logs.
