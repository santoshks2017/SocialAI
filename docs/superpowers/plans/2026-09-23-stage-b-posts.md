# Stage B: Posts, Approvals and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the reference app's Posts page, public approval page and Dashboard. Add the approval workflow behind them (draft → pending approval → ready to publish), approval links, and notifications for approval and publish outcomes.

**Architecture:**
- **API: approval domain.** Approval logic lives in `apps/api/src/lib/approvals.ts`:
  - approval tokens: only a hash is stored, links last 7 days and are single-use;
  - `decideApproval()`, the single guarded transition shared by the in-app routes and the public link.
- **API: routes and helpers.**
  - `apps/api/src/routes/approvals.ts` holds the authenticated approve/reject/submit routes and the public `/approval/:token` routes, registered under `/v1/publisher`.
  - Publish outcomes notify through `lib/postNotifications.ts`, hooked into `publishPost()` and the cron recovery.
  - Two small read endpoints (`/posts/counts`, `/posts/activity`) replace the reference's many count requests and its 250-post download.
- **Web: pure logic.** Tab parsing, timelines, pagination, activity buckets and chart paths live in `apps/web/src/utils/`, where the test runner looks.
- **Web: primitives and pages.**
  - Shared primitives go in `components/ui/`: StatCard, SectionCard, PageCard/PageHeader, InlineEmpty.
  - Page parts go in `components/posts/` and `components/dashboard/`.
  - Pages go in `pages/`.

**Tech Stack:** Fastify 5, Prisma 5 schema with the Firestore adapter, `@fastify/rate-limit`, node:test via tsx. React 19, react-router-dom 7, Tailwind v4, lucide-react. The charts are hand-written SVG; no chart library.

**Spec:** `docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md` (§6 Dashboard, Posts, Approval page; §7 endpoints, statuses, records, notifications; §8 Stage B).

**Reference:** `~/Documents/Coder/social-ai-reference-2026-09-23/`.
- `chunks/PostsPage-*.js` is the Posts page.
- `app.js` holds the Dashboard and `/approve/:token`.
- The classes and copy below were extracted from it. Never copy the bundle into this repo.

## Global Constraints

- **Look:** the app uses the AI Video App theme (PR #11). Keep writing the reference's `orange-*` / `amber-*` / `zinc-*` classes: `index.css` remaps them to the coral brand and warm greys. `h1`–`h3` render in the serif display font through the global rule.
- **Copy:** user-visible text from the reference is verbatim, including "—", "…" and "’".
- **Statuses:** `draft`, `pending_approval`, `approved`, `scheduled`, `publishing`, `published`, `failed`. Only the approval routes move a post into or out of `pending_approval` / `approved`.
- **Approval links:**
  - `https://<FRONTEND_URL>/approve/<token>`, where the token is 32 random bytes in base64url (43 chars). Only its SHA-256 hex is stored.
  - Valid for 7 days, single use. Issuing a new link, or deciding in the app, spends the open ones.
- **Public routes:** `GET/POST /v1/publisher/approval/:token` need no auth and are limited to 20 requests per minute per client IP.
- **Notifications:**
  - Every link is an app-relative path.
  - Recipients are always intersected with the dealership's active users.
  - Rows carry `expires_at` = created + 90 days; a Firestore TTL policy deletes them.
  - Marking read is a no-op while an admin is impersonating.
- **Posts API responses stay snake_case** (raw post documents), as today and as the reference expects. New non-post responses use camelCase, except the public approval preview, which keeps the reference's snake_case fields.
- **Errors:** `{ error: { code, message } }`.
- **Tests:**
  - API: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`
  - Web: `npm test -w web` (runs `src/utils/**/*.test.ts`)
  - Before a PR: `npm run build` from the repo root (the API build type-checks `apps/api/test/`).
- **After `schema.prisma` changes:** `cd apps/api && npx prisma generate`.
- **Lint:** `cd apps/web && npx eslint . | tail -1` must not exceed the baseline of **78 problems**.
  - In components, set state only in event handlers, promise callbacks, timers or `useState` initialisers. Never set it synchronously in an effect body.
  - Never call `Date.now()` / `new Date()` during render; use a `useState` initialiser.
  - Component files export only components (types are fine).
- **Commits:** every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `AGENTS.md`, `CLAUDE.md`, `memory/`, `.superpowers/` or `apps/web/dist/`.

## Deviations from the reference (intended)

1. **Approvals use permissions, not roles:** approve needs `approve_post` and publish needs `publish_post`. The reference checks role ≥ Manager.
2. **Send for approval on drafts:** users without `publish_post` see "Send for approval" on drafts; the reference shows a Publish button that fails for them.
3. **Tab counts:** one request to `GET /publisher/posts/counts` instead of six `pageSize=1` requests.
4. **Dashboard activity:** `GET /publisher/posts/activity?days=30` instead of downloading 250 posts.
5. **Ready posts are counted:** they get their own series in the activity chart and their own pipeline segment ("Ready", teal); publishing posts count as scheduled. The reference folds them into Draft or drops them.
6. **Approver note storage:** stored in `Post.approver_note` + `Post.approval_decision` (spec §7), not in `publish_results._approval`.
7. **Posts "View" link:** opens the live post URL when one is recorded, falling back to the creative.
8. **No dead controls:** the reference's no-op "Refresh" buttons on the Suggested Post and Connected Accounts widgets are not ported. Disconnect asks for confirmation.
9. **Failed analytics:** the Engagement and Audience cards show their empty states instead of skeletons forever.
10. **Share link, not auto-open:** Create's "Save for approval" shows the WhatsApp share link as a button on the success screen, instead of opening a pre-opened tab.

## File Map

**API**
- Modify `apps/api/prisma/schema.prisma`:
  - Notification: add `expires_at`.
  - Post: add `created_by`, `approver_note`, `approval_decision`.
  - Add a new `ApprovalToken` model.
- Modify `apps/api/src/db/prisma.ts`: register the `approvalToken` collection.
- Modify `apps/api/src/lib/notifications.ts`: link validation, recipient intersection, `expires_at`.
- Modify `apps/api/src/routes/notifications.ts`: no read-state writes during impersonation.
- Create `apps/api/src/lib/teamMembers.ts`: `usersWithPermission()`.
- Create `apps/api/src/lib/approvals.ts`: tokens, `decideApproval()`, share URLs.
- Create `apps/api/src/routes/approvals.ts`: submit/approve/reject and public link routes. Register in `apps/api/src/index.ts`.
- Modify `apps/api/src/routes/publisher.ts`:
  - `created_by` on create;
  - approval guards;
  - `/posts/counts` and `/posts/activity`.
- Create `apps/api/src/lib/postNotifications.ts`: `notifyPublishOutcome()`.
- Modify `apps/api/src/lib/publishDirect.ts` and `apps/api/src/routes/cron.ts`: call it.
- Modify `apps/api/src/routes/dealer.ts`: `GET /dealer/analytics`.
- Tests:
  - `test/notifications.test.ts` (extend)
  - `test/approvals-lib.test.ts`
  - `test/approvals.test.ts`
  - `test/approval-links.test.ts`
  - `test/publish-notifications.test.ts`
  - `test/post-stats.test.ts`

**Web**
- Create `apps/web/src/utils/posts.ts`, `utils/dashboard.ts`, `utils/chartPath.ts`, each with a `.test.ts`.
- Modify `components/ui/Button.tsx` (`success` variant) and `components/ui/Modal.tsx` (reference styling, scrollable body).
- Create in `components/ui/`: `StatCard.tsx`, `SectionCard.tsx`, `PageCard.tsx`, `InlineEmpty.tsx`, `linkStyles.ts`.
- Create in `components/posts/`: `PostStatusBadge.tsx`, `PlatformList.tsx`, `PostThumbnail.tsx`, `PostRow.tsx`, `PostsEmptyState.tsx`, `PostDialogs.tsx`.
- Modify `services/creative.ts`: Post type and `postService` approval/count/activity calls.
- Create `services/approvals.ts` and `services/dashboard.ts`.
- Rewrite `pages/PostsPage.tsx`.
- Create `pages/ApprovePage.tsx`.
- Create `pages/Dashboard.tsx`.
- Create in `components/dashboard/`: `ActivityChart.tsx`, `PipelineDonut.tsx`, `Insights.tsx`, `Widgets.tsx`.
- Modify `App.tsx`:
  - remove the inline dashboard;
  - add the `/approve/:token` public route;
  - use `pages/Dashboard`.
- Modify `pages/CreatePost.tsx`: "Save for approval" submits for approval.

---

### Task 1: Notification safeguards (carried forward from Stage A)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Notification`)
- Modify: `apps/api/src/lib/notifications.ts`
- Modify: `apps/api/src/routes/notifications.ts`
- Test: `apps/api/test/notifications.test.ts` (append)

**Interfaces:**
- Produces:
  - `notify(input: NotifyInput): Promise<number>`: same signature as before.
    - It now throws `Error(/app-relative/)` for a bad `link`.
    - It drops `userIds` that aren't active users of `dealerId`.
    - It sets `expires_at`.
  - `isAppPath(link: string): boolean`
  - `NOTIFICATION_TTL_DAYS = 90`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/test/notifications.test.ts`. The file already has `newDealerWithUsers`, `tokenFor`, `bearer`, and `before`/`after` hooks for `fastify`.

```ts
describe('notify() safeguards', () => {
  it('skips userIds that are inactive or belong to another dealership', async () => {
    const { dealerId, users } = await newDealerWithUsers(1, 1);
    const other = await newDealerWithUsers(1);

    const created = await notify({
      dealerId, type: 'approval_requested', title: 'Approval requested',
      userIds: [users[0]!.id, users[1]!.id, other.users[0]!.id, users[0]!.id],
    });

    assert.equal(created, 1);
    const rows = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(rows.map((r) => r.user_id), [users[0]!.id]);
    assert.equal(await prisma.notification.count({ where: { user_id: other.users[0]!.id } }), 0);
  });

  it('refuses links that are not app-relative paths', async () => {
    const { dealerId } = await newDealerWithUsers(1);
    for (const link of ['https://evil.example/x', '//evil.example', 'posts', '/posts?x=1 2', '/\\evil.example']) {
      await assert.rejects(notify({ dealerId, type: 'post_failed', title: 'x', link }), /app-relative/, link);
    }
    assert.equal(await prisma.notification.count({ where: { dealer_id: dealerId } }), 0);
  });

  it('stamps each row with a 90-day expiry for the TTL policy', async () => {
    const { dealerId } = await newDealerWithUsers(1);
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const before = Date.now();
    await notify({ dealerId, type: 'post_published', title: 'Post published', link: '/posts?status=published' });
    const [row] = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    const expires = new Date(row!.expires_at!).getTime();
    assert.ok(expires >= before + ninetyDays && expires <= Date.now() + ninetyDays);
  });
});

describe('notifications during impersonation', () => {
  it('leaves read state untouched while an admin is viewing as the user', async () => {
    const { dealerId, users } = await newDealerWithUsers(1);
    const n = await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[0]!.id, type: 'inbox_message', title: 'Hi' } });
    const payload: JwtUser = {
      dealer_user_id: users[0]!.id, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
      permissions: resolvePermissions('admin'), impersonatedBy: 'owner-1', typ: 'access',
    };
    const headers = bearer(fastify.jwt.sign(payload));

    const one = await fastify.inject({ method: 'POST', url: `/v1/notifications/${n.id}/read`, headers });
    assert.equal(one.statusCode, 200);
    const all = await fastify.inject({ method: 'POST', url: '/v1/notifications/read-all', headers });
    assert.equal((all.json() as { count: number }).count, 0);
    assert.equal((await prisma.notification.findUnique({ where: { id: n.id } }))?.is_read, false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/notifications.test.ts`
Expected: FAIL. The new tests fail: the count is 2 instead of 1, `notify` does not reject bad links, `expires_at` is undefined (a type error until the schema changes), and `is_read` becomes true.

- [ ] **Step 3: Add `expires_at` to the model**

In `apps/api/prisma/schema.prisma`, model `Notification`, add this line after the `created_at` line:

```prisma
  expires_at DateTime? // Firestore TTL policy on notifications.expires_at deletes the row after this time
```

Run: `cd apps/api && npx prisma generate`

- [ ] **Step 4: Rewrite `apps/api/src/lib/notifications.ts`**

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

/** Rows are kept this long; a Firestore TTL policy on expires_at deletes them afterwards. */
export const NOTIFICATION_TTL_DAYS = 90;

export interface NotifyInput {
  dealerId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** App-relative path the bell opens, e.g. "/posts?status=failed". */
  link?: string;
  /** Recipients (DealerUser ids). Only active users of the dealership are notified. Omit to notify all of them. */
  userIds?: string[];
}

// Only paths inside the app: an absolute or protocol-relative URL could send a reader off-site.
export function isAppPath(link: string): boolean {
  return link.startsWith('/') && !link.startsWith('//') && !/[\s\\]/.test(link);
}

// One row per recipient so each person has their own read state.
export async function notify(input: NotifyInput): Promise<number> {
  if (input.link !== undefined && !isAppPath(input.link)) {
    throw new Error(`notify(): link must be an app-relative path, got "${input.link}"`);
  }

  const active = await prisma.dealerUser.findMany({ where: { dealer_id: input.dealerId, is_active: true } });
  const activeIds = new Set(active.map((u) => u.id));
  const userIds = input.userIds ? [...new Set(input.userIds)].filter((id) => activeIds.has(id)) : [...activeIds];
  if (userIds.length === 0) return 0;

  const expires_at = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.notification.createMany({
    data: userIds.map((user_id) => ({
      dealer_id: input.dealerId,
      user_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      expires_at,
    })),
  });
  return userIds.length;
}
```

- [ ] **Step 5: Keep read state during impersonation**

In `apps/api/src/routes/notifications.ts`, make the `read-all` handler start with the early return below. The rest of the handler is unchanged.

```ts
  // POST /v1/notifications/read-all
  fastify.post('/read-all', async (request) => {
    // An admin viewing as this user must not clear the user's unread notifications.
    if (request.user.impersonatedBy) return { success: true, count: 0 };
    const { count } = await prisma.notification.updateMany({
```

In the `/:id/read` handler, change the write guard:

```ts
    if (!notification.is_read && !request.user.impersonatedBy) {
      await prisma.notification.update({ where: { id }, data: { is_read: true } });
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/notifications.test.ts`
Expected: PASS, both the new and the existing tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/lib/notifications.ts apps/api/src/routes/notifications.ts apps/api/test/notifications.test.ts
git commit -m "feat(api): notification expiry, recipient and link checks, impersonation-safe reads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Approval records and the approval domain

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Post`; new model `ApprovalToken`)
- Modify: `apps/api/src/db/prisma.ts`
- Create: `apps/api/src/lib/teamMembers.ts`
- Create: `apps/api/src/lib/approvals.ts`
- Test: `apps/api/test/approvals-lib.test.ts`

**Interfaces:**
- Consumes:
  - `notify()` (Task 1)
  - `transitionPost(id, guard, data): Promise<boolean>` from `lib/publishClaim.ts`
  - `getFrontendUrl()` from `lib/frontendUrl.ts`
- Produces:
  - `usersWithPermission(dealerId: string, permission: Permission, exclude?: Array<string | null | undefined>): Promise<string[]>`
  - `APPROVAL_LINK_DAYS = 7`
  - `type ApprovalDecision = 'approve' | 'reject'`
  - `hashApprovalToken(raw: string): string`
  - `postLabel(post: Pick<Post, 'prompt_text'>): string`: prompt text, 60 characters at most, or "Untitled post".
  - `approvalUrl(raw: string): string`
  - `whatsappShareUrl(dealerName: string, raw: string): string`
  - `issueApprovalToken(post: Pick<Post, 'id' | 'dealer_id'>, createdBy: string | null): Promise<string>`: returns the raw token.
  - `lookupApprovalToken(raw: string): Promise<{ state: 'invalid' } | { state: 'expired' | 'valid'; token: ApprovalToken }>`
  - `decideApproval(postId: string, dealerId: string, input: { decision: ApprovalDecision; note?: string | null; byUserId: string | null }): Promise<Post | null>`

- [ ] **Step 1: Add the fields and the model**

In `apps/api/prisma/schema.prisma`, model `Post`, add these lines after the `approved_at` line:

```prisma
  created_by        String?   // DealerUser.id of the author; null on posts created before Stage B
  approver_note     String?   // the approver's comment when approving, or the reason when rejecting
  approval_decision String?   // 'approved' | 'rejected': the last approval decision
```

Append a new model at the end of the file:

```prisma
// Single-use link that lets someone approve or reject a post without signing in
// (/approve/:token). Only the SHA-256 of the token is stored.
model ApprovalToken {
  id         String    @id @default(uuid())
  dealer_id  String
  post_id    String
  token_hash String    @unique
  created_by String?   // DealerUser.id who asked for approval
  expires_at DateTime
  used_at    DateTime?
  decision   String?   // 'approve' | 'reject'; null when a newer link replaced this one
  comment    String?
  created_at DateTime  @default(now())

  @@index([post_id])
}
```

Run: `cd apps/api && npx prisma generate`

In `apps/api/src/db/prisma.ts`:
- add `ApprovalToken,` to the `import type { … } from '../generated/client/index.js'` list;
- add this line after the `notification = …` line:

```ts
  approvalToken = new FirestoreCollection<ApprovalToken>('approval_tokens', 'ApprovalToken');
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/test/approvals-lib.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { decideApproval, hashApprovalToken, issueApprovalToken, lookupApprovalToken } from '../src/lib/approvals.js';
import { usersWithPermission } from '../src/lib/teamMembers.js';

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Approval Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  const member = (role: string, extra: Record<string, unknown> = {}) => prisma.dealerUser.create({
    data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true, ...extra },
  });
  return {
    dealerId: dealer.id,
    admin: await member('admin'),
    creator: await member('user'),
    approver: await member('user', { permissions: { approve_post: true } }),
    inactiveAdmin: await member('admin', { is_active: false }),
  };
}

function pendingPost(dealerId: string, createdBy: string) {
  return prisma.post.create({
    data: {
      dealer_id: dealerId, prompt_text: 'Diwali offers', caption_text: 'Visit us', caption_hashtags: [],
      platforms: ['facebook'], status: 'pending_approval', created_by: createdBy,
    },
  });
}

const titlesFor = async (userId: string) =>
  (await prisma.notification.findMany({ where: { user_id: userId } })).map((n) => n.title);

describe('usersWithPermission', () => {
  it('applies role defaults and custom overrides, skipping inactive and excluded users', async () => {
    const t = await team();
    assert.deepEqual(await usersWithPermission(t.dealerId, 'approve_post', [t.admin.id]), [t.approver.id]);
    assert.deepEqual(await usersWithPermission(t.dealerId, 'publish_post'), [t.admin.id]);
  });
});

describe('approval tokens', () => {
  it('stores only the hash and finds the token by its raw value', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    const raw = await issueApprovalToken(post, t.creator.id);

    assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
    const [stored] = await prisma.approvalToken.findMany({ where: { post_id: post.id } });
    assert.equal(stored!.token_hash, hashApprovalToken(raw));
    assert.ok(!JSON.stringify(stored).includes(raw));
    assert.equal((await lookupApprovalToken(raw)).state, 'valid');
    assert.equal((await lookupApprovalToken('not-a-token')).state, 'invalid');
  });

  it('spends the previous link when a new one is issued', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    const first = await issueApprovalToken(post, t.creator.id);
    await issueApprovalToken(post, t.creator.id);

    const lookup = await lookupApprovalToken(first);
    assert.ok(lookup.state === 'valid' && lookup.token.used_at && lookup.token.decision == null);
  });

  it('reports an expired link', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    await prisma.approvalToken.create({
      data: { dealer_id: t.dealerId, post_id: post.id, token_hash: hashApprovalToken('old-token'), expires_at: new Date(Date.now() - 1000) },
    });
    assert.equal((await lookupApprovalToken('old-token')).state, 'expired');
  });
});

describe('decideApproval', () => {
  it('approves a pending post, spends its links and tells the author and publishers', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    const raw = await issueApprovalToken(post, t.creator.id);

    const updated = await decideApproval(post.id, t.dealerId, { decision: 'approve', byUserId: t.approver.id, note: '  Looks good ' });

    assert.equal(updated?.status, 'approved');
    assert.equal(updated?.approval_decision, 'approved');
    assert.equal(updated?.approver_note, 'Looks good');
    assert.equal(updated?.approved_by, t.approver.id);
    assert.ok(updated?.approved_at);
    const lookup = await lookupApprovalToken(raw);
    assert.ok(lookup.state === 'valid' && lookup.token.used_at && lookup.token.decision === 'approve');
    assert.deepEqual(await titlesFor(t.creator.id), ['Post approved']);
    assert.deepEqual(await titlesFor(t.admin.id), ['Post approved']);
    assert.deepEqual(await titlesFor(t.approver.id), []);
  });

  it('rejects back to draft with the reason and tells only the author', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);

    const updated = await decideApproval(post.id, t.dealerId, { decision: 'reject', byUserId: t.admin.id, note: 'Wrong price' });

    assert.equal(updated?.status, 'draft');
    assert.equal(updated?.approval_decision, 'rejected');
    assert.equal(updated?.approver_note, 'Wrong price');
    const [n] = await prisma.notification.findMany({ where: { user_id: t.creator.id } });
    assert.equal(n?.title, 'Post rejected');
    assert.match(n?.body ?? '', /Reason: Wrong price/);
    assert.equal(n?.link, '/posts?status=draft');
    assert.deepEqual(await titlesFor(t.admin.id), []);
  });

  it('does nothing when the post is not awaiting approval or belongs to another dealership', async () => {
    const t = await team();
    const other = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);

    assert.equal(await decideApproval(post.id, other.dealerId, { decision: 'approve', byUserId: other.admin.id }), null);
    await prisma.post.update({ where: { id: post.id }, data: { status: 'draft' } });
    assert.equal(await decideApproval(post.id, t.dealerId, { decision: 'approve', byUserId: t.admin.id }), null);
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'draft');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/approvals-lib.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/approvals.js'`

- [ ] **Step 4: Create `apps/api/src/lib/teamMembers.ts`**

```ts
import { prisma } from '../db/prisma.js';
import { resolvePermissions, type Permission } from './permissions.js';

// Active users of the dealership who hold `permission` (role defaults plus any custom
// overrides), minus anyone listed in `exclude`.
export async function usersWithPermission(
  dealerId: string,
  permission: Permission,
  exclude: Array<string | null | undefined> = [],
): Promise<string[]> {
  const skip = new Set(exclude.filter((id): id is string => !!id));
  const users = await prisma.dealerUser.findMany({ where: { dealer_id: dealerId, is_active: true } });
  return users
    .filter((u) => !skip.has(u.id))
    .filter((u) => resolvePermissions(u.role, u.permissions as Record<string, boolean> | null)[permission] === true)
    .map((u) => u.id);
}
```

- [ ] **Step 5: Create `apps/api/src/lib/approvals.ts`**

```ts
import { createHash, randomBytes } from 'crypto';
import type { ApprovalToken, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { getFrontendUrl } from './frontendUrl.js';
import { notify } from './notifications.js';
import { PERMISSIONS } from './permissions.js';
import { transitionPost } from './publishClaim.js';
import { usersWithPermission } from './teamMembers.js';

export const APPROVAL_LINK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ApprovalDecision = 'approve' | 'reject';

export type ApprovalTokenLookup =
  | { state: 'invalid' }
  | { state: 'expired'; token: ApprovalToken }
  | { state: 'valid'; token: ApprovalToken };

export interface DecideApprovalInput {
  decision: ApprovalDecision;
  /** The approver's comment, or the rejection reason. */
  note?: string | null;
  /** DealerUser who decided in the app; null when decided through an approval link. */
  byUserId: string | null;
}

export function hashApprovalToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function postLabel(post: Pick<Post, 'prompt_text'>): string {
  const text = (post.prompt_text ?? '').trim() || 'Untitled post';
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function approvalUrl(rawToken: string): string {
  return `${getFrontendUrl()}/approve/${rawToken}`;
}

export function whatsappShareUrl(dealerName: string, rawToken: string): string {
  const text = `Please review this post for ${dealerName}: ${approvalUrl(rawToken)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function spendOpenTokens(postId: string, outcome: { decision?: ApprovalDecision; comment?: string | null } = {}) {
  const now = new Date();
  const tokens = await prisma.approvalToken.findMany({ where: { post_id: postId } });
  for (const token of tokens) {
    if (!token.used_at) await prisma.approvalToken.update({ where: { id: token.id }, data: { used_at: now, ...outcome } });
  }
}

// Issues a fresh single-use link for a post awaiting approval; older open links for the post
// stop working. Returns the raw token, which is never stored.
export async function issueApprovalToken(post: Pick<Post, 'id' | 'dealer_id'>, createdBy: string | null): Promise<string> {
  await spendOpenTokens(post.id);
  const raw = randomBytes(32).toString('base64url');
  await prisma.approvalToken.create({
    data: {
      dealer_id: post.dealer_id,
      post_id: post.id,
      token_hash: hashApprovalToken(raw),
      created_by: createdBy,
      expires_at: new Date(Date.now() + APPROVAL_LINK_DAYS * DAY_MS),
    },
  });
  return raw;
}

export async function lookupApprovalToken(raw: string): Promise<ApprovalTokenLookup> {
  if (!raw || raw.length > 128) return { state: 'invalid' };
  const token = await prisma.approvalToken.findFirst({ where: { token_hash: hashApprovalToken(raw) } });
  if (!token) return { state: 'invalid' };
  if (new Date(token.expires_at).getTime() <= Date.now()) return { state: 'expired', token };
  return { state: 'valid', token };
}

// Moves a post from pending_approval to approved, or back to draft when rejected, and spends its
// approval links. Returns null when the post is no longer awaiting approval (someone decided first).
export async function decideApproval(postId: string, dealerId: string, input: DecideApprovalInput): Promise<Post | null> {
  const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : null;
  const moved = await transitionPost(
    postId,
    (p) => p.dealer_id === dealerId && p.status === 'pending_approval',
    input.decision === 'approve'
      ? { status: 'approved', approval_decision: 'approved', approver_note: note, approved_by: input.byUserId, approved_at: new Date() }
      : { status: 'draft', approval_decision: 'rejected', approver_note: note, approved_by: null, approved_at: null },
  );
  if (!moved) return null;

  await spendOpenTokens(postId, { decision: input.decision, comment: note });
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (post) await notifyDecision(post, input.decision, input.byUserId, note);
  return post;
}

async function notifyDecision(post: Post, decision: ApprovalDecision, byUserId: string | null, note: string | null) {
  const label = postLabel(post);
  const author = post.created_by && post.created_by !== byUserId ? [post.created_by] : [];

  if (decision === 'approve') {
    // The author, and everyone who can publish it, need to know it is ready.
    const publishers = await usersWithPermission(post.dealer_id, PERMISSIONS.PUBLISH_POST, [byUserId]);
    await notify({
      dealerId: post.dealer_id,
      type: 'approval_decided',
      userIds: [...new Set([...author, ...publishers])],
      title: 'Post approved',
      body: note ? `"${label}" is ready to publish. Approver note: ${note}` : `"${label}" is ready to publish.`,
      link: '/posts?status=approved',
    });
    return;
  }

  await notify({
    dealerId: post.dealer_id,
    type: 'approval_decided',
    userIds: author,
    title: 'Post rejected',
    body: note ? `"${label}" was sent back to drafts. Reason: ${note}` : `"${label}" was sent back to drafts.`,
    link: '/posts?status=draft',
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/approvals-lib.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests); `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/db/prisma.ts apps/api/src/lib/teamMembers.ts apps/api/src/lib/approvals.ts apps/api/test/approvals-lib.test.ts
git commit -m "feat(api): approval tokens and the shared approve/reject transition

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Submit, approve and reject routes; approval guards on publishing

**Files:**
- Create: `apps/api/src/routes/approvals.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/publisher.ts`
- Test: `apps/api/test/approvals.test.ts`

**Interfaces:**
- Consumes: Task 2 (`decideApproval`, `issueApprovalToken`, `approvalUrl`, `whatsappShareUrl`, `postLabel`, `usersWithPermission`); `notify()`.
- Produces (HTTP, all under `/v1/publisher`, all authenticated):
  - `POST /posts/:id/submit-for-approval`, body `{ platforms?: string[] }`
    - 200: `{ success: true, item: Post, approvalUrl: string, whatsappShare: string }`
    - 404: `NOT_FOUND`
    - 409: `INVALID_STATUS` (only drafts)
    - 400: `INVALID_INPUT` (bad platforms)
  - `POST /posts/:id/approve` (needs `approve_post`)
    - 200: `{ success: true, item: Post }`
    - 403, 404
    - 409: `NOT_PENDING`
  - `POST /posts/:id/reject`, body `{ reason?: string }` (needs `approve_post`)
    - 200: `{ success: true, item: Post }`
    - 400, 403, 404
    - 409: `NOT_PENDING`
  - Changes to existing routes:
    - `POST /v1/publisher` stores `created_by`.
    - `PATCH /posts/:id` returns 400 `INVALID_STATUS` for `pending_approval`/`approved`.
    - `POST /publish` and `PATCH /posts/:id/reschedule` return 409 `AWAITING_APPROVAL` for a pending post.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/approvals.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Approval Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const member = (role: Role) => prisma.dealerUser.create({
    data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true },
  });
  return { dealerId: dealer.id, admin: await member('admin'), creator: await member('user') };
}

function headersFor(user: { id: string; role: string; dealer_id: string | null }) {
  const payload: JwtUser = {
    dealer_user_id: user.id, dealer_id: user.dealer_id, role: user.role as Role, phone: '+910000000000',
    permissions: resolvePermissions(user.role), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function newPost(dealerId: string, createdBy: string, status = 'draft') {
  return prisma.post.create({
    data: {
      dealer_id: dealerId, prompt_text: 'Weekend test drive', caption_text: 'Book now', caption_hashtags: ['TestDrive'],
      creative_urls: { facebook: 'https://cdn.example.com/fb.jpg' }, platforms: ['facebook'], status, created_by: createdBy,
    },
  });
}

const send = (method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) =>
  fastify.inject({ method, url, headers, ...(payload !== undefined ? { payload: payload as object } : {}) });

describe('submit for approval', () => {
  it('moves a draft to pending_approval, returns a share link and notifies approvers', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id);

    const res = await send('POST', `/v1/publisher/posts/${post.id}/submit-for-approval`, headersFor(t.creator), { platforms: ['facebook', 'instagram'] });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { item: { status: string; platforms: string[] }; approvalUrl: string; whatsappShare: string };
    assert.equal(body.item.status, 'pending_approval');
    assert.deepEqual(body.item.platforms, ['facebook', 'instagram']);
    assert.match(body.approvalUrl, /\/approve\/[A-Za-z0-9_-]{43}$/);
    assert.ok(body.whatsappShare.startsWith('https://wa.me/?text='));
    assert.ok(decodeURIComponent(body.whatsappShare).includes(body.approvalUrl));
    const [n] = await prisma.notification.findMany({ where: { user_id: t.admin.id } });
    assert.equal(n?.type, 'approval_requested');
    assert.equal(n?.link, '/posts?status=pending_approval');
    assert.equal(await prisma.notification.count({ where: { user_id: t.creator.id } }), 0);
  });

  it('refuses posts that are not drafts, and posts of another dealership', async () => {
    const t = await team();
    const other = await team();
    const scheduled = await newPost(t.dealerId, t.creator.id, 'scheduled');
    assert.equal((await send('POST', `/v1/publisher/posts/${scheduled.id}/submit-for-approval`, headersFor(t.creator))).statusCode, 409);
    const draft = await newPost(t.dealerId, t.creator.id);
    assert.equal((await send('POST', `/v1/publisher/posts/${draft.id}/submit-for-approval`, headersFor(other.creator))).statusCode, 404);
  });
});

describe('approve and reject', () => {
  it('lets an approver approve a pending post once', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');

    const res = await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.admin));

    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { status: string; approved_by: string } }).item;
    assert.equal(item.status, 'approved');
    assert.equal(item.approved_by, t.admin.id);
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.admin))).statusCode, 409);
  });

  it('refuses users without approve_post', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.creator))).statusCode, 403);
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/reject`, headersFor(t.creator), { reason: 'x' })).statusCode, 403);
  });

  it('rejects back to draft with the reason as the approver note', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');

    const res = await send('POST', `/v1/publisher/posts/${post.id}/reject`, headersFor(t.admin), { reason: 'Use the new price' });

    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { status: string; approver_note: string; approval_decision: string } }).item;
    assert.deepEqual([item.status, item.approver_note, item.approval_decision], ['draft', 'Use the new price', 'rejected']);
  });

  it('keeps other dealerships out', async () => {
    const t = await team();
    const other = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(other.admin))).statusCode, 404);
  });
});

describe('approval guards on existing publisher routes', () => {
  it('records the author of a new post', async () => {
    const t = await team();
    const res = await send('POST', '/v1/publisher', headersFor(t.creator), { promptText: 'Monsoon offer', platforms: ['facebook'] });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { item: { created_by: string } }).item.created_by, t.creator.id);
  });

  it('does not let PATCH set approval statuses', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id);
    for (const status of ['pending_approval', 'approved']) {
      const res = await send('PATCH', `/v1/publisher/posts/${post.id}`, headersFor(t.admin), { status });
      assert.equal(res.statusCode, 400, status);
    }
  });

  it('will not publish, schedule or reschedule a post awaiting approval', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    const headers = headersFor(t.admin);
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const responses = [
      await send('POST', '/v1/publisher/publish', headers, { post_id: post.id, platforms: ['facebook'] }),
      await send('POST', '/v1/publisher/publish', headers, { post_id: post.id, platforms: ['facebook'], scheduled_at: later }),
      await send('PATCH', `/v1/publisher/posts/${post.id}/reschedule`, headers, { scheduled_at: later }),
    ];

    for (const res of responses) {
      assert.equal(res.statusCode, 409);
      assert.equal((res.json() as { error: { code: string } }).error.code, 'AWAITING_APPROVAL');
    }
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'pending_approval');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/approvals.test.ts`
Expected: FAIL. The new routes return 404, `created_by` is missing, and PATCH/publish don't refuse.

- [ ] **Step 3: Create `apps/api/src/routes/approvals.ts`**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma.js';
import { approvalUrl, decideApproval, issueApprovalToken, postLabel, whatsappShareUrl } from '../lib/approvals.js';
import { notify } from '../lib/notifications.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { transitionPost } from '../lib/publishClaim.js';
import { getUser, requirePermission } from '../lib/routeHelpers.js';
import { usersWithPermission } from '../lib/teamMembers.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Post not found' } };
const NOT_PENDING = { error: { code: 'NOT_PENDING', message: 'This post is not awaiting approval.' } };

async function requireApprovePermission(request: FastifyRequest, reply: FastifyReply) {
  if (!requirePermission(reply, getUser(request), PERMISSIONS.APPROVE_POST)) return reply;
}

// Approval workflow, registered under /v1/publisher: a draft is sent for approval
// (pending_approval), then an approver marks it ready to publish (approved) or sends it back
// to drafts. Publishing an approved post still needs publish_post.
export default async function approvalRoutes(fastify: FastifyInstance) {
  // POST /v1/publisher/posts/:id/submit-for-approval  { platforms? }
  fastify.post('/posts/:id/submit-for-approval', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    const dealer_id = user.dealer_id!;
    const { id } = request.params as { id: string };
    const { platforms } = (request.body ?? {}) as { platforms?: unknown };
    if (platforms !== undefined && (!Array.isArray(platforms) || platforms.length === 0 || !platforms.every((p) => typeof p === 'string'))) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'platforms must be a non-empty list' } });
    }

    const post = await prisma.post.findFirst({ where: { id, dealer_id } });
    if (!post) return reply.code(404).send(NOT_FOUND);

    const submitted = await transitionPost(
      id,
      (p) => p.dealer_id === dealer_id && p.status === 'draft',
      { status: 'pending_approval', approval_decision: null, approver_note: null, ...(platforms ? { platforms } : {}) },
    );
    if (!submitted) {
      return reply.code(409).send({ error: { code: 'INVALID_STATUS', message: 'Only drafts can be sent for approval.' } });
    }

    const rawToken = await issueApprovalToken(post, user.dealer_user_id);
    const [dealer, approvers] = await Promise.all([
      prisma.dealer.findUnique({ where: { id: dealer_id } }),
      usersWithPermission(dealer_id, PERMISSIONS.APPROVE_POST, [user.dealer_user_id]),
    ]);
    await notify({
      dealerId: dealer_id,
      type: 'approval_requested',
      userIds: approvers,
      title: 'Approval requested',
      body: `"${postLabel(post)}" is waiting for your approval.`,
      link: '/posts?status=pending_approval',
    });

    const item = await prisma.post.findUnique({ where: { id } });
    return {
      success: true,
      item,
      approvalUrl: approvalUrl(rawToken),
      whatsappShare: whatsappShareUrl(dealer?.name ?? 'your dealership', rawToken),
    };
  });

  // POST /v1/publisher/posts/:id/approve
  fastify.post('/posts/:id/approve', { preHandler: [fastify.authenticate, requireApprovePermission] }, async (request, reply) => {
    const user = getUser(request);
    const dealer_id = user.dealer_id!;
    const { id } = request.params as { id: string };
    if (!(await prisma.post.findFirst({ where: { id, dealer_id } }))) return reply.code(404).send(NOT_FOUND);

    const item = await decideApproval(id, dealer_id, { decision: 'approve', byUserId: user.dealer_user_id });
    if (!item) return reply.code(409).send(NOT_PENDING);
    return { success: true, item };
  });

  // POST /v1/publisher/posts/:id/reject  { reason? }
  fastify.post('/posts/:id/reject', { preHandler: [fastify.authenticate, requireApprovePermission] }, async (request, reply) => {
    const user = getUser(request);
    const dealer_id = user.dealer_id!;
    const { id } = request.params as { id: string };
    const { reason } = (request.body ?? {}) as { reason?: unknown };
    if (reason != null && (typeof reason !== 'string' || reason.length > 1000)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'reason must be at most 1000 characters' } });
    }
    if (!(await prisma.post.findFirst({ where: { id, dealer_id } }))) return reply.code(404).send(NOT_FOUND);

    const item = await decideApproval(id, dealer_id, {
      decision: 'reject',
      byUserId: user.dealer_user_id,
      note: typeof reason === 'string' ? reason : null,
    });
    if (!item) return reply.code(409).send(NOT_PENDING);
    return { success: true, item };
  });
}
```

In `apps/api/src/index.ts`:
- add `import approvalRoutes from './routes/approvals.js';` after the `publisherRoutes` import;
- register it right after the publisher line:

```ts
fastify.register(approvalRoutes,  { prefix: '/v1/publisher' });
```

- [ ] **Step 4: Guard the existing publisher routes**

In `apps/api/src/routes/publisher.ts`:

(a) Below `const PUBLISH_STATUSES = …`, add:

```ts
// Approval statuses change only through the approval routes (routes/approvals.ts).
const APPROVAL_STATUSES = new Set(["pending_approval", "approved"])

const AWAITING_APPROVAL = {
  error: {
    code: "AWAITING_APPROVAL",
    message: "Approve or reject this post before publishing it.",
  },
}
```

(b) In `POST /` (create), add `created_by` to the `prisma.post.create` data, right after `status: "draft",`:

```ts
          created_by: request.user.dealer_user_id ?? null,
```

(c) In `PATCH /posts/:id`, insert this check before the existing `publish_post` check:

```ts
      if (body.status !== undefined && APPROVAL_STATUSES.has(body.status)) {
        return reply.code(400).send({
          error: { code: "INVALID_STATUS", message: "Use the approval actions to send, approve or reject a post." },
        })
      }
```

(d) In `PATCH /posts/:id/reschedule`, right after `if (post.status === "publishing") return reply.code(409).send(PUBLISH_IN_PROGRESS)`, add:

```ts
      if (post.status === "pending_approval") return reply.code(409).send(AWAITING_APPROVAL)
```

(e) In `POST /publish`:
- Add the same line right after its `if (post.status === "publishing") return reply.code(409).send(PUBLISH_IN_PROGRESS)`.
- Extend the claim guard so a post sent for approval mid-request isn't published:

```ts
      const claimed = await transitionPost(
        post_id,
        (p) => p.dealer_id === dealer_id && p.status !== "publishing" && p.status !== "pending_approval",
        { status: "publishing", platforms },
      )
```

- [ ] **Step 5: Run the tests, then the whole suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/approvals.test.ts`
Expected: PASS (9 tests)

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/approvals.ts apps/api/src/index.ts apps/api/src/routes/publisher.ts apps/api/test/approvals.test.ts
git commit -m "feat(api): send posts for approval, approve and reject them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Public approval link routes

**Files:**
- Modify: `apps/api/src/routes/approvals.ts`
- Test: `apps/api/test/approval-links.test.ts`

**Interfaces:**
- Consumes: `lookupApprovalToken`, `decideApproval` (Task 2).
- Produces (public, no auth, 20 requests/min per IP):
  - `GET /v1/publisher/approval/:token`
    - 200: `{ dealer_name: string, actionable: boolean, post: { creative_urls: object, caption_text: string, caption_hashtags: string[], platforms: string[] } }`
    - 404: `INVALID_LINK` "This approval link is invalid."
    - 410: `LINK_EXPIRED` "This approval link has expired. Ask the team to send a new one."
  - `POST /v1/publisher/approval/:token`, body `{ decision: 'approve' | 'reject', comment?: string }`
    - 200: `{ status: 'approved' | 'rejected', message: string }`
    - 400: `INVALID_INPUT`
    - 404, 410 as above
    - 409: `ALREADY_ACTIONED` "This post has already been actioned."

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/approval-links.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { hashApprovalToken } from '../src/lib/approvals.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

function headersFor(user: { id: string; role: string; dealer_id: string | null }) {
  const payload: JwtUser = {
    dealer_user_id: user.id, dealer_id: user.dealer_id, role: user.role as Role, phone: '+910000000000',
    permissions: resolvePermissions(user.role), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

// A post sent for approval through the API; returns its raw link token.
async function submitted() {
  const dealer = await prisma.dealer.create({ data: { name: 'Link Motors', city: 'Jaipur', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const member = (role: Role) => prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true } });
  const admin = await member('admin');
  const creator = await member('user');
  const post = await prisma.post.create({
    data: {
      dealer_id: dealer.id, prompt_text: 'Festive exchange bonus', caption_text: 'Exchange your old car', caption_hashtags: ['Exchange'],
      creative_urls: { instagram: 'https://cdn.example.com/ig.jpg' }, platforms: ['instagram'], status: 'draft', created_by: creator.id,
    },
  });
  const res = await fastify.inject({ method: 'POST', url: `/v1/publisher/posts/${post.id}/submit-for-approval`, headers: headersFor(creator) });
  const token = (res.json() as { approvalUrl: string }).approvalUrl.split('/approve/')[1]!;
  return { dealerId: dealer.id, admin, creator, post, token };
}

const view = (token: string) => fastify.inject({ method: 'GET', url: `/v1/publisher/approval/${token}` });
const decide = (token: string, payload: object) => fastify.inject({ method: 'POST', url: `/v1/publisher/approval/${token}`, payload });

describe('GET /v1/publisher/approval/:token', () => {
  it('shows the post to anyone holding the link', async () => {
    const s = await submitted();
    const res = await view(s.token);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      dealer_name: 'Link Motors',
      actionable: true,
      post: {
        creative_urls: { instagram: 'https://cdn.example.com/ig.jpg' },
        caption_text: 'Exchange your old car',
        caption_hashtags: ['Exchange'],
        platforms: ['instagram'],
      },
    });
  });

  it('explains unknown and expired links', async () => {
    const unknown = await view('no-such-token');
    assert.equal(unknown.statusCode, 404);
    assert.equal((unknown.json() as { error: { code: string } }).error.code, 'INVALID_LINK');

    const s = await submitted();
    await prisma.approvalToken.create({
      data: { dealer_id: s.dealerId, post_id: s.post.id, token_hash: hashApprovalToken('expired-token'), expires_at: new Date(Date.now() - 1000) },
    });
    const expired = await view('expired-token');
    assert.equal(expired.statusCode, 410);
    assert.equal((expired.json() as { error: { message: string } }).error.message, 'This approval link has expired. Ask the team to send a new one.');
  });
});

describe('POST /v1/publisher/approval/:token', () => {
  it('approves once, then reports the post as actioned', async () => {
    const s = await submitted();

    const res = await decide(s.token, { decision: 'approve', comment: 'Go ahead' });

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { status: string }).status, 'approved');
    const post = await prisma.post.findUnique({ where: { id: s.post.id } });
    assert.deepEqual([post?.status, post?.approver_note, post?.approved_by], ['approved', 'Go ahead', null]);
    const again = await decide(s.token, { decision: 'reject' });
    assert.equal(again.statusCode, 409);
    assert.equal((again.json() as { error: { code: string } }).error.code, 'ALREADY_ACTIONED');
    assert.equal((await view(s.token)).json().actionable, false);
  });

  it('rejects back to draft with the comment', async () => {
    const s = await submitted();
    const res = await decide(s.token, { decision: 'reject', comment: 'Wrong logo' });
    assert.equal((res.json() as { status: string }).status, 'rejected');
    const post = await prisma.post.findUnique({ where: { id: s.post.id } });
    assert.deepEqual([post?.status, post?.approver_note, post?.approval_decision], ['draft', 'Wrong logo', 'rejected']);
  });

  it('refuses a bad decision and a link already spent in the app', async () => {
    const s = await submitted();
    assert.equal((await decide(s.token, { decision: 'maybe' })).statusCode, 400);
    await fastify.inject({ method: 'POST', url: `/v1/publisher/posts/${s.post.id}/approve`, headers: headersFor(s.admin) });
    assert.equal((await decide(s.token, { decision: 'reject' })).statusCode, 409);
  });

  it('rate-limits each client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/approval/probe', headers: { 'x-forwarded-for': '203.0.113.77' } });
      statuses.push(res.statusCode);
    }
    assert.equal(statuses[19], 404);
    assert.equal(statuses[20], 429);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/approval-links.test.ts`
Expected: FAIL. Fastify's default 404 has no `error.code`, and the public routes don't exist yet.

- [ ] **Step 3: Add the public routes**

In `apps/api/src/routes/approvals.ts`:

(a) Extend the import from `../lib/approvals.js` to include `lookupApprovalToken`.

(b) Add these constants below `NOT_PENDING`:

```ts
// Approval links are public, so each client IP gets a small budget per route.
const APPROVAL_LINK_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };
const INVALID_LINK = { error: { code: 'INVALID_LINK', message: 'This approval link is invalid.' } };
const EXPIRED_LINK = { error: { code: 'LINK_EXPIRED', message: 'This approval link has expired. Ask the team to send a new one.' } };
const ALREADY_ACTIONED = { error: { code: 'ALREADY_ACTIONED', message: 'This post has already been actioned.' } };
```

(c) Add these two routes at the end of `approvalRoutes`:

```ts
  // GET /v1/publisher/approval/:token (public): the post the approver is asked about
  fastify.get('/approval/:token', { config: APPROVAL_LINK_RATE_LIMIT }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const lookup = await lookupApprovalToken(token);
    if (lookup.state === 'invalid') return reply.code(404).send(INVALID_LINK);
    if (lookup.state === 'expired') return reply.code(410).send(EXPIRED_LINK);

    const post = await prisma.post.findFirst({ where: { id: lookup.token.post_id, dealer_id: lookup.token.dealer_id } });
    if (!post) return reply.code(404).send(INVALID_LINK);
    const dealer = await prisma.dealer.findUnique({ where: { id: lookup.token.dealer_id } });

    return {
      dealer_name: dealer?.name ?? 'Your dealership',
      actionable: !lookup.token.used_at && post.status === 'pending_approval',
      post: {
        creative_urls: post.creative_urls ?? {},
        caption_text: post.caption_text ?? '',
        caption_hashtags: post.caption_hashtags ?? [],
        platforms: post.platforms ?? [],
      },
    };
  });

  // POST /v1/publisher/approval/:token (public)  { decision: 'approve' | 'reject', comment? }
  fastify.post('/approval/:token', { config: APPROVAL_LINK_RATE_LIMIT }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const { decision, comment } = (request.body ?? {}) as { decision?: unknown; comment?: unknown };
    if (decision !== 'approve' && decision !== 'reject') {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'decision must be approve or reject' } });
    }
    if (comment != null && (typeof comment !== 'string' || comment.length > 1000)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'comment must be at most 1000 characters' } });
    }

    const lookup = await lookupApprovalToken(token);
    if (lookup.state === 'invalid') return reply.code(404).send(INVALID_LINK);
    if (lookup.state === 'expired') return reply.code(410).send(EXPIRED_LINK);
    if (lookup.token.used_at) return reply.code(409).send(ALREADY_ACTIONED);

    const post = await decideApproval(lookup.token.post_id, lookup.token.dealer_id, {
      decision,
      byUserId: null,
      note: typeof comment === 'string' ? comment : null,
    });
    if (!post) return reply.code(409).send(ALREADY_ACTIONED);

    request.log.info({ action: `post.approval_link.${decision}`, postId: post.id });
    return decision === 'approve'
      ? { status: 'approved', message: 'Post approved. The team can now publish it.' }
      : { status: 'rejected', message: 'Post rejected. It has been sent back to drafts for changes.' };
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/approval-links.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests); `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/approvals.ts apps/api/test/approval-links.test.ts
git commit -m "feat(api): public single-use approval links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Notify on publish success and failure

**Files:**
- Create: `apps/api/src/lib/postNotifications.ts`
- Modify: `apps/api/src/lib/publishDirect.ts` (`publishPost`)
- Modify: `apps/api/src/routes/cron.ts` (`recoverStuckPosts`)
- Test: `apps/api/test/publish-notifications.test.ts`

**Interfaces:**
- Consumes: `notify()`, `usersWithPermission()`, `postLabel()`.
- Produces: `notifyPublishOutcome(notice: { post: Pick<Post, 'id' | 'dealer_id' | 'prompt_text' | 'created_by'>; status: 'published' | 'failed'; publishedOn: string[]; failedOn: string[] }): Promise<void>`. It never throws.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/publish-notifications.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { notifyPublishOutcome } from '../src/lib/postNotifications.js';
import { publishPost } from '../src/lib/publishDirect.js';

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Outcome Motors', city: 'Nagpur', phone: `phone-${randomUUID()}` } });
  const member = (role: string) => prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true } });
  return { dealerId: dealer.id, admin: await member('admin'), creator: await member('user') };
}

const inbox = (userId: string) => prisma.notification.findMany({ where: { user_id: userId } });

describe('notifyPublishOutcome', () => {
  it('tells the author when the post goes live', async () => {
    const t = await team();
    await notifyPublishOutcome({
      post: { id: 'p1', dealer_id: t.dealerId, prompt_text: 'Diwali offers', created_by: t.creator.id },
      status: 'published', publishedOn: ['Facebook', 'Instagram'], failedOn: [],
    });
    const [n] = await inbox(t.creator.id);
    assert.deepEqual([n?.type, n?.title, n?.body, n?.link], ['post_published', 'Post published', '"Diwali offers" is live on Facebook and Instagram.', '/posts?status=published']);
    assert.equal((await inbox(t.admin.id)).length, 0);
  });

  it('reports a partial publish', async () => {
    const t = await team();
    await notifyPublishOutcome({
      post: { id: 'p2', dealer_id: t.dealerId, prompt_text: 'Service camp', created_by: t.creator.id },
      status: 'published', publishedOn: ['Facebook'], failedOn: ['Google Business Profile'],
    });
    const [n] = await inbox(t.creator.id);
    assert.equal(n?.title, 'Post partly published');
    assert.equal(n?.body, '"Service camp" is live on Facebook but failed on Google Business Profile.');
  });

  it('tells everyone who can publish when the post has no author', async () => {
    const t = await team();
    await notifyPublishOutcome({
      post: { id: 'p3', dealer_id: t.dealerId, prompt_text: 'Old post', created_by: null },
      status: 'failed', publishedOn: [], failedOn: ['Instagram'],
    });
    const [n] = await inbox(t.admin.id);
    assert.deepEqual([n?.type, n?.title, n?.link], ['post_failed', 'Post failed to publish', '/posts?status=failed']);
    assert.equal(n?.body, '"Old post" could not be published to Instagram. Open Posts to retry.');
    assert.equal((await inbox(t.creator.id)).length, 0);
  });

  it('never throws', async (t) => {
    const team1 = await team();
    t.mock.method(prisma.notification, 'createMany', async () => { throw new Error('store down'); });
    t.mock.method(console, 'error', () => {});
    await assert.doesNotReject(notifyPublishOutcome({
      post: { id: 'p4', dealer_id: team1.dealerId, prompt_text: 'x', created_by: team1.creator.id },
      status: 'published', publishedOn: ['Facebook'], failedOn: [],
    }));
  });
});

describe('publishPost', () => {
  it('notifies the author when every platform fails', async () => {
    const t = await team();
    const post = await prisma.post.create({
      data: {
        dealer_id: t.dealerId, prompt_text: 'Monsoon service camp', caption_text: 'x', caption_hashtags: [],
        platforms: ['facebook'], status: 'publishing', created_by: t.creator.id,
      },
    });

    const outcome = await publishPost(post, ['facebook']); // no connected account → failed

    assert.equal(outcome.status, 'failed');
    const [n] = await inbox(t.creator.id);
    assert.equal(n?.type, 'post_failed');
    assert.match(n?.body ?? '', /could not be published to Facebook/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publish-notifications.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/postNotifications.js'`

- [ ] **Step 3: Create `apps/api/src/lib/postNotifications.ts`**

```ts
import type { Post } from '../generated/client/index.js';
import { postLabel } from './approvals.js';
import { notify } from './notifications.js';
import { PERMISSIONS } from './permissions.js';
import { usersWithPermission } from './teamMembers.js';

export interface PublishOutcomeNotice {
  post: Pick<Post, 'id' | 'dealer_id' | 'prompt_text' | 'created_by'>;
  status: 'published' | 'failed';
  /** Display names of the platforms that have the post, e.g. "Facebook". */
  publishedOn: string[];
  /** Display names of the platforms that failed. */
  failedOn: string[];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Tells the author (or, for posts without one, everyone who can publish) how publishing went.
// Never throws: a notification problem must not turn a finished publish into an error.
export async function notifyPublishOutcome(notice: PublishOutcomeNotice): Promise<void> {
  try {
    const { post } = notice;
    const userIds = post.created_by
      ? [post.created_by]
      : await usersWithPermission(post.dealer_id, PERMISSIONS.PUBLISH_POST);
    const label = postLabel(post);

    if (notice.status === 'failed') {
      const where = notice.failedOn.length ? ` to ${joinNames(notice.failedOn)}` : '';
      await notify({
        dealerId: post.dealer_id, type: 'post_failed', userIds,
        title: 'Post failed to publish',
        body: `"${label}" could not be published${where}. Open Posts to retry.`,
        link: '/posts?status=failed',
      });
      return;
    }

    const partial = notice.failedOn.length > 0;
    await notify({
      dealerId: post.dealer_id, type: 'post_published', userIds,
      title: partial ? 'Post partly published' : 'Post published',
      body: partial
        ? `"${label}" is live on ${joinNames(notice.publishedOn)} but failed on ${joinNames(notice.failedOn)}.`
        : `"${label}" is live on ${joinNames(notice.publishedOn)}.`,
      link: '/posts?status=published',
    });
  } catch (err) {
    console.error('[notifications] Could not record the publish outcome', err);
  }
}
```

- [ ] **Step 4: Hook it into both places that finish a publish**

In `apps/api/src/lib/publishDirect.ts`:
- add `import { notifyPublishOutcome } from './postNotifications.js';`;
- in `publishPost`, between the final `await prisma.post.update({ … })` and `return { status, results };`, insert:

```ts
  await notifyPublishOutcome({
    post: {
      id: post.id,
      dealer_id: post.dealer_id,
      prompt_text: existing?.prompt_text ?? '',
      created_by: existing?.created_by ?? null,
    },
    status,
    publishedOn: results.filter((r) => r.success).map((r) => platformLabel(r.platform)),
    failedOn: results.filter((r) => !r.success).map((r) => platformLabel(r.platform)),
  });
```

In `apps/api/src/routes/cron.ts`:
- change the publishDirect import to `import { isSuccessfulResult, platformLabel, publishPost } from '../lib/publishDirect.js';`;
- add `import { notifyPublishOutcome } from '../lib/postNotifications.js';`;
- in `recoverStuckPosts`, replace `if (marked) recovered.push(post.id);` with:

```ts
    if (marked) {
      recovered.push(post.id);
      const platforms = post.platforms ?? [];
      await notifyPublishOutcome({
        post,
        status: anySucceeded ? 'published' : 'failed',
        publishedOn: platforms.filter((p) => isSuccessfulResult(publishResults[p])).map(platformLabel),
        failedOn: platforms.filter((p) => !isSuccessfulResult(publishResults[p])).map(platformLabel),
      });
    }
```

- [ ] **Step 5: Run the tests and the publish suites**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publish-notifications.test.ts test/publish-lifecycle.test.ts test/cron.test.ts && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/postNotifications.ts apps/api/src/lib/publishDirect.ts apps/api/src/routes/cron.ts apps/api/test/publish-notifications.test.ts
git commit -m "feat(api): notify the author when a post publishes or fails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Post counts, posting activity and dashboard analytics endpoints

**Files:**
- Modify: `apps/api/src/routes/publisher.ts`
- Modify: `apps/api/src/routes/dealer.ts`
- Test: `apps/api/test/post-stats.test.ts`

**Interfaces:**
- Produces (authenticated, scoped to the caller's dealership):
  - `GET /v1/publisher/posts/counts` returns `{ success: true, counts: Record<status, number>, total: number }`.
  - `GET /v1/publisher/posts/activity?days=30` returns `{ success: true, days: number, posts: Array<{ created_at: string; status: string }> }`.
    - `days` is clamped to 1–90.
    - Posts from the last `days + 1` days, oldest first.
  - `GET /v1/dealer/analytics` returns `{ success: true, engagementByType: Array<{ type: string; engagementRate: number }>, followerTrend: Array<{ platform: string; current: number; delta: number | null }>, reviewSummary: { avgRating: number | null; responseRate: number; totalReviews: number } }`.
    - Engagement and followers are empty until metrics are collected.
    - `responseRate` counts inbox messages from the last 30 days.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/post-stats.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function dealerWithAdmin() {
  const dealer = await prisma.dealer.create({ data: { name: 'Stats Motors', city: 'Surat', phone: `phone-${randomUUID()}` } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const payload: JwtUser = { dealer_user_id: admin.id, dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { dealerId: dealer.id, headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } };
}

const DAY = 24 * 60 * 60 * 1000;

function post(dealerId: string, status: string, createdAt = new Date()) {
  return prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status, created_at: createdAt } });
}

describe('GET /v1/publisher/posts/counts', () => {
  it("counts the dealership's posts per status", async () => {
    const d = await dealerWithAdmin();
    const other = await dealerWithAdmin();
    for (const status of ['draft', 'draft', 'pending_approval', 'published']) await post(d.dealerId, status);
    await post(other.dealerId, 'draft');

    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/counts', headers: d.headers });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { success: true, counts: { draft: 2, pending_approval: 1, published: 1 }, total: 4 });
  });
});

describe('GET /v1/publisher/posts/activity', () => {
  it('returns recent posts of the dealership, oldest first', async () => {
    const d = await dealerWithAdmin();
    await post(d.dealerId, 'published', new Date(Date.now() - 2 * DAY));
    await post(d.dealerId, 'draft', new Date(Date.now() - 40 * DAY));
    await post(d.dealerId, 'scheduled', new Date(Date.now() - 1 * DAY));

    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/activity?days=30', headers: d.headers });

    const body = res.json() as { days: number; posts: Array<{ status: string; created_at: string }> };
    assert.equal(body.days, 30);
    assert.deepEqual(body.posts.map((p) => p.status), ['published', 'scheduled']);
    assert.match(body.posts[0]!.created_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('clamps days to 1..90', async () => {
    const d = await dealerWithAdmin();
    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/activity?days=500', headers: d.headers });
    assert.equal((res.json() as { days: number }).days, 90);
  });
});

describe('GET /v1/dealer/analytics', () => {
  it('reports the response rate and leaves uncollected metrics empty', async () => {
    const d = await dealerWithAdmin();
    const message = (replied: boolean, type = 'review') => prisma.inboxMessage.create({
      data: {
        dealer_id: d.dealerId, platform: 'gmb', message_type: type, platform_message_id: `m-${randomUUID()}`,
        customer_name: 'Asha', message_text: 'Great service', received_at: new Date(), ...(replied ? { replied_at: new Date() } : {}),
      },
    });
    await message(true);
    await message(false);
    await message(false, 'comment');
    await message(true, 'comment');

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: d.headers });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      success: true,
      engagementByType: [],
      followerTrend: [],
      reviewSummary: { avgRating: null, responseRate: 50, totalReviews: 2 },
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/post-stats.test.ts`
Expected: FAIL. `/posts/counts` is matched by `GET /posts/:id` and returns 404, and `/dealer/analytics` returns 404.

- [ ] **Step 3: Add the publisher endpoints**

In `apps/api/src/routes/publisher.ts`, insert these two routes directly before the `GET /posts/:id` route. Static paths win over `:id` in Fastify's router, but keeping them first makes that obvious.

```ts
  // GET /v1/publisher/posts/counts — posts per status, for the Posts tabs and the dashboard pipeline
  fastify.get("/posts/counts", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!
    const groups = (await prisma.post.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { dealer_id },
    })) as Array<{ status: string | null; _count: { _all: number } }>
    const counts: Record<string, number> = {}
    for (const group of groups) {
      const status = group.status ?? "draft"
      counts[status] = (counts[status] ?? 0) + group._count._all
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    return { success: true, counts, total }
  })

  // GET /v1/publisher/posts/activity?days=30 — when recent posts were created and their status,
  // for the dashboard chart. The browser buckets by local day, so one extra day is included.
  fastify.get("/posts/activity", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!
    const { days: daysParam } = request.query as { days?: string }
    const days = Math.max(1, Math.min(90, parseInt(daysParam ?? "30", 10) || 30))
    const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000)
    const posts = await prisma.post.findMany({
      where: { dealer_id, created_at: { gte: since } },
      orderBy: { created_at: "asc" },
    })
    return {
      success: true,
      days,
      posts: posts.map((p) => ({ created_at: new Date(p.created_at).toISOString(), status: p.status })),
    }
  })
```

- [ ] **Step 4: Add `GET /v1/dealer/analytics`**

In `apps/api/src/routes/dealer.ts`, add this route directly after the `GET /dashboard` route:

```ts
  // GET /v1/dealer/analytics — dashboard insights. Engagement by post type and follower trends
  // stay empty until post metrics and follower counts are collected; review health is live.
  fastify.get('/analytics', { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = await prisma.inboxMessage.findMany({ where: { dealer_id, received_at: { gte: since } } });
    const replied = messages.filter((m) => m.replied_at).length;

    return {
      success: true,
      engagementByType: [] as Array<{ type: string; engagementRate: number }>,
      followerTrend: [] as Array<{ platform: string; current: number; delta: number | null }>,
      reviewSummary: {
        avgRating: null as number | null,
        responseRate: messages.length > 0 ? Math.round((replied / messages.length) * 100) : 0,
        totalReviews: messages.filter((m) => m.message_type === 'review').length,
      },
    };
  });
```

- [ ] **Step 5: Run the tests and the full API suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/post-stats.test.ts`
Expected: PASS (4 tests)

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/publisher.ts apps/api/src/routes/dealer.ts apps/api/test/post-stats.test.ts
git commit -m "feat(api): post counts, posting activity and dashboard analytics endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web logic for posts, dashboard buckets and chart paths

**Files:**
- Create: `apps/web/src/utils/posts.ts` + `apps/web/src/utils/posts.test.ts`
- Create: `apps/web/src/utils/dashboard.ts` + `apps/web/src/utils/dashboard.test.ts`
- Create: `apps/web/src/utils/chartPath.ts` + `apps/web/src/utils/chartPath.test.ts`

**Interfaces (produced; later tasks import exactly these):**
- `utils/posts.ts`:
  - `type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed'`
  - `type PostTab = 'all' | PostStatus`
  - `POST_TABS: ReadonlyArray<{ id: PostTab; label: string }>`
  - `parsePostTab(value: string | null | undefined): PostTab`
  - `firstCreative(value: unknown): string | null`
  - `postTimeline(post: { status: string; created_at: string; scheduled_at?: string | null; published_at?: string | null }): string`
  - `approvalRemark(post: { status: string; approver_note?: string | null; approval_decision?: string | null }): { kind: 'rejected' | 'note'; text: string } | null`
  - `pageList(current: number, total: number): Array<number | '...'>`
  - `toLocalInput(date: Date): string`
  - `platformResults(results: unknown): Array<{ platform: string; url?: string; error?: string }>`
  - `metricTotals(metrics: unknown): { reach: number; likes: number; comments: number }`
- `utils/dashboard.ts`:
  - `greetingFor(hour: number): string`
  - `compactIndian(n: number): string`
  - `ACTIVITY_STATUSES`, `type ActivityStatus`
  - `interface ActivityBucket { key: string; date: Date; label: string; total: number; byStatus: Record<ActivityStatus, number> }`
  - `buildBuckets(posts: Array<{ created_at: string; status: string }>, days: number, now?: Date): ActivityBucket[]`
  - `weekTrend(buckets: ActivityBucket[]): { last7: number; prev7: number; delta: number } | null`
  - `PIPELINE`
  - `pipelineSegments(counts: Record<string, number>): Array<{ key: string; label: string; color: string; value: number }>`
- `utils/chartPath.ts`:
  - `type Point = [number, number]`
  - `smoothPath(points: Point[]): string`
  - `yTicks(max: number): number[]`
  - `labelStride(count: number, width: number): number`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/utils/posts.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { approvalRemark, firstCreative, metricTotals, pageList, parsePostTab, platformResults, postTimeline, toLocalInput } from './posts.js';

describe('parsePostTab', () => {
  it('accepts known statuses and falls back to all', () => {
    assert.equal(parsePostTab('pending_approval'), 'pending_approval');
    assert.equal(parsePostTab('publishing'), 'publishing');
    assert.equal(parsePostTab('bogus'), 'all');
    assert.equal(parsePostTab(null), 'all');
  });
});

describe('firstCreative', () => {
  it('finds the first URL in objects, arrays and strings', () => {
    assert.equal(firstCreative({ facebook: '', instagram: 'https://x.test/ig.jpg' }), 'https://x.test/ig.jpg');
    assert.equal(firstCreative(['', 'https://x.test/a.jpg']), 'https://x.test/a.jpg');
    assert.equal(firstCreative({ gmb: ['https://x.test/g.jpg'] }), 'https://x.test/g.jpg');
    assert.equal(firstCreative('https://x.test/s.jpg'), 'https://x.test/s.jpg');
    assert.equal(firstCreative(null), null);
    assert.equal(firstCreative({}), null);
  });
});

describe('postTimeline', () => {
  it('describes scheduled, published and other posts', () => {
    assert.match(postTimeline({ status: 'scheduled', created_at: '2026-09-01T10:00:00Z', scheduled_at: '2026-09-25T10:00:00Z' }), /^Scheduled for 25 Sep/);
    assert.match(postTimeline({ status: 'published', created_at: '2026-09-01T10:00:00Z', published_at: '2026-09-20T10:00:00Z' }), /^Published 20 Sep/);
    assert.match(postTimeline({ status: 'draft', created_at: '2026-09-01T10:00:00Z' }), /^Created 1 Sep\S* 2026$/);
    assert.match(postTimeline({ status: 'scheduled', created_at: '2026-09-01T10:00:00Z', scheduled_at: null }), /^Created /);
  });
});

describe('approvalRemark', () => {
  it('shows a rejection reason on drafts and a note on approved posts only', () => {
    assert.deepEqual(approvalRemark({ status: 'draft', approval_decision: 'rejected', approver_note: ' Fix price ' }), { kind: 'rejected', text: 'Fix price' });
    assert.deepEqual(approvalRemark({ status: 'approved', approval_decision: 'approved', approver_note: 'Nice' }), { kind: 'note', text: 'Nice' });
    assert.equal(approvalRemark({ status: 'draft', approval_decision: 'approved', approver_note: 'Nice' }), null);
    assert.equal(approvalRemark({ status: 'published', approval_decision: 'approved', approver_note: 'Nice' }), null);
    assert.equal(approvalRemark({ status: 'approved', approval_decision: 'approved', approver_note: '  ' }), null);
  });
});

describe('pageList', () => {
  it('lists every page up to 7, otherwise first, last and neighbours', () => {
    assert.deepEqual(pageList(1, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageList(1, 10), [1, 2, '...', 10]);
    assert.deepEqual(pageList(5, 10), [1, '...', 4, 5, 6, '...', 10]);
    assert.deepEqual(pageList(10, 10), [1, '...', 9, 10]);
  });
});

describe('toLocalInput', () => {
  it('formats a date for a datetime-local input in local time', () => {
    assert.equal(toLocalInput(new Date(2026, 8, 25, 15, 30)), '2026-09-25T15:30');
  });
});

describe('platformResults', () => {
  it('lists per-platform results and hides internal keys', () => {
    assert.deepEqual(platformResults({
      facebook: { post_id: '1', url: 'https://fb.test/1' },
      instagram: { error: 'Token expired' },
      _approval: { note: 'x' },
    }), [
      { platform: 'facebook', url: 'https://fb.test/1' },
      { platform: 'instagram', error: 'Token expired' },
    ]);
    assert.deepEqual(platformResults(null), []);
  });
});

describe('metricTotals', () => {
  it('sums per-platform metrics and accepts flat ones', () => {
    assert.deepEqual(metricTotals({ facebook: { reach: 100, likes: 5 }, instagram: { reach: 50, comments: 2 } }), { reach: 150, likes: 5, comments: 2 });
    assert.deepEqual(metricTotals({ reach: 7, likes: 1, comments: 0 }), { reach: 7, likes: 1, comments: 0 });
    assert.deepEqual(metricTotals(undefined), { reach: 0, likes: 0, comments: 0 });
  });
});
```

`apps/web/src/utils/dashboard.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBuckets, compactIndian, greetingFor, pipelineSegments, weekTrend } from './dashboard.js';

const now = new Date(2026, 8, 23, 12, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 8, 23 - daysAgo, hour).toISOString();

describe('greetingFor', () => {
  it('greets by time of day', () => {
    assert.equal(greetingFor(9), 'Good morning');
    assert.equal(greetingFor(13), 'Good afternoon');
    assert.equal(greetingFor(20), 'Good evening');
  });
});

describe('compactIndian', () => {
  it('uses K for thousands and L for lakhs', () => {
    assert.equal(compactIndian(950), '950');
    assert.equal(compactIndian(1500), '1.5K');
    assert.equal(compactIndian(250000), '2.5L');
  });
});

describe('buildBuckets', () => {
  it('counts posts per local day and status, oldest first', () => {
    const buckets = buildBuckets([
      { created_at: at(0), status: 'published' },
      { created_at: at(0, 11), status: 'publishing' },
      { created_at: at(0, 8), status: 'mystery' },
      { created_at: at(1), status: 'approved' },
      { created_at: at(20), status: 'draft' },
    ], 14, now);

    assert.equal(buckets.length, 14);
    assert.equal(buckets[0]!.key, '2026-9-10');
    assert.equal(buckets[13]!.key, '2026-9-23');
    const today = buckets[13]!;
    assert.deepEqual([today.total, today.byStatus.published, today.byStatus.scheduled, today.byStatus.draft], [3, 1, 1, 1]);
    assert.equal(buckets[12]!.byStatus.approved, 1);
    assert.equal(buckets.reduce((n, b) => n + b.total, 0), 4);
  });
});

describe('weekTrend', () => {
  it('compares the last 7 days with the 7 before', () => {
    const posts = [at(1), at(1), at(1), at(9)].map((created_at) => ({ created_at, status: 'draft' }));
    assert.deepEqual(weekTrend(buildBuckets(posts, 14, now)), { last7: 3, prev7: 1, delta: 2 });
    assert.equal(weekTrend(buildBuckets(posts, 7, now)), null);
    assert.equal(weekTrend(buildBuckets([], 14, now)), null);
  });
});

describe('pipelineSegments', () => {
  it('adds posts being published to Scheduled and fills missing statuses with 0', () => {
    assert.deepEqual(
      pipelineSegments({ scheduled: 2, publishing: 1, draft: 4 }).map((s) => [s.key, s.value]),
      [['published', 0], ['scheduled', 3], ['approved', 0], ['pending_approval', 0], ['draft', 4], ['failed', 0]],
    );
  });
});
```

`apps/web/src/utils/chartPath.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { labelStride, smoothPath, yTicks } from './chartPath.js';

describe('smoothPath', () => {
  it('draws a Catmull-Rom curve through the points', () => {
    assert.equal(smoothPath([]), '');
    assert.equal(smoothPath([[1, 2]]), 'M1.0,2.0');
    assert.equal(smoothPath([[0, 0], [6, 6]]), 'M0.0,0.0 C1.0,1.0 5.0,5.0 6.0,6.0');
  });
});

describe('yTicks', () => {
  it('uses small steps for small counts and about four lines otherwise', () => {
    assert.deepEqual(yTicks(1), [1]);
    assert.deepEqual(yTicks(3), [1, 2, 3]);
    assert.deepEqual(yTicks(7), [2, 4, 6]);
    assert.deepEqual(yTicks(12), [5, 10]);
    assert.deepEqual(yTicks(40), [10, 20, 30, 40]);
  });
});

describe('labelStride', () => {
  it('keeps x-axis labels about 60px apart', () => {
    assert.equal(labelStride(14, 640), 2);
    assert.equal(labelStride(30, 280), 8);
    assert.equal(labelStride(7, 900), 1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL with `Cannot find module './posts.js'` (and likewise for the other two).

- [ ] **Step 3: Implement `apps/web/src/utils/posts.ts`**

```ts
export type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type PostTab = 'all' | PostStatus;

export const POST_TABS: ReadonlyArray<{ id: PostTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'pending_approval', label: 'Approvals' },
  { id: 'approved', label: 'Ready' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'failed', label: 'Failed' },
];

const TAB_IDS: ReadonlySet<string> = new Set(['all', 'draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed']);

export function parsePostTab(value: string | null | undefined): PostTab {
  return value && TAB_IDS.has(value) ? (value as PostTab) : 'all';
}

/** First usable image URL in a post's creatives: a per-platform object, an array or a single URL. */
export function firstCreative(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const url = firstCreative(item);
      if (url) return url;
    }
  }
  return null;
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function postTimeline(post: { status: string; created_at: string; scheduled_at?: string | null; published_at?: string | null }): string {
  if (post.status === 'scheduled' && post.scheduled_at) return `Scheduled for ${dateTime(post.scheduled_at)}`;
  if (post.status === 'published' && post.published_at) return `Published ${dateTime(post.published_at)}`;
  return `Created ${dateOnly(post.created_at)}`;
}

/** The approver's words for a post row: the rejection reason on a draft, or the note on an approved post. */
export function approvalRemark(post: { status: string; approver_note?: string | null; approval_decision?: string | null }): { kind: 'rejected' | 'note'; text: string } | null {
  const text = post.approver_note?.trim();
  if (!text) return null;
  if (post.status === 'draft' && post.approval_decision === 'rejected') return { kind: 'rejected', text };
  if (post.status === 'approved' && post.approval_decision === 'approved') return { kind: 'note', text };
  return null;
}

/** Page buttons: every page up to 7, otherwise the first, the last and the current page's neighbours. */
export function pageList(current: number, total: number): Array<number | '...'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  const pages: Array<number | '...'> = [1];
  if (start > 2) pages.push('...');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

/** Value for <input type="datetime-local">, in the browser's time zone. */
export function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Per-platform publish results, without internal keys such as `_rejection`. */
export function platformResults(results: unknown): Array<{ platform: string; url?: string; error?: string }> {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return [];
  return Object.entries(results as Record<string, unknown>)
    .filter(([key, value]) => !key.startsWith('_') && !!value && typeof value === 'object')
    .map(([platform, value]) => {
      const r = value as { url?: unknown; error?: unknown };
      return {
        platform,
        ...(typeof r.url === 'string' ? { url: r.url } : {}),
        ...(typeof r.error === 'string' ? { error: r.error } : {}),
      };
    });
}

/** Reach, likes and comments summed over platforms (`{ facebook: {...}, instagram: {...} }`), or read from a flat object. */
export function metricTotals(metrics: unknown): { reach: number; likes: number; comments: number } {
  const totals = { reach: 0, likes: 0, comments: 0 };
  if (!metrics || typeof metrics !== 'object') return totals;
  const add = (m: Record<string, unknown>) => {
    for (const key of ['reach', 'likes', 'comments'] as const) {
      const value = m[key];
      if (typeof value === 'number') totals[key] += value;
    }
  };
  const values = Object.values(metrics as Record<string, unknown>);
  if (values.some((v) => typeof v === 'number')) add(metrics as Record<string, unknown>);
  else for (const v of values) if (v && typeof v === 'object') add(v as Record<string, unknown>);
  return totals;
}
```

- [ ] **Step 4: Implement `apps/web/src/utils/dashboard.ts`**

```ts
export function greetingFor(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Indian short form: 2.5L for lakhs, 1.5K for thousands. */
export function compactIndian(n: number): string {
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Stacking order of the activity chart, bottom to top.
export const ACTIVITY_STATUSES = ['published', 'scheduled', 'approved', 'pending_approval', 'draft', 'failed'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export interface ActivityBucket {
  key: string;
  date: Date;
  label: string;
  total: number;
  byStatus: Record<ActivityStatus, number>;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// Posts going out right now count as scheduled; unknown statuses count as drafts.
function activityStatus(status: string): ActivityStatus {
  if (status === 'publishing') return 'scheduled';
  return (ACTIVITY_STATUSES as readonly string[]).includes(status) ? (status as ActivityStatus) : 'draft';
}

/** One bucket per local day for the last `days` days, oldest first, counting posts by creation day. */
export function buildBuckets(posts: Array<{ created_at: string; status: string }>, days: number, now: Date = new Date()): ActivityBucket[] {
  const buckets: ActivityBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      key: dayKey(date),
      date,
      label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      total: 0,
      byStatus: Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s, 0])) as Record<ActivityStatus, number>,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const post of posts) {
    const bucket = byKey.get(dayKey(new Date(post.created_at)));
    if (!bucket) continue;
    bucket.total += 1;
    bucket.byStatus[activityStatus(post.status)] += 1;
  }
  return buckets;
}

/** Posts in the last 7 days against the 7 before; null for ranges under 14 days or when both are 0. */
export function weekTrend(buckets: ActivityBucket[]): { last7: number; prev7: number; delta: number } | null {
  if (buckets.length < 14) return null;
  const sum = (list: ActivityBucket[]) => list.reduce((n, b) => n + b.total, 0);
  const last7 = sum(buckets.slice(-7));
  const prev7 = sum(buckets.slice(-14, -7));
  if (last7 === 0 && prev7 === 0) return null;
  return { last7, prev7, delta: last7 - prev7 };
}

export const PIPELINE = [
  { key: 'published', label: 'Published', color: '#10b981' },
  { key: 'scheduled', label: 'Scheduled', color: '#f59e0b' },
  { key: 'approved', label: 'Ready', color: '#14b8a6' },
  { key: 'pending_approval', label: 'In review', color: '#8b5cf6' },
  { key: 'draft', label: 'Drafts', color: '#a1a1aa' },
  { key: 'failed', label: 'Failed', color: '#ef4444' },
] as const;

export function pipelineSegments(counts: Record<string, number>): Array<{ key: string; label: string; color: string; value: number }> {
  return PIPELINE.map((s) => ({
    ...s,
    value: (counts[s.key] ?? 0) + (s.key === 'scheduled' ? counts['publishing'] ?? 0 : 0),
  }));
}
```

- [ ] **Step 5: Implement `apps/web/src/utils/chartPath.ts`**

```ts
export type Point = [number, number];

/** Smooth SVG path through the points: Catmull-Rom converted to cubic Béziers (tension 1/6). */
export function smoothPath(points: Point[]): string {
  const first = points[0];
  if (!first) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(first[0])},${f(first[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)}`
      + ` ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)}`
      + ` ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Y gridline values: steps of 1, 2 or 5 for small maxima, otherwise about four lines. */
export function yTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 8 ? 2 : max <= 20 ? 5 : Math.ceil(max / 4);
  const ticks: number[] = [];
  for (let t = step; t <= max; t += step) ticks.push(t);
  return ticks.length ? ticks : [max];
}

/** Label every nth day so x-axis labels stay about 60px apart. */
export function labelStride(count: number, width: number): number {
  return Math.max(1, Math.ceil(count / Math.max(3, Math.floor(width / 60))));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w web`
Expected: PASS, with the new suites plus the existing 38 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/posts.ts apps/web/src/utils/posts.test.ts apps/web/src/utils/dashboard.ts apps/web/src/utils/dashboard.test.ts apps/web/src/utils/chartPath.ts apps/web/src/utils/chartPath.test.ts
git commit -m "feat(web): post, dashboard and chart helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Page primitives and post building blocks

**Files:**
- Modify: `apps/web/src/components/ui/Button.tsx`: `success` variant.
- Modify: `apps/web/src/components/ui/Modal.tsx`: reference styling, scrollable body.
- Create in `apps/web/src/components/ui/`: `linkStyles.ts`, `StatCard.tsx`, `SectionCard.tsx`, `PageCard.tsx`, `InlineEmpty.tsx`.
- Create in `apps/web/src/components/posts/`: `PostStatusBadge.tsx`, `PlatformList.tsx`, `PostThumbnail.tsx`.

**Interfaces (produced):**
- `Button` variant `'success'` (emerald).
- `LINK_CLASS: string`
- `StatCard({ label, value, sub?, icon, tint, trend?: { value: string; up: boolean }, to? })`
- `SectionCard({ title, subtitle?, icon?, action?, to?, className?, children })`
- `PageCard({ className?, children })`
- `PageHeader({ title, subtitle?, actions?, className? })`
- `InlineEmpty({ icon, text })`
- `PostStatusBadge({ status: string })`
- `PlatformList({ platforms?: string[] | null })`
- `PostThumbnail({ url: string | null })`

- [ ] **Step 1: Button `success` variant**

In `apps/web/src/components/ui/Button.tsx`:
- change the variant union to `variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';`;
- add to `variants`:

```ts
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs',
```

- [ ] **Step 2: Modal to the reference look, with a scrollable body**

In `apps/web/src/components/ui/Modal.tsx`:
- `variantClasses`: change every `rounded-2xl` to `rounded-xl`.
- Dialog container class: `'relative bg-white shadow-xl w-full mx-4 animate-scale-in flex flex-col max-h-[90vh]'`.
- Header `<div className="flex items-start justify-between p-6 pb-0">` becomes `className="flex items-start justify-between p-6 pb-0 shrink-0"`.
- Title `text-gray-900` → `text-zinc-900`; description `text-gray-500` → `text-zinc-500`.
- Close button: `hover:bg-gray-100 text-gray-400 hover:text-gray-600` → `hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600`.
- Body `<div className="p-6">` → `<div className="p-6 overflow-y-auto">`.
- Footer classes → `flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50 rounded-b-xl shrink-0`.

- [ ] **Step 3: Create the shared primitives**

`apps/web/src/components/ui/linkStyles.ts`:

```ts
// Small orange "View details →" style links used in cards.
export const LINK_CLASS = 'text-[11px] text-orange-600 font-medium hover:text-orange-700 whitespace-nowrap transition-colors';
```

`apps/web/src/components/ui/StatCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import { cn } from './Button';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  /** Background and text colour of the icon tile, e.g. "bg-orange-50 text-orange-600". */
  tint: string;
  trend?: { value: string; up: boolean };
  to?: string;
}

export function StatCard({ label, value, sub, icon, tint, trend, to }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs text-zinc-500 font-medium">{label}</p>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tint)}>{icon}</div>
      </div>
      <p className="text-[26px] leading-none font-semibold tracking-tight text-zinc-900 mb-1.5">{value}</p>
      <div className="flex items-center gap-1.5">
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', trend.up ? 'text-emerald-600' : 'text-red-500')}>
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
        {sub && <p className="text-xs text-zinc-400">{sub}</p>}
      </div>
    </>
  );
  const base = 'relative block bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 transition-all duration-200';

  if (!to) return <div className={cn(base, 'hover:shadow-md hover:border-zinc-300')}>{body}</div>;
  return (
    <NavLink to={to} className={cn('group', base, 'hover:shadow-md hover:border-orange-200 cursor-pointer')}>
      {body}
      <ChevronRight className="absolute bottom-4 right-3.5 w-4 h-4 text-zinc-300 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-orange-500 transition-all" />
    </NavLink>
  );
}
```

`apps/web/src/components/ui/SectionCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from './Button';
import { LINK_CLASS } from './linkStyles';

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Controls shown on the right of the header, before "View details →". */
  action?: ReactNode;
  to?: string;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, icon, action, to, className, children }: SectionCardProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm', className)}>
      <div className="px-5 pt-4 pb-3 border-b border-zinc-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-zinc-400 flex-shrink-0">{icon}</span>}
            <h3 className="text-sm font-semibold text-zinc-900 truncate">{title}</h3>
          </div>
          {(action || to) && (
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {action}
              {to && <NavLink to={to} className={LINK_CLASS}>View details →</NavLink>}
            </div>
          )}
        </div>
        {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
```

`apps/web/src/components/ui/PageCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from './Button';

// The white root card every ported page sits in (spec §5 "Page chrome").
export function PageCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 mb-4', className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

`apps/web/src/components/ui/InlineEmpty.tsx`:

```tsx
import type { ReactNode } from 'react';

// Compact empty state for cards (the full-page one is EmptyState).
export function InlineEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-300 mb-2">{icon}</div>
      <p className="text-xs text-zinc-400 max-w-[220px] leading-relaxed">{text}</p>
    </div>
  );
}
```

- [ ] **Step 4: Create the post building blocks**

`apps/web/src/components/posts/PostStatusBadge.tsx`:

```tsx
import { cn } from '../ui/Button';

const STATUS: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: 'Draft', badge: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
  pending_approval: { label: 'Awaiting approval', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100', dot: 'bg-violet-500' },
  approved: { label: 'Ready to publish', badge: 'bg-teal-50 text-teal-700 ring-1 ring-teal-100', dot: 'bg-teal-500' },
  scheduled: { label: 'Scheduled', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  publishing: { label: 'Publishing', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100', dot: 'bg-blue-500 animate-pulse' },
  published: { label: 'Published', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  failed: { label: 'Failed', badge: 'bg-red-50 text-red-700 ring-1 ring-red-100', dot: 'bg-red-500' },
};

export function PostStatusBadge({ status }: { status: string }) {
  const meta = STATUS[status] ?? STATUS['draft']!;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', meta.badge)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}
```

`apps/web/src/components/posts/PlatformList.tsx`:

```tsx
import { PlatformIcon } from '../ui/PlatformIcon';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];
const WITH_ICON = new Set<string>(['facebook', 'instagram', 'gmb', 'whatsapp', 'youtube']);

export function PlatformList({ platforms }: { platforms?: string[] | null }) {
  if (!platforms?.length) return <span className="text-xs text-zinc-300">No platforms</span>;
  return (
    <div className="flex items-center gap-1.5">
      {platforms.map((p) => WITH_ICON.has(p)
        ? <PlatformIcon key={p} platform={p as IconPlatform} size="sm" />
        : <span key={p} className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{p}</span>)}
    </div>
  );
}
```

`apps/web/src/components/posts/PostThumbnail.tsx`:

```tsx
import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { cn } from '../ui/Button';

// Creative thumbnail over a branded placeholder; the placeholder stays if the image fails.
export function PostThumbnail({ url }: { url: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 ring-1 ring-orange-100 flex items-center justify-center">
      <Megaphone className="w-6 h-6 text-orange-500" />
      {url && !failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run build -w web && cd apps/web && npx eslint src/components/ui src/components/posts`
Expected: the build exits 0. eslint reports only the problems already in `Button.tsx` (`cn` export), `Toast.tsx` and `Input.tsx`; none in the new files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/components/posts
git commit -m "feat(web): page primitives, success button and post building blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Posts page

**Files:**
- Modify: `apps/web/src/services/creative.ts` (`Post` type and `postService`)
- Create: `apps/web/src/components/posts/PostRow.tsx`
- Create: `apps/web/src/components/posts/PostsEmptyState.tsx`
- Create: `apps/web/src/components/posts/PostDialogs.tsx`
- Rewrite: `apps/web/src/pages/PostsPage.tsx`

**Interfaces:**
- Consumes:
  - Task 3/6 HTTP routes;
  - Task 7 `utils/posts`;
  - Task 8 components;
  - `summarizePublishResult` / `publishErrorMessage` (`utils/publishResult.ts`);
  - `can`, `PERMISSIONS` (`lib/permissions.ts`).
- Produces:
  - `postService.counts()`
  - `postService.activity(days)`
  - `postService.submitForApproval(id, platforms?)`
  - `postService.approve(id)`
  - `postService.reject(id, reason)`
  - `type ConfirmKind = 'publish' | 'retry' | 'delete' | 'cancel'`

- [ ] **Step 1: Extend the post service**

In `apps/web/src/services/creative.ts`:
- add `import type { PostStatus } from '../utils/posts';`;
- replace the `Post` interface with:

```ts
export interface Post {
  id: string;
  dealer_id: string;
  prompt_text: string;
  caption_text?: string;
  caption_hashtags: string[];
  creative_urls?: Record<string, string>;
  platforms: string[];
  status: PostStatus;
  scheduled_at?: string;
  published_at?: string;
  created_by?: string | null;
  approver_note?: string | null;
  approval_decision?: 'approved' | 'rejected' | null;
  publish_results?: Record<string, unknown> | null;
  metrics?: { reach?: number; likes?: number; comments?: number };
  created_at: string;
}
```

Add these methods to `postService`:

```ts
  counts: () => api.get<{ counts: Partial<Record<PostStatus, number>>; total: number }>('/publisher/posts/counts'),
  activity: (days: number) =>
    api.get<{ days: number; posts: Array<{ created_at: string; status: string }> }>('/publisher/posts/activity', { days }),
  submitForApproval: (id: string, platforms?: string[]) =>
    api.post<{ item: Post; approvalUrl: string; whatsappShare: string }>(`/publisher/posts/${id}/submit-for-approval`, platforms ? { platforms } : {}),
  approve: (id: string) => api.post<{ item: Post }>(`/publisher/posts/${id}/approve`),
  reject: (id: string, reason: string) => api.post<{ item: Post }>(`/publisher/posts/${id}/reject`, { reason }),
```

Run `cd apps/web && npx tsc --noEmit -p tsconfig.app.json`. If any file maps statuses with a `Record<Post['status'], …>` (for example `pages/Calendar.tsx`), add entries for `pending_approval` (label `Awaiting approval`, violet) and `approved` (label `Ready to publish`, teal) in that file's existing style.

- [ ] **Step 2: Create `apps/web/src/components/posts/PostsEmptyState.tsx`**

```tsx
import { CircleAlert, CircleCheck, Clock, FileText, Inbox, LoaderCircle, Plus, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PostTab } from '../../utils/posts';

const EMPTY: Record<PostTab, { icon: LucideIcon; title: string; sub: string }> = {
  all: { icon: FileText, title: 'No posts yet', sub: 'Create your first post to start reaching customers across your social channels.' },
  draft: { icon: FileText, title: 'No drafts', sub: 'Drafts appear here when you save a post without publishing it.' },
  pending_approval: { icon: Inbox, title: 'Nothing to approve', sub: 'Posts submitted for approval will show up here.' },
  approved: { icon: CircleCheck, title: 'Nothing ready', sub: 'Approved posts that are ready to publish will appear here.' },
  scheduled: { icon: Clock, title: 'Nothing scheduled', sub: 'Schedule a post when creating it to keep a steady posting cadence.' },
  publishing: { icon: LoaderCircle, title: 'Nothing publishing', sub: 'Posts currently going out will appear here.' },
  published: { icon: CircleCheck, title: 'No published posts', sub: 'Published posts and their links will appear here.' },
  failed: { icon: CircleAlert, title: 'No failed posts', sub: 'Everything is running smoothly — nothing has failed.' },
};

export function PostsEmptyState({ status, onCreate }: { status: PostTab; onCreate: () => void }) {
  const { icon: Icon, title, sub } = EMPTY[status];
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="w-14 h-14 rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-400">
        <Icon className="w-6 h-6" />
      </div>
      <p className="mt-4 text-sm font-semibold text-zinc-800">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-zinc-400 leading-relaxed">{sub}</p>
      {(status === 'all' || status === 'draft') && (
        <Button className="mt-5" onClick={onCreate}><Plus className="w-4 h-4" /> Create post</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/components/posts/PostDialogs.tsx`**

```tsx
import { useState } from 'react';
import { ExternalLink, LoaderCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Post } from '../../services/creative';
import { metricTotals, platformResults, postTimeline, toLocalInput } from '../../utils/posts';
import { PostStatusBadge } from './PostStatusBadge';
import { PlatformList } from './PlatformList';

export type ConfirmKind = 'publish' | 'retry' | 'delete' | 'cancel';

function confirmCopy(kind: ConfirmKind, post: Post) {
  const n = post.platforms?.length ?? 0;
  switch (kind) {
    case 'delete':
      return { title: 'Delete this post?', body: 'This permanently removes the post and its content. This action cannot be undone.', label: 'Delete post', keep: 'Keep post', danger: true };
    case 'cancel':
      return { title: 'Cancel scheduled post?', body: 'This post will not be published and will be removed from your schedule.', label: 'Cancel post', keep: 'Keep post', danger: true };
    case 'publish':
      return { title: 'Publish now?', body: `This post will be published immediately to ${n || 'the selected'} connected platform${n === 1 ? '' : 's'}.`, label: 'Publish now', keep: 'Not now', danger: false };
    case 'retry':
      return { title: 'Retry publishing?', body: 'We will attempt to publish this post again. Make sure your platform connections are still active.', label: 'Retry publishing', keep: 'Not now', danger: false };
  }
}

export function ConfirmDialog({ confirm, onClose, onConfirm }: {
  confirm: { kind: ConfirmKind; post: Post } | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const copy = confirmCopy(confirm.kind, confirm.post);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title={copy.title}
      size="sm"
      variant={copy.danger ? 'danger' : 'default'}
      closeOnOverlayClick={!busy}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>{copy.keep}</Button>
        <Button variant={copy.danger ? 'danger' : 'primary'} disabled={busy} onClick={run}>
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}{copy.label}
        </Button>
      </>}
    >
      <p className="text-sm text-zinc-600 leading-relaxed">{copy.body}</p>
      <p className="mt-3 text-xs text-zinc-400 line-clamp-1">{confirm.post.prompt_text || 'Untitled post'}</p>
    </Modal>
  );
}

export function RejectDialog({ post, onClose, onReject }: {
  post: Post | null;
  onClose: () => void;
  onReject: (post: Post, reason: string) => Promise<void>;
}) {
  if (!post) return null;
  return <RejectForm key={post.id} post={post} onClose={onClose} onReject={onReject} />;
}

function RejectForm({ post, onClose, onReject }: { post: Post; onClose: () => void; onReject: (post: Post, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onReject(post, reason); } finally { setBusy(false); }
  };
  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title="Reject this post"
      description="The post will be sent back to drafts so it can be revised and resubmitted."
      size="md"
      closeOnOverlayClick={!busy}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={busy} onClick={submit}>
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}Reject post
        </Button>
      </>}
    >
      <label htmlFor="reject-reason" className="block text-xs font-semibold text-zinc-600 mb-1.5">
        Reason <span className="font-normal text-zinc-400">(optional)</span>
      </label>
      <textarea
        id="reject-reason"
        rows={3}
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Let the author know what needs to change…"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 resize-none"
      />
    </Modal>
  );
}

export function RescheduleDialog({ post, onClose, onReschedule }: {
  post: Post | null;
  onClose: () => void;
  onReschedule: (post: Post, isoTime: string) => Promise<void>;
}) {
  if (!post) return null;
  return <RescheduleForm key={post.id} post={post} onClose={onClose} onReschedule={onReschedule} />;
}

function RescheduleForm({ post, onClose, onReschedule }: { post: Post; onClose: () => void; onReschedule: (post: Post, isoTime: string) => Promise<void> }) {
  const [value, setValue] = useState(() =>
    toLocalInput(post.scheduled_at ? new Date(post.scheduled_at) : new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [min] = useState(() => toLocalInput(new Date()));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!value) return;
    setBusy(true);
    try { await onReschedule(post, new Date(value).toISOString()); } finally { setBusy(false); }
  };
  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title="Reschedule post"
      description="Pick a new date and time. The post stays scheduled and will publish then."
      size="sm"
      closeOnOverlayClick={!busy}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !value} onClick={submit}>
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}Reschedule
        </Button>
      </>}
    >
      <input
        type="datetime-local"
        aria-label="New date and time"
        value={value}
        min={min}
        onChange={(e) => setValue(e.target.value)}
        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:ring-2 focus:ring-orange-500/30 focus:border-zinc-400 focus:outline-none"
      />
    </Modal>
  );
}

export function PostDetailDialog({ post, onClose }: { post: Post | null; onClose: () => void }) {
  if (!post) return null;
  const creatives = Object.entries(post.creative_urls ?? {}).filter(([, url]) => !!url);
  const results = platformResults(post.publish_results);
  const metrics = metricTotals(post.metrics);
  const hasMetrics = metrics.reach > 0 || metrics.likes > 0 || metrics.comments > 0;

  return (
    <Modal isOpen onClose={onClose} title={post.prompt_text || 'Untitled post'} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <PostStatusBadge status={post.status} />
          <PlatformList platforms={post.platforms} />
          <span className="text-xs text-zinc-400">· {postTimeline(post)}</span>
        </div>

        {creatives.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {creatives.map(([platform, url]) => (
              <img key={platform} src={url} alt={platform} className="w-28 h-28 object-cover rounded-lg ring-1 ring-zinc-200" />
            ))}
          </div>
        )}

        {post.caption_text && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 mb-1">Caption</p>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{post.caption_text}</p>
          </div>
        )}

        {post.caption_hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.caption_hashtags.map((tag, i) => (
              <span key={`${tag}-${i}`} className="text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 mb-1.5">Per-platform result</p>
            <div className="space-y-1.5">
              {results.map((r) => (
                <div key={r.platform} className="flex items-center justify-between gap-2 text-xs border border-zinc-100 rounded-lg px-3 py-2">
                  <span className="font-semibold capitalize text-zinc-700">{r.platform}</span>
                  {r.error ? (
                    <span className="text-red-600 truncate">{r.error}</span>
                  ) : r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> View post
                    </a>
                  ) : (
                    <span className="text-emerald-700">Published</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMetrics && (
          <div className="grid grid-cols-3 gap-2">
            {([['Reach', metrics.reach], ['Likes', metrics.likes], ['Comments', metrics.comments]] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 text-center">
                <p className="text-base font-bold text-zinc-900">{value}</p>
                <p className="text-[11px] text-zinc-400">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/components/posts/PostRow.tsx`**

```tsx
import { CircleCheck, Clock, ExternalLink, LoaderCircle, Pencil, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import type { Post } from '../../services/creative';
import { approvalRemark, firstCreative, platformResults, postTimeline } from '../../utils/posts';
import type { ConfirmKind } from './PostDialogs';
import { PostStatusBadge } from './PostStatusBadge';
import { PlatformList } from './PlatformList';
import { PostThumbnail } from './PostThumbnail';

const ACTION = 'h-8 px-2.5 text-xs';

export interface PostRowProps {
  post: Post;
  canPublish: boolean;
  canApprove: boolean;
  approving: boolean;
  onOpen: (post: Post) => void;
  onEdit: (post: Post) => void;
  onConfirm: (kind: ConfirmKind, post: Post) => void;
  onApprove: (post: Post) => void;
  onReject: (post: Post) => void;
  onReschedule: (post: Post) => void;
  onSubmitForApproval: (post: Post) => void;
}

export function PostRow(props: PostRowProps) {
  const { post, onOpen, onConfirm } = props;
  const remark = approvalRemark(post);
  return (
    <div
      role="button"
      tabIndex={0}
      title="View details"
      onClick={() => onOpen(post)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(post); }}
      className="group bg-white rounded-xl border border-zinc-200/80 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300 cursor-pointer"
    >
      <div className="flex items-center gap-4 p-3.5">
        <PostThumbnail url={firstCreative(post.creative_urls)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-sm font-semibold text-zinc-900 leading-snug line-clamp-1">{post.prompt_text || 'Untitled post'}</h3>
            <PostStatusBadge status={post.status} />
          </div>
          {post.caption_text && <p className="mt-1 text-[13px] text-zinc-500 line-clamp-1 leading-relaxed">{post.caption_text}</p>}
          <div className="mt-2 flex items-center gap-2.5">
            <PlatformList platforms={post.platforms} />
            <span className="w-px h-3 bg-zinc-200" />
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
              {post.status === 'published' ? <CircleCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {postTimeline(post)}
            </span>
          </div>
          {remark && (
            <p className={cn('mt-1.5 text-[12px] line-clamp-2 leading-relaxed', remark.kind === 'rejected' ? 'text-red-600' : 'text-teal-700')}>
              <span className="font-semibold">{remark.kind === 'rejected' ? 'Rejected:' : 'Approver note:'}</span> {remark.text}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <RowActions {...props} />
          {post.status !== 'publishing' && (
            <button
              type="button"
              onClick={() => onConfirm('delete', post)}
              title="Delete post"
              aria-label="Delete post"
              className="p-1.5 rounded-lg text-zinc-300 transition-colors hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RowActions({ post, canPublish, canApprove, approving, onEdit, onConfirm, onApprove, onReject, onReschedule, onSubmitForApproval }: PostRowProps) {
  switch (post.status) {
    case 'draft':
      return (
        <>
          <Button variant="secondary" className={ACTION} onClick={() => onEdit(post)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
          {canPublish ? (
            <Button className={ACTION} onClick={() => onConfirm('publish', post)}><Send className="w-3.5 h-3.5" /> Publish</Button>
          ) : (
            <Button variant="secondary" className={ACTION} onClick={() => onSubmitForApproval(post)}><Send className="w-3.5 h-3.5" /> Send for approval</Button>
          )}
        </>
      );
    case 'pending_approval':
      if (!canApprove) return <span className="text-xs font-medium text-violet-600 px-2">Awaiting approval</span>;
      return (
        <>
          <Button variant="secondary" className={ACTION} disabled={approving} onClick={() => onReject(post)}>Reject</Button>
          <Button variant="success" className={ACTION} disabled={approving} onClick={() => onApprove(post)}>
            {approving ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5" />} Approve
          </Button>
        </>
      );
    case 'approved':
      return canPublish
        ? <Button className={ACTION} onClick={() => onConfirm('publish', post)}><Send className="w-3.5 h-3.5" /> Publish</Button>
        : <span className="text-xs font-medium text-teal-600 px-2">Ready to publish</span>;
    case 'scheduled':
      if (!canPublish) return null;
      return (
        <>
          <Button variant="secondary" className={ACTION} onClick={() => onReschedule(post)}><Clock className="w-3.5 h-3.5" /> Reschedule</Button>
          <Button variant="secondary" className={ACTION} onClick={() => onConfirm('cancel', post)}><X className="w-3.5 h-3.5" /> Cancel</Button>
        </>
      );
    case 'published': {
      const url = platformResults(post.publish_results).find((r) => r.url)?.url ?? firstCreative(post.creative_urls);
      if (!url) return null;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-700 transition-colors hover:bg-zinc-50 hover:border-zinc-300"
        >
          <ExternalLink className="w-3.5 h-3.5" /> View
        </a>
      );
    }
    case 'failed':
      return canPublish ? (
        <Button variant="secondary" className={cn(ACTION, 'text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300')} onClick={() => onConfirm('retry', post)}>
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      ) : null;
    case 'publishing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 px-2">
          <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Publishing
        </span>
      );
    default:
      return null;
  }
}

export function PostRowSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 p-3.5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-lg bg-zinc-100 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="h-3.5 w-2/3 bg-zinc-100 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-zinc-100 rounded animate-pulse" />
          <div className="h-3 w-28 bg-zinc-100 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-zinc-100 rounded-lg animate-pulse" />
          <div className="h-8 w-8 bg-zinc-100 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `apps/web/src/pages/PostsPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Button, cn } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { PageCard, PageHeader } from '../components/ui/PageCard';
import { PostRow, PostRowSkeleton } from '../components/posts/PostRow';
import { PostsEmptyState } from '../components/posts/PostsEmptyState';
import { ConfirmDialog, PostDetailDialog, RejectDialog, RescheduleDialog, type ConfirmKind } from '../components/posts/PostDialogs';
import { postService, type Post } from '../services/creative';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { can, PERMISSIONS } from '../lib/permissions';
import { POST_TABS, pageList, parsePostTab, type PostTab } from '../utils/posts';
import { publishErrorMessage, summarizePublishResult } from '../utils/publishResult';

const PAGE_SIZE = 15;
const POLL_MS = 4000;
const MAX_POLLS = 20; // about 80 seconds of watching a post that is publishing

export default function PostsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { user } = useAuth();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);
  const canApprove = can(user, PERMISSIONS.APPROVE_POST);

  const [tab, setTab] = useState<PostTab>(() => parsePostTab(searchParams.get('status')));
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [listKey, setListKey] = useState(0);
  const [countsKey, setCountsKey] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; post: Post } | null>(null);
  const [rejecting, setRejecting] = useState<Post | null>(null);
  const [rescheduling, setRescheduling] = useState<Post | null>(null);
  const [viewing, setViewing] = useState<Post | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const polls = useRef(0);

  useEffect(() => {
    let cancelled = false;
    postService.list(tab === 'all' ? { page, pageSize: PAGE_SIZE } : { status: tab, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setPosts(res.data ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', title: 'Load failed', message: 'Could not load posts. Please try again.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, page, listKey, addToast]);

  useEffect(() => {
    postService.counts().then((res) => setCounts(res.counts)).catch(() => { /* tab counts are optional */ });
  }, [countsKey]);

  const refreshQuietly = useCallback(() => {
    setListKey((k) => k + 1);
    setCountsKey((k) => k + 1);
  }, []);

  // Keep watching while any visible post is publishing, then stop.
  const hasPublishing = posts.some((p) => p.status === 'publishing');
  useEffect(() => {
    if (!hasPublishing) {
      polls.current = 0;
      return;
    }
    if (polls.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      refreshQuietly();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [hasPublishing, posts, refreshQuietly]);

  const switchTab = (next: PostTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setLoading(true);
  };
  const goToPage = (next: number) => {
    setPage(next);
    setLoading(true);
  };
  const refreshAll = () => {
    setLoading(true);
    refreshQuietly();
  };

  const publish = async (post: Post, retry: boolean) => {
    const failTitle = retry ? 'Retry failed' : 'Publish failed';
    try {
      const res = await postService.publish(post.id, post.platforms);
      const outcome = summarizePublishResult(res, post.platforms);
      if (!outcome.ok) {
        addToast({ type: 'error', title: failTitle, message: outcome.message ?? 'Could not publish. Check your platform connections.' });
      } else if (outcome.message) {
        addToast({ type: 'warning', title: 'Partly published', message: outcome.message });
      } else {
        addToast(retry
          ? { type: 'success', title: 'Re-published', message: 'The post is being published again.' }
          : { type: 'success', title: 'Publishing', message: 'Your post is being published to the selected platforms.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: failTitle, message: publishErrorMessage(err, 'Could not publish. Check your platform connections.') });
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    const { kind, post } = confirm;
    try {
      if (kind === 'publish' || kind === 'retry') {
        await publish(post, kind === 'retry');
      } else if (kind === 'delete') {
        await postService.delete(post.id)
          .then(() => addToast({ type: 'success', title: 'Post deleted', message: 'The post has been removed.' }))
          .catch(() => addToast({ type: 'error', title: 'Delete failed', message: 'Could not delete the post. Try again.' }));
      } else {
        await postService.cancelSchedule(post.id)
          .then(() => addToast({ type: 'success', title: 'Schedule cancelled', message: 'The post was moved back to drafts.' }))
          .catch(() => addToast({ type: 'error', title: 'Cancel failed', message: 'Could not cancel the schedule. Try again.' }));
      }
    } finally {
      setConfirm(null);
      refreshQuietly();
    }
  };

  const approve = async (post: Post) => {
    setApprovingId(post.id);
    try {
      await postService.approve(post.id);
      addToast({ type: 'success', title: 'Post approved', message: "It's now ready to publish — open the Ready tab to publish it." });
    } catch (err) {
      addToast({ type: 'error', title: 'Approve failed', message: err instanceof ApiError ? err.message : 'Could not approve. Try again.' });
    } finally {
      setApprovingId(null);
      refreshQuietly();
    }
  };

  const reject = async (post: Post, reason: string) => {
    try {
      await postService.reject(post.id, reason.trim());
      addToast({ type: 'success', title: 'Post rejected', message: 'The post has been sent back to drafts.' });
    } catch {
      addToast({ type: 'error', title: 'Reject failed', message: 'Could not reject the post. Try again.' });
    } finally {
      setRejecting(null);
      refreshQuietly();
    }
  };

  const reschedule = async (post: Post, isoTime: string) => {
    try {
      await postService.reschedule(post.id, isoTime);
      addToast({ type: 'success', title: 'Rescheduled', message: 'The post will publish at the new time.' });
    } catch {
      addToast({ type: 'error', title: 'Reschedule failed', message: 'Could not reschedule. Try again.' });
    } finally {
      setRescheduling(null);
      refreshQuietly();
    }
  };

  const submitForApproval = async (post: Post) => {
    try {
      await postService.submitForApproval(post.id);
      addToast({ type: 'success', title: 'Sent for approval', message: 'Your approver has been notified with the review link.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Could not send for approval', message: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      refreshQuietly();
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const subtitle = total > 0 ? `${total} ${total === 1 ? 'post' : 'posts'} across your social channels` : 'Create and manage your social posts';

  return (
    <PageCard>
      <PageHeader
        title="Posts"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" className="px-2.5" disabled={loading} aria-label="Refresh posts" title="Refresh" onClick={refreshAll}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button onClick={() => navigate('/create')}><Plus className="w-4 h-4" /> New Post</Button>
          </>
        }
      />

      <div className="flex mb-4 overflow-x-auto">
        <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1" role="tablist">
          {POST_TABS.map(({ id, label }) => {
            const active = id === tab;
            const count = id === 'all' ? 0 : counts[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0',
                  active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
                )}
              >
                {label}
                {count > 0 && (
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', active ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-200/70 text-zinc-500')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }, (_, i) => <PostRowSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <PostsEmptyState status={tab} onCreate={() => navigate('/create')} />
      ) : (
        <>
          <div className="space-y-2.5">
            {posts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                canPublish={canPublish}
                canApprove={canApprove}
                approving={approvingId === post.id}
                onOpen={setViewing}
                onEdit={(p) => navigate(`/create?edit=${p.id}&prompt=${encodeURIComponent(p.prompt_text ?? '')}`)}
                onConfirm={(kind, p) => setConfirm({ kind, post: p })}
                onApprove={approve}
                onReject={setRejecting}
                onReschedule={setRescheduling}
                onSubmitForApproval={submitForApproval}
              />
            ))}
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} total={total} onPage={goToPage} />}
        </>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} onConfirm={runConfirmed} />
      <RejectDialog post={rejecting} onClose={() => setRejecting(null)} onReject={reject} />
      <RescheduleDialog post={rescheduling} onClose={() => setRescheduling(null)} onReschedule={reschedule} />
      <PostDetailDialog post={viewing} onClose={() => setViewing(null)} />
    </PageCard>
  );
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100 flex-wrap gap-3">
      <p className="text-xs text-zinc-400">
        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" className="h-8 px-2 text-xs" disabled={page === 1} aria-label="Previous page" onClick={() => onPage(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        {pageList(page, totalPages).map((n, i) => n === '...' ? (
          <span key={`gap-${i}`} className="px-1.5 text-xs text-zinc-300">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            className={cn('h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition-colors', n === page ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}
          >
            {n}
          </button>
        ))}
        <Button variant="secondary" className="h-8 px-2 text-xs" disabled={page === totalPages} aria-label="Next page" onClick={() => onPage(page + 1)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run build -w web && npm test -w web && cd apps/web && npx eslint src/pages/PostsPage.tsx src/components/posts src/services/creative.ts`
Expected: the build exits 0, tests pass, and no eslint problems in these files.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/services/creative.ts apps/web/src/components/posts apps/web/src/pages/PostsPage.tsx
git add -u apps/web/src/pages
git commit -m "feat(web): Posts page with approvals, ready and schedule actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -u apps/web/src/pages` picks up `Calendar.tsx` only if Step 1 had to change it.)

---

### Task 10: Public approval page (`/approve/:token`)

**Files:**
- Create: `apps/web/src/services/approvals.ts`
- Create: `apps/web/src/pages/ApprovePage.tsx`
- Modify: `apps/web/src/App.tsx` (public route)

**Interfaces:**
- Consumes: the Task 4 HTTP contract and `firstCreative` (Task 7).
- Produces: route `/approve/:token`, with no auth and no app shell.

- [ ] **Step 1: Create `apps/web/src/services/approvals.ts`**

```ts
import api from './api';

export interface ApprovalPreview {
  dealer_name: string;
  actionable: boolean;
  post: { creative_urls: unknown; caption_text: string; caption_hashtags: string[]; platforms: string[] };
}

export interface ApprovalResult {
  status: 'approved' | 'rejected';
  message: string;
}

// Public approval links: no sign-in needed.
export const approvalService = {
  get: (token: string) => api.get<ApprovalPreview>(`/publisher/approval/${encodeURIComponent(token)}`),
  decide: (token: string, decision: 'approve' | 'reject', comment: string) =>
    api.post<ApprovalResult>(`/publisher/approval/${encodeURIComponent(token)}`, { decision, comment }),
};
```

- [ ] **Step 2: Create `apps/web/src/pages/ApprovePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CircleCheck, CircleX, LoaderCircle, ShieldCheck } from 'lucide-react';
import { ApiError } from '../services/api';
import { approvalService, type ApprovalPreview, type ApprovalResult } from '../services/approvals';
import { firstCreative } from '../utils/posts';

export default function ApprovePage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<ApprovalPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    approvalService.get(token)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'This approval link is invalid or has expired.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const decide = async (decision: 'approve' | 'reject') => {
    setPending(decision);
    try {
      setResult(await approvalService.decide(token, decision, comment.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(null);
    }
  };

  const image = data ? firstCreative(data.post.creative_urls) : null;
  const hashtags = (data?.post.caption_hashtags ?? []).map((t) => (t.startsWith('#') ? t : `#${t}`));

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm ring-1 ring-zinc-100 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-100">
          <ShieldCheck className="w-5 h-5 text-orange-500" />
          <span className="font-semibold text-zinc-900">Post approval</span>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center">
              <LoaderCircle className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : result ? (
            <div className="text-center py-8">
              {result.status === 'approved'
                ? <CircleCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                : <CircleX className="w-12 h-12 text-amber-500 mx-auto mb-3" />}
              <p className="text-zinc-800 font-medium">{result.message}</p>
              <p className="text-zinc-500 text-sm mt-1">You can close this window.</p>
            </div>
          ) : error || !data ? (
            <div className="text-center py-8">
              <CircleX className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-zinc-700">{error ?? 'This approval link is invalid or has expired.'}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-500 mb-3">
                <span className="font-medium text-zinc-700">{data.dealer_name}</span> submitted a post for your approval.
              </p>
              {image && <img src={image} alt="Creative preview" className="w-full rounded-xl ring-1 ring-zinc-100 mb-3 object-cover" />}
              {data.post.caption_text && <p className="text-sm text-zinc-700 whitespace-pre-wrap mb-2">{data.post.caption_text}</p>}
              {hashtags.length > 0 && <p className="text-sm text-orange-600 mb-3">{hashtags.join(' ')}</p>}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {data.post.platforms.map((p) => (
                  <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">{p}</span>
                ))}
              </div>
              {data.actionable ? (
                <>
                  <label htmlFor="approval-comment" className="block text-xs font-medium text-zinc-500 mb-1.5">Feedback / comment (optional)</label>
                  <textarea
                    id="approval-comment"
                    rows={3}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a note for the team — e.g. why you're rejecting, or any change requested."
                    className="w-full rounded-xl border border-zinc-200 p-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => decide('reject')}
                      disabled={pending !== null}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {pending === 'reject' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CircleX className="w-4 h-4" />} Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => decide('approve')}
                      disabled={pending !== null}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {pending === 'approve' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />} Approve
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-center text-zinc-500 py-2">This post has already been actioned.</p>
              )}
              <p className="text-[11px] text-center text-zinc-400 mt-4">Approving marks this post ready to publish — it won't post automatically.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the public route**

In `apps/web/src/App.tsx`:
- add `import ApprovePage from './pages/ApprovePage';` next to the other page imports;
- in the `{/* Public routes */}` block, after the `/oauth/callback` route, add:

```tsx
      <Route path="/approve/:token" element={<ApprovePage />} />
```

- [ ] **Step 4: Verify**

Run: `npm run build -w web && cd apps/web && npx eslint src/pages/ApprovePage.tsx src/services/approvals.ts`
Expected: the build exits 0; no eslint problems.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/approvals.ts apps/web/src/pages/ApprovePage.tsx apps/web/src/App.tsx
git commit -m "feat(web): public approval page for review links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Dashboard

**Files:**
- Create: `apps/web/src/services/dashboard.ts`
- Create in `apps/web/src/components/dashboard/`: `ActivityChart.tsx`, `PipelineDonut.tsx`, `Insights.tsx`, `Widgets.tsx`
- Create: `apps/web/src/pages/Dashboard.tsx`
- Modify: `apps/web/src/App.tsx`: remove the inline dashboard; route `/` to `pages/Dashboard`.

**Interfaces:**
- Consumes:
  - `GET /dealer/dashboard`, `GET /dealer/analytics` (Task 6);
  - `postService.counts/activity/list` (Task 9);
  - Task 7 utils;
  - Task 8 primitives;
  - `formatRelativeTime` and `getInitials` from `utils/helpers.ts`.
- Produces: the default export `Dashboard` page.

- [ ] **Step 1: Create `apps/web/src/services/dashboard.ts`**

```ts
import api from './api';

export interface DashboardStats {
  postsThisMonth: number;
  postsChange: number;
  totalReach: number;
  leadsGenerated: number;
  leadsThisWeek: number;
  inboxPending: number;
  negativeReviews: number;
}

export interface Festival {
  id: string;
  name_en: string;
  date: string;
  category: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  upcomingFestivals: Festival[];
}

export interface DealerAnalytics {
  engagementByType: Array<{ type: string; engagementRate: number }>;
  followerTrend: Array<{ platform: string; current: number; delta: number | null }>;
  reviewSummary: { avgRating: number | null; responseRate: number; totalReviews: number };
}

export const dashboardService = {
  get: () => api.get<DashboardData>('/dealer/dashboard'),
  analytics: () => api.get<DealerAnalytics>('/dealer/analytics'),
};
```

- [ ] **Step 2: Create `apps/web/src/components/dashboard/ActivityChart.tsx`**

```tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ACTIVITY_STATUSES, type ActivityBucket, type ActivityStatus } from '../../utils/dashboard';
import { labelStride, smoothPath, yTicks, type Point } from '../../utils/chartPath';

const HEIGHT = 180;
const PAD_L = 28;
const TOP = 18;
const PLOT_H = 136;
const BASE = TOP + PLOT_H;

// --color-orange-* are defined in index.css (brand remap), so they always exist at runtime.
const SERIES: Record<ActivityStatus, { color: string; label: string }> = {
  published: { color: 'var(--color-orange-600)', label: 'Published' },
  scheduled: { color: 'var(--color-orange-400)', label: 'Scheduled' },
  approved: { color: '#14b8a6', label: 'Ready' },
  pending_approval: { color: '#fcd34d', label: 'Pending approval' },
  draft: { color: '#a1a1aa', label: 'Draft' },
  failed: { color: '#ef4444', label: 'Failed' },
};

// Stacked area chart of posts created per day, coloured by status, with a hover tooltip.
export function ActivityChart({ buckets }: { buckets: ActivityBucket[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = buckets.length;
  const plotW = width - PAD_L;
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => TOP + (1 - v / max) * PLOT_H;
  const active = ACTIVITY_STATUSES.filter((s) => buckets.some((b) => b.byStatus[s] > 0));

  // Each status is a band between the running total below it and the running total including it.
  const areas = active.reduce<{ lower: number[]; paths: Array<{ status: ActivityStatus; d: string }> }>(
    (acc, status) => {
      const upper = acc.lower.map((v, i) => v + (buckets[i]?.byStatus[status] ?? 0));
      const top = upper.map((v, i): Point => [x(i), y(v)]);
      const bottom = acc.lower.map((v, i): Point => [x(i), y(v)]).reverse();
      return { lower: upper, paths: [...acc.paths, { status, d: `${smoothPath(top)} ${smoothPath(bottom).replace(/^M/, 'L')} Z` }] };
    },
    { lower: buckets.map(() => 0), paths: [] },
  ).paths;
  const outline = smoothPath(buckets.map((b, i): Point => [x(i), y(b.total)]));
  const stride = labelStride(n, width);
  const hovered = hover !== null ? buckets[hover] : undefined;

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    if (svgX < PAD_L) {
      setHover(null);
      return;
    }
    setHover(Math.min(n - 1, Math.max(0, Math.round(((svgX - PAD_L) / plotW) * (n - 1)))));
  };

  return (
    <div>
      <div ref={wrapRef} className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full h-[180px]" role="img" aria-label="Posts created per day">
          <defs>
            <clipPath id="activity-plot-clip">
              <rect x={PAD_L} y={TOP} width={plotW} height={PLOT_H} />
            </clipPath>
          </defs>
          {yTicks(max).map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={width} y1={y(t)} y2={y(t)} stroke="#e4e4e7" strokeDasharray="2 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={22} y={y(t) + 3} textAnchor="end" className="fill-zinc-300" style={{ fontSize: 10, fontWeight: 500 }}>{t}</text>
            </g>
          ))}
          <line x1={PAD_L} y1={BASE} x2={width} y2={BASE} stroke="#d4d4d8" strokeWidth={1} />
          <g clipPath="url(#activity-plot-clip)">
            {areas.map((a) => <path key={a.status} d={a.d} fill={SERIES[a.status].color} fillOpacity={0.88} />)}
            <path d={outline} fill="none" stroke="#27272a" strokeOpacity={0.4} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          </g>
          {buckets.map((b, i) => (i % stride === 0 || i === n - 1) && (
            <text
              key={b.key}
              x={x(i)}
              y={174}
              textAnchor="middle"
              style={{ fontSize: 10, fontWeight: 500 }}
              className={hover === i ? 'fill-zinc-800' : b.date.getDay() === 1 ? 'fill-zinc-500' : 'fill-zinc-400'}
            >
              {b.label}
            </text>
          ))}
          {hovered && hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={BASE} stroke="var(--color-orange-600)" strokeOpacity={0.25} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(hovered.total)} r={4.5} fill="#27272a" stroke="#fff" strokeWidth={2} />
            </>
          )}
          <rect x={PAD_L} y={0} width={plotW} height={HEIGHT} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hovered && hover !== null && (
          <ChartTooltip bucket={hovered} left={(x(hover) / width) * 100} top={(y(hovered.total) / HEIGHT) * 100} />
        )}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-zinc-100">
          {active.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="w-3 h-[2px] rounded-full" style={{ background: SERIES[s].color }} />
              {SERIES[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ bucket, left, top }: { bucket: ActivityBucket; left: number; top: number }) {
  const transform = left < 22
    ? 'translate(8px, -100%)'
    : left > 78
      ? 'translate(calc(-100% - 8px), -100%)'
      : 'translate(-50%, calc(-100% - 8px))';
  return (
    <div
      className="absolute z-10 bg-zinc-900 text-white rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none whitespace-nowrap"
      style={{ left: `${left}%`, top: `${top}%`, transform, minWidth: 152 }}
    >
      <p className="font-semibold mb-0.5">{bucket.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      <p className="text-zinc-300 mb-1.5 text-[11px]">{bucket.total} {bucket.total === 1 ? 'post' : 'posts'} total</p>
      {bucket.total === 0 ? (
        <p className="text-[11px] text-zinc-400">No posts</p>
      ) : (
        ACTIVITY_STATUSES.filter((s) => bucket.byStatus[s] > 0).map((s) => (
          <div key={s} className="flex items-center justify-between gap-4 text-[11px] leading-relaxed">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: SERIES[s].color }} />
              {SERIES[s].label}
            </span>
            <span className="font-semibold">{bucket.byStatus[s]}</span>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/components/dashboard/PipelineDonut.tsx`**

```tsx
const R = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Donut of posts by status, starting at 12 o'clock and running clockwise.
export function PipelineDonut({ segments, total }: { segments: Array<{ key: string; color: string; value: number }>; total: number }) {
  const arcs = segments
    .filter((s) => s.value > 0)
    .reduce<Array<{ key: string; color: string; len: number; start: number }>>((list, s) => {
      const prev = list[list.length - 1];
      const start = prev ? prev.start + prev.len : 0;
      return [...list, { key: s.key, color: s.color, len: (s.value / total) * CIRCUMFERENCE, start }];
    }, []);

  return (
    <div className="relative w-[150px] h-[150px] flex-shrink-0">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" role="img" aria-label="Posts by status">
        <circle cx={80} cy={80} r={R} fill="none" stroke="#f4f4f5" strokeWidth={20} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={80}
            cy={80}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={20}
            strokeDasharray={`${a.len.toFixed(2)} ${(CIRCUMFERENCE - a.len).toFixed(2)}`}
            strokeDashoffset={(-a.start).toFixed(2)}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tracking-tight text-zinc-900">{total}</span>
        <span className="text-[10px] font-medium text-zinc-400">total posts</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/components/dashboard/Insights.tsx`**

```tsx
import type { ReactNode } from 'react';
import { MessageSquare, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import type { DealerAnalytics } from '../../services/dashboard';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];
const FOLLOWER_ICONS: Record<string, IconPlatform> = {
  facebook: 'facebook', instagram: 'instagram', gmb: 'gmb', google: 'gmb', google_my_business: 'gmb', whatsapp: 'whatsapp', youtube: 'youtube',
};

export function EngagementBars({ rows }: { rows: DealerAnalytics['engagementByType'] }) {
  const top = [...rows].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
  const max = Math.max(1, ...top.map((r) => r.engagementRate));
  return (
    <div className="space-y-3.5">
      {top.map((r) => (
        <div key={r.type} className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-zinc-600 capitalize w-24 flex-shrink-0 truncate">{r.type}</span>
          <div className="flex-1 h-2.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500"
              style={{ width: `${Math.max(4, (r.engagementRate / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-zinc-700 w-12 text-right flex-shrink-0">{r.engagementRate}%</span>
        </div>
      ))}
    </div>
  );
}

// Followers per platform plus review health. `analytics` is null when the request failed.
export function AudienceSummary({ analytics }: { analytics: DealerAnalytics | null }) {
  const followers = analytics?.followerTrend ?? [];
  const review = analytics?.reviewSummary;
  return (
    <div className="space-y-3">
      {followers.length === 0
        ? <p className="text-xs text-zinc-400 py-1">No follower data yet.</p>
        : followers.map((f) => <FollowerRow key={f.platform} {...f} />)}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100">
        <MiniStat icon={<Star className="w-3.5 h-3.5" />} label="Avg rating" value={review?.avgRating == null ? '—' : review.avgRating.toFixed(1)} />
        <MiniStat icon={<MessageSquare className="w-3.5 h-3.5" />} label="Response rate" value={review ? `${review.responseRate}%` : '—'} />
      </div>
    </div>
  );
}

function FollowerRow({ platform, current, delta }: DealerAnalytics['followerTrend'][number]) {
  const icon = FOLLOWER_ICONS[platform];
  return (
    <div className="flex items-center gap-2.5">
      {icon
        ? <PlatformIcon platform={icon} size="md" />
        : <span className="w-5 text-center text-[10px] font-bold uppercase text-zinc-400">{platform.slice(0, 2)}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-zinc-900 leading-tight">{current.toLocaleString('en-IN')}</p>
        <p className="text-[11px] text-zinc-400 capitalize">{platform.replace(/_/g, ' ')} followers</p>
      </div>
      {delta !== null && (
        <span className={cn(
          'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
          delta >= 0 ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-red-50 text-red-500 ring-1 ring-red-100',
        )}>
          {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {delta >= 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-50 rounded-lg px-2.5 py-2">
      <div className="flex items-center gap-1 text-zinc-400">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-sm font-bold text-zinc-900 mt-0.5">{value}</p>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/components/dashboard/Widgets.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Calendar, Car, Check, MessageSquare, RefreshCw, Send, X } from 'lucide-react';
import api from '../../services/api';
import { postService, type Post } from '../../services/creative';
import type { Festival } from '../../services/dashboard';
import { formatRelativeTime, getInitials } from '../../utils/helpers';
import { cn } from '../ui/Button';
import { LINK_CLASS } from '../ui/linkStyles';
import { useToast } from '../ui/Toast';

const CARD = 'bg-white rounded-2xl border border-zinc-200/80 shadow-sm';
const shortDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// ── Today's suggested post ──────────────────────────────────────────────────
export function SuggestedPost({ festival }: { festival?: Festival }) {
  const [today] = useState(() => new Date());
  const idea = festival
    ? {
        title: `${festival.name_en} Special Offer`,
        body: `Celebrate ${festival.name_en} with exclusive offers! Visit our showroom for special discounts. Limited period only.`,
        tags: [`#${festival.name_en.replace(/\s+/g, '')}`, '#FestivalOffer', '#CarDeal'],
        category: festival.category ?? 'Weekend Offer',
        date: new Date(festival.date),
        postType: 'festival',
      }
    : {
        title: 'Weekend Test Drive Special',
        body: 'Saturday ho ya Sunday, aapki dream car ka test drive sirf ek call door hai! 🚗✨',
        tags: ['#WeekendOffer', '#TestDrive', '#CarDeal'],
        category: 'Weekend Offer',
        date: today,
        postType: 'promotional',
      };
  const href = `/create?prompt=${encodeURIComponent(`${idea.title}\n\n${idea.body}\n\n${idea.tags.join(' ')}`)}&postType=${encodeURIComponent(idea.postType)}`;

  return (
    <div className={cn(CARD, 'overflow-hidden')}>
      <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 border-b border-zinc-100">
        <span className="text-[11px] font-semibold text-orange-600 tracking-widest uppercase">Today's Suggested Post</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline text-xs text-zinc-400">
            {idea.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <NavLink to={href} className={LINK_CLASS}>Create →</NavLink>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 p-4 sm:p-5">
        <div className="w-full sm:w-40 flex-shrink-0 bg-gradient-to-br from-zinc-900 to-zinc-700 rounded-lg flex flex-col items-center justify-center p-4 relative overflow-hidden aspect-[16/9] sm:aspect-[4/3]">
          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center mb-3">
            <Car className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-zinc-400 text-[9px] font-bold uppercase tracking-widest mb-1.5">{idea.category.slice(0, 14)}</p>
          <p className="text-white text-xs font-bold text-center leading-snug mb-3 px-1">{idea.title.slice(0, 28)}</p>
          <div className="bg-orange-600 rounded-full px-3 py-1">
            <p className="text-white text-[9px] font-bold">Your Dealership</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="bg-teal-50 text-teal-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-teal-100">{idea.category}</span>
            <span className="bg-orange-50 text-orange-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-100">Auto-Suggested</span>
          </div>
          <h3 className="font-semibold text-zinc-900 text-sm leading-tight mb-2">{idea.title}</h3>
          <div className="bg-zinc-50 rounded-lg px-3 py-2.5 mb-3 border border-zinc-100">
            <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{idea.body}</p>
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {idea.tags.map((tag) => <span key={tag} className="text-[11px] text-orange-600 font-medium">{tag}</span>)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <NavLink to={href} className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-xs">
              <Send className="w-3 h-3" /> Post Everywhere
            </NavLink>
            <NavLink to={href} className="text-xs font-medium text-zinc-700 hover:bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-200 hover:border-zinc-300 bg-white transition-colors">
              Edit First
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Review & comment inbox ──────────────────────────────────────────────────
interface InboxItem {
  id: string;
  customerName: string;
  platform: string;
  messageType: string;
  messageText: string;
  receivedAt: string;
  isRead: boolean;
  repliedAt?: string;
}

const PLATFORM_NAMES: Record<string, string> = { google: 'Google', gmb: 'Google', instagram: 'Instagram', facebook: 'Facebook' };
const TYPE_NAMES: Record<string, string> = { review: 'Review', dm: 'DM' };

export function InboxPreview({ pending }: { pending: number }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    api.get<{ items: InboxItem[] }>('/inbox', { pageSize: 3 })
      .then((res) => setItems(res.items ?? []))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className={cn(CARD, 'overflow-hidden')}>
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-zinc-900 text-sm">Review &amp; Comment Inbox</h3>
          {pending > 0 && (
            <span className="bg-orange-50 text-orange-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-100">{pending} Pending</span>
          )}
        </div>
        <NavLink to="/inbox" className={LINK_CLASS}>View All →</NavLink>
      </div>
      {items === null ? (
        <div className="p-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-9 h-9 bg-zinc-100 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-zinc-100 rounded w-1/3" />
                <div className="h-3 bg-zinc-100 rounded w-full" />
                <div className="h-3 bg-zinc-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 px-4">
          <MessageSquare className="w-7 h-7 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-700">Inbox is empty</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">Reviews and comments from your published posts will appear here.</p>
          <NavLink to="/inbox" className="text-xs text-orange-600 font-medium hover:text-orange-700 mt-2 inline-block">Open inbox</NavLink>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((m) => {
            const unread = !m.isRead && !m.repliedAt;
            return (
              <li key={m.id} className="p-4 hover:bg-zinc-50/60 transition-colors">
                <NavLink to="/inbox" className="flex gap-3">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0', unread ? 'bg-zinc-900' : 'bg-zinc-400')}>
                    {getInitials(m.customerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-sm leading-tight', unread ? 'font-bold text-zinc-900' : 'font-medium text-zinc-600')}>{m.customerName}</span>
                      {unread && <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />}
                      <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">
                        {PLATFORM_NAMES[m.platform] ?? m.platform} · {TYPE_NAMES[m.messageType] ?? 'Comment'}
                      </span>
                      <span className="text-[10px] text-zinc-400 ml-auto">{formatRelativeTime(m.receivedAt)}</span>
                    </div>
                    <p className={cn('text-xs leading-relaxed line-clamp-2', unread ? 'text-zinc-700' : 'text-zinc-500')}>“{m.messageText}”</p>
                    {m.repliedAt && (
                      <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1 font-medium"><Check className="w-3 h-3" /> Replied</p>
                    )}
                  </div>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Coming up ───────────────────────────────────────────────────────────────
interface UpcomingItem { key: string; label: string; date: string; sub: string; kind: 'post' | 'festival' }

function upcomingItems(posts: Post[], festivals: Festival[], now: number): UpcomingItem[] {
  const items: UpcomingItem[] = [
    ...posts
      .filter((p) => p.scheduled_at && new Date(p.scheduled_at).getTime() > now)
      .map((p): UpcomingItem => ({
        key: `post-${p.id}`,
        label: (p.prompt_text?.trim() || 'Scheduled post').slice(0, 42),
        date: p.scheduled_at!,
        sub: `Scheduled${p.platforms?.length ? ` · ${p.platforms.join(', ')}` : ''}`,
        kind: 'post',
      })),
    ...festivals
      .filter((f) => new Date(f.date).getTime() > now)
      .map((f): UpcomingItem => ({ key: `festival-${f.id}`, label: f.name_en, date: f.date, sub: f.category ?? 'Festival', kind: 'festival' })),
  ];
  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 3);
}

export function ComingUp({ festivals }: { festivals?: Festival[] }) {
  const navigate = useNavigate();
  const [now] = useState(() => Date.now());
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    postService.list({ status: 'scheduled', pageSize: 20 })
      .then((res) => setPosts(res.data ?? []))
      .catch(() => setPosts([]));
  }, []);

  const items = posts ? upcomingItems(posts, festivals ?? [], now) : null;

  return (
    <div className={cn(CARD, 'p-5')}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="font-semibold text-zinc-900 text-sm">Coming Up</h3>
        <button type="button" onClick={() => navigate('/calendar')} className={LINK_CLASS}>Calendar →</button>
      </div>
      {items === null ? (
        <div className="flex items-center justify-center py-4"><RefreshCw className="w-4 h-4 text-zinc-300 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-xs text-zinc-400">Nothing scheduled yet</p>
          <button type="button" onClick={() => navigate('/create')} className="text-xs text-orange-600 font-medium mt-1 hover:text-orange-700">+ Schedule a post</button>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.kind === 'post' ? '/calendar' : '/create')}
              className="w-full flex items-center gap-3 py-2 text-left hover:bg-zinc-50 rounded-lg px-1 -mx-1 transition-colors"
            >
              <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0', item.kind === 'post' ? 'bg-orange-50 border-orange-100' : 'bg-zinc-50 border-zinc-200')}>
                <Calendar className={cn('w-3.5 h-3.5', item.kind === 'post' ? 'text-orange-500' : 'text-zinc-400')} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{item.label}</p>
                <p className="text-xs text-zinc-400 truncate">{shortDate(item.date)} — {item.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Connected accounts ──────────────────────────────────────────────────────
interface Account { id: string; platform: string; accountName: string; createdAt: string }

const ACCOUNT_STYLE: Record<string, { color: string; label: string }> = {
  facebook: { color: '#1877F2', label: 'Facebook' },
  instagram: { color: '#E1306C', label: 'Instagram' },
  google: { color: '#4285F4', label: 'Google' },
};

export function ConnectedAccounts() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    api.get<{ accounts: Account[] }>('/platform-accounts')
      .then((res) => setAccounts(res.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.accountName}? Posts will stop publishing to it.`)) return;
    try {
      await api.delete(`/platform-accounts/${account.id}`);
      setAccounts((list) => list?.filter((a) => a.id !== account.id) ?? null);
    } catch {
      addToast({ type: 'error', title: 'Could not disconnect', message: 'Try again from Accounts.' });
    }
  };

  return (
    <div className={cn(CARD, 'p-5')}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="font-semibold text-zinc-900 text-sm">Connected Accounts</h3>
        <button type="button" onClick={() => navigate('/accounts')} className={LINK_CLASS}>Manage →</button>
      </div>
      {accounts === null ? (
        <div className="flex items-center justify-center py-4"><RefreshCw className="w-4 h-4 text-zinc-300 animate-spin" /></div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-xs text-zinc-400">No accounts connected</p>
          <button type="button" onClick={() => navigate('/accounts')} className="text-xs text-orange-600 font-medium mt-1 hover:text-orange-700">+ Connect</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {accounts.slice(0, 5).map((account) => {
            const style = ACCOUNT_STYLE[account.platform] ?? { color: '#888888', label: account.platform };
            return (
              <div key={account.id} className="flex items-center gap-2.5 group">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${style.color}18` }}>
                  <span className="w-3 h-3 rounded-full" style={{ background: style.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800 truncate">{account.accountName}</p>
                  <p className="text-[10px] text-zinc-400">{style.label} · {formatRelativeTime(account.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(account)}
                  title="Disconnect"
                  aria-label={`Disconnect ${account.accountName}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-zinc-400 hover:text-red-500 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {accounts.length > 5 && (
            <button type="button" onClick={() => navigate('/accounts')} className="text-[10px] text-zinc-400 font-medium hover:text-orange-600 w-full text-center pt-1">
              +{accounts.length - 5} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/web/src/pages/Dashboard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, ChartNoAxesColumn, ChartPie, MessageSquare, Plus, Send, TrendingUp, Users } from 'lucide-react';
import { cn } from '../components/ui/Button';
import { InlineEmpty } from '../components/ui/InlineEmpty';
import { PageCard, PageHeader } from '../components/ui/PageCard';
import { SectionCard } from '../components/ui/SectionCard';
import { StatCard } from '../components/ui/StatCard';
import { ActivityChart } from '../components/dashboard/ActivityChart';
import { PipelineDonut } from '../components/dashboard/PipelineDonut';
import { AudienceSummary, EngagementBars } from '../components/dashboard/Insights';
import { ComingUp, ConnectedAccounts, InboxPreview, SuggestedPost } from '../components/dashboard/Widgets';
import { useAuth } from '../contexts/AuthContext';
import { postService } from '../services/creative';
import { dashboardService, type DashboardData, type DealerAnalytics } from '../services/dashboard';
import { buildBuckets, compactIndian, greetingFor, pipelineSegments, weekTrend } from '../utils/dashboard';

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export default function Dashboard() {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<DealerAnalytics | null | undefined>(undefined); // undefined: loading, null: failed
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [activity, setActivity] = useState<Array<{ created_at: string; status: string }> | null>(null);
  const [range, setRange] = useState<Range>(14);

  useEffect(() => {
    dashboardService.get().then(setDashboard).catch(() => setDashboard(null));
    dashboardService.analytics().then(setAnalytics).catch(() => setAnalytics(null));
    postService.counts().then((res) => setCounts(res.counts as Record<string, number>)).catch(() => setCounts({}));
    postService.activity(30).then((res) => setActivity(res.posts)).catch(() => setActivity([]));
  }, []);

  const stats = dashboard?.stats;
  const firstName = user?.name?.split(' ')[0];
  const buckets = activity ? buildBuckets(activity, range, now) : null;
  const rangeTotal = buckets ? buckets.reduce((n, b) => n + b.total, 0) : 0;
  const trend = buckets ? weekTrend(buckets) : null;
  const segments = counts ? pipelineSegments(counts) : [];
  const pipelineTotal = segments.reduce((n, s) => n + s.value, 0);

  return (
    <PageCard className="space-y-4">
      <PageHeader
        className="items-center gap-3 mb-0"
        title={`${greetingFor(now.getHours())}${firstName ? `, ${firstName}` : ''}`}
        subtitle="Your social presence at a glance."
        actions={
          <NavLink
            to="/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-semibold shadow-sm shadow-orange-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" /> New post
          </NavLink>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Posts this month"
          value={stats?.postsThisMonth ?? 0}
          icon={<Send className="w-4 h-4" />}
          tint="bg-orange-50 text-orange-600"
          trend={stats ? { value: `${stats.postsChange >= 0 ? '+' : ''}${stats.postsChange}`, up: stats.postsChange >= 0 } : undefined}
          sub="vs last month"
          to="/posts"
        />
        <StatCard label="Total reach" value={stats ? compactIndian(stats.totalReach) : '—'} icon={<TrendingUp className="w-4 h-4" />} tint="bg-blue-50 text-blue-600" sub="across platforms" to="/analytics" />
        <StatCard
          label="Leads generated"
          value={stats?.leadsGenerated ?? 0}
          icon={<Users className="w-4 h-4" />}
          tint="bg-emerald-50 text-emerald-600"
          sub={stats && stats.leadsThisWeek > 0 ? `+${stats.leadsThisWeek} this week` : 'total'}
          to="/analytics"
        />
        <StatCard
          label="Inbox pending"
          value={stats?.inboxPending ?? 0}
          icon={<MessageSquare className="w-4 h-4" />}
          tint="bg-amber-50 text-amber-600"
          sub={stats && stats.negativeReviews > 0 ? `${stats.negativeReviews} need attention` : 'need reply'}
          to="/inbox"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          className="lg:col-span-2"
          icon={<Activity className="w-4 h-4" />}
          title="Posting activity"
          subtitle={`Posts created over the last ${range} days`}
          to="/analytics"
          action={
            <div className="flex items-center gap-2">
              {trend && (
                <span
                  title={`Last 7d: ${trend.last7} · Prev 7d: ${trend.prev7}`}
                  className={cn(
                    'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                    trend.delta > 0 ? 'bg-emerald-50 text-emerald-600' : trend.delta < 0 ? 'bg-red-50 text-red-500' : 'bg-zinc-100 text-zinc-500',
                  )}
                >
                  {trend.delta > 0 ? '+' : ''}{trend.delta} vs prev 7d
                </span>
              )}
              {buckets && <span className="text-xs font-medium text-zinc-400">{rangeTotal} posts</span>}
              <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn('text-[11px] font-medium px-2 py-0.5 rounded transition-colors', r === range ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
                  >
                    {r}d
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {!buckets ? (
            <div className="h-[160px] bg-zinc-50 rounded-lg animate-pulse" />
          ) : rangeTotal === 0 ? (
            <InlineEmpty icon={<Activity className="w-5 h-5" />} text={`No posts created in the last ${range} days.`} />
          ) : (
            <ActivityChart buckets={buckets} />
          )}
        </SectionCard>

        <SectionCard icon={<ChartPie className="w-4 h-4" />} title="Content pipeline" subtitle="All posts by status" to="/posts">
          {!counts ? (
            <div className="h-[160px] bg-zinc-50 rounded-lg animate-pulse" />
          ) : pipelineTotal === 0 ? (
            <InlineEmpty icon={<ChartPie className="w-5 h-5" />} text="No posts yet — create one to get started." />
          ) : (
            <div className="flex items-center gap-4">
              <PipelineDonut segments={segments} total={pipelineTotal} />
              <div className="flex-1 space-y-1.5 min-w-0">
                {segments.filter((s) => s.value > 0).map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-zinc-500 flex-1 truncate">{s.label}</span>
                    <span className="text-xs font-semibold text-zinc-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          className="lg:col-span-2"
          icon={<ChartNoAxesColumn className="w-4 h-4" />}
          title="Engagement by post type"
          subtitle="Engagement rate across your published content"
          to="/analytics"
        >
          {analytics === undefined ? (
            <div className="space-y-3.5">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-2.5 bg-zinc-100 rounded-full animate-pulse" />)}
            </div>
          ) : analytics && analytics.engagementByType.length > 0 ? (
            <EngagementBars rows={analytics.engagementByType} />
          ) : (
            <InlineEmpty icon={<ChartNoAxesColumn className="w-5 h-5" />} text="Engagement data appears as your posts gather reach." />
          )}
        </SectionCard>

        <SectionCard icon={<Users className="w-4 h-4" />} title="Audience" subtitle="Followers & review health" to="/analytics">
          {analytics === undefined ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-zinc-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <AudienceSummary analytics={analytics} />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <SuggestedPost festival={dashboard?.upcomingFestivals?.[0]} />
          <InboxPreview pending={stats?.inboxPending ?? 0} />
        </div>
        <div className="space-y-4">
          <ComingUp festivals={dashboard?.upcomingFestivals} />
          <ConnectedAccounts />
        </div>
      </div>
    </PageCard>
  );
}
```

- [ ] **Step 7: Swap the dashboard in `App.tsx`**

In `apps/web/src/App.tsx`:
1. Delete everything from the line `// ─── Dashboard data ───…` down to the closing brace of `function Dashboard() { … }`, just above `function RequireAuth`. That removes:
   - `DashboardData`
   - `StatCard`
   - `SuggestedPostCard`
   - `InboxPreview`
   - `timeAgo` helpers
   - `ComingUpPanel`
   - `ConnectedPanel`
   - `Dashboard`
2. Add `import Dashboard from './pages/Dashboard';` with the other page imports. The existing `/` route already renders `<Dashboard />`.
3. Remove the imports that are now unused. Run `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` and delete whatever it reports as unused (`noUnusedLocals`), for example lucide icons, `NavLink`, `useState`, `useEffect` and `api`.

- [ ] **Step 8: Verify**

Run: `npm run build -w web && npm test -w web && cd apps/web && npx eslint src/pages/Dashboard.tsx src/components/dashboard src/services/dashboard.ts && npx eslint . | tail -1`
Expected:
- the build exits 0 and tests pass;
- no problems in the new files;
- the overall count is at most 78. It should drop by 3, because the removed App.tsx dashboard held three existing problems.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/services/dashboard.ts apps/web/src/components/dashboard apps/web/src/pages/Dashboard.tsx apps/web/src/App.tsx
git commit -m "feat(web): Dashboard with posting activity, pipeline, insights and widgets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Create sends posts for approval

**Files:**
- Modify: `apps/web/src/pages/CreatePost.tsx`

**Interfaces:**
- Consumes: `postService.create` and `postService.submitForApproval` (Task 9).

- [ ] **Step 1: State**

In `CreatePost.tsx`, change the `published` state (around line 37) to:

```ts
  const [published, setPublished] = useState<false | 'published' | 'scheduled' | 'approval'>(false);
  const [approvalShare, setApprovalShare] = useState<string | null>(null);
```

- [ ] **Step 2: Replace `handleSaveForApproval`**

Replace the whole function (and the comment above it) with:

```ts
  // Creates the post and sends it for approval: approvers are notified in the app, and the
  // author gets a review link to share (for approvers who don't use the app).
  const handleSaveForApproval = async () => {
    if (!variants) return;
    setIsPublishing(true);
    let savedId: string | null = null;
    try {
      const cap = selectedCaptionIdx !== null ? variants.captions[selectedCaptionIdx] : null;
      const cre = selectedCreativeIdx !== null ? variants.creatives[selectedCreativeIdx] : null;
      const { item } = await postService.create({
        promptText: prompt,
        captionText: caption,
        captionHashtags: cap?.hashtags ?? [],
        creativeUrls: (cre?.platform_urls as Record<string, string>) ?? {},
        platforms: selectedPlatforms,
      });
      savedId = item.id;
      const submitted = await postService.submitForApproval(item.id, selectedPlatforms);
      setApprovalShare(submitted.whatsappShare);
      setPublished('approval');
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Could not send for approval',
        message: savedId
          ? 'The post was saved to your drafts. Send it for approval from Posts.'
          : err instanceof Error && err.message ? err.message : 'Please try again.',
      });
    } finally {
      setIsPublishing(false);
    }
  };
```

- [ ] **Step 3: Success screens**

Directly above `// Success Screen`, add a shared reset:

```ts
  const startAnother = () => {
    setVariants(null);
    setPrompt('');
    setPublished(false);
    setApprovalShare(null);
    setElaboratedBrief(null);
    setUploadedImageUrl(null);
  };
```

Then replace the `if (published) { … }` success block with:

```tsx
  if (published === 'approval') {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-50">
        <div className="text-center bg-white border border-zinc-200 rounded-2xl p-10 shadow-sm max-w-md w-full mx-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-semibold text-zinc-900">Sent for approval</h3>
          <p className="text-zinc-500 text-sm mt-2">Your approver has been notified with the review link.</p>
          <div className="flex flex-wrap gap-3 mt-8 justify-center">
            <button onClick={startAnother} className="px-5 py-2.5 text-sm font-semibold text-zinc-700 border border-zinc-200 bg-white rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer">
              Create another
            </button>
            {approvalShare && (
              <a href={approvalShare} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 text-sm font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
                Share on WhatsApp
              </a>
            )}
            <NavLink to="/posts?status=pending_approval" className="px-5 py-2.5 text-sm font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10">
              Go to Posts
            </NavLink>
          </div>
        </div>
      </div>
    );
  }

  if (published) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white border border-slate-200 rounded-3xl p-10 shadow-xl max-w-md w-full mx-4">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-150 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600 animate-bounce" />
          </div>
          <h3 className="text-xl font-black text-slate-900">{published === 'scheduled' ? 'Post scheduled!' : 'Post sent for publishing!'}</h3>
          <p className="text-slate-500 text-sm mt-2">{published === 'scheduled' ? 'Scheduled for' : 'Queued to'}: {selectedPlatforms.join(', ')}</p>
          <div className="flex gap-3 mt-8 justify-center">
            <button
              onClick={startAnother}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 bg-white rounded-xl hover:bg-slate-55 transition-colors cursor-pointer"
            >
              Create Another
            </button>
            <NavLink to="/calendar" className="px-5 py-2.5 text-sm font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10">
              View Calendar
            </NavLink>
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Button label and permission notice**

In the publish panel:
- change the notice shown when `!canPublish` to: `You don't have permission to publish. Send the post for approval and your approver will be notified.`
- change the approval button's label from `Save for approval` to `Send for approval`.

- [ ] **Step 5: Verify**

Run: `npm run build -w web && cd apps/web && npx eslint src/pages/CreatePost.tsx | tail -1`
Expected: the build exits 0, and the eslint count for `CreatePost.tsx` is no higher than before this task (compare with `git stash`, or note the count before editing).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/CreatePost.tsx
git commit -m "feat(web): Create sends posts for approval and offers the review link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Verify, compare with the reference, ship

- [ ] **Step 1: Full gate**

From the repo root:
- `npm run build`
- `JWT_SECRET=dummy npm test`
- `cd apps/web && npx eslint . | tail -1`

Expected: the build is green, all tests pass, and lint shows ≤ 78 problems.

- [ ] **Step 2: Local end-to-end (controller)**

Use `.claude/launch.json`:
- `api-verify`: in-memory store, local-only JWT secret, no Gemini key.
- `web-local`.

Mint local-only tokens for a dealership admin and a `user`-role creator, with DealerUsers created through the demo login or seeded with a script against the running API. Check:
1. As the creator: create a draft, then **Send for approval** from Posts. The admin's bell shows "Approval requested", with a link to Posts → Approvals.
2. As the admin on Posts → Approvals: **Reject** with a reason. The creator's draft shows `Rejected: <reason>` and their bell shows "Post rejected". Resubmit, then **Approve**. The post appears in **Ready** and the toast copy matches.
3. Open the returned `approvalUrl` in a signed-out tab, then approve with a comment. Check the result screen. Reloading shows "This post has already been actioned."
4. Dashboard: the stat cards, the activity chart (hover tooltip, 7/14/30 toggle), the donut with Ready and In review, the empty Engagement state, Audience with a response rate, and the four lower widgets.
5. At 375px wide: the Posts rows, tabs (horizontal scroll), dialogs and Dashboard have no page-level horizontal scroll.

- [ ] **Step 3: Visual parity**

Compare Posts, Dashboard and the approval page with the product owner's screenshots of `social.smartdealer.ai`, at the same widths, in light mode. Fix differences or list them as intended (see "Deviations").

- [ ] **Step 4: PR, then deploy after the owner signs off**

- **Push and open the PR.** Use neutral wording (the repo is public). CI deploys a preview channel.
- **After the merge:**
  1. Deploy the API from a clean `git archive` of the merged `main`: `gcloud run deploy cardekho-api --source . --region asia-south1 --project gen-lang-client-0078524499 --quiet`. First check `gcloud builds list --ongoing`.
  2. Turn on the notification TTL policy (one-time):
     `gcloud firestore fields ttls update expires_at --collection-group=notifications --enable-ttl --project gen-lang-client-0078524499`
- **Smoke test:**
  - As a signed-out visitor, `GET /v1/publisher/approval/x` returns 404 `INVALID_LINK`.
  - `GET /v1/publisher/posts/counts` returns 401 without a token.
  - The live bundle contains "Nothing to approve" and "Your social presence at a glance."
