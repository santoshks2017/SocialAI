# Stage E1: Accounts and YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A dealership can connect several accounts per platform (Facebook Pages, Instagram accounts, Google Business Profile locations, YouTube channels), and each post publishes to the accounts it names, or to each platform's primary account.
- YouTube connects through real Google OAuth, and reels publish to it as Shorts.
- Port the reference Accounts page, with "Detect Instagram", Create Studio account chips, per-account publish results, and a notice when Google revokes access.

**Architecture:**
- **API: data model.**
  - `PlatformConnection`'s unique key becomes `[dealer_id, platform, platform_account_id]` (one row per account). `Post.connection_ids` names target accounts; `InboxMessage.connection_id` records the receiving account.
  - `lib/connections.ts` (pure): labels, the 30-account cap, primary account, target resolution.
  - `lib/connectionStore.ts`: saving accounts under the cap, reply account, revoked-token disconnect.
- **API: publishing.** `lib/publishResults.ts` (pure) keeps `publish_results[platform]` a per-platform summary and adds per-account detail under `accounts`. `lib/publishDirect.ts` publishes per account on the inline, cron and queue paths.
- **API: YouTube.** `services/youtube.ts` (Data API reads) and `lib/youtubeUpload.ts` (resumable Shorts upload). The existing Google redirect URI serves both Business Profile and YouTube.
- **API: connect flows.** The Meta callback saves every Page and each Page's linked Instagram account (`lib/instagramDiscovery.ts`, also behind `POST /v1/platforms/sync-instagram`). The Google callback saves every Business Profile location.
- **Web.**
  - `utils/connectPlatform.ts` is the one connect flow (full-page redirect, return path in `sessionStorage`). `pages/OAuthCallbackPage.tsx` shows the outcome and returns to the page that started it.
  - `utils/accounts.ts` + `components/accounts/*` + `pages/AccountsPage.tsx` port the reference Accounts page.
  - Create Studio gains account chips; the post detail lists per-account results.

**Tech Stack:**
- API: Fastify 5, Prisma 5 schema with the Firestore adapter (in-memory under `NODE_ENV=test`), axios, node:test via tsx.
- Web: React 19, react-router-dom 7, Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md`:
- §6 Accounts, Create ("Post to" chips, Reels allow YouTube).
- §7: `GET /platforms/connect/youtube`, `POST /platforms/sync-instagram`, notifications when a platform is found disconnected, YouTube notes.
- §8 Stage E (this is its first PR, E1; E2 covers Settings, Boost and Calendar).

**Design:** the Stage E design (owner answers of 2026-09-24: several accounts per platform; YouTube connect + Shorts). Its E1 decisions are restated in this plan; the section "Decisions and deviations" lists every refinement.

**Reference:** `~/Documents/Coder/social-ai-reference-2026-09-23/chunks/AccountsPage-*.js`. The classes and copy below were extracted from it. Never copy the bundle into this repo.

## Global Constraints

- **Look:**
  - Keep the reference's `orange-*` / `amber-*` / `zinc-*` / `emerald-*` classes; `index.css` remaps orange/amber to the coral brand and warm greys.
  - `h1`–`h3` render in the serif display font.
  - Each dealer page sits in `PageCard` (`max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6`).
- **Copy** from the reference is verbatim, including — … ’ → ·.
  - New code never contains these characters raw. Write them as `\uXXXX` escapes inside string literals (never as JSX text): — `\u2014`, … `\u2026`, ’ `\u2019`, → `\u2192`, · `\u00b7`.
  - Tasks with such copy say so (Tasks 9, 10 and 11). Run them with a model that keeps escapes intact (not Haiku). Their tests assert the escaped strings, and the task's byte check must print nothing: `git diff -U0 -- <files> | grep -nP '^\+.*[^\x00-\x7F]'`.
- **Nothing fabricated:** real data, or the reference's empty states. No sample numbers.
- **Mock ids and tokens:**
  - Local and demo connections carry `mock_` ids and tokens. Every real Meta, Google and YouTube call skips them quietly (`isMockId` / `isMockConnection` in `lib/platformMock.ts`, or the `mock_` checks inside `services/meta.ts` and `lib/youtubeUpload.ts`).
  - Meta credentials are still missing in production, so Facebook and Instagram stay dormant there; the UI shows the reference's empty states.
- **Keys and logs:**
  - Google AI keys go only in the `x-goog-api-key` header; a guard test (`test/no-key-in-url.test.ts`) forbids `key=` in URLs.
  - YouTube Data API and Google OAuth calls send `Authorization: Bearer <token>`. Meta Graph calls keep the `access_token` parameter like every existing Meta call; the axios redaction (`lib/httpErrorRedaction.ts`) strips it from logged errors.
  - Log `err instanceof Error ? err.message : String(err)`, never a raw error object. Code this plan touches in `routes/platform.ts`, `routes/platformAccounts.ts` and `services/autoReplyEngine.ts` switches to message-only logging.
- **Environment:**
  - Local API runs force the in-memory store (`FIRESTORE_MEMORY=true`); tests run with `NODE_ENV=test`.
  - `apps/api/.env` holds real `GOOGLE_CLIENT_ID` and `META_APP_ID` values, and dotenv loads it in tests. Route code reads the Google client from `process.env` per request; tests that depend on it set or delete it and restore it in `t.after` (or the file's `afterEach`).
- **API conventions:**
  - Existing string errors (`{ error: "…" }`) keep their shape.
  - New errors use `{ error: { code, message } }`: `ACCOUNT_LIMIT` (409), `NO_INSTAGRAM` (404), `INVALID_INPUT` (400).
  - `GET /v1/platform-accounts` keeps `success: true` beside `accounts`.
- **Permissions:**
  - Account and connect routes stay authenticate-only, as today and as in the reference (no plan gating on the Accounts page).
  - The `platforms` plan limit still applies when a connect adds a new platform. Publishing still needs `publish_post`.
- **Tests:**
  - A fresh worktree needs `cd apps/api && npx prisma generate` before any API test.
  - One API file: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`
  - Full API suite: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'`
  - Web: `npm test -w web`. It runs only `src/utils/**/*.test.ts`, and tests import siblings with a `.js` suffix; so do `utils/*.ts` files importing each other.
  - Stub HTTP the way existing tests do: `t.mock.method(axios, 'get' | 'post' | 'put' | 'delete', …)` and `t.mock.method(globalThis, 'fetch', …)`. Nothing in a test may reach a real provider.
  - API tsconfig is strict, with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type`). Web tsconfig has `noUnusedLocals`, `noUnusedParameters` and `erasableSyntaxOnly`, and excludes test files.
- **Build:** root `npm run build` type-checks `apps/api/test` too. Every task ends with it green.
- **After `schema.prisma` changes:** `cd apps/api && npx prisma generate`.
- **Web lint:** `cd apps/web && npx eslint . | tail -1` must stay ≤ **45** problems. It is 45 today; deleting `ConnectProfilesPage.tsx` (Task 10) makes it 44.
  - Set React state only in handlers, promise callbacks, timers or `useState` initialisers, never synchronously in an effect body.
  - No `Date.now()` / `new Date()` during render; take "now" from a `useState` initialiser or a handler.
  - Component files export only components (types are fine).
- **Commits:**
  - Every message ends with a blank line, then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model writes it.
  - Use neutral wording; the repo is public. No credentials anywhere.
  - Never commit `AGENTS.md`, `CLAUDE.md`, `memory/`, `.superpowers/` or `apps/web/dist/`.

## Decisions and deviations (intended)

Design decisions this plan implements as written: E1-1 … E1-10 and the shared contracts. Refinements, with the reason for each:

1. **Posts API field is `connectionIds`.** The design says `connection_ids` on "POST /posts and PUT /posts/:id". The real routes are `POST /v1/publisher` and `PATCH /v1/publisher/posts/:id`, and both take camelCase bodies (`captionHashtags`, `mediaType`). The stored field is `Post.connection_ids`.
2. **The notify-me event is flat.** `POST /v1/events` stores the body's top-level fields as meta and rejects a nested `meta` object. The web sends `{ action: 'platform.notify_requested', platform }` through `trackEvent`.
3. **Connect returns carry per-platform counts.** Besides `accounts=<n>`, callbacks add `fb`, `ig`, `google` and `youtube` counts (only when non-zero). The success toast can then read as the reference's: "Linked: 2 Facebook page(s), 1 Instagram account(s)". `{n} YouTube channel(s)` is our addition.
4. **Notify-me toast message.** The title stays "We’ll let you know". The reference's "You’ll get an email when … ships" becomes "Your interest in {label} is noted.", because nothing sends that email.
5. **The plan limit counts platforms, not accounts.** The `platforms` plan gate and billing's `platformsConnected` count distinct connected platforms. Otherwise a Starter dealer with two Pages could not add Google, and billing would show "3 of 2 platforms".
6. **Google Business callback errors.**
   - Zero locations shows the reference's `no_locations` copy. A failed location lookup shows its `gbp_error` copy.
   - Before, the callback redirected with success and saved nothing.
   - Locations are listed with the v4 API the rest of the code already uses (`accounts/{a}/locations/{l}` names).
7. **Meta page tokens.**
   - They come from one paginated `me/accounts?fields=id,name,access_token` call, not one `GET /{page}?fields=access_token` per Page.
   - Instagram discovery is one call with field expansion `instagram_business_account{id,username,name}`.
8. **YouTube `?mock=true`.** Outside production it uses the mock channel even when Google is configured, like Meta's `?mock=true`, so local end-to-end checks work.
9. **YouTube description** also drops `<` and `>`, which YouTube rejects in descriptions as well as titles.
10. **Failure text for several accounts** is `{account}: {error}; {account}: {error}`.
11. **Metrics and followers.**
    - A platform's metrics are replaced only when every account that has the post answered; otherwise the previous numbers stay, because a partial sum would read as a drop. Accounts disconnected since are skipped.
    - Follower snapshots sum the accounts that answered. As today, one failing account doesn't block the day.
12. **No popups or dev sandbox on Accounts.** The reference Accounts page uses full-page redirects for YouTube. The popup flow and the dev "Sandbox / Mock Mode" toggle go; local checks connect mock accounts with `curl …/connect/<platform>?mock=true`, as in Stage D.
13. **Accounts library details.**
    - The platform filter adds YouTube; the reference lacked it, but YouTube is live here.
    - Account ids get "…" only when cut.
    - Cards use our `PlatformIcon`; the reference used placeholder icons.
14. **Onboarding.**
    - Step 2's Facebook and Google rows connect through the shared helper. Returning from OAuth reopens step 2 (`sessionStorage['onboarding_resume_step']`).
    - The Instagram row shows "via Facebook", as in the reference's Connect Profiles.
15. **Create Studio account chips** appear only when a selected platform has two or more connected accounts. `connectionIds` is the chosen ids for those platforms; single-account platforms use their primary on the server.
16. **Queue path.**
    - Platforms that can't be targeted are reported in `skipped_platforms`, as before.
    - Unsupported media (a video to Google, an image to YouTube) is still queued, so the worker records the failure.
    - Jobs queued before this change carry no `connection_id` and go to the primary account.
17. **SocialConnection** keeps its model and data; nothing writes or updates it any more.
18. **Twitter mock connect** stays (non-production) with the new key; X / Twitter shows as "Coming soon" on the page.
19. **Revoked Google access.** Only `invalid_grant` from Google's token endpoint disconnects an account. A missing refresh token or another failure does not.
20. **Where per-account results show.** The post detail lists per-account rows under each platform. Posts list rows keep one "View" link (the primary account's post), and publish toasts name the accounts that failed.
21. **Inbox email samples** (`POST /v1/inbox/mock/seed`) have no platform account, so their `connection_id` stays null. The reply path falls back to the primary account anyway, and email never needs one.

## File Map

**API** (paths under `apps/api/`)
- Create:
  - `src/lib/connections.ts`, `src/lib/connectionStore.ts`
  - `src/lib/publishResults.ts`
  - `src/lib/instagramDiscovery.ts`
  - `src/services/youtube.ts`, `src/lib/youtubeUpload.ts`
- Modify:
  - `prisma/schema.prisma`: `PlatformConnection` unique key, `Post.connection_ids`, `InboxMessage.connection_id`.
  - `src/plugins/planGate.ts`, `src/routes/billing.ts`: distinct platforms.
  - `src/routes/platformAccounts.ts`: list contract, cap, no SocialConnection writes.
  - `src/services/platformConnections.ts`: `saveAccount` through `saveConnection`.
  - `src/routes/platform.ts`: callbacks save every account, `sync-instagram`, YouTube OAuth.
  - `src/services/meta.ts` (`fetchManagedPages`), `src/services/gmb.ts` (`fetchGmbLocations`).
  - `src/lib/publishDirect.ts`, `src/queues/index.ts`, `src/routes/publisher.ts`: per-account publishing, `connectionIds`.
  - `src/lib/inboxIngest.ts`, `src/routes/inbox.ts`, `src/lib/gmbReviewSync.ts`, `src/services/autoReplyEngine.ts`: receiving account and reply account.
  - `src/lib/postMetrics.ts`, `src/lib/metricsSync.ts`, `src/lib/followerSync.ts`: per-account sums, YouTube.
  - `src/lib/googleToken.ts`: YouTube wording, revoked access.
  - `src/lib/events.ts`: `platform.notify_requested`.
- Tests (create): `connections`, `platform-connect`, `publish-accounts`, `publisher-accounts`, `youtube-connect`, `youtube-upload`, `inbox-accounts`, `metrics-accounts`, `google-token`.
- Tests (modify): `firestore-semantics.test.ts` (compound key), `security-routes.test.ts` (YouTube in production), `events.test.ts` (new action).

**Web** (paths under `apps/web/`)
- Create:
  - `src/utils/connectPlatform.ts` (+ `connectPlatform.test.ts`)
  - `src/utils/accounts.ts` (+ `accounts.test.ts`)
  - `src/services/accounts.ts`
  - `src/components/accounts/{AccountPills,PlatformCard,AccountLibrary,DisconnectModal}.tsx`
- Modify:
  - `src/pages/OAuthCallbackPage.tsx` (rewritten), `src/pages/Onboarding.tsx`, `src/App.tsx`
  - `src/pages/AccountsPage.tsx` (rewritten), `src/components/dashboard/Widgets.tsx`, `src/services/events.ts`
  - `src/utils/createStudio.ts` (+ test), `src/services/createStudio.ts`, `src/services/creative.ts`, `src/components/create/EditorSections.tsx`, `src/pages/CreateStudio.tsx`
  - `src/utils/posts.ts` (+ test), `src/utils/publishResult.ts` (+ test), `src/components/posts/PostDialogs.tsx`
- Delete (Task 10): `src/pages/ConnectProfilesPage.tsx`.

### Contracts E2 builds on (pinned)

- `GET /v1/platform-accounts` → `{ success: true, accounts: [{ id, platform, accountName, accountId, tokenExpiry, createdAt }] }`.
  - `platform` is `facebook | instagram | google | youtube` (stored `gmb` maps to `google`).
  - One row per connected account, so several rows can share a platform. `tokenExpiry` and `createdAt` are ISO strings (`tokenExpiry` may be null).
- `DELETE /v1/platform-accounts/:id` soft-disconnects one account.
- `GET /v1/platforms/connect/:platform` → `{ redirect_url }` for `facebook | gmb | youtube` (and `instagram`, which shares the Meta flow).
- `apps/web/src/utils/connectPlatform.ts` exports:
  - `type OAuthReturnPath = '/accounts' | '/onboarding' | '/settings?tab=platforms'`
  - `const OAUTH_RETURN_KEY = 'oauth_return_to'`
  - `function readOAuthReturn(): OAuthReturnPath`: whitelisted; defaults to `/accounts`; clears the key.
  - `async function startConnect(platform: 'facebook' | 'gmb' | 'youtube', returnTo: OAuthReturnPath): Promise<void>`: GET `/platforms/connect/:platform`, store the return path, then `window.location.href = redirect_url`. It throws on failure so the caller can toast.
- OAuth return query (`/oauth/callback`):
  - success: `success=1&platform=<p>&page_name=<first account>&accounts=<n>` plus non-zero `fb`, `ig`, `google`, `youtube`;
  - failure: `error=<message or code>&platform=<p>`.

### Cross-task interface table (pre-flight)

| Produced name | Where | Task | Consumed by |
|---|---|---|---|
| `PlatformConnection @@unique([dealer_id, platform, platform_account_id])` (selector `dealer_id_platform_platform_account_id`), `Post.connection_ids: string[]`, `InboxMessage.connection_id: string \| null` | schema | 1 | 1, 3, 4, 7, 12 |
| `MAX_CONNECTED_ACCOUNTS`, `ACCOUNT_LIMIT_MESSAGE`, `ACCOUNT_PLATFORMS`, `platformLabel`, `ConnectionRef`, `byAge`, `primaryConnection`, `noConnectedAccountMessage`, `selectedAccountGoneMessage`, `TargetPost`, `PlatformTargets`, `resolveTargets` | `lib/connections.ts` | 1 | 2, 3, 4, 5, 7, 8, 9 |
| `CONNECTION_IDS_MESSAGE`, `parseConnectionIds` | `lib/connections.ts` | 4 | 4 |
| `ConnectionInput`, `SaveOutcome`, `saveConnections`, `saveConnection`, `connectedPlatformCount` | `lib/connectionStore.ts` | 1 | 1, 2, 5 |
| `ownConnectionIds` | `lib/connectionStore.ts` | 4 | 4 |
| `replyConnection` | `lib/connectionStore.ts` | 7 | 7 |
| `disconnectRevokedConnection` | `lib/connectionStore.ts` | 9 | 9 |
| HTTP `GET/POST/DELETE /v1/platform-accounts` (contract above; POST 409 `ACCOUNT_LIMIT`) | `routes/platformAccounts.ts` | 1 | 11, 12, E2 |
| `ManagedPage`, `fetchManagedPages(userAccessToken, max)` | `services/meta.ts` | 2 | 2 |
| `GmbLocation`, `fetchGmbLocations(accessToken, max)` | `services/gmb.ts` | 2 | 2 |
| `InstagramAccount`, `MOCK_INSTAGRAM`, `discoverInstagram(pageId, pageToken)`, `instagramConnection(ig, pageToken, expiresAt)` | `lib/instagramDiscovery.ts` | 2 | 2 |
| `googleClient()`, `exchangeGoogleCode(code)`, `savedCountQuery(saved)` (module-private) | `routes/platform.ts` | 2 | 5 |
| HTTP callbacks save every account, return query (above); `POST /v1/platforms/sync-instagram` → `{ found, accountName }` / 404 `NO_INSTAGRAM` / 409 `ACCOUNT_LIMIT` | `routes/platform.ts` | 2 | 10, 11 |
| `AccountSuccess`, `AccountFailure`, `AccountEntry`, `PlatformSummary`, `AccountOutcome`, `PlatformPublishResult`, `PostRef`, `isSuccessfulResult`, `accountEntries`, `isLegacySuccess`, `storedOutcome`, `mergePlatformResult`, `toPlatformResult`, `outcomeLabels`, `successfulPostRefs` | `lib/publishResults.ts` | 3 | 3, 4, 7, 8 |
| `PublishPlatform`, `PublishDirectData` (+ `connection_id`, `caption_text`, `hashtags`), `PublishablePost` (+ `connection_ids`), `YOUTUBE_VIDEO_ONLY`, `GMB_NO_VIDEO`, `unsupportedMediaError`, `resolveAccessToken` (YouTube too), `buildPublishData`, `publishPost`, `publishPostToPlatform`; re-exports `platformLabel`, `isSuccessfulResult`, type `PlatformPublishResult` | `lib/publishDirect.ts` | 3 | 4, 6, 7, 8 |
| `PublishJob`, `publishJobs(post, platforms, connections)` | `lib/publishDirect.ts` | 4 | 4 |
| `PublishJobData = PublishDirectData` | `queues/index.ts` | 3 | 4 |
| HTTP `POST /v1/publisher` and `PATCH /v1/publisher/posts/:id` accept `connectionIds`; posts return `connection_ids`; publish `results[].accounts` | `routes/publisher.ts` | 4 | 12, 13 |
| `YOUTUBE_API_BASE`, `YOUTUBE_SCOPES`, `NO_YOUTUBE_CHANNEL`, `bearer`, `youtubeCount`, `YouTubeChannel`, `fetchYouTubeChannels` | `services/youtube.ts` | 5 | 5, 6, 8 |
| `fetchYouTubeVideoMetrics`, `fetchYouTubeSubscribers` | `services/youtube.ts` | 8 | 8 |
| `SHORTS_TAG`, `YOUTUBE_LIMIT_MESSAGE`, `YOUTUBE_EXPIRED_MESSAGE`, `shortsTitle`, `shortsDescription`, `shortsTags`, `shortsMetadata`, `youtubeErrorMessage`, `reelSource`, `ShortUpload`, `uploadShort` | `lib/youtubeUpload.ts` | 6 | 6 |
| `InboxIngestInput.connection_id` | `lib/inboxIngest.ts` | 7 | 7 |
| `METRIC_PLATFORMS` gains `youtube`; `addMetrics` | `lib/postMetrics.ts`, `lib/metricsSync.ts` | 8 | 8 |
| `GoogleTokenConnection.platform?` | `lib/googleToken.ts` | 9 | 9 |
| `EVENT_ACTIONS` gains `platform.notify_requested`; web `TrackedAction` too | `lib/events.ts`, `services/events.ts` | 11 | 11 |
| `OAuthReturnPath`, `ConnectPlatform`, `OAUTH_RETURN_KEY`, `parseOAuthReturn`, `readOAuthReturn`, `startConnect`, `OAuthToast`, `oauthToast` | `utils/connectPlatform.ts` | 10 | 10, 11, E2 |
| `ConnectedAccount`, `CatalogueId`, `CatalogueStatus`, `CatalogueEntry`, `CATALOGUE`, `MAX_ACCOUNTS`, `LIVE_CHANNELS`, `STATUS_LABELS`, `INSTAGRAM_NEEDS_FACEBOOK`, `SEARCH_PLACEHOLDER`, `NOTIFY_LABEL`, `TokenHealth`, `TOKEN_WARN_MS`, `sortedCatalogue`, `tokenHealth`, `accountsFor`, `CardAction`, `cardAction`, `needsFacebookFirst`, `PlatformFilter`, `FILTER_OPTIONS`, `filterAccounts`, `shortAccountId`, `connectedDate`, `accountPlatformName`, `libraryCountText`, `notifyToast`, `syncInstagramToast` | `utils/accounts.ts` | 11 | 11, 12 |
| `accountsService.list()`, `.remove(id)`, `.syncInstagram()` | `services/accounts.ts` | 11 | 11, 12 |
| `StatPill`, `StatusPill`, `TokenPill`, `ActivePill`, `PlatformGlyph`, `PlatformCard`, `AccountLibrary`, `DisconnectModal` | `components/accounts/*` | 11 | 11 |
| `PlatformOption`, `YOUTUBE_VIDEO_ONLY_HINT`, `platformOptions` (disabled YouTube for images), `defaultPlatforms`, `StudioAccount`, `postPlatform`, `connectedPlatformIds`, `platformAccounts`, `accountSelection`, `toggleAccount`, `selectedConnectionIds` | `utils/createStudio.ts` | 12 | 12 |
| `Post.connection_ids`, `postService.create/update` `connectionIds` | `services/creative.ts` | 12 | 12 |
| `AccountResult`, `PlatformResult`, `platformResults` (with `accounts`) | `utils/posts.ts` | 13 | 13 |
| `PublishAccountResult`, `PublishPlatformResult.accounts`, `platformName('youtube')` | `utils/publishResult.ts` | 13 | 13 |

---

### Task 1: Several accounts per platform — schema, connection helpers and the account list

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `PlatformConnection`, `Post`, `InboxMessage`)
- Create: `apps/api/src/lib/connections.ts`, `apps/api/src/lib/connectionStore.ts`
- Modify: `apps/api/src/routes/platformAccounts.ts` (rewritten), `apps/api/src/services/platformConnections.ts`, `apps/api/src/plugins/planGate.ts`, `apps/api/src/routes/billing.ts`
- Modify test: `apps/api/test/firestore-semantics.test.ts` (the undefined-selector check uses the new key)
- Test: `apps/api/test/connections.test.ts`

**Interfaces:**
- Consumes: the Firestore adapter. A compound unique selector `{ <a>_<b>_<c>: { a, b, c } }` is an equality lookup (`findTarget` in `src/db/firestore.ts`); uniqueness itself is not enforced on create, so every save goes through `saveConnections`.
- Produces:
  - Schema:
    - `PlatformConnection @@unique([dealer_id, platform, platform_account_id])`, selector `dealer_id_platform_platform_account_id`
    - `Post.connection_ids: string[]` (default `[]`)
    - `InboxMessage.connection_id: string | null`
  - `lib/connections.ts`:
    - constants `MAX_CONNECTED_ACCOUNTS = 30`, `ACCOUNT_LIMIT_MESSAGE`, `ACCOUNT_PLATFORMS`
    - `platformLabel(platform): string`
    - `type ConnectionRef = Pick<PlatformConnection, 'id' | 'platform' | 'is_connected' | 'created_at'>`
    - `byAge(a, b): number`, `primaryConnection<T extends ConnectionRef>(conns, platform): T | null`
    - `noConnectedAccountMessage(platform)`, `selectedAccountGoneMessage(platform)`
    - `interface TargetPost { platforms; connection_ids? }`, `interface PlatformTargets<T> { platform; targets: T[]; error: string | null }`
    - `resolveTargets<T extends ConnectionRef>(post: TargetPost, conns: readonly T[]): PlatformTargets<T>[]`
  - `lib/connectionStore.ts`:
    - `interface ConnectionInput { platform; platform_account_id; platform_account_name; access_token; refresh_token?; token_expires_at }`
    - `type SaveOutcome = { status: 'saved'; connection } | { status: 'limit' }`
    - `saveConnections(dealerId, inputs): Promise<{ saved: PlatformConnection[]; limitReached: boolean }>`
    - `saveConnection(dealerId, input): Promise<SaveOutcome>`
    - `connectedPlatformCount(dealerId): Promise<number>`
  - HTTP:
    - `GET /v1/platform-accounts`: the pinned contract, four platforms only.
    - `POST /v1/platform-accounts`: one row per account; 409 `ACCOUNT_LIMIT` at 30 connected.
    - `DELETE /v1/platform-accounts/:id`: that account only.
    - The `platforms` plan gate and `GET /v1/billing/status` `platformsConnected` count distinct platforms.

- [ ] **Step 1: Schema.** In `apps/api/prisma/schema.prisma`:

(a) In `model PlatformConnection`, replace `  @@unique([dealer_id, platform])` with:

```prisma
  // One row per connected account: a dealership may connect several accounts per platform.
  @@unique([dealer_id, platform, platform_account_id])
```

(b) In `model Post`, after `  platforms              String[]` add:

```prisma
  connection_ids         String[] @default([]) // PlatformConnection ids this post targets; none named = each platform's primary account
```

(c) In `model InboxMessage`, after `  post_id              String?` add:

```prisma
  connection_id        String?   // PlatformConnection that received it (webhook, review sync); null for email samples and older messages
```

Leave `model SocialConnection` as it is: its data stays, and nothing writes it after Task 2.

Run: `cd apps/api && npx prisma generate`

- [ ] **Step 2: Write the failing test** — `apps/api/test/connections.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { ACCOUNT_LIMIT_MESSAGE, MAX_CONNECTED_ACCOUNTS, byAge, platformLabel, primaryConnection, resolveTargets } from '../src/lib/connections.js';
import { connectedPlatformCount, saveConnection, saveConnections } from '../src/lib/connectionStore.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(plan = 'growth'): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Accounts Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const connect = (dealerId: string, platform: string, accountId: string, extra: Record<string, unknown> = {}) =>
  prisma.platformConnection.create({
    data: { dealer_id: dealerId, platform, platform_account_id: accountId, platform_account_name: accountId, access_token: `mock_${accountId}`, is_connected: true, ...extra },
  });

const row = (id: string, platform: string, created: string, is_connected = true) => ({ id, platform, is_connected, created_at: new Date(created) });

describe('primary account and publish targets', () => {
  const conns = [
    row('b', 'facebook', '2026-09-02T00:00:00Z'),
    row('a', 'facebook', '2026-09-02T00:00:00Z'),
    row('old', 'facebook', '2026-09-01T00:00:00Z', false),
    row('ig', 'instagram', '2026-09-03T00:00:00Z'),
    row('gone', 'instagram', '2026-09-01T00:00:00Z', false),
  ];

  it('orders by age, ties by id, and takes the oldest connected row as primary', () => {
    assert.deepEqual([...conns].sort(byAge).map((c) => c.id), ['gone', 'old', 'a', 'b', 'ig']);
    assert.equal(primaryConnection(conns, 'facebook')?.id, 'a');
    assert.equal(primaryConnection(conns, 'gmb'), null);
  });

  it('sends a post to the accounts it names, else to the primary', () => {
    const [fb, ig] = resolveTargets({ platforms: ['facebook', 'instagram'], connection_ids: ['b'] }, conns);
    assert.deepEqual([fb?.targets.map((c) => c.id), fb?.error], [['b'], null]);
    assert.deepEqual([ig?.targets.map((c) => c.id), ig?.error], [['ig'], null]);
    const [legacy] = resolveTargets({ platforms: ['facebook'] }, conns);
    assert.deepEqual(legacy?.targets.map((c) => c.id), ['a']);
  });

  it('keeps several named accounts in age order and drops disconnected ones', () => {
    const [fb] = resolveTargets({ platforms: ['facebook'], connection_ids: ['b', 'old', 'a'] }, conns);
    assert.deepEqual(fb?.targets.map((c) => c.id), ['a', 'b']);
  });

  it('fails a platform whose named accounts are all gone, or that has none', () => {
    const [ig, gmb] = resolveTargets({ platforms: ['instagram', 'gmb'], connection_ids: ['gone'] }, conns);
    assert.deepEqual(ig?.targets, []);
    assert.equal(ig?.error, 'The selected Instagram account is no longer connected. Reconnect it or pick another account, then publish again.');
    assert.equal(gmb?.error, 'No connected Google Business Profile account. Connect it in Settings, then publish again.');
    assert.equal(platformLabel('youtube'), 'YouTube');
  });
});

describe('saving accounts', () => {
  const page = (id: string, token: string) => ({
    platform: 'facebook', platform_account_id: id, platform_account_name: `Page ${id}`, access_token: token, token_expires_at: null,
  });

  it('adds one row per account and brings a disconnected one back', async () => {
    const dealerId = await newDealer();
    const first = await saveConnections(dealerId, [page('p1', 't1'), page('p2', 't2'), page('p1', 'duplicate')]);
    assert.deepEqual([first.saved.length, first.limitReached], [2, false]);

    const p1 = first.saved[0]!;
    await prisma.platformConnection.update({ where: { id: p1.id }, data: { is_connected: false } });
    assert.equal((await saveConnection(dealerId, page('p1', 't1b'))).status, 'saved');

    const stored = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.equal(stored.length, 2);
    const back = stored.find((c) => c.id === p1.id);
    assert.deepEqual([back?.is_connected, back?.access_token], [true, 't1b']);
  });

  it('keeps the stored refresh token unless a new one arrives', async () => {
    const dealerId = await newDealer();
    const channel = { platform: 'youtube', platform_account_id: 'UC1', platform_account_name: 'Channel', token_expires_at: null };
    await saveConnection(dealerId, { ...channel, access_token: 'a1', refresh_token: 'r1' });
    await saveConnection(dealerId, { ...channel, access_token: 'a2' });
    const [conn] = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual([conn?.access_token, conn?.refresh_token], ['a2', 'r1']);
  });

  it('stops adding at 30 connected accounts but still refreshes connected ones', async () => {
    const dealerId = await newDealer();
    for (let i = 0; i < MAX_CONNECTED_ACCOUNTS - 1; i++) await connect(dealerId, 'gmb', `accounts/1/locations/${i}`);

    const result = await saveConnections(dealerId, [page('p1', 't1'), page('p2', 't2')]);

    assert.deepEqual([result.saved.map((c) => c.platform_account_id), result.limitReached], [['p1'], true]);
    assert.equal((await saveConnection(dealerId, page('p1', 't1-again'))).status, 'saved');
    assert.equal((await saveConnection(dealerId, page('p3', 't3'))).status, 'limit');
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId, is_connected: true } }), MAX_CONNECTED_ACCOUNTS);
  });

  it('counts connected platforms, not accounts', async () => {
    const dealerId = await newDealer();
    await connect(dealerId, 'gmb', 'accounts/1/locations/1');
    await connect(dealerId, 'gmb', 'accounts/1/locations/2');
    await connect(dealerId, 'facebook', 'p-off', { is_connected: false });
    assert.equal(await connectedPlatformCount(dealerId), 1);
  });
});

describe('platform plan limit', () => {
  const connectFacebook = (dealerId: string) =>
    fastify.inject({ method: 'GET', url: '/v1/platforms/connect/facebook?mock=true', headers: headers(dealerId) });

  it('lets a Starter dealer with two locations of one platform add a second platform', async () => {
    const dealerId = await newDealer('starter');
    await connect(dealerId, 'gmb', 'accounts/1/locations/1');
    await connect(dealerId, 'gmb', 'accounts/1/locations/2');
    assert.equal((await connectFacebook(dealerId)).statusCode, 200);
  });

  it('still stops a Starter dealer at two platforms', async () => {
    const dealerId = await newDealer('starter');
    await connect(dealerId, 'gmb', 'accounts/2/locations/1');
    await connect(dealerId, 'youtube', 'UC-limit');
    const res = await connectFacebook(dealerId);
    assert.equal(res.statusCode, 403);
    assert.equal((res.json() as { error: { code: string } }).error.code, 'PLAN_LIMIT_REACHED');
  });
});

describe('/v1/platform-accounts', () => {
  it('lists one row per connected account on the four platforms', async () => {
    const dealerId = await newDealer();
    const pageA = await connect(dealerId, 'facebook', 'mock_page_a');
    await connect(dealerId, 'facebook', 'mock_page_b');
    await connect(dealerId, 'gmb', 'accounts/9/locations/1');
    await connect(dealerId, 'youtube', 'mock_UC1');
    await connect(dealerId, 'twitter', 'mock_tw');
    await connect(dealerId, 'instagram', 'mock_ig_old', { is_connected: false });

    const res = await fastify.inject({ method: 'GET', url: '/v1/platform-accounts', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const { accounts } = res.json() as { accounts: Array<Record<string, unknown>> };
    assert.deepEqual(accounts.map((a) => a['platform']).sort(), ['facebook', 'facebook', 'google', 'youtube']);
    const a = accounts.find((x) => x['id'] === pageA.id)!;
    assert.deepEqual(Object.keys(a).sort(), ['accountId', 'accountName', 'createdAt', 'id', 'platform', 'tokenExpiry']);
    assert.deepEqual([a['accountId'], a['accountName'], a['tokenExpiry']], ['mock_page_a', 'mock_page_a', null]);
    assert.equal(a['createdAt'], pageA.created_at.toISOString());

    const google = await fastify.inject({ method: 'GET', url: '/v1/platform-accounts?platform=google', headers: headers(dealerId) });
    assert.deepEqual((google.json() as { accounts: Array<{ platform: string }> }).accounts.map((x) => x.platform), ['google']);
  });

  it('saves a second account of a platform and refuses the 31st', async () => {
    const dealerId = await newDealer();
    const save = (accountId: string) => fastify.inject({
      method: 'POST', url: '/v1/platform-accounts', headers: headers(dealerId),
      payload: { platform: 'google', accountId, accountName: `Location ${accountId}`, accessToken: 'ya29.x' },
    });
    assert.equal((await save('accounts/1/locations/1')).statusCode, 200);
    assert.equal((await save('accounts/1/locations/2')).statusCode, 200);
    assert.equal((await save('accounts/1/locations/2')).statusCode, 200);
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId, platform: 'gmb' } }), 2);

    for (let i = 3; i <= MAX_CONNECTED_ACCOUNTS; i++) await connect(dealerId, 'youtube', `mock_UC${i}`);
    const refused = await save('accounts/1/locations/99');
    assert.equal(refused.statusCode, 409);
    assert.deepEqual((refused.json() as { error: unknown }).error, { code: 'ACCOUNT_LIMIT', message: ACCOUNT_LIMIT_MESSAGE });
  });

  it('disconnects one account and leaves the others', async (t) => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', 'mock_page_c');
    const b = await connect(dealerId, 'facebook', 'mock_page_d');
    const del = t.mock.method(axios, 'delete', async () => ({ data: {} }));

    const res = await fastify.inject({ method: 'DELETE', url: `/v1/platform-accounts/${a.id}`, headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: a.id } }))?.is_connected, false);
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: b.id } }))?.is_connected, true);
    assert.equal(del.mock.callCount(), 0); // mock Pages have no webhook subscription to remove
    assert.equal(await prisma.socialConnection.count({ where: { dealer_id: dealerId } }), 0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/connections.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/connections.js'`).

- [ ] **Step 4: `apps/api/src/lib/connections.ts`**

```ts
import type { PlatformConnection } from '../generated/client/index.js';

// A dealership can connect several accounts per platform: Facebook Pages, Instagram accounts, Google Business
// Profile locations (stored as `gmb`) and YouTube channels. A platform's primary account is its oldest connected
// row. A post goes to the accounts it names in Post.connection_ids, otherwise to each platform's primary.

export const MAX_CONNECTED_ACCOUNTS = 30;
export const ACCOUNT_LIMIT_MESSAGE = `Account limit reached (${MAX_CONNECTED_ACCOUNTS}). Disconnect an account to add another.`;

/** Platforms GET /v1/platform-accounts lists; stored `gmb` is shown as `google`. */
export const ACCOUNT_PLATFORMS: readonly string[] = ['facebook', 'instagram', 'gmb', 'youtube'];

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  gmb: 'Google Business Profile',
  youtube: 'YouTube',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export type ConnectionRef = Pick<PlatformConnection, 'id' | 'platform' | 'is_connected' | 'created_at'>;

/** Oldest first; a tie goes to the smaller id. */
export function byAge(a: Pick<ConnectionRef, 'id' | 'created_at'>, b: Pick<ConnectionRef, 'id' | 'created_at'>): number {
  const diff = a.created_at.getTime() - b.created_at.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The platform's primary account: its oldest connected row. */
export function primaryConnection<T extends ConnectionRef>(conns: readonly T[], platform: string): T | null {
  return conns.filter((c) => c.platform === platform && c.is_connected).sort(byAge)[0] ?? null;
}

export function noConnectedAccountMessage(platform: string): string {
  return `No connected ${platformLabel(platform)} account. Connect it in Settings, then publish again.`;
}

export function selectedAccountGoneMessage(platform: string): string {
  return `The selected ${platformLabel(platform)} account is no longer connected. Reconnect it or pick another account, then publish again.`;
}

export interface TargetPost {
  platforms: readonly string[];
  connection_ids?: readonly string[] | null | undefined;
}

export interface PlatformTargets<T> {
  platform: string;
  /** Connected accounts to publish to, oldest first. Empty when `error` is set. */
  targets: T[];
  error: string | null;
}

/**
 * Where each platform of a post goes. `conns` are all of the dealership's rows, connected or not.
 * - The post names accounts of this platform: those still connected; none left is an error.
 * - It names none: the primary account; no connected account is the "No connected ... account" error.
 */
export function resolveTargets<T extends ConnectionRef>(post: TargetPost, conns: readonly T[]): Array<PlatformTargets<T>> {
  const named = new Set(post.connection_ids ?? []);
  return post.platforms.map((platform) => {
    const chosen = conns.filter((c) => c.platform === platform && named.has(c.id));
    if (chosen.length > 0) {
      const live = chosen.filter((c) => c.is_connected).sort(byAge);
      return live.length > 0
        ? { platform, targets: live, error: null }
        : { platform, targets: [], error: selectedAccountGoneMessage(platform) };
    }
    const primary = primaryConnection(conns, platform);
    return primary
      ? { platform, targets: [primary], error: null }
      : { platform, targets: [], error: noConnectedAccountMessage(platform) };
  });
}
```

- [ ] **Step 5: `apps/api/src/lib/connectionStore.ts`**

```ts
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { MAX_CONNECTED_ACCOUNTS } from './connections.js';

export interface ConnectionInput {
  platform: string;
  platform_account_id: string;
  platform_account_name: string | null;
  access_token: string;
  /** undefined keeps the stored refresh token (Google leaves it out on a reconnect); null clears it. */
  refresh_token?: string | null | undefined;
  token_expires_at: Date | null;
}

export type SaveOutcome = { status: 'saved'; connection: PlatformConnection } | { status: 'limit' };

function findAccount(dealerId: string, input: Pick<ConnectionInput, 'platform' | 'platform_account_id'>) {
  return prisma.platformConnection.findUnique({
    where: {
      dealer_id_platform_platform_account_id: {
        dealer_id: dealerId,
        platform: input.platform,
        platform_account_id: input.platform_account_id,
      },
    },
  });
}

async function writeAccount(dealerId: string, input: ConnectionInput, existing: PlatformConnection | null): Promise<PlatformConnection> {
  const data = {
    platform_account_name: input.platform_account_name,
    access_token: input.access_token,
    token_expires_at: input.token_expires_at,
    is_connected: true,
    ...(input.refresh_token !== undefined ? { refresh_token: input.refresh_token } : {}),
  };
  if (existing) return prisma.platformConnection.update({ where: { id: existing.id }, data });
  return prisma.platformConnection.create({
    data: {
      dealer_id: dealerId,
      platform: input.platform,
      platform_account_id: input.platform_account_id,
      ...data,
      refresh_token: input.refresh_token ?? null,
    },
  });
}

/**
 * Saves the accounts a connect flow returned, one row per account. An account that is already connected is
 * always refreshed. A new one, or one the dealer disconnected, is added only while the dealership has fewer
 * than MAX_CONNECTED_ACCOUNTS connected accounts; `limitReached` says some were left out.
 */
export async function saveConnections(
  dealerId: string,
  inputs: readonly ConnectionInput[],
): Promise<{ saved: PlatformConnection[]; limitReached: boolean }> {
  let connected = await prisma.platformConnection.count({ where: { dealer_id: dealerId, is_connected: true } });
  const saved: PlatformConnection[] = [];
  const seen = new Set<string>();
  let limitReached = false;
  for (const input of inputs) {
    const key = `${input.platform}:${input.platform_account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await findAccount(dealerId, input);
    const adds = !existing?.is_connected;
    if (adds && connected >= MAX_CONNECTED_ACCOUNTS) {
      limitReached = true;
      continue;
    }
    saved.push(await writeAccount(dealerId, input, existing));
    if (adds) connected++;
  }
  return { saved, limitReached };
}

export async function saveConnection(dealerId: string, input: ConnectionInput): Promise<SaveOutcome> {
  const { saved } = await saveConnections(dealerId, [input]);
  const [connection] = saved;
  return connection ? { status: 'saved', connection } : { status: 'limit' };
}

/** Distinct platforms with a connected account: Google Business Profile counts once, however many locations. */
export async function connectedPlatformCount(dealerId: string): Promise<number> {
  const rows = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, is_connected: true } });
  return new Set(rows.map((r) => r.platform)).size;
}
```

- [ ] **Step 6: `apps/api/src/routes/platformAccounts.ts`** — replace the whole file:

```ts
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { clearMetaPageSelection, resolveMetaAccount } from '../lib/oauthHandoff.js';
import { ACCOUNT_LIMIT_MESSAGE, ACCOUNT_PLATFORMS } from '../lib/connections.js';
import { saveConnection } from '../lib/connectionStore.js';
import { isMockConnection } from '../lib/platformMock.js';

const VALID_PLATFORMS = new Set([
  'facebook', 'instagram', 'google', 'gmb',
  'twitter', 'linkedin', 'youtube', 'tiktok',
  'pinterest', 'discord', 'slack',
]);

// Graph API answers that mean a Meta token is dead: code 190, or subcodes 460, 463 and 467.
const DEAD_TOKEN_SUBCODES = new Set([460, 463, 467]);
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface SaveAccountBody {
  platform?: string;
  accountId?: string;
  accountName?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
}

// The shape the web reads (Accounts page, Create Studio, Settings): one row per connected account.
function toAccount(conn: PlatformConnection) {
  return {
    id: conn.id,
    platform: conn.platform === 'gmb' ? 'google' : conn.platform,
    accountName: conn.platform_account_name ?? 'Connected Page',
    accountId: conn.platform_account_id,
    tokenExpiry: conn.token_expires_at ? conn.token_expires_at.toISOString() : null,
    createdAt: conn.created_at.toISOString(),
  };
}

export default async function platformAccountRoutes(fastify: FastifyInstance) {
  // GET /v1/platform-accounts: the dealer's connected accounts on Facebook, Instagram, Google and YouTube
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { platform } = request.query as { platform?: string };

    if (platform && !VALID_PLATFORMS.has(platform)) {
      return reply.code(400).send({
        error: `Invalid platform filter. Must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }

    const dealer_id = request.user.dealer_id!;
    const wanted = (platform ? [platform === 'google' ? 'gmb' : platform] : [...ACCOUNT_PLATFORMS])
      .filter((p) => ACCOUNT_PLATFORMS.includes(p));

    try {
      const connections = await prisma.platformConnection.findMany({
        where: { dealer_id, is_connected: true, platform: { in: wanted } },
        orderBy: { created_at: 'desc' },
      });

      // A live Meta token check, so a revoked Page shows "Reconnect" (mock tokens are never sent to Meta).
      await Promise.all(connections.map(async (conn) => {
        if ((conn.platform !== 'facebook' && conn.platform !== 'instagram') || isMockConnection(conn)) return;
        try {
          await axios.get(`https://graph.facebook.com/v19.0/${conn.platform_account_id}`, {
            params: { fields: 'id', access_token: conn.access_token },
            timeout: 1500,
          });
        } catch (err: unknown) {
          const fbError = (err as { response?: { data?: { error?: { code?: number; error_subcode?: number } } } }).response?.data?.error;
          if (fbError && (fbError.code === 190 || DEAD_TOKEN_SUBCODES.has(fbError.error_subcode ?? 0))) {
            const expired = new Date(0);
            await prisma.platformConnection.update({ where: { id: conn.id }, data: { token_expires_at: expired } });
            conn.token_expires_at = expired;
          }
        }
      }));

      return { success: true, accounts: connections.map(toAccount) };
    } catch (err) {
      request.log.error({ message: errorText(err) }, '[PlatformAccounts] Failed to list accounts');
      return reply.code(500).send({ error: 'Failed to list platform accounts' });
    }
  });

  // POST /v1/platform-accounts: save or update one account. After the Meta page picker
  // (POST /v1/auth/facebook/pages), send only platform + accountId: the name and token come from the server.
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as SaveAccountBody | undefined;

    if (!body || !body.platform || !body.accountId) {
      return reply.code(400).send({
        error: 'Missing required fields: platform, accountId, accountName, accessToken',
      });
    }

    if (!VALID_PLATFORMS.has(body.platform)) {
      return reply.code(400).send({
        error: `Invalid platform. Must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }

    const dealer_id = request.user.dealer_id!;
    const platform = body.platform === 'google' ? 'gmb' : body.platform;

    let { accountName, accessToken, tokenExpiry } = body;
    const fromMetaSelection = !accessToken && (platform === 'facebook' || platform === 'instagram');
    if (fromMetaSelection) {
      const picked = await resolveMetaAccount(dealer_id, platform, body.accountId);
      if (!picked) {
        return reply.code(400).send({
          error: 'Facebook authorization has expired or does not include this account. Please connect again.',
        });
      }
      ({ accountName, accessToken, tokenExpiry } = picked);
    }

    if (!accountName || !accessToken) {
      return reply.code(400).send({
        error: 'Missing required fields: platform, accountId, accountName, accessToken',
      });
    }

    try {
      const outcome = await saveConnection(dealer_id, {
        platform,
        platform_account_id: body.accountId,
        platform_account_name: accountName,
        access_token: accessToken,
        refresh_token: body.refreshToken ?? null,
        token_expires_at: tokenExpiry ? new Date(tokenExpiry) : null,
      });
      if (outcome.status === 'limit') {
        return reply.code(409).send({ error: { code: 'ACCOUNT_LIMIT', message: ACCOUNT_LIMIT_MESSAGE } });
      }
      const connection = outcome.connection;

      if (fromMetaSelection) {
        await clearMetaPageSelection(dealer_id).catch((err: unknown) => {
          request.log.warn({ message: errorText(err) }, '[PlatformAccounts] Failed to clear Meta page selection');
        });
      }

      request.log.info(`[PlatformAccounts] Saved a ${platform} account for dealer=${dealer_id}`);
      return {
        success: true,
        account: {
          id: connection.id,
          platform: connection.platform === 'gmb' ? 'google' : connection.platform,
          accountId: connection.platform_account_id,
          accountName: connection.platform_account_name,
          tokenExpiry: connection.token_expires_at,
          createdAt: connection.created_at,
        },
      };
    } catch (err) {
      request.log.error({ message: errorText(err) }, '[PlatformAccounts] Failed to save connection');
      return reply.code(500).send({ error: 'Failed to save platform connection' });
    }
  });

  // DELETE /v1/platform-accounts/:id: soft-disconnect one account
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!id) {
      return reply.code(400).send({ error: 'Missing account id' });
    }

    const dealer_id = request.user.dealer_id!;

    try {
      const conn = await prisma.platformConnection.findFirst({ where: { id, dealer_id } });

      if (conn) {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { is_connected: false } });

        // Stop this Page's webhooks (Meta only; mock Pages have none)
        if (conn.platform === 'facebook' && conn.access_token && !conn.access_token.startsWith('mock_')) {
          try {
            await axios.delete(`https://graph.facebook.com/v19.0/${conn.platform_account_id}/subscribed_apps`, {
              params: { access_token: conn.access_token },
            });
          } catch (err) {
            request.log.warn({ message: errorText(err) }, `Failed to unsubscribe app webhook for page ${conn.platform_account_id}`);
          }
        }
      }

      request.log.info(`[PlatformAccounts] Disconnected connection ${id} for dealer=${dealer_id}`);
      return { success: true };
    } catch (err) {
      request.log.error({ message: errorText(err) }, '[PlatformAccounts] Failed to delete connection');
      return reply.code(500).send({ error: 'Failed to disconnect platform connection' });
    }
  });
}
```

- [ ] **Step 7: The other call sites.**

(a) `apps/api/src/services/platformConnections.ts`: replace `saveAccount` (keep `getAccountsByUser` and `deleteAccount` as they are) and add the import:

```ts
import { saveConnection } from '../lib/connectionStore.js';
```

```ts
export async function saveAccount(input: SaveAccountInput) {
  if (input.userId === 'anonymous') {
    return null;
  }

  const outcome = await saveConnection(input.userId, {
    platform: input.platform,
    platform_account_id: input.accountId,
    platform_account_name: input.accountName,
    access_token: input.accessToken,
    refresh_token: input.refreshToken ?? null,
    token_expires_at: input.tokenExpiry ?? null,
  });
  return outcome.status === 'saved' ? outcome.connection : null;
}
```

(b) `apps/api/src/plugins/planGate.ts`: add `import { connectedPlatformCount } from '../lib/connectionStore.js';`, then in the `feature === 'platforms'` block replace the `prisma.platformConnection.count({ … })` call with:

```ts
        // Platforms, not accounts: a second Facebook Page or Google location doesn't use up the plan.
        const connectionsCount = await connectedPlatformCount(dealerId);
```

(c) `apps/api/src/routes/billing.ts`: add `import { connectedPlatformCount } from '../lib/connectionStore.js';`, then replace the `platformsConnected` count with:

```ts
    // 2. Connected platforms (several Pages or locations of one platform count once)
    const platformsConnected = await connectedPlatformCount(dealerId);
```

(d) `apps/api/test/firestore-semantics.test.ts`: in `describe('unique lookups')`, replace the `dealer_id_platform` selector with the new key:

```ts
    assert.equal(
      await prisma.platformConnection.findUnique({
        where: { dealer_id_platform_platform_account_id: { dealer_id: undefined, platform: 'facebook', platform_account_id: 'page-1' } } as any,
      }),
      null,
    );
```

`test/firestoreAdapter.test.ts` keeps its `dealer_id_platform` selector: it tests the adapter's schemaless fallback on a model-less collection.

- [ ] **Step 8: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/connections.test.ts test/firestore-semantics.test.ts test/firestoreAdapter.test.ts test/oauthHandoff.test.ts test/security-routes.test.ts
cd ../.. && npm run build
grep -rn "dealer_id_platform:" apps/api/src/routes/platformAccounts.ts apps/api/src/services
```
Expected:
- All tests pass (`connections`: 13).
- The build exits 0.
- The grep prints nothing. `routes/platform.ts` still uses the old selector until Task 2; the adapter's schemaless fallback keeps it working meanwhile.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/lib/connections.ts apps/api/src/lib/connectionStore.ts apps/api/src/routes/platformAccounts.ts apps/api/src/services/platformConnections.ts apps/api/src/plugins/planGate.ts apps/api/src/routes/billing.ts apps/api/test/connections.test.ts apps/api/test/firestore-semantics.test.ts
git commit -m "feat(api): several connected accounts per platform, with a 30-account cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Connect flows save every account; Instagram detect

**Files:**
- Create: `apps/api/src/lib/instagramDiscovery.ts`
- Modify: `apps/api/src/services/meta.ts` (add `fetchManagedPages`), `apps/api/src/services/gmb.ts` (add `fetchGmbLocations`), `apps/api/src/routes/platform.ts` (rewritten)
- Test: `apps/api/test/platform-connect.test.ts`

**Interfaces:**
- Consumes (Task 1): `saveConnections`, `saveConnection`, `ConnectionInput`, `MAX_CONNECTED_ACCOUNTS`, `ACCOUNT_LIMIT_MESSAGE`, `byAge`.
- Produces:
  - `services/meta.ts`: `interface ManagedPage { id; name; access_token }`, `fetchManagedPages(userAccessToken: string, max: number): Promise<ManagedPage[]>`.
  - `services/gmb.ts`: `interface GmbLocation { name; title }`, `fetchGmbLocations(accessToken: string, max: number): Promise<GmbLocation[]>`.
  - `lib/instagramDiscovery.ts`: `interface InstagramAccount { id; username; name }`, `MOCK_INSTAGRAM`, `discoverInstagram(pageId, pageToken): Promise<InstagramAccount | null>`, `instagramConnection(ig, pageToken, expiresAt): ConnectionInput`.
  - `routes/platform.ts` (module-private; Task 5 uses them): `googleClient()`, `exchangeGoogleCode(code)`, `savedCountQuery(saved)`.
  - HTTP:
    - The Meta callback saves every managed Page (paginated, up to the cap) plus each Page's Instagram account.
    - The Google callback saves every Business Profile location.
    - Return query: `accounts`, `fb`, `ig`, `google`, `youtube`. The mock Meta flow makes two Pages and one Instagram account.
    - `POST /v1/platforms/sync-instagram` → `{ found, accountName }` / 404 `NO_INSTAGRAM` / 409 `ACCOUNT_LIMIT`.
    - Nothing writes `SocialConnection`.

- [ ] **Step 1: Write the failing test** — `apps/api/test/platform-connect.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { signOAuthState } from '../src/lib/oauthState.js';
import { ACCOUNT_LIMIT_MESSAGE, MAX_CONNECTED_ACCOUNTS } from '../src/lib/connections.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Connect Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function setEnv(t: TestContext, values: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const apply = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(values);
  t.after(() => apply(saved));
}

const state = (dealerId: string, platform: string) => signOAuthState(fastify, 'platform_oauth', { dealer_id: dealerId, platform });
const redirect = (res: { headers: Record<string, unknown> }) => new URL(String(res.headers['location']));
const rows = (dealerId: string) => prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
const metaCallback = (dealerId: string, code = 'mock_code') =>
  fastify.inject({ method: 'GET', url: `/v1/platforms/callback/meta?code=${code}&state=${state(dealerId, 'facebook')}` });

describe('Meta callback', () => {
  it('saves every Page and the Instagram account linked to each, once', async () => {
    const dealerId = await newDealer();

    const target = redirect(await metaCallback(dealerId));

    assert.equal(target.searchParams.get('success'), '1');
    assert.deepEqual(
      ['platform', 'page_name', 'accounts', 'fb', 'ig'].map((k) => target.searchParams.get(k)),
      ['facebook,instagram', 'Mock Dealership Page', '3', '2', '1'],
    );
    const saved = await rows(dealerId);
    assert.deepEqual(
      saved.map((c) => `${c.platform}:${c.platform_account_id}`).sort(),
      ['facebook:mock_fb_page_id', 'facebook:mock_fb_page_id_2', 'instagram:mock_ig_user_id'],
    );
    const ig = saved.find((c) => c.platform === 'instagram');
    assert.deepEqual([ig?.platform_account_name, ig?.access_token], ['@mock_dealership_instagram', 'mock_fb_page_token']);

    await metaCallback(dealerId);
    assert.equal((await rows(dealerId)).length, 3);
    assert.equal(await prisma.socialConnection.count({ where: { dealer_id: dealerId } }), 0);
  });

  it('brings back a Page the dealer disconnected', async () => {
    const dealerId = await newDealer();
    await metaCallback(dealerId);
    const second = (await rows(dealerId)).find((c) => c.platform_account_id === 'mock_fb_page_id_2')!;
    await prisma.platformConnection.update({ where: { id: second.id }, data: { is_connected: false } });

    await metaCallback(dealerId);

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: second.id } }))?.is_connected, true);
    assert.equal((await rows(dealerId)).length, 3);
  });

  it('stops at 30 connected accounts and says so', async () => {
    const dealerId = await newDealer();
    for (let i = 0; i < MAX_CONNECTED_ACCOUNTS - 1; i++) {
      await prisma.platformConnection.create({
        data: { dealer_id: dealerId, platform: 'gmb', platform_account_id: `accounts/1/locations/${i}`, access_token: 'mock_g', is_connected: true },
      });
    }

    const target = redirect(await metaCallback(dealerId));

    assert.equal(target.searchParams.get('error'), ACCOUNT_LIMIT_MESSAGE);
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId, is_connected: true } }), MAX_CONNECTED_ACCOUNTS);
    assert.deepEqual((await rows(dealerId)).filter((c) => c.platform !== 'gmb').map((c) => c.platform_account_id), ['mock_fb_page_id']);
  });

  it('reads every managed Page across result pages, each with its own Page token', async (t) => {
    setEnv(t, { META_APP_ID: 'meta-app', META_APP_SECRET: 'meta-secret' });
    const dealerId = await newDealer();
    const calls: Array<{ url: string; params: Record<string, string> }> = [];
    t.mock.method(axios, 'get', async (url: string, config: { params?: Record<string, string> } = {}) => {
      const params = config.params ?? {};
      calls.push({ url, params });
      if (url.endsWith('/oauth/access_token')) {
        return { data: params['grant_type'] === 'fb_exchange_token' ? { access_token: 'long-token', expires_in: 5_184_000 } : { access_token: 'short-token' } };
      }
      if (url.endsWith('/v19.0/me')) return { data: { id: 'fb-user-1', name: 'Owner' } };
      if (url.endsWith('/me/accounts')) {
        return { data: { data: [{ id: 'page-1', name: 'Apex Motors', access_token: 'page-token-1' }], paging: { next: 'https://graph.facebook.com/v19.0/me/accounts?after=cursor-1' } } };
      }
      if (url.includes('/me/accounts?after=cursor-1')) return { data: { data: [{ id: 'page-2', name: 'Apex Used Cars', access_token: 'page-token-2' }] } };
      if (url.endsWith('/page-1')) return { data: { instagram_business_account: { id: 'ig-1', username: 'apexmotors', name: 'Apex Motors' } } };
      if (url.endsWith('/page-2')) return { data: {} };
      throw new Error(`unexpected GET ${url}`);
    });

    const target = redirect(await metaCallback(dealerId, 'real-code'));

    assert.deepEqual(['accounts', 'fb', 'ig', 'page_name'].map((k) => target.searchParams.get(k)), ['3', '2', '1', 'Apex Motors']);
    const saved = await rows(dealerId);
    const token = (id: string) => saved.find((c) => c.platform_account_id === id)?.access_token;
    assert.deepEqual([token('page-1'), token('page-2'), token('ig-1')], ['page-token-1', 'page-token-2', 'page-token-1']);
    assert.equal(calls.find((c) => c.url.endsWith('/me/accounts'))?.params['fields'], 'id,name,access_token');
    assert.equal(calls.find((c) => c.url.endsWith('/page-1'))?.params['fields'], 'instagram_business_account{id,username,name}');
  });
});

describe('Google Business Profile callback', () => {
  function mockGoogle(t: TestContext, options: { noLocations?: boolean; failAccounts?: boolean } = {}) {
    t.mock.method(axios, 'post', async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') return { data: { access_token: 'ya29.gbp', refresh_token: '1//gbp-refresh', expires_in: 3599 } };
      throw new Error(`unexpected POST ${url}`);
    });
    t.mock.method(axios, 'get', async (url: string, config: { params?: Record<string, unknown> } = {}) => {
      const pageToken = config.params?.['pageToken'];
      if (url.endsWith('/oauth2/v2/userinfo')) return { data: { id: 'g-1', name: 'Owner' } };
      if (url.endsWith('/v4/accounts')) {
        if (options.failAccounts) throw Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } });
        return pageToken === 'acc-2'
          ? { data: { accounts: [{ name: 'accounts/2', accountName: 'Apex Used' }] } }
          : { data: { accounts: [{ name: 'accounts/1', accountName: 'Apex' }], nextPageToken: 'acc-2' } };
      }
      if (url.endsWith('/accounts/1/locations')) {
        if (options.noLocations) return { data: {} };
        return pageToken === 'loc-2'
          ? { data: { locations: [{ name: 'accounts/1/locations/12', locationName: 'Apex Andheri' }] } }
          : { data: { locations: [{ name: 'accounts/1/locations/11', locationName: 'Apex Bandra' }], nextPageToken: 'loc-2' } };
      }
      if (url.endsWith('/accounts/2/locations')) {
        return options.noLocations ? { data: {} } : { data: { locations: [{ name: 'accounts/2/locations/21', locationName: 'Apex Pre-owned' }] } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
  }
  const googleCallback = (dealerId: string) =>
    fastify.inject({ method: 'GET', url: `/v1/platforms/callback/google?code=g-code&state=${state(dealerId, 'gmb')}` });

  it('saves every location across the Google accounts', async (t) => {
    mockGoogle(t);
    const dealerId = await newDealer();

    const target = redirect(await googleCallback(dealerId));

    assert.deepEqual(
      ['success', 'platform', 'page_name', 'accounts', 'google'].map((k) => target.searchParams.get(k)),
      ['1', 'google', 'Apex Bandra', '3', '3'],
    );
    const saved = await rows(dealerId);
    assert.deepEqual(saved.map((c) => c.platform_account_id).sort(), ['accounts/1/locations/11', 'accounts/1/locations/12', 'accounts/2/locations/21']);
    assert.ok(saved.every((c) => c.platform === 'gmb' && c.access_token === 'ya29.gbp' && c.refresh_token === '1//gbp-refresh'));
  });

  it('says when there is no location, or when the locations cannot be read', async (t) => {
    const dealerId = await newDealer();
    mockGoogle(t, { noLocations: true });
    assert.equal(
      redirect(await googleCallback(dealerId)).searchParams.get('error'),
      'No Google Business locations found on this account. Make sure you have a verified Business Profile, then try again.',
    );

    t.mock.restoreAll();
    mockGoogle(t, { failAccounts: true });
    assert.equal(
      redirect(await googleCallback(dealerId)).searchParams.get('error'),
      'Could not read your Google Business Profile. Please try again, or contact support if it persists.',
    );
    assert.equal((await rows(dealerId)).length, 0);
  });
});

describe('POST /v1/platforms/sync-instagram', () => {
  const page = (dealerId: string, id: string, token: string, expires: Date | null = null) => prisma.platformConnection.create({
    data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: id, platform_account_name: id, access_token: token, token_expires_at: expires, is_connected: true },
  });
  const sync = (dealerId: string) => fastify.inject({ method: 'POST', url: '/v1/platforms/sync-instagram', headers: headers(dealerId), payload: {} });

  it("links a connected Page's Instagram account with the Page token and expiry", async (t) => {
    const dealerId = await newDealer();
    const expires = new Date(Date.now() + 30 * 86_400_000);
    await page(dealerId, 'page-9', 'page-token-9', expires);
    const get = t.mock.method(axios, 'get', async (url: string) => {
      if (url.endsWith('/page-9')) return { data: { instagram_business_account: { id: 'ig-9', username: 'apexig' } } };
      throw new Error(`unexpected GET ${url}`);
    });

    const res = await sync(dealerId);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { found: 1, accountName: '@apexig' });
    const ig = await prisma.platformConnection.findFirst({ where: { dealer_id: dealerId, platform: 'instagram' } });
    assert.deepEqual([ig?.platform_account_id, ig?.access_token, ig?.token_expires_at?.getTime()], ['ig-9', 'page-token-9', expires.getTime()]);
    assert.equal(get.mock.callCount(), 1);
  });

  it('answers 404 when no Page has one, and finds the mock account locally', async () => {
    const dealerId = await newDealer();
    await page(dealerId, 'mock_fb_page_id_2', 'mock_fb_page_token_2');

    const none = await sync(dealerId);
    assert.equal(none.statusCode, 404);
    assert.deepEqual((none.json() as { error: unknown }).error, {
      code: 'NO_INSTAGRAM',
      message: 'No Instagram Business account is linked to your Facebook Pages. Link one in Meta Business Suite, then try again.',
    });

    await page(dealerId, 'mock_fb_page_id', 'mock_fb_page_token');
    assert.deepEqual((await sync(dealerId)).json(), { found: 1, accountName: '@mock_dealership_instagram' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/platform-connect.test.ts`
Expected: FAIL. The mock Meta flow saves one Page (`accounts` is null), and `/sync-instagram` answers 404 for every case.

- [ ] **Step 3: `fetchManagedPages`** — in `apps/api/src/services/meta.ts`, after `getPageAccessToken`, add:

```ts
export interface ManagedPage {
  id: string;
  name: string;
  access_token: string;
}

/** Every Facebook Page the user manages, each with its Page token (me/accounts, following paging.next), up to `max`. */
export async function fetchManagedPages(userAccessToken: string, max: number): Promise<ManagedPage[]> {
  const pages: ManagedPage[] = [];
  let url: string | undefined = `${META_GRAPH_BASE}/me/accounts`;
  let params: Record<string, string> | undefined = { fields: 'id,name,access_token', limit: '100', access_token: userAccessToken };
  for (let hop = 0; url && hop < 20 && pages.length < max; hop++) {
    const res: { data: { data?: Array<Partial<ManagedPage>>; paging?: { next?: string } } } =
      await axios.get(url, { ...(params ? { params } : {}), timeout: 15_000 });
    for (const page of res.data.data ?? []) {
      if (page.id && page.name && page.access_token) pages.push({ id: page.id, name: page.name, access_token: page.access_token });
      if (pages.length >= max) break;
    }
    // paging.next is a full URL that already carries the query, token included
    url = res.data.paging?.next;
    params = undefined;
  }
  return pages;
}
```

- [ ] **Step 4: `fetchGmbLocations`** — in `apps/api/src/services/gmb.ts`, after `fetchGmbPostMetrics`, add:

```ts
export interface GmbLocation {
  /** `accounts/{accountId}/locations/{locationId}`: the name publishing, reviews and metrics use. */
  name: string;
  title: string;
}

const GBP_MAX_PAGES = 20; // result pages read per list, a guard against endless paging

/** Every location across the user's Business Profile accounts (v4 API, following nextPageToken), up to `max`. */
export async function fetchGmbLocations(accessToken: string, max: number): Promise<GmbLocation[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const locations: GmbLocation[] = [];
  let accountsToken: string | undefined;
  for (let accountPage = 0; accountPage < GBP_MAX_PAGES; accountPage++) {
    const accountsRes = await axios.get<{ accounts?: Array<{ name?: string; accountName?: string }>; nextPageToken?: string }>(
      `${GMB_BASE}/accounts`,
      { headers, params: accountsToken ? { pageToken: accountsToken } : {}, timeout: READ_TIMEOUT_MS },
    );
    for (const account of accountsRes.data.accounts ?? []) {
      if (!account.name) continue;
      let locationsToken: string | undefined;
      for (let locationPage = 0; locationPage < GBP_MAX_PAGES; locationPage++) {
        const locationsRes = await axios.get<{ locations?: Array<{ name?: string; locationName?: string }>; nextPageToken?: string }>(
          `${GMB_BASE}/${account.name}/locations`,
          { headers, params: { pageSize: 100, ...(locationsToken ? { pageToken: locationsToken } : {}) }, timeout: READ_TIMEOUT_MS },
        );
        for (const location of locationsRes.data.locations ?? []) {
          if (!location.name) continue;
          locations.push({ name: location.name, title: location.locationName || account.accountName || location.name });
          if (locations.length >= max) return locations;
        }
        locationsToken = locationsRes.data.nextPageToken;
        if (!locationsToken) break;
      }
    }
    accountsToken = accountsRes.data.nextPageToken;
    if (!accountsToken) break;
  }
  return locations;
}
```

- [ ] **Step 5: `apps/api/src/lib/instagramDiscovery.ts`**

```ts
import axios from 'axios';
import type { ConnectionInput } from './connectionStore.js';
import { isMockId } from './platformMock.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const TIMEOUT_MS = 15_000;

export interface InstagramAccount {
  id: string;
  username: string;
  name: string | null;
}

// Local and demo connects: the first mock Page (routes/platform.ts) has this linked Instagram account.
export const MOCK_INSTAGRAM: InstagramAccount = { id: 'mock_ig_user_id', username: 'mock_dealership_instagram', name: 'Mock Dealership' };
const MOCK_PAGE_WITH_INSTAGRAM = 'mock_fb_page_id';

/** The Instagram Business account linked to a Facebook Page, or null when none is linked. */
export async function discoverInstagram(pageId: string, pageToken: string): Promise<InstagramAccount | null> {
  if (isMockId(pageId) || isMockId(pageToken)) return pageId === MOCK_PAGE_WITH_INSTAGRAM ? MOCK_INSTAGRAM : null;
  const res = await axios.get<{ instagram_business_account?: { id?: string; username?: string; name?: string } }>(
    `${META_GRAPH_BASE}/${pageId}`,
    { params: { fields: 'instagram_business_account{id,username,name}', access_token: pageToken }, timeout: TIMEOUT_MS },
  );
  const ig = res.data.instagram_business_account;
  if (!ig?.id) return null;
  return { id: ig.id, username: ig.username || ig.id, name: ig.name ?? null };
}

/** The connection row for a discovered account: it posts with its Page's token, so it shares that expiry. */
export function instagramConnection(ig: InstagramAccount, pageToken: string, expiresAt: Date | null): ConnectionInput {
  return {
    platform: 'instagram',
    platform_account_id: ig.id,
    platform_account_name: `@${ig.username}`,
    access_token: pageToken,
    token_expires_at: expiresAt,
  };
}
```

- [ ] **Step 6: `apps/api/src/routes/platform.ts`** — replace the whole file:

```ts
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { prisma } from '../db/prisma.js';
import { exchangeForLongLivedToken, fetchManagedPages, type ManagedPage } from '../services/meta.js';
import { fetchGmbLocations, type GmbLocation } from '../services/gmb.js';
import { getFrontendUrl } from '../lib/frontendUrl.js';
import { issueHandoffCode, type SessionHandoff } from '../lib/oauthHandoff.js';
import { signOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { needsReconnect } from '../lib/platformHealth.js';
import { ACCOUNT_LIMIT_MESSAGE, MAX_CONNECTED_ACCOUNTS, byAge } from '../lib/connections.js';
import { saveConnection, saveConnections, type ConnectionInput } from '../lib/connectionStore.js';
import { discoverInstagram, instagramConnection } from '../lib/instagramDiscovery.js';

const META_APP_ID     = process.env['META_APP_ID']     ?? '';
const META_APP_SECRET = process.env['META_APP_SECRET'] ?? '';

// API_BASE_URL must be set to the deployed API URL in production (e.g. https://xxx.a.run.app)
const API_BASE_URL = process.env['API_BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3001}`;
const FRONTEND_URL = getFrontendUrl();

// Redirect URIs, registered in the Meta App Dashboard and Google Cloud Console. Google Business Profile and
// YouTube share the Google one.
const META_CALLBACK_URI   = `${API_BASE_URL}/v1/platforms/callback/meta`;
const GOOGLE_CALLBACK_URI = `${API_BASE_URL}/v1/platforms/callback/google`;
const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token';
const GOOGLE_TIMEOUT_MS   = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Shown on the OAuth return toast (the Google Business Profile copy is the reference's).
const NO_GBP_LOCATIONS = 'No Google Business locations found on this account. Make sure you have a verified Business Profile, then try again.';
const GBP_READ_FAILED = 'Could not read your Google Business Profile. Please try again, or contact support if it persists.';
const NO_INSTAGRAM = 'No Instagram Business account is linked to your Facebook Pages. Link one in Meta Business Suite, then try again.';

// Local and demo connects: two Pages; lib/instagramDiscovery.ts links a mock Instagram account to the first.
const MOCK_PAGES: ManagedPage[] = [
  { id: 'mock_fb_page_id', name: 'Mock Dealership Page', access_token: 'mock_fb_page_token' },
  { id: 'mock_fb_page_id_2', name: 'Mock Dealership Page 2', access_token: 'mock_fb_page_token_2' },
];

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Page and OAuth tokens never leave the server.
function publicConnection(conn: Record<string, any>) {
  const { access_token: _a, refresh_token: _r, ...rest } = conn;
  return { ...rest, needs_reconnect: needsReconnect(conn as Parameters<typeof needsReconnect>[0]) };
}

type PlatformState = { dealer_id: string | null; platform?: string; signin?: boolean };

// Twitter (and YouTube without a Google client) are mock integrations that store fake tokens.
function mockPlatformsDisabled(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/** The Google OAuth client, read per request so tests (and a key rotation) see the current values. */
function googleClient(): { id: string; secret: string } | null {
  const id = process.env['GOOGLE_CLIENT_ID'];
  return id ? { id, secret: process.env['GOOGLE_CLIENT_SECRET'] ?? '' } : null;
}

async function exchangeGoogleCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const client = googleClient();
  const res = await axios.post<{ access_token: string; refresh_token?: string; expires_in: number }>(
    GOOGLE_TOKEN_URL,
    { code, client_id: client?.id ?? '', client_secret: client?.secret ?? '', redirect_uri: GOOGLE_CALLBACK_URI, grant_type: 'authorization_code' },
    { timeout: GOOGLE_TIMEOUT_MS },
  );
  return res.data;
}

// How many accounts a connect saved, for the return toast: accounts=<total>, plus fb / ig / google / youtube.
const COUNT_KEYS: ReadonlyArray<readonly [string, string]> = [['facebook', 'fb'], ['instagram', 'ig'], ['gmb', 'google'], ['youtube', 'youtube']];

function savedCountQuery(saved: ReadonlyArray<{ platform: string }>): string {
  const params = new URLSearchParams({ accounts: String(saved.length) });
  for (const [platform, key] of COUNT_KEYS) {
    const count = saved.filter((c) => c.platform === platform).length;
    if (count > 0) params.set(key, String(count));
  }
  return params.toString();
}

export default async function platformRoutes(fastify: FastifyInstance) {
  // GET /v1/platforms  — list all connections for dealer
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const connections = await prisma.platformConnection.findMany({
      where: { dealer_id: request.user.dealer_id! },
    });
    return { success: true, platforms: connections.map(publicConnection) };
  });

  // GET /v1/platforms/connect/:platform  — return OAuth URL as JSON
  // Supports two modes:
  //   - Default (requires auth JWT): links the platform to the existing dealer account
  //   - ?signin=1 (no auth required): creates a new account via social sign-in
  fastify.get('/connect/:platform', async (request, reply) => {
    const { platform } = request.params as { platform: string };
    const { signin, mock } = request.query as { signin?: string; mock?: string };
    const isSignin = signin === '1';
    const isMock = mock === 'true';

    if ((platform === 'twitter' || platform === 'youtube') && mockPlatformsDisabled()) {
      return reply.code(501).send({ error: { code: 'NOT_AVAILABLE', message: `${platform} connections are not available yet` } });
    }

    // For linking mode (not signin), require authentication
    let dealer_id: string | null = null;
    if (!isSignin) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return reply;
      dealer_id = request.user.dealer_id ?? null;

      // Enforce plan limits for platforms. Reconnecting one the dealer already has (e.g. an
      // expired token) adds nothing; Facebook and Instagram share one Meta connect flow.
      const samePlatforms = platform === 'facebook' || platform === 'instagram' ? ['facebook', 'instagram'] : [platform];
      const existing = dealer_id
        ? await prisma.platformConnection.findFirst({ where: { dealer_id, platform: { in: samePlatforms } } })
        : null;
      if (!existing) {
        const planGateHook = fastify.checkPlanLimit('platforms');
        await planGateHook(request, reply);
        if (reply.sent) return reply;
      }
    }

    if (platform === 'facebook' || platform === 'instagram') {
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform, signin: isSignin });
      if (isMock && process.env['NODE_ENV'] !== 'production') {
        const callbackUrl = `${API_BASE_URL}/v1/platforms/callback/meta?code=mock_facebook_code&state=${state}`;
        return { success: true, redirect_url: callbackUrl };
      }

      if (!META_APP_ID) {
        return reply.code(500).send({ error: { code: 'CONFIG_ERROR', message: 'META_APP_ID not configured' } });
      }
      const scopes = [
        'pages_manage_posts',
        'pages_read_engagement',
        'pages_manage_metadata',
        'pages_messaging',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_comments',
        'instagram_manage_messages',
        'ads_management',
      ].join(',');
      const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
      url.searchParams.set('client_id', META_APP_ID);
      url.searchParams.set('redirect_uri', META_CALLBACK_URI);
      url.searchParams.set('scope', scopes);
      url.searchParams.set('state', state);
      url.searchParams.set('response_type', 'code');
      return { success: true, redirect_url: url.toString() };
    }

    if (platform === 'gmb') {
      const google = googleClient();
      if (!google) {
        return reply.code(500).send({ error: { code: 'CONFIG_ERROR', message: 'GOOGLE_CLIENT_ID not configured' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform, signin: isSignin });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', google.id);
      url.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage email profile');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return { success: true, redirect_url: url.toString() };
    }

    // Twitter/X: mock OAuth only
    if (platform === 'twitter') {
      if (!dealer_id) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to link platforms' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform });
      // Mock: immediately redirect to our own callback (no real Twitter OAuth round-trip)
      const callbackUrl = `${API_BASE_URL}/v1/platforms/callback/twitter?code=mock_twitter_code&state=${state}`;
      return { success: true, redirect_url: callbackUrl };
    }

    // YouTube: mock OAuth (Task 5 adds real Google OAuth)
    if (platform === 'youtube') {
      if (!dealer_id) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to link platforms' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform });
      const callbackUrl = `${API_BASE_URL}/v1/platforms/callback/youtube?code=mock_youtube_code&state=${state}`;
      return { success: true, redirect_url: callbackUrl };
    }

    return reply.code(400).send({ error: { code: 'INVALID_PLATFORM', message: `Unknown platform: ${platform}` } });
  });

  // GET /v1/platforms/callback/twitter: mock Twitter/X OAuth callback: saves a demo connection.
  fastify.get('/callback/twitter', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=twitter`);

    if (mockPlatformsDisabled()) {
      return reply.code(501).send({ error: { code: 'NOT_AVAILABLE', message: 'twitter connections are not available yet' } });
    }

    if (oauthError || !code || !state) return fail(oauthError ?? 'Twitter login cancelled');

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || stateData.platform !== 'twitter') return fail('Invalid state');
    if (!stateData.dealer_id) return fail('Session expired. Please try again.');

    try {
      // Fetch dealer name for a realistic mock handle
      const dealer = await prisma.dealer.findUnique({ where: { id: stateData.dealer_id } });
      const handle = dealer?.name
        ? `@${dealer.name.toLowerCase().replace(/\s+/g, '').slice(0, 15)}`
        : '@dealershowroom';

      const outcome = await saveConnection(stateData.dealer_id, {
        platform: 'twitter',
        platform_account_id: `tw_${stateData.dealer_id.slice(0, 8)}`,
        platform_account_name: handle,
        access_token: 'mock_twitter_access_token',
        refresh_token: 'mock_twitter_refresh_token',
        token_expires_at: new Date(Date.now() + 90 * DAY_MS),
      });
      if (outcome.status === 'limit') return fail(ACCOUNT_LIMIT_MESSAGE);

      return reply.redirect(`${frontendCallback}?success=1&platform=twitter&page_name=${encodeURIComponent(handle)}&${savedCountQuery([outcome.connection])}`);
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'Twitter mock callback failed');
      return fail('Twitter connection failed');
    }
  });

  // GET /v1/platforms/callback/youtube: mock YouTube OAuth callback: saves a demo channel.
  fastify.get('/callback/youtube', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=youtube`);

    if (mockPlatformsDisabled()) {
      return reply.code(501).send({ error: { code: 'NOT_AVAILABLE', message: 'youtube connections are not available yet' } });
    }

    if (oauthError || !code || !state) return fail(oauthError ?? 'YouTube login cancelled');

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || stateData.platform !== 'youtube') return fail('Invalid state');
    if (!stateData.dealer_id) return fail('Session expired. Please try again.');

    try {
      const dealer = await prisma.dealer.findUnique({ where: { id: stateData.dealer_id } });
      const channelName = dealer?.name ? `${dealer.name} Official` : 'Dealership Channel';

      const outcome = await saveConnection(stateData.dealer_id, {
        platform: 'youtube',
        platform_account_id: `yt_${stateData.dealer_id.slice(0, 8)}`,
        platform_account_name: channelName,
        access_token: 'mock_youtube_access_token',
        refresh_token: 'mock_youtube_refresh_token',
        token_expires_at: new Date(Date.now() + 90 * DAY_MS),
      });
      if (outcome.status === 'limit') return fail(ACCOUNT_LIMIT_MESSAGE);

      return reply.redirect(`${frontendCallback}?success=1&platform=youtube&page_name=${encodeURIComponent(channelName)}&${savedCountQuery([outcome.connection])}`);
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'YouTube mock callback failed');
      return fail('YouTube connection failed');
    }
  });

  // GET /v1/platforms/callback/meta
  // Facebook redirects the browser here after the user authorises the app. Every Page the user manages is
  // saved, with the Instagram Business account linked to each; then the browser goes back to the web app.
  fastify.get('/callback/meta', async (request, reply) => {
    const { code, state, error: oauthError, error_description } = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=facebook`);

    if (oauthError || !code || !state) {
      fastify.log.warn({ oauthError, error_description }, 'Meta OAuth denied or missing params');
      return fail(error_description ?? oauthError ?? 'Missing code or state');
    }

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || (stateData.platform !== 'facebook' && stateData.platform !== 'instagram')) {
      return fail('Invalid state parameter');
    }

    try {
      let expiresAt: Date;
      let fbUser: { id: string; name: string; email?: string };
      let pages: ManagedPage[];

      if (process.env['NODE_ENV'] !== 'production' && (code.startsWith('mock_') || code === 'test')) {
        expiresAt = new Date(Date.now() + 60 * DAY_MS);
        fbUser = { id: 'mock_fb_user_id', name: 'Mock FB User', email: 'mock@facebook.com' };
        pages = MOCK_PAGES;
      } else {
        // 1. Exchange the code for a short-lived user token, then for a long-lived one (60 days)
        const tokenRes = await axios.get<{ access_token: string }>('https://graph.facebook.com/v19.0/oauth/access_token', {
          params: {
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            redirect_uri: META_CALLBACK_URI,
            code,
          },
        });
        const { access_token: longLivedToken, expires_in } = await exchangeForLongLivedToken(tokenRes.data.access_token);
        expiresAt = new Date(Date.now() + expires_in * 1000);

        // 2. The user, and every Page they manage with its Page token
        const [meRes, managed] = await Promise.all([
          axios.get<{ id: string; name: string; email?: string }>('https://graph.facebook.com/v19.0/me', {
            params: { fields: 'id,name,email', access_token: longLivedToken },
          }),
          fetchManagedPages(longLivedToken, MAX_CONNECTED_ACCOUNTS),
        ]);
        fbUser = meRes.data;
        pages = managed;
      }

      const firstPage = pages[0];
      if (!firstPage) {
        return fail(stateData.signin
          ? 'No Facebook Page found. Please create a Facebook Business Page first, then try again.'
          : 'No Facebook Page found. Create a Facebook Page first.');
      }

      // Social sign-in mode: create or find a dealer account
      let dealerId = stateData.dealer_id;
      let accessTokenForJwt: string | null = null;
      let refreshTokenForJwt: string | null = null;

      if (stateData.signin) {
        // Find existing dealer by FB user id, or create a new one
        const fbPhone = `fb_${fbUser.id}`;
        let dealer = await prisma.dealer.findFirst({ where: { phone: fbPhone } });
        if (!dealer) {
          dealer = await prisma.dealer.create({
            data: {
              phone: fbPhone,
              name: firstPage.name,
              city: '',
              contact_phone: '',
              onboarding_completed: false,
              onboarding_step: 2,
            },
          });
        }
        dealerId = dealer.id;

        // Create or find DealerUser
        const userPhone = `fb_user_${fbUser.id}`;
        let dealerUser = await prisma.dealerUser.findFirst({ where: { dealer_id: dealer.id } });
        if (!dealerUser) {
          dealerUser = await prisma.dealerUser.create({
            data: {
              phone: userPhone,
              name: fbUser.name,
              email: fbUser.email ?? null,
              role: 'admin',
              dealer_id: dealer.id,
              is_active: true,
            },
          });
        }

        // Generate JWT for this new session
        const { resolvePermissions } = await import('../lib/permissions.js');
        type JwtUserLocal = { dealer_user_id: string; dealer_id: string | null; role: 'owner' | 'admin' | 'user'; phone: string; permissions: Record<string, boolean> };
        const permissions = resolvePermissions(dealerUser.role);
        const jwtPayload: JwtUserLocal = {
          dealer_user_id: dealerUser.id,
          dealer_id: dealer.id,
          role: dealerUser.role as 'admin',
          phone: userPhone,
          permissions,
        };
        accessTokenForJwt = fastify.jwt.sign({ ...jwtPayload, typ: 'access' }, { expiresIn: '30d' });
        refreshTokenForJwt = fastify.jwt.sign({ ...jwtPayload, typ: 'refresh' }, { expiresIn: '90d' });
      }

      if (!dealerId) return fail('Session expired. Please try again.');

      // 3. Every Page, and the Instagram Business account linked to each
      const accounts: ConnectionInput[] = [];
      for (const page of pages) {
        accounts.push({
          platform: 'facebook',
          platform_account_id: page.id,
          platform_account_name: page.name,
          access_token: page.access_token,
          token_expires_at: expiresAt,
        });
        try {
          const ig = await discoverInstagram(page.id, page.access_token);
          if (ig) accounts.push(instagramConnection(ig, page.access_token, expiresAt));
        } catch (err) {
          fastify.log.warn({ message: errorText(err) }, 'Could not read the Instagram account linked to a Facebook Page');
        }
      }
      const { saved, limitReached } = await saveConnections(dealerId, accounts);
      const connected = [...new Set(saved.map((c) => c.platform))].join(',') || 'facebook';

      // For social sign-in: hand the JWTs to the frontend through a one-time code
      // (redeemed via POST /v1/auth/oauth/exchange) so they never appear in a URL
      if (stateData.signin && accessTokenForJwt) {
        const handoffCode = await issueHandoffCode('session', {
          token: accessTokenForJwt,
          refreshToken: refreshTokenForJwt ?? '',
        } satisfies SessionHandoff);
        return reply.redirect(
          `${FRONTEND_URL}/auth/callback?code=${handoffCode}&platform=${encodeURIComponent(connected)}&page_name=${encodeURIComponent(firstPage.name)}`
        );
      }

      if (limitReached) return fail(ACCOUNT_LIMIT_MESSAGE);
      return reply.redirect(
        `${frontendCallback}?success=1&platform=${encodeURIComponent(connected)}&page_name=${encodeURIComponent(firstPage.name)}&${savedCountQuery(saved)}`
      );
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'Meta OAuth callback failed');
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Connection failed';
      return fail(msg);
    }
  });

  // GET /v1/platforms/callback/google
  // Google redirects the browser here after consent: every Business Profile location is saved.
  fastify.get('/callback/google', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=google`);

    if (oauthError || !code || !state) return fail(oauthError ?? 'Google login cancelled');

    const stateData = verifyOAuthState<PlatformState>(fastify, state, 'platform_oauth');
    if (!stateData || stateData.platform !== 'gmb') return fail('Invalid state');

    try {
      const { access_token, refresh_token, expires_in } = await exchangeGoogleCode(code);
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Google user info (for sign-in mode)
      const googleUserRes = await axios.get<{ id: string; name: string; email?: string }>(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${access_token}` }, timeout: GOOGLE_TIMEOUT_MS },
      ).catch(() => ({ data: { id: '', name: 'Google User', email: undefined } }));
      const googleUser = googleUserRes.data;

      // Every location across the user's Business Profile accounts
      let locations: GmbLocation[] = [];
      let lookupFailed = false;
      try {
        locations = await fetchGmbLocations(access_token, MAX_CONNECTED_ACCOUNTS);
      } catch (err) {
        lookupFailed = true;
        fastify.log.warn({ message: errorText(err) }, 'Could not list Google Business Profile locations');
      }
      const displayName = locations[0]?.title ?? googleUser.name;

      // Social sign-in mode: create or find dealer account
      let dealerId = stateData.dealer_id;
      let jwtToken: string | null = null;
      let jwtRefresh: string | null = null;

      if (stateData.signin) {
        const gPhone = `google_${googleUser.id || Date.now()}`;
        let dealer = await prisma.dealer.findFirst({ where: { phone: gPhone } });
        if (!dealer) {
          dealer = await prisma.dealer.create({
            data: {
              phone: gPhone,
              name: displayName,
              city: '',
              contact_phone: '',
              onboarding_completed: false,
              onboarding_step: 2,
            },
          });
        }
        dealerId = dealer.id;

        let dealerUser = await prisma.dealerUser.findFirst({ where: { dealer_id: dealer.id } });
        if (!dealerUser) {
          dealerUser = await prisma.dealerUser.create({
            data: {
              phone: gPhone,
              name: googleUser.name,
              email: googleUser.email ?? null,
              role: 'admin',
              dealer_id: dealer.id,
              is_active: true,
            },
          });
        }

        const { resolvePermissions } = await import('../lib/permissions.js');
        const permissions = resolvePermissions(dealerUser.role);
        type JwtUserLocal = { dealer_user_id: string; dealer_id: string | null; role: 'owner' | 'admin' | 'user'; phone: string; permissions: Record<string, boolean> };
        const jwtPayload: JwtUserLocal = {
          dealer_user_id: dealerUser.id,
          dealer_id: dealer.id,
          role: 'admin',
          phone: gPhone,
          permissions,
        };
        jwtToken = fastify.jwt.sign({ ...jwtPayload, typ: 'access' }, { expiresIn: '30d' });
        jwtRefresh = fastify.jwt.sign({ ...jwtPayload, typ: 'refresh' }, { expiresIn: '90d' });
      }

      if (!dealerId) return fail('Session expired. Please try again.');

      const { saved, limitReached } = await saveConnections(dealerId, locations.map((location) => ({
        platform: 'gmb',
        platform_account_id: location.name,
        platform_account_name: location.title,
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
      })));

      if (stateData.signin && jwtToken) {
        const handoffCode = await issueHandoffCode('session', {
          token: jwtToken,
          refreshToken: jwtRefresh ?? '',
        } satisfies SessionHandoff);
        return reply.redirect(
          `${FRONTEND_URL}/auth/callback?code=${handoffCode}&platform=gmb&page_name=${encodeURIComponent(displayName)}`
        );
      }

      if (lookupFailed) return fail(GBP_READ_FAILED);
      if (locations.length === 0) return fail(NO_GBP_LOCATIONS);
      if (limitReached) return fail(ACCOUNT_LIMIT_MESSAGE);
      return reply.redirect(
        `${frontendCallback}?success=1&platform=google&page_name=${encodeURIComponent(displayName)}&${savedCountQuery(saved)}`
      );
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'Google OAuth callback failed');
      return fail('Google connection failed');
    }
  });

  // POST /v1/platforms/sync-instagram: links the Instagram Business accounts of the connected Facebook Pages
  fastify.post('/sync-instagram', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Sign in to a dealership account first.' } });
    }

    const pages = (await prisma.platformConnection.findMany({
      where: { dealer_id: dealerId, platform: 'facebook', is_connected: true },
    })).sort(byAge);
    const found: ConnectionInput[] = [];
    for (const page of pages) {
      try {
        const ig = await discoverInstagram(page.platform_account_id, page.access_token);
        if (ig) found.push(instagramConnection(ig, page.access_token, page.token_expires_at));
      } catch (err) {
        request.log.warn({ message: errorText(err) }, '[platforms] Instagram discovery failed for a Page');
      }
    }
    if (found.length === 0) return reply.code(404).send({ error: { code: 'NO_INSTAGRAM', message: NO_INSTAGRAM } });

    const { saved, limitReached } = await saveConnections(dealerId, found);
    if (saved.length === 0 && limitReached) {
      return reply.code(409).send({ error: { code: 'ACCOUNT_LIMIT', message: ACCOUNT_LIMIT_MESSAGE } });
    }
    return { found: saved.length, accountName: saved[0]?.platform_account_name ?? null };
  });

  // DELETE /v1/platforms/:platform: disconnect every account of a platform
  fastify.delete('/:platform', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const { platform } = request.params as { platform: string };
    await prisma.platformConnection.updateMany({
      where: { dealer_id, platform },
      data: { is_connected: false },
    });
    return { success: true, message: `${platform} disconnected` };
  });
}
```

`getPageAccessToken` stays exported from `services/meta.ts` (no longer used here).

- [ ] **Step 7: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/platform-connect.test.ts test/connections.test.ts test/security-routes.test.ts test/oauthHandoff.test.ts test/platform-health.test.ts
cd ../.. && npm run build
grep -rn "dealer_id_platform:\|socialConnection\." apps/api/src/routes apps/api/src/services apps/api/src/lib
```
Expected: all tests pass (`platform-connect`: 8); the build exits 0; the grep prints nothing.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/instagramDiscovery.ts apps/api/src/services/meta.ts apps/api/src/services/gmb.ts apps/api/src/routes/platform.ts apps/api/test/platform-connect.test.ts
git commit -m "feat(api): connect flows save every Page, Instagram account and Business Profile location; Instagram detect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Per-account publishing and results

**Files:**
- Create: `apps/api/src/lib/publishResults.ts`
- Modify: `apps/api/src/lib/publishDirect.ts` (rewritten), `apps/api/src/queues/index.ts` (`PublishJobData`)
- Test: `apps/api/test/publish-accounts.test.ts`

**Interfaces:**
- Consumes (Task 1): `resolveTargets`, `primaryConnection`, `byAge`, `platformLabel`, `noConnectedAccountMessage`, `selectedAccountGoneMessage`; `Post.connection_ids`.
- Produces:
  - `lib/publishResults.ts`:
    - types `AccountSuccess`, `AccountFailure`, `AccountEntry`, `PlatformSummary`, `AccountOutcome { connection_id; account_name; success; post_id?; url?; error? }`, `PlatformPublishResult { platform; success; post_id?; url?; error?; accounts?: AccountOutcome[] }`, `PostRef { connection_id: string | null; post_id; url }`
    - `isSuccessfulResult(entry)`, `accountEntries(entry)`, `isLegacySuccess(entry)`, `storedOutcome(entry, connectionId)`
    - `mergePlatformResult(entry, outcomes, order, at, platformError?): PlatformSummary`
    - `toPlatformResult(platform, summary, accounts?)`, `outcomeLabels(results)`, `successfulPostRefs(entry): PostRef[]`
  - `lib/publishDirect.ts`:
    - `type PublishPlatform = 'facebook' | 'instagram' | 'gmb' | 'youtube'`
    - `PublishDirectData` gains `connection_id`, `caption_text`, `hashtags`; `PublishablePost` gains optional `connection_ids`
    - `YOUTUBE_VIDEO_ONLY`, `GMB_NO_VIDEO`, `unsupportedMediaError(platform, mediaType)`
    - `resolveAccessToken` refreshes YouTube tokens too; `buildPublishData`, `publishPost` and `publishPostToPlatform` work per account
    - Re-exports `platformLabel`, `isSuccessfulResult` and type `PlatformPublishResult`, so existing imports (`cron.ts`, `inboxView.ts`, `metricsSync.ts`, `publisher.ts`) keep working.
  - `queues/index.ts`: `type PublishJobData = PublishDirectData`.
- Stored shape (the contract for every reader):
  - `publish_results[platform]`, success: `{ post_id, url, published_at, accounts }`. `post_id` and `url` belong to the first successful account in target order (primary first).
  - Failure: `{ error, failed_at, accounts? }`.
  - `accounts[connectionId]` is `{ account_name, post_id, url, published_at }` or `{ account_name, error, failed_at }`.
  - Entries written before this change have no `accounts`. A succeeded one counts as done, as before.

- [ ] **Step 1: Write the failing test** — `apps/api/test/publish-accounts.test.ts`:

```ts
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import {
  GMB_NO_VIDEO, YOUTUBE_VIDEO_ONLY, buildPublishData, publishPost, publishPostToPlatform, unsupportedMediaError,
} from '../src/lib/publishDirect.js';
import {
  isLegacySuccess, mergePlatformResult, outcomeLabels, storedOutcome, successfulPostRefs, toPlatformResult, type AccountOutcome,
} from '../src/lib/publishResults.js';

const AT = '2026-09-24T10:00:00.000Z';
const ok = (id: string, name: string, postId: string): AccountOutcome => ({ connection_id: id, account_name: name, success: true, post_id: postId, url: `https://fb.test/${postId}` });
const bad = (id: string, name: string, error: string): AccountOutcome => ({ connection_id: id, account_name: name, success: false, error });

describe('per-account results', () => {
  it('summarises with the first successful account in target order', () => {
    assert.deepEqual(mergePlatformResult(undefined, [bad('a', 'Page A', 'Token expired'), ok('b', 'Page B', 'post-b')], ['a', 'b'], AT), {
      post_id: 'post-b', url: 'https://fb.test/post-b', published_at: AT,
      accounts: {
        a: { account_name: 'Page A', error: 'Token expired', failed_at: AT },
        b: { account_name: 'Page B', post_id: 'post-b', url: 'https://fb.test/post-b', published_at: AT },
      },
    });
  });

  it('never replaces an account that already has the post', () => {
    const first = mergePlatformResult(undefined, [ok('a', 'Page A', 'post-a'), bad('b', 'Page B', 'Timeout')], ['a', 'b'], AT);
    const retry = mergePlatformResult(first, [bad('a', 'Page A', 'must not land'), ok('b', 'Page B', 'post-b')], ['a', 'b'], '2026-09-24T11:00:00.000Z');
    assert.deepEqual([retry.post_id, retry.published_at], ['post-a', AT]);
    assert.equal(storedOutcome(retry, 'b')?.post_id, 'post-b');
    assert.equal(storedOutcome(first, 'b'), null);
  });

  it('names each account when all fail, and uses the platform error when none could be tried', () => {
    assert.equal(mergePlatformResult(undefined, [bad('a', 'Page A', 'x')], ['a'], AT).error, 'x');
    assert.equal(mergePlatformResult(undefined, [bad('a', 'Page A', 'x'), bad('b', 'Page B', 'y')], ['a', 'b'], AT).error, 'Page A: x; Page B: y');
    assert.deepEqual(mergePlatformResult(undefined, [], [], AT, 'No connected Facebook account.'), { error: 'No connected Facebook account.', failed_at: AT });
  });

  it('treats a result written before accounts as done when it succeeded', () => {
    const legacy = { post_id: 'fb-1', url: 'https://fb.test/1', published_at: AT };
    assert.equal(isLegacySuccess(legacy), true);
    assert.equal(isLegacySuccess({ error: 'x' }), false);
    assert.equal(isLegacySuccess(mergePlatformResult(undefined, [ok('a', 'Page A', 'p')], ['a'], AT)), false);
    assert.deepEqual(successfulPostRefs(legacy), [{ connection_id: null, post_id: 'fb-1', url: 'https://fb.test/1' }]);
    const mixed = mergePlatformResult(undefined, [ok('a', 'A', 'p-a'), bad('b', 'B', 'x'), ok('c', 'C', 'p-c')], ['a', 'b', 'c'], AT);
    assert.deepEqual(successfulPostRefs(mixed).map((r) => [r.connection_id, r.post_id]), [['a', 'p-a'], ['c', 'p-c']]);
  });

  it('names accounts in notifications only when a platform had several', () => {
    const fbAccounts = [ok('a', 'Apex Motors', 'p'), bad('b', 'Apex Used', 'x')];
    const results = [
      toPlatformResult('facebook', mergePlatformResult(undefined, fbAccounts, ['a', 'b'], AT), fbAccounts),
      toPlatformResult('youtube', { post_id: 'v1', url: 'https://youtube.com/shorts/v1' }, [ok('y', 'Apex TV', 'v1')]),
      toPlatformResult('gmb', { error: 'No connected Google Business Profile account.' }),
    ];
    assert.deepEqual(results.map((r) => [r.platform, r.success]), [['facebook', true], ['youtube', true], ['gmb', false]]);
    assert.deepEqual(outcomeLabels(results), {
      publishedOn: ['Facebook (Apex Motors)', 'YouTube'],
      failedOn: ['Facebook (Apex Used)', 'Google Business Profile'],
    });
  });

  it('refuses media a platform cannot take', () => {
    assert.equal(unsupportedMediaError('youtube', 'image'), YOUTUBE_VIDEO_ONLY);
    assert.equal(unsupportedMediaError('youtube', 'video'), null);
    assert.equal(unsupportedMediaError('gmb', 'video'), GMB_NO_VIDEO);
    assert.equal(unsupportedMediaError('facebook', 'video'), null);
  });
});

async function dealerWithPages() {
  const dealer = await prisma.dealer.create({ data: { name: 'Multi Page Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const author = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Author', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const page = (name: string, created: string) => {
    const id = `page-${randomUUID()}`;
    return prisma.platformConnection.create({
      data: { dealer_id: dealer.id, platform: 'facebook', platform_account_id: id, platform_account_name: name, access_token: `token-${id}`, is_connected: true, created_at: new Date(created) },
    });
  };
  const first = await page('Apex Motors', '2026-09-01T00:00:00Z');
  const second = await page('Apex Used Cars', '2026-09-02T00:00:00Z');
  return { dealerId: dealer.id, author, first, second };
}

// Stubs Facebook photo posts; pages listed in failFor answer with an error.
function mockPhotos(t: TestContext, failFor: string[] = []) {
  const sent: Array<{ pageId: string; token: string }> = [];
  t.mock.method(axios, 'post', async (url: string, body: { access_token?: string }) => {
    const pageId = url.split('/').at(-2) ?? '';
    if (failFor.includes(pageId)) throw new Error('(#200) Permissions error');
    sent.push({ pageId, token: String(body.access_token) });
    return { data: { id: `photo-${pageId}` } };
  });
  return sent;
}

const newPost = (dealerId: string, createdBy: string, extra: Record<string, unknown> = {}) => prisma.post.create({
  data: {
    dealer_id: dealerId, prompt_text: 'Diwali offers', caption_text: 'Visit us', caption_hashtags: [],
    creative_urls: { facebook: 'https://cdn.test/fb.jpg' }, platforms: ['facebook'], status: 'publishing', created_by: createdBy, ...extra,
  },
});

describe('publishPost with several accounts', () => {
  it('sends to the primary Page when the post names none', async (t) => {
    const g = await dealerWithPages();
    const sent = mockPhotos(t);

    const outcome = await publishPost(await newPost(g.dealerId, g.author.id), ['facebook']);

    assert.deepEqual(sent, [{ pageId: g.first.platform_account_id, token: g.first.access_token }]);
    assert.deepEqual(outcome.results[0]?.accounts?.map((a) => a.connection_id), [g.first.id]);
  });

  it('sends to every named Page with its own token and summarises with the primary', async (t) => {
    const g = await dealerWithPages();
    const sent = mockPhotos(t);
    const post = await newPost(g.dealerId, g.author.id, { connection_ids: [g.second.id, g.first.id] });

    const outcome = await publishPost(post, ['facebook']);

    assert.equal(outcome.status, 'published');
    assert.deepEqual(sent.map((s) => s.token).sort(), [g.first.access_token, g.second.access_token].sort());
    const stored = (await prisma.post.findUnique({ where: { id: post.id } }))?.publish_results as Record<string, { post_id: string; accounts: Record<string, unknown> }>;
    assert.equal(stored['facebook']?.post_id, `photo-${g.first.platform_account_id}`);
    assert.deepEqual(Object.keys(stored['facebook']?.accounts ?? {}).sort(), [g.first.id, g.second.id].sort());
    const [notice] = await prisma.notification.findMany({ where: { user_id: g.author.id } });
    assert.equal(notice?.body, '"Diwali offers" is live on Facebook (Apex Motors) and Facebook (Apex Used Cars).');
  });

  it('retries only the Page that failed', async (t) => {
    const g = await dealerWithPages();
    const post = await newPost(g.dealerId, g.author.id, { connection_ids: [g.first.id, g.second.id] });
    mockPhotos(t, [g.second.platform_account_id]);

    const first = await publishPost(post, ['facebook']);
    assert.equal(first.status, 'published');
    assert.equal(first.results[0]?.accounts?.find((a) => a.connection_id === g.second.id)?.success, false);

    t.mock.restoreAll();
    const sent = mockPhotos(t);
    await publishPost(post, ['facebook']);
    assert.deepEqual(sent.map((s) => s.pageId), [g.second.platform_account_id]);
  });

  it('fails a platform whose named Pages were all disconnected', async (t) => {
    const g = await dealerWithPages();
    await prisma.platformConnection.update({ where: { id: g.second.id }, data: { is_connected: false } });
    const sent = mockPhotos(t);

    const outcome = await publishPost(await newPost(g.dealerId, g.author.id, { connection_ids: [g.second.id] }), ['facebook']);

    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.results[0]?.error, 'The selected Facebook account is no longer connected. Reconnect it or pick another account, then publish again.');
    assert.equal(sent.length, 0);
  });

  it('fails an image post to YouTube before any token refresh', async (t) => {
    const g = await dealerWithPages();
    await prisma.platformConnection.create({
      data: { dealer_id: g.dealerId, platform: 'youtube', platform_account_id: 'UC-x', access_token: 'ya29.x', refresh_token: '1//r', token_expires_at: new Date(0), is_connected: true },
    });
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('no token refresh expected'); });

    const outcome = await publishPost(await newPost(g.dealerId, g.author.id, { platforms: ['youtube'] }), ['youtube']);

    assert.equal(outcome.results[0]?.error, YOUTUBE_VIDEO_ONLY);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});

describe('publishPostToPlatform (queue worker)', () => {
  it('records the job account and never sends it twice', async (t) => {
    const g = await dealerWithPages();
    const post = await newPost(g.dealerId, g.author.id, { connection_ids: [g.second.id] });
    const sent = mockPhotos(t);
    const job = buildPublishData(post, 'facebook', g.second);

    await publishPostToPlatform(job);
    await publishPostToPlatform(job);

    assert.equal(sent.length, 1);
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'published');
    const fb = (stored?.publish_results as Record<string, { post_id: string; accounts: Record<string, unknown> }>)['facebook'];
    assert.deepEqual([fb?.post_id, Object.keys(fb?.accounts ?? {})], [`photo-${g.second.platform_account_id}`, [g.second.id]]);
  });

  it('sends a job queued before per-account publishing to the primary Page', async (t) => {
    const g = await dealerWithPages();
    const post = await newPost(g.dealerId, g.author.id);
    const sent = mockPhotos(t);

    await publishPostToPlatform({ ...buildPublishData(post, 'facebook', g.second), connection_id: '' });

    assert.deepEqual(sent.map((s) => s.pageId), [g.first.platform_account_id]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publish-accounts.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/publishResults.js'`).

- [ ] **Step 3: `apps/api/src/lib/publishResults.ts`**

```ts
import { platformLabel } from './connections.js';

// publish_results[platform] stays a per-platform summary, so the readers written before accounts existed keep
// working (Posts links, analytics, metrics, inbox post matching). Per-account detail sits under `accounts`,
// keyed by PlatformConnection.id:
//   success (an account has the post): { post_id, url, published_at, accounts }  (first success in target order)
//   failure (none has it):             { error, failed_at, accounts? }         (no `accounts` when none was tried)
// Entries written before per-account publishing have no `accounts` map.

export interface AccountSuccess { account_name: string; post_id: string; url: string; published_at: string }
export interface AccountFailure { account_name: string; error: string; failed_at: string }
export type AccountEntry = AccountSuccess | AccountFailure;

export interface PlatformSummary {
  post_id?: string;
  url?: string;
  published_at?: string;
  error?: string;
  failed_at?: string;
  accounts?: Record<string, AccountEntry>;
}

export interface AccountOutcome {
  connection_id: string;
  account_name: string;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
}

export interface PlatformPublishResult {
  platform: string;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
  /** Each target account, when the platform had any: sent now, or already live from an earlier attempt. */
  accounts?: AccountOutcome[];
}

export interface PostRef {
  /** null for a result written before per-account publishing (the account is not recorded). */
  connection_id: string | null;
  post_id: string;
  url: string;
}

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function isSuccessfulResult(entry: unknown): boolean {
  return isObject(entry) && typeof entry['post_id'] === 'string' && !entry['error'];
}

const isAccountSuccess = (entry: AccountEntry | undefined): entry is AccountSuccess => !!entry && 'post_id' in entry;

/** The per-account map of a platform entry; empty for older entries. */
export function accountEntries(entry: unknown): Record<string, AccountEntry> {
  const out: Record<string, AccountEntry> = {};
  if (!isObject(entry) || !isObject(entry['accounts'])) return out;
  for (const [id, value] of Object.entries(entry['accounts'])) {
    if (!isObject(value)) continue;
    const account_name = text(value['account_name']);
    if (isSuccessfulResult(value)) {
      out[id] = { account_name, post_id: text(value['post_id']), url: text(value['url']), published_at: text(value['published_at']) };
    } else if (typeof value['error'] === 'string') {
      out[id] = { account_name, error: value['error'], failed_at: text(value['failed_at']) };
    }
  }
  return out;
}

/** A result written before per-account publishing that succeeded: that platform is done, as before. */
export function isLegacySuccess(entry: unknown): boolean {
  return isSuccessfulResult(entry) && !(isObject(entry) && isObject(entry['accounts']));
}

/** An account that already has the post, as an outcome; it is never sent again. */
export function storedOutcome(entry: unknown, connectionId: string): AccountOutcome | null {
  const account = accountEntries(entry)[connectionId];
  if (!isAccountSuccess(account)) return null;
  return { connection_id: connectionId, account_name: account.account_name, success: true, post_id: account.post_id, url: account.url };
}

function failureText(failures: AccountFailure[]): string {
  const [only] = failures;
  if (!only) return 'Unknown error';
  if (failures.length === 1) return only.error;
  return failures.map((f) => `${f.account_name}: ${f.error}`).join('; ');
}

/**
 * Merges this attempt's outcomes into a platform entry. A success is never replaced.
 * `order` lists the target connection ids, primary first. `platformError` is the failure text when
 * nothing could be tried (no connected account, or media the platform can't take).
 */
export function mergePlatformResult(
  entry: unknown,
  outcomes: readonly AccountOutcome[],
  order: readonly string[],
  at: string,
  platformError?: string,
): PlatformSummary {
  const accounts = accountEntries(entry);
  for (const o of outcomes) {
    if (isAccountSuccess(accounts[o.connection_id])) continue;
    accounts[o.connection_id] = o.success
      ? { account_name: o.account_name, post_id: o.post_id ?? '', url: o.url ?? '', published_at: at }
      : { account_name: o.account_name, error: o.error ?? 'Unknown error', failed_at: at };
  }
  const ids = [...order.filter((id) => id in accounts), ...Object.keys(accounts).filter((id) => !order.includes(id))];
  const first = ids.map((id) => accounts[id]).find(isAccountSuccess);
  if (first) return { post_id: first.post_id, url: first.url, published_at: first.published_at, accounts };
  const failures = ids.map((id) => accounts[id]).filter((a): a is AccountFailure => !!a && !isAccountSuccess(a));
  return { error: platformError ?? failureText(failures), failed_at: at, ...(ids.length > 0 ? { accounts } : {}) };
}

/** The API's per-platform result from a stored summary and this attempt's account outcomes. */
export function toPlatformResult(platform: string, summary: unknown, accounts: readonly AccountOutcome[] = []): PlatformPublishResult {
  const extra = accounts.length > 0 ? { accounts: [...accounts] } : {};
  if (isSuccessfulResult(summary)) {
    const s = summary as Loose;
    const url = text(s['url']);
    return { platform, success: true, post_id: text(s['post_id']), ...(url ? { url } : {}), ...extra };
  }
  const error = isObject(summary) && typeof summary['error'] === 'string' ? summary['error'] : 'Unknown error';
  return { platform, success: false, error, ...extra };
}

/** Names for the publish notification: "Facebook", or "Facebook (Page name)" per account when a platform had several. */
export function outcomeLabels(results: readonly PlatformPublishResult[]): { publishedOn: string[]; failedOn: string[] } {
  const publishedOn: string[] = [];
  const failedOn: string[] = [];
  for (const r of results) {
    const label = platformLabel(r.platform);
    const accounts = r.accounts ?? [];
    if (accounts.length > 1) {
      for (const a of accounts) (a.success ? publishedOn : failedOn).push(`${label} (${a.account_name})`);
    } else {
      (r.success ? publishedOn : failedOn).push(label);
    }
  }
  return { publishedOn, failedOn };
}

/** Every platform post a result holds: one per successful account, or the older top-level one. */
export function successfulPostRefs(entry: unknown): PostRef[] {
  const accounts = accountEntries(entry);
  const ids = Object.keys(accounts);
  if (ids.length > 0) {
    return ids.flatMap((id) => {
      const account = accounts[id];
      return isAccountSuccess(account) ? [{ connection_id: id, post_id: account.post_id, url: account.url }] : [];
    });
  }
  if (!isSuccessfulResult(entry)) return [];
  const e = entry as Loose;
  return [{ connection_id: null, post_id: text(e['post_id']), url: text(e['url']) }];
}
```

- [ ] **Step 4: `apps/api/src/lib/publishDirect.ts`** — replace the whole file:

```ts
import axios from 'axios';
import type { Prisma, Post, PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { publishToFacebook, publishToInstagram, publishReelToInstagram, publishVideoToFacebook } from '../services/meta.js';
import { publishToGmb } from '../services/gmb.js';
import { getFreshGoogleAccessToken } from './googleToken.js';
import { notifyPublishOutcome } from './postNotifications.js';
import { transitionPost } from './publishClaim.js';
import {
  byAge, noConnectedAccountMessage, platformLabel, primaryConnection, resolveTargets, selectedAccountGoneMessage,
} from './connections.js';
import {
  isLegacySuccess, isSuccessfulResult, mergePlatformResult, outcomeLabels, storedOutcome, toPlatformResult,
  type AccountOutcome, type PlatformPublishResult,
} from './publishResults.js';

export { platformLabel } from './connections.js';
export { isSuccessfulResult } from './publishResults.js';
export type { PlatformPublishResult } from './publishResults.js';

export type PublishPlatform = 'facebook' | 'instagram' | 'gmb' | 'youtube';

export interface PublishDirectData {
  post_id: string;
  dealer_id: string;
  platform: PublishPlatform;
  /** The PlatformConnection this publishes to (one account per job). */
  connection_id: string;
  image_url: string;
  /** What platforms receive: the caption, a blank line, then the hashtags. */
  caption: string;
  /** The caption text alone and the post's hashtags (YouTube builds its title and tags from them). */
  caption_text: string;
  hashtags: string[];
  access_token: string;
  page_id?: string;
  ig_user_id?: string;
  gmb_location_name?: string;
  dealer_phone?: string;
  dealer_whatsapp?: string;
  media_type: 'image' | 'video';
  video_url: string;
}

export interface PostPublishOutcome {
  status: 'published' | 'failed';
  results: PlatformPublishResult[];
}

export type PublishablePost = Pick<Post, 'id' | 'dealer_id' | 'caption_text' | 'creative_urls'>
  & Partial<Pick<Post, 'media_type' | 'video_url' | 'caption_hashtags' | 'connection_ids'>>;

export const YOUTUBE_VIDEO_ONLY = "YouTube takes video posts only. Remove it from this post's platforms.";
export const GMB_NO_VIDEO = "Google Business Profile doesn't support video posts. Remove it from this post's platforms.";

/** A platform that can't take this kind of post fails before any account is tried (and before a token refresh). */
export function unsupportedMediaError(platform: string, mediaType: string | null | undefined): string | null {
  const video = mediaType === 'video';
  if (platform === 'youtube' && !video) return YOUTUBE_VIDEO_ONLY;
  if (platform === 'gmb' && video) return GMB_NO_VIDEO;
  return null;
}

function toJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

// Graph API and Google APIs both return { error: { message } }; prefer that over axios' generic text.
export function describePublishError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const apiMessage = (err.response?.data as { error?: { message?: unknown } } | undefined)?.error?.message;
    if (typeof apiMessage === 'string' && apiMessage) return apiMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

// A token that is safe to publish with: Google tokens (Business Profile, YouTube) are renewed, expired Meta ones refused.
export async function resolveAccessToken(conn: PlatformConnection): Promise<string> {
  if (conn.platform === 'gmb' || conn.platform === 'youtube') return getFreshGoogleAccessToken(conn);
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() <= Date.now()) {
    const label = platformLabel(conn.platform);
    throw new Error(`${label} access expired. Reconnect ${label} in Settings, then publish again.`);
  }
  return conn.access_token;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A tag the caption already contains as a whole tag (not a prefix of a longer one), ignoring case.
function captionHasTag(caption: string, tag: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_#])${escapeRegExp(tag)}(?![\\p{L}\\p{M}\\p{N}_])`, 'iu').test(caption);
}

/**
 * The text platforms receive: the caption, a blank line, then the post's hashtags.
 * Tags already in the caption (older posts wrote them into it) aren't repeated.
 */
export function captionWithHashtags(caption: string, hashtags: readonly string[]): string {
  const tags: string[] = [];
  for (const raw of hashtags) {
    const name = raw.trim().replace(/^#+/, '');
    if (!name) continue;
    const tag = `#${name}`;
    if (captionHasTag(caption, tag) || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
  }
  if (tags.length === 0) return caption;
  const body = caption.trimEnd();
  return body ? `${body}\n\n${tags.join(' ')}` : tags.join(' ');
}

// The fields that say which account a publish goes to.
function accountFields(platform: string, conn: PlatformConnection): Pick<PublishDirectData, 'connection_id' | 'page_id' | 'ig_user_id' | 'gmb_location_name'> {
  return {
    connection_id: conn.id,
    ...(platform === 'facebook' ? { page_id: conn.platform_account_id } : {}),
    ...(platform === 'instagram' ? { ig_user_id: conn.platform_account_id } : {}),
    ...(platform === 'gmb' ? { gmb_location_name: conn.platform_account_id } : {}),
  };
}

export function buildPublishData(
  post: PublishablePost,
  platform: string,
  conn: PlatformConnection,
  accessToken = conn.access_token,
): PublishDirectData {
  const captionText = post.caption_text ?? '';
  const hashtags = post.caption_hashtags ?? [];
  return {
    post_id: post.id,
    dealer_id: post.dealer_id,
    platform: platform as PublishPlatform,
    ...accountFields(platform, conn),
    image_url: (post.creative_urls as Record<string, string> | null)?.[platform] ?? '',
    // Every path to a platform (direct, cron and queued jobs) sends this caption.
    caption: captionWithHashtags(captionText, hashtags),
    caption_text: captionText,
    hashtags: [...hashtags],
    access_token: accessToken,
    media_type: post.media_type === 'video' ? 'video' : 'image',
    video_url: post.video_url ?? '',
  };
}

async function sendVideoToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  const { platform, video_url, caption, access_token } = data;
  if (!video_url) throw new Error('This post has no video to publish.');
  if (platform === 'facebook') {
    if (!data.page_id) throw new Error('page_id required for Facebook publish');
    const result = await publishVideoToFacebook(data.page_id, access_token, video_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'instagram') {
    if (!data.ig_user_id) throw new Error('ig_user_id required for Instagram publish');
    const result = await publishReelToInstagram(data.ig_user_id, access_token, video_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'gmb') throw new Error(GMB_NO_VIDEO);
  throw new Error(`${platformLabel(platform)} video publishing isn't available yet.`);
}

// Calls the platform API only; no database writes.
async function sendToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  if (data.media_type === 'video') return sendVideoToPlatform(data);
  const { platform, image_url, caption, access_token } = data;
  if (platform === 'facebook') {
    if (!data.page_id) throw new Error('page_id required for Facebook publish');
    const result = await publishToFacebook(data.page_id, access_token, image_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'instagram') {
    if (!data.ig_user_id) throw new Error('ig_user_id required for Instagram publish');
    const result = await publishToInstagram(data.ig_user_id, access_token, image_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'gmb') {
    if (!data.gmb_location_name) throw new Error('gmb_location_name required for GMB publish');
    const result = await publishToGmb(
      data.gmb_location_name,
      access_token,
      image_url,
      caption.slice(0, 1500),
      data.dealer_phone ? { actionType: 'CALL', phone: data.dealer_phone } : undefined,
    );
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'youtube') throw new Error(YOUTUBE_VIDEO_ONLY);
  throw new Error(`Unknown platform: ${platform}`);
}

function accountName(conn: PlatformConnection): string {
  return conn.platform_account_name ?? platformLabel(conn.platform);
}

// One account of one platform: skipped when it already has the post, otherwise sent with that account's token.
async function publishToAccount(post: PublishablePost, platform: string, conn: PlatformConnection, previous: unknown): Promise<AccountOutcome> {
  const stored = storedOutcome(previous, conn.id);
  if (stored) return stored;
  try {
    const accessToken = await resolveAccessToken(conn);
    const sent = await sendToPlatform(buildPublishData(post, platform, conn, accessToken));
    return { connection_id: conn.id, account_name: accountName(conn), success: true, post_id: sent.platform_post_id, url: sent.url };
  } catch (err) {
    return { connection_id: conn.id, account_name: accountName(conn), success: false, error: describePublishError(err) };
  }
}

// Publishes a post to every target account of every requested platform, then writes the outcome once:
// 'published' if at least one account succeeded, 'failed' only if all of them failed. An account that
// already has the post is never sent it again, so a retry resends only to the failed accounts.
// The caller is expected to have claimed the post (status 'publishing') first.
export async function publishPost(post: PublishablePost, platforms: string[]): Promise<PostPublishOutcome> {
  const [connections, existing] = await Promise.all([
    prisma.platformConnection.findMany({ where: { dealer_id: post.dealer_id } }),
    prisma.post.findUnique({ where: { id: post.id } }),
  ]);
  const previousResults = toJsonObject(existing?.publish_results);
  const plans = resolveTargets({ platforms, connection_ids: post.connection_ids ?? existing?.connection_ids ?? [] }, connections);
  const at = new Date().toISOString();

  const settled = await Promise.all(plans.map(async (plan) => {
    const previous: unknown = previousResults[plan.platform];
    // Published before per-account results existed: that platform is done, as before.
    if (isLegacySuccess(previous)) return { platform: plan.platform, summary: previous, outcomes: [] as AccountOutcome[] };
    const blocked = unsupportedMediaError(plan.platform, post.media_type) ?? plan.error;
    const outcomes = blocked ? [] : await Promise.all(plan.targets.map((conn) => publishToAccount(post, plan.platform, conn, previous)));
    const summary: unknown = mergePlatformResult(previous, outcomes, plan.targets.map((c) => c.id), at, blocked ?? undefined);
    return { platform: plan.platform, summary, outcomes };
  }));

  const results = settled.map((s) => toPlatformResult(s.platform, s.summary, s.outcomes));
  const status = results.some((r) => r.success) ? 'published' : 'failed';
  const publishResults: Record<string, unknown> = { ...previousResults };
  for (const s of settled) publishResults[s.platform] = s.summary;

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status,
      publish_results: publishResults as Prisma.InputJsonObject,
      ...(status === 'published' ? { published_at: new Date(at) } : {}),
    },
  });

  await notifyPublishOutcome({
    post: {
      id: post.id,
      dealer_id: post.dealer_id,
      prompt_text: existing?.prompt_text ?? '',
      created_by: existing?.created_by ?? null,
    },
    status,
    ...outcomeLabels(results),
  });

  return { status, results };
}

// Queue worker path: one account per job. Records that account's result and derives the post status from all
// recorded results, so one account's failure can't mask another's success.
export async function publishPostToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  const { post_id, platform } = data;
  const connections = await prisma.platformConnection.findMany({ where: { dealer_id: data.dealer_id, platform } });
  // Jobs queued before per-account publishing carry no connection_id: they go to the primary account.
  const conn = data.connection_id
    ? connections.find((c) => c.id === data.connection_id && c.is_connected) ?? null
    : primaryConnection(connections, platform);

  const before = await prisma.post.findUnique({ where: { id: post_id } });
  const previous: unknown = toJsonObject(before?.publish_results)[platform];
  if (isLegacySuccess(previous)) {
    const entry = previous as { post_id: string; url?: unknown };
    return { platform_post_id: entry.post_id, url: typeof entry.url === 'string' ? entry.url : '' };
  }
  const done = conn ? storedOutcome(previous, conn.id) : null;
  if (done?.post_id) return { platform_post_id: done.post_id, url: done.url ?? '' };

  let sent: { platform_post_id: string; url: string } | null = null;
  let failure: unknown = null;
  try {
    // Keeps the cron sweep from also claiming a queued scheduled post.
    await transitionPost(post_id, (p) => p.status === 'scheduled', { status: 'publishing' });
    if (!conn) throw new Error(data.connection_id ? selectedAccountGoneMessage(platform) : noConnectedAccountMessage(platform));
    const blocked = unsupportedMediaError(platform, data.media_type);
    if (blocked) throw new Error(blocked);
    // The account fields come from the resolved connection, so an older job reaches the primary account's Page.
    sent = await sendToPlatform({ ...data, ...accountFields(platform, conn), access_token: await resolveAccessToken(conn) });
  } catch (err) {
    failure = err;
  }

  const at = new Date().toISOString();
  const existing = await prisma.post.findUnique({ where: { id: post_id } });
  const publishResults: Record<string, unknown> = { ...toJsonObject(existing?.publish_results) };
  const order = [...connections].sort(byAge).map((c) => c.id);
  if (conn) {
    const outcome: AccountOutcome = sent
      ? { connection_id: conn.id, account_name: accountName(conn), success: true, post_id: sent.platform_post_id, url: sent.url }
      : { connection_id: conn.id, account_name: accountName(conn), success: false, error: describePublishError(failure) };
    publishResults[platform] = mergePlatformResult(publishResults[platform], [outcome], order, at);
  } else {
    publishResults[platform] = mergePlatformResult(publishResults[platform], [], order, at, describePublishError(failure));
  }
  const targets = existing?.platforms?.length ? existing.platforms : [platform];
  const anySucceeded = targets.some((p) => isSuccessfulResult(publishResults[p]));

  await prisma.post.update({
    where: { id: post_id },
    data: {
      status: anySucceeded ? 'published' : 'failed',
      publish_results: publishResults as Prisma.InputJsonObject,
      ...(sent ? { published_at: new Date(at) } : {}),
    },
  });

  if (!sent) throw failure;
  return sent;
}
```

- [ ] **Step 5: `apps/api/src/queues/index.ts`** — add `import type { PublishDirectData } from '../lib/publishDirect.js';` after the bullmq import, and replace the `PublishJobData` interface with:

```ts
/** One publish job: one post to one account (lib/publishDirect.ts). */
export type PublishJobData = PublishDirectData;
```

- [ ] **Step 6: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publish-accounts.test.ts test/publish-lifecycle.test.ts test/publish-video.test.ts test/publish-notifications.test.ts test/publish-instagram.test.ts test/cron.test.ts test/inbox-routes.test.ts test/inbox-ingest.test.ts test/metrics-sync.test.ts test/workers.test.ts
cd ../.. && npm run build
```
Expected:
- All pass (`publish-accounts`: 13). The existing publish and cron tests pass unchanged: results written before this change are still honoured, and their summary fields are unchanged.
- The build exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/publishResults.ts apps/api/src/lib/publishDirect.ts apps/api/src/queues/index.ts apps/api/test/publish-accounts.test.ts
git commit -m "feat(api): publish to each target account and record per-account results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Posts name their accounts; queue jobs per account

**Files:**
- Modify: `apps/api/src/lib/connections.ts` (add `CONNECTION_IDS_MESSAGE`, `parseConnectionIds`), `apps/api/src/lib/connectionStore.ts` (add `ownConnectionIds`), `apps/api/src/lib/publishDirect.ts` (add `PublishJob`, `publishJobs`), `apps/api/src/routes/publisher.ts`
- Test: `apps/api/test/publisher-accounts.test.ts`

**Interfaces:**
- Consumes (Tasks 1, 3): `resolveTargets`, `MAX_CONNECTED_ACCOUNTS`, `buildPublishData`, `isLegacySuccess`, `storedOutcome`, `publishPost`.
- Produces:
  - `CONNECTION_IDS_MESSAGE`, `parseConnectionIds(value: unknown): string[] | null` (`lib/connections.ts`)
  - `ownConnectionIds(dealerId, ids): Promise<string[]>` (`lib/connectionStore.ts`)
  - `interface PublishJob { name; data: PublishDirectData }`, `publishJobs(post, platforms, connections): { jobs: PublishJob[]; skipped: string[] }` (`lib/publishDirect.ts`)
  - HTTP:
    - `POST /v1/publisher` and `PATCH /v1/publisher/posts/:id` accept `connectionIds?: string[]` (at most 30). Only the dealer's own account ids are kept; an invalid value is 400 `INVALID_INPUT`.
    - Posts return `connection_ids`. Changing `connectionIds` counts as a content edit (it sends an approved post back to draft).
    - `POST /v1/publisher/publish` targets accounts; its `results[]` gain `accounts`.

- [ ] **Step 1: Write the failing test** — `apps/api/test/publisher-accounts.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { registerJwt } from '../src/plugins/jwt.js';
import { registerPlanGate } from '../src/plugins/planGate.js';
import publisherRoutes from '../src/routes/publisher.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { CONNECTION_IDS_MESSAGE, parseConnectionIds } from '../src/lib/connections.js';
import { publishJobs } from '../src/lib/publishDirect.js';

let app: FastifyInstance;

before(async () => {
  process.env['JWT_SECRET'] ??= 'publisher-accounts-secret';
  app = Fastify();
  await registerJwt(app);
  await registerPlanGate(app);
  await app.register(publisherRoutes, { prefix: '/v1/publisher' });
  await app.ready();
});

after(async () => {
  await app.close();
});

function auth(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `user-${dealerId}`, dealer_id: dealerId, role: 'admin', phone: `phone-${dealerId}`, permissions: resolvePermissions('admin'),
  };
  return { authorization: `Bearer ${app.jwt.sign(payload)}` };
}

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Target Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } })).id;
}

const page = (dealerId: string, id: string, created: string) => prisma.platformConnection.create({
  data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: id, platform_account_name: `Page ${id}`, access_token: `token-${id}`, is_connected: true, created_at: new Date(created) },
});

const createPost = (dealerId: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/v1/publisher', headers: auth(dealerId), payload: { promptText: 'Diwali offers', platforms: ['facebook'], ...payload } });

describe('connectionIds on posts', () => {
  it("keeps only the dealership's own account ids", async () => {
    const dealerId = await newDealer();
    const mine = await page(dealerId, `own-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const theirs = await page(await newDealer(), `other-${randomUUID()}`, '2026-09-01T00:00:00Z');

    const res = await createPost(dealerId, { connectionIds: [mine.id, theirs.id, 'no-such-account', mine.id] });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().item.connection_ids, [mine.id]);
    assert.deepEqual((await createPost(dealerId, {})).json().item.connection_ids, []);
  });

  it('rejects anything but a short list of ids', async () => {
    const dealerId = await newDealer();
    for (const connectionIds of ['abc', [1], [''], Array.from({ length: 31 }, (_, i) => `c${i}`)]) {
      const res = await createPost(dealerId, { connectionIds });
      assert.equal(res.statusCode, 400, JSON.stringify(connectionIds));
      assert.equal(res.json().error.message, CONNECTION_IDS_MESSAGE);
    }
    assert.deepEqual(parseConnectionIds(['a', 'a', 'b']), ['a', 'b']);
  });

  it('changes the accounts of a draft', async () => {
    const dealerId = await newDealer();
    const a = await page(dealerId, `a-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const b = await page(dealerId, `b-${randomUUID()}`, '2026-09-02T00:00:00Z');
    const id = (await createPost(dealerId, { connectionIds: [a.id] })).json().item.id as string;

    const res = await app.inject({ method: 'PATCH', url: `/v1/publisher/posts/${id}`, headers: auth(dealerId), payload: { connectionIds: [b.id] } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().item.connection_ids, [b.id]);
  });
});

describe('publishing to the chosen accounts', () => {
  it('publishes only to the Page the post names', async (t) => {
    const dealerId = await newDealer();
    await page(dealerId, `first-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const second = await page(dealerId, `second-${randomUUID()}`, '2026-09-02T00:00:00Z');
    const urls: string[] = [];
    t.mock.method(axios, 'post', async (url: string) => {
      urls.push(url);
      return { data: { id: `photo-${urls.length}` } };
    });
    const id = (await createPost(dealerId, { captionText: 'Offers', creativeUrls: { facebook: 'https://cdn.test/a.jpg' }, connectionIds: [second.id] })).json().item.id as string;

    const res = await app.inject({ method: 'POST', url: '/v1/publisher/publish', headers: auth(dealerId), payload: { post_id: id, platforms: ['facebook'] } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(urls, [`https://graph.facebook.com/v19.0/${second.platform_account_id}/photos`]);
    const [fb] = res.json().results as Array<{ accounts: Array<{ connection_id: string }> }>;
    assert.deepEqual(fb?.accounts.map((a) => a.connection_id), [second.id]);
  });
});

describe('publishJobs (queue path)', () => {
  it('queues one job per account still to publish and skips platforms it cannot target', async () => {
    const dealerId = await newDealer();
    const a = await page(dealerId, `qa-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const b = await page(dealerId, `qb-${randomUUID()}`, '2026-09-02T00:00:00Z');
    const at = '2026-09-20T00:00:00.000Z';
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'p', caption_text: 'c', caption_hashtags: ['#Creta'], platforms: ['facebook', 'instagram'], status: 'draft',
        connection_ids: [a.id, b.id],
        publish_results: { facebook: { post_id: 'fb-a', url: 'u', published_at: at, accounts: { [a.id]: { account_name: 'A', post_id: 'fb-a', url: 'u', published_at: at } } } },
      },
    });
    const connections = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });

    const { jobs, skipped } = publishJobs(post, ['facebook', 'instagram'], connections);

    assert.deepEqual(skipped, ['instagram']);
    assert.deepEqual(
      jobs.map((j) => [j.name, j.data.connection_id, j.data.page_id, j.data.hashtags]),
      [[`publish-facebook-${post.id}-${b.id}`, b.id, b.platform_account_id, ['#Creta']]],
    );
  });

  it('leaves alone a platform published before per-account results', async () => {
    const dealerId = await newDealer();
    await page(dealerId, `ql-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'draft',
        publish_results: { facebook: { post_id: 'fb-old', url: 'u', published_at: '2026-09-01T00:00:00.000Z' } },
      },
    });
    const connections = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(publishJobs(post, ['facebook'], connections), { jobs: [], skipped: [] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publisher-accounts.test.ts`
Expected: FAIL (`parseConnectionIds` / `publishJobs` are not exported).

- [ ] **Step 3: Helpers.**

(a) `apps/api/src/lib/connections.ts`, after `resolveTargets`:

```ts
export const CONNECTION_IDS_MESSAGE = `connectionIds must be a list of up to ${MAX_CONNECTED_ACCOUNTS} account ids`;

/** A post's target account ids from a request body: distinct non-empty strings, at most 30; null when invalid. */
export function parseConnectionIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CONNECTED_ACCOUNTS) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)) return null;
  return [...new Set(value as string[])];
}
```

(b) `apps/api/src/lib/connectionStore.ts`, at the end:

```ts
/** The ids that are this dealership's own accounts (connected or not), in the order given. */
export async function ownConnectionIds(dealerId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const mine = new Set((await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } })).map((c) => c.id));
  return ids.filter((id) => mine.has(id));
}
```

(c) `apps/api/src/lib/publishDirect.ts`, after `buildPublishData`:

```ts
export interface PublishJob {
  name: string;
  data: PublishDirectData;
}

/**
 * Queue path: one job per target account that doesn't have the post yet. Platforms with no account to target
 * are returned as skipped. Media a platform can't take is still queued, so the worker records the failure.
 */
export function publishJobs(
  post: PublishablePost & Pick<Post, 'publish_results'>,
  platforms: readonly string[],
  connections: readonly PlatformConnection[],
): { jobs: PublishJob[]; skipped: string[] } {
  const previous = toJsonObject(post.publish_results);
  const jobs: PublishJob[] = [];
  const skipped: string[] = [];
  for (const plan of resolveTargets({ platforms, connection_ids: post.connection_ids ?? [] }, connections)) {
    if (plan.error) {
      skipped.push(plan.platform);
      continue;
    }
    const entry: unknown = previous[plan.platform];
    if (isLegacySuccess(entry)) continue;
    for (const conn of plan.targets) {
      if (storedOutcome(entry, conn.id)) continue;
      jobs.push({ name: `publish-${plan.platform}-${post.id}-${conn.id}`, data: buildPublishData(post, plan.platform, conn) });
    }
  }
  return { jobs, skipped };
}
```

- [ ] **Step 4: `apps/api/src/routes/publisher.ts`.**

(a) Imports: replace `import { buildPublishData, platformLabel, publishPost } from "../lib/publishDirect.js"` with:

```ts
import { platformLabel, publishJobs, publishPost } from "../lib/publishDirect.js"
import { CONNECTION_IDS_MESSAGE, parseConnectionIds } from "../lib/connections.js"
import { ownConnectionIds } from "../lib/connectionStore.js"
```

Remove the now-unused `import type { PublishJobData } from "../queues/index.js"`.

(b) Above `export default async function publisherRoutes`, add:

```ts
// Target accounts from a request body: the dealer's own ids only. undefined = not sent; null = invalid.
async function targetAccounts(dealerId: string, value: unknown): Promise<string[] | null | undefined> {
  if (value === undefined) return undefined
  const ids = parseConnectionIds(value)
  return ids ? ownConnectionIds(dealerId, ids) : null
}
```

(c) `POST /` (create): add `connectionIds?: unknown` to the body type. After the `thumbnailUrl` check add:

```ts
      const connectionIds = await targetAccounts(dealer_id, body.connectionIds)
      if (connectionIds === null) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: CONNECTION_IDS_MESSAGE } })
      }
```

Then add `connection_ids: connectionIds ?? [],` to `prisma.post.create({ data: { … } })`, after `platforms: body.platforms,`.

(d) `PATCH /posts/:id`: add `connectionIds: unknown` to the `Partial<{ … }>` body type. After the `thumbnailUrl` check add:

```ts
      const connectionIds = await targetAccounts(dealer_id, body.connectionIds)
      if (connectionIds === null) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: CONNECTION_IDS_MESSAGE } })
      }
```

Add `body.connectionIds !== undefined ||` to the `isContentEdit` expression, after `body.platforms !== undefined ||`. After `if (body.platforms !== undefined) updateData.platforms = body.platforms` add:

```ts
      if (connectionIds !== undefined) updateData.connection_ids = connectionIds
```

(e) `POST /publish`: replace the block from `// Load platform connections for this dealer` down to the end of the `enqueue` function with:

```ts
      // All the dealer's accounts, connected or not: the post may name one that was disconnected since.
      const connections = await prisma.platformConnection.findMany({ where: { dealer_id } })
      const queued = publishJobs(post, platforms, connections)
      const skipped = queued.skipped
      const useQueue = isQueueAvailable() && !!publishQueue && skipped.length < platforms.length

      // BullMQ path: one job per target account, delayed for scheduled posts
      const enqueue = async (delay: number) => {
        const jobIds: string[] = []
        for (const job of queued.jobs) {
          const added = await publishQueue!.add(job.name, job.data, {
            delay,
            attempts: 3,
            backoff: { type: "exponential", delay: 60_000 },
          })
          if (added.id) jobIds.push(added.id)
        }
        return jobIds
      }
```

The scheduled path, the claim and the inline `publishPost(post, platforms)` call stay as they are. `post` is the full row, so it carries `connection_ids`.

- [ ] **Step 5: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publisher-accounts.test.ts test/publish-lifecycle.test.ts test/publish-video.test.ts test/approvals.test.ts test/security-routes.test.ts
cd ../.. && npm run build
```
Expected: all pass (`publisher-accounts`: 6); the build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/connections.ts apps/api/src/lib/connectionStore.ts apps/api/src/lib/publishDirect.ts apps/api/src/routes/publisher.ts apps/api/test/publisher-accounts.test.ts
git commit -m "feat(api): posts name their target accounts; queued publishing runs per account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: YouTube connect with Google OAuth

**Files:**
- Create: `apps/api/src/services/youtube.ts`
- Modify: `apps/api/src/routes/platform.ts` (connect and Google callback), `apps/api/test/security-routes.test.ts`
- Test: `apps/api/test/youtube-connect.test.ts`

**Interfaces:**
- Consumes (Tasks 1–2): `saveConnections`, `ACCOUNT_LIMIT_MESSAGE`; the module-private `googleClient()`, `exchangeGoogleCode()` and `savedCountQuery()` in `routes/platform.ts`.
- Produces:
  - `services/youtube.ts`:
    - `YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'`
    - `YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'`
    - `NO_YOUTUBE_CHANNEL`
    - `bearer(accessToken) → { Authorization: 'Bearer …' }`
    - `youtubeCount(value): number | null`
    - `interface YouTubeChannel { id; title }`, `fetchYouTubeChannels(accessToken): Promise<YouTubeChannel[]>`
  - HTTP `GET /v1/platforms/connect/youtube`:
    - A real Google OAuth URL when the Google client is configured (`access_type=offline`, `prompt=consent`, `redirect_uri` = the registered `/v1/platforms/callback/google`, signed state with `platform: 'youtube'`).
    - Without a Google client: the mock outside production, 501 in production. `?mock=true` outside production: the mock.
  - `/v1/platforms/callback/google` with a `youtube` state saves every channel of the Google account. With no channel: `error=` + `NO_YOUTUBE_CHANNEL`. A reconnect without a refresh token keeps the stored one.

- [ ] **Step 1: Write the failing test** — `apps/api/test/youtube-connect.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { signOAuthState, verifyOAuthState } from '../src/lib/oauthState.js';
import { NO_YOUTUBE_CHANNEL, YOUTUBE_SCOPES } from '../src/services/youtube.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Tube Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function setEnv(t: TestContext, values: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const apply = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(values);
  t.after(() => apply(saved));
}

const connect = (dealerId: string, query = '') =>
  fastify.inject({ method: 'GET', url: `/v1/platforms/connect/youtube${query}`, headers: headers(dealerId) });
const redirectUrl = (res: { json: () => unknown }) => new URL((res.json() as { redirect_url: string }).redirect_url);

describe('GET /v1/platforms/connect/youtube', () => {
  it('sends the dealer to Google with the YouTube scopes', async (t) => {
    setEnv(t, { GOOGLE_CLIENT_ID: 'yt-client-id' });
    const dealerId = await newDealer();

    const res = await connect(dealerId);

    assert.equal(res.statusCode, 200);
    const url = redirectUrl(res);
    assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.deepEqual(
      ['client_id', 'scope', 'access_type', 'prompt', 'response_type'].map((k) => url.searchParams.get(k)),
      ['yt-client-id', YOUTUBE_SCOPES, 'offline', 'consent', 'code'],
    );
    assert.equal(YOUTUBE_SCOPES, 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
    assert.match(url.searchParams.get('redirect_uri') ?? '', /\/v1\/platforms\/callback\/google$/);
    const state = verifyOAuthState<{ dealer_id: string; platform: string }>(fastify, url.searchParams.get('state'), 'platform_oauth');
    assert.deepEqual([state?.dealer_id, state?.platform], [dealerId, 'youtube']);
  });

  it('uses the mock channel locally without a Google client, or with ?mock=true', async (t) => {
    setEnv(t, { GOOGLE_CLIENT_ID: undefined });
    const dealerId = await newDealer();
    assert.match(redirectUrl(await connect(dealerId)).pathname, /\/v1\/platforms\/callback\/youtube$/);

    process.env['GOOGLE_CLIENT_ID'] = 'yt-client-id';
    const mock = redirectUrl(await connect(dealerId, '?mock=true'));
    assert.deepEqual([mock.pathname.endsWith('/callback/youtube'), mock.searchParams.get('code')], [true, 'mock_youtube_code']);
  });
});

describe('YouTube callback (/v1/platforms/callback/google)', () => {
  function mockGoogle(t: TestContext, channels: Array<{ id: string; snippet: { title: string } }>, refreshToken?: string) {
    const gets: Array<{ url: string; params: unknown; auth: string }> = [];
    t.mock.method(axios, 'post', async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return { data: { access_token: 'ya29.yt', expires_in: 3599, ...(refreshToken ? { refresh_token: refreshToken } : {}) } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    t.mock.method(axios, 'get', async (url: string, config: { params?: unknown; headers?: Record<string, string> } = {}) => {
      gets.push({ url, params: config.params, auth: config.headers?.['Authorization'] ?? '' });
      if (url === 'https://www.googleapis.com/youtube/v3/channels') return { data: { items: channels } };
      throw new Error(`unexpected GET ${url}`);
    });
    return gets;
  }
  const callback = (dealerId: string) => fastify.inject({
    method: 'GET',
    url: `/v1/platforms/callback/google?code=yt-code&state=${signOAuthState(fastify, 'platform_oauth', { dealer_id: dealerId, platform: 'youtube' })}`,
  });
  const redirect = (res: { headers: Record<string, unknown> }) => new URL(String(res.headers['location']));

  it('saves every channel of the Google account', async (t) => {
    const gets = mockGoogle(t, [{ id: 'UC-1', snippet: { title: 'Apex TV' } }, { id: 'UC-2', snippet: { title: 'Apex Used' } }], '1//yt-refresh');
    const dealerId = await newDealer();

    const target = redirect(await callback(dealerId));

    assert.deepEqual(
      ['success', 'platform', 'page_name', 'accounts', 'youtube'].map((k) => target.searchParams.get(k)),
      ['1', 'youtube', 'Apex TV', '2', '2'],
    );
    assert.deepEqual(gets, [{ url: 'https://www.googleapis.com/youtube/v3/channels', params: { part: 'snippet,statistics', mine: 'true' }, auth: 'Bearer ya29.yt' }]);
    const rows = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, platform: 'youtube' } });
    assert.deepEqual(
      rows.map((r) => [r.platform_account_id, r.platform_account_name, r.refresh_token]).sort(),
      [['UC-1', 'Apex TV', '1//yt-refresh'], ['UC-2', 'Apex Used', '1//yt-refresh']],
    );
  });

  it('keeps the stored refresh token when Google sends none on a reconnect', async (t) => {
    const dealerId = await newDealer();
    await prisma.platformConnection.create({
      data: { dealer_id: dealerId, platform: 'youtube', platform_account_id: 'UC-1', access_token: 'ya29.old', refresh_token: '1//kept', is_connected: true },
    });
    mockGoogle(t, [{ id: 'UC-1', snippet: { title: 'Apex TV' } }]);

    await callback(dealerId);

    const [row] = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, platform: 'youtube' } });
    assert.deepEqual([row?.access_token, row?.refresh_token], ['ya29.yt', '1//kept']);
  });

  it('explains a Google account without a channel', async (t) => {
    mockGoogle(t, []);
    const dealerId = await newDealer();

    const target = redirect(await callback(dealerId));

    assert.deepEqual([target.searchParams.get('error'), target.searchParams.get('platform')], [NO_YOUTUBE_CHANNEL, 'youtube']);
    assert.equal(NO_YOUTUBE_CHANNEL, 'This Google account has no YouTube channel. Create one on YouTube, then connect again.');
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId } }), 0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/youtube-connect.test.ts`
Expected: FAIL (`Cannot find module '../src/services/youtube.js'`).

- [ ] **Step 3: `apps/api/src/services/youtube.ts`**

```ts
import axios from 'axios';

// YouTube Data API v3 reads. OAuth access tokens go in the Authorization header, never in a URL.
export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
export const NO_YOUTUBE_CHANNEL = 'This Google account has no YouTube channel. Create one on YouTube, then connect again.';
const TIMEOUT_MS = 15_000;

export const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

/** A YouTube count (the API sends them as strings); null when absent or not a number. */
export function youtubeCount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface YouTubeChannel {
  id: string;
  title: string;
}

/** The channels the signed-in Google account owns (channels.list with mine=true). */
export async function fetchYouTubeChannels(accessToken: string): Promise<YouTubeChannel[]> {
  const res = await axios.get<{ items?: Array<{ id?: string; snippet?: { title?: string } }> }>(
    `${YOUTUBE_API_BASE}/channels`,
    { params: { part: 'snippet,statistics', mine: 'true' }, headers: bearer(accessToken), timeout: TIMEOUT_MS },
  );
  return (res.data.items ?? []).flatMap((item) => (item.id ? [{ id: item.id, title: item.snippet?.title?.trim() || item.id }] : []));
}
```

- [ ] **Step 4: `apps/api/src/routes/platform.ts`.**

(a) Imports: change `import type { FastifyInstance } from 'fastify';` to `import type { FastifyInstance, FastifyReply } from 'fastify';` and add:

```ts
import { NO_YOUTUBE_CHANNEL, YOUTUBE_SCOPES, fetchYouTubeChannels } from '../services/youtube.js';
```

(b) In `GET /connect/:platform`, replace:

```ts
    if ((platform === 'twitter' || platform === 'youtube') && mockPlatformsDisabled()) {
```

with:

```ts
    // Twitter is mock-only; YouTube is mock-only until the Google client is configured.
    if ((platform === 'twitter' || (platform === 'youtube' && !googleClient())) && mockPlatformsDisabled()) {
```

(c) Replace the whole `// YouTube: mock OAuth (Task 5 adds real Google OAuth)` block with:

```ts
    // YouTube: Google OAuth with the YouTube scopes. It returns to the registered Google callback, which
    // tells YouTube from Business Profile by the state. The mock runs without a Google client, or with
    // ?mock=true outside production.
    if (platform === 'youtube') {
      if (!dealer_id) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to link platforms' } });
      }
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id, platform });
      const google = googleClient();
      if (!google || (isMock && process.env['NODE_ENV'] !== 'production')) {
        return { success: true, redirect_url: `${API_BASE_URL}/v1/platforms/callback/youtube?code=mock_youtube_code&state=${state}` };
      }
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', google.id);
      url.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', YOUTUBE_SCOPES);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return { success: true, redirect_url: url.toString() };
    }
```

(d) Inside `platformRoutes`, before the `// GET /v1/platforms/callback/google` route, add:

```ts
  // The YouTube half of /callback/google: saves every channel the Google account owns.
  async function saveYouTubeChannels(code: string, dealerId: string | null, reply: FastifyReply) {
    const frontendCallback = `${FRONTEND_URL}/oauth/callback`;
    const fail = (message: string) => reply.redirect(`${frontendCallback}?error=${encodeURIComponent(message)}&platform=youtube`);
    if (!dealerId) return fail('Session expired. Please try again.');
    try {
      const tokens = await exchangeGoogleCode(code);
      const channels = await fetchYouTubeChannels(tokens.access_token);
      const [first] = channels;
      if (!first) return fail(NO_YOUTUBE_CHANNEL);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const { saved, limitReached } = await saveConnections(dealerId, channels.map((channel) => ({
        platform: 'youtube',
        platform_account_id: channel.id,
        platform_account_name: channel.title,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token, // undefined on a reconnect keeps the stored one
        token_expires_at: expiresAt,
      })));
      if (limitReached) return fail(ACCOUNT_LIMIT_MESSAGE);
      return reply.redirect(`${frontendCallback}?success=1&platform=youtube&page_name=${encodeURIComponent(first.title)}&${savedCountQuery(saved)}`);
    } catch (err) {
      fastify.log.error({ message: errorText(err) }, 'YouTube OAuth callback failed');
      return fail('YouTube connection failed');
    }
  }
```

(e) In `GET /callback/google`, replace:

```ts
    if (!stateData || stateData.platform !== 'gmb') return fail('Invalid state');
```

with:

```ts
    if (!stateData || (stateData.platform !== 'gmb' && stateData.platform !== 'youtube')) return fail('Invalid state');
    if (stateData.platform === 'youtube') return saveYouTubeChannels(code, stateData.dealer_id, reply);
```

- [ ] **Step 5: `apps/api/test/security-routes.test.ts`.** In `it('turns off the mock Twitter/YouTube integrations in production', …)`, after `process.env['NODE_ENV'] = 'production';` add:

```ts
    delete process.env['GOOGLE_CLIENT_ID']; // with a Google client, YouTube is real OAuth (next test)
```

Then add this test after it (`afterEach(restoreEnv)` restores the environment):

```ts
  it('sends YouTube to Google OAuth in production once Google is configured', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['GOOGLE_CLIENT_ID'] = 'prod-client-id';
    const dealerId = await newDealer('youtube-prod-dealer', 'growth');
    const res = await fastify.inject({
      method: 'GET', url: '/v1/platforms/connect/youtube?mock=true', headers: bearer(token(dealerId)),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(new URL(res.json().redirect_url).host, 'accounts.google.com');
  });
```

- [ ] **Step 6: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/youtube-connect.test.ts test/platform-connect.test.ts test/security-routes.test.ts test/no-key-in-url.test.ts
cd ../.. && npm run build
```
Expected: all pass (`youtube-connect`: 5); the build exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/youtube.ts apps/api/src/routes/platform.ts apps/api/test/youtube-connect.test.ts apps/api/test/security-routes.test.ts
git commit -m "feat(api): connect YouTube channels through Google OAuth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Publish reels to YouTube as Shorts

**Files:**
- Create: `apps/api/src/lib/youtubeUpload.ts`
- Modify: `apps/api/src/lib/publishDirect.ts` (YouTube branch in `sendVideoToPlatform`)
- Test: `apps/api/test/youtube-upload.test.ts`

**Interfaces:**
- Consumes: `NO_YOUTUBE_CHANNEL`, `bearer` (Task 5); `isMockId`; `safeFetchBuffer` (`lib/safeUrl.ts`); `PublishDirectData.caption_text`, `.hashtags` (Task 3).
- Produces (`lib/youtubeUpload.ts`):
  - `SHORTS_TAG = '#Shorts'`, `YOUTUBE_LIMIT_MESSAGE`, `YOUTUBE_EXPIRED_MESSAGE`
  - `shortsTitle(caption, dealerName)`, `shortsDescription(fullCaption)`, `shortsTags(hashtags)`, `shortsMetadata({ captionText, fullCaption, hashtags, dealerName }) → { title, description, tags }`
  - `youtubeErrorMessage(err): string`
  - `reelSource.load(url): Promise<Buffer>` (a mutable object so tests can stub it)
  - `interface ShortUpload { accessToken; videoUrl; title; description; tags }`, `uploadShort(input): Promise<{ platform_post_id; url }>`
- Behaviour:
  - Video posts publish through the every-minute cron (`POST /v1/publisher/publish` hands them over), within the existing per-post time budget.
  - A `mock_` token returns a mock Short without calling YouTube.
  - Uploads are `public`, category `2` (Autos & Vehicles), not made for kids.

- [ ] **Step 1: Write the failing test** — `apps/api/test/youtube-upload.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { prisma } from '../src/db/prisma.js';
import { publishPost } from '../src/lib/publishDirect.js';
import {
  YOUTUBE_EXPIRED_MESSAGE, YOUTUBE_LIMIT_MESSAGE, reelSource, shortsDescription, shortsTags, shortsTitle, uploadShort, youtubeErrorMessage,
} from '../src/lib/youtubeUpload.js';

const apiError = (status: number, reason: string, message = 'Request failed') =>
  new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status, statusText: '', headers: {}, config: {}, data: { error: { code: status, message, errors: [{ reason }] } },
  } as unknown as AxiosResponse);

const UPLOAD = { accessToken: 'ya29.token', videoUrl: 'https://storage.googleapis.com/bucket/reels/r1.mp4', title: 'Creta walkaround #Shorts', description: 'Book a test drive', tags: ['Creta'] };

describe('Shorts metadata', () => {
  it('builds the title from the first caption line, without hashtags or angle brackets', () => {
    assert.equal(shortsTitle('New <Creta> is here #Hyundai #SUV\nVisit us', 'Apex Motors'), 'New Creta is here #Shorts');
    assert.equal(shortsTitle('#Diwali #Offers', 'Apex Motors'), 'Apex Motors #Shorts');
    const long = shortsTitle('x'.repeat(150), 'Apex');
    assert.equal(long.length, 100);
    assert.ok(long.endsWith(' #Shorts'));
  });

  it('keeps the description under 5000 characters and drops angle brackets', () => {
    assert.equal(shortsDescription('Book <now>\n\n#Creta'), 'Book now\n\n#Creta');
    assert.equal(shortsDescription('x'.repeat(6000)).length, 5000);
  });

  it('turns hashtags into tags within 500 characters', () => {
    assert.deepEqual(shortsTags(['#Creta', 'creta', ' #SUV ', '#', '<b>']), ['Creta', 'SUV', 'b']);
    const many = shortsTags(Array.from({ length: 60 }, (_, i) => `#tag${String(i).padStart(6, '0')}`));
    assert.ok(many.join(',').length <= 500);
    assert.ok(many.length < 60);
  });
});

describe('uploadShort', () => {
  it('starts a resumable session, then uploads the bytes', async (t) => {
    const bytes = Buffer.from('fake-mp4-bytes');
    t.mock.method(reelSource, 'load', async () => bytes);
    const post = t.mock.method(axios, 'post', async (_url: string, _body: unknown, _config: unknown) => ({
      headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc' }, data: {},
    }));
    const put = t.mock.method(axios, 'put', async (_url: string, _body: unknown, _config: unknown) => ({ data: { id: 'short-1' } }));

    const result = await uploadShort(UPLOAD);

    assert.deepEqual(result, { platform_post_id: 'short-1', url: 'https://youtube.com/shorts/short-1' });
    const [initUrl, initBody, initConfig] = post.mock.calls[0]!.arguments;
    assert.equal(initUrl, 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status');
    assert.deepEqual(initBody, {
      snippet: { title: 'Creta walkaround #Shorts', description: 'Book a test drive', tags: ['Creta'], categoryId: '2' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    });
    const initHeaders = (initConfig as { headers: Record<string, string> }).headers;
    assert.deepEqual(
      [initHeaders['Authorization'], initHeaders['X-Upload-Content-Type'], initHeaders['X-Upload-Content-Length']],
      ['Bearer ya29.token', 'video/mp4', String(bytes.length)],
    );
    const [putUrl, putBody, putConfig] = put.mock.calls[0]!.arguments;
    assert.equal(putUrl, 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc');
    assert.equal(putBody, bytes);
    assert.equal((putConfig as { timeout: number }).timeout, 120_000);
  });

  it('maps YouTube errors to plain copy', async (t) => {
    assert.equal(youtubeErrorMessage(apiError(403, 'quotaExceeded')), YOUTUBE_LIMIT_MESSAGE);
    assert.equal(youtubeErrorMessage(apiError(400, 'uploadLimitExceeded')), YOUTUBE_LIMIT_MESSAGE);
    assert.equal(youtubeErrorMessage(apiError(401, 'youtubeSignupRequired')), 'This Google account has no YouTube channel. Create one on YouTube, then connect again.');
    assert.equal(youtubeErrorMessage(apiError(401, 'authError')), YOUTUBE_EXPIRED_MESSAGE);
    assert.equal(youtubeErrorMessage(apiError(400, 'invalidTitle', 'The title is invalid.')), 'The title is invalid.');
    assert.equal(youtubeErrorMessage(new Error('socket hang up')), 'socket hang up');
    assert.equal(YOUTUBE_LIMIT_MESSAGE, "YouTube's daily upload limit was reached. Try again tomorrow.");

    t.mock.method(reelSource, 'load', async () => Buffer.from('x'));
    t.mock.method(axios, 'post', async () => { throw apiError(403, 'quotaExceeded'); });
    await assert.rejects(uploadShort(UPLOAD), { message: YOUTUBE_LIMIT_MESSAGE });
  });

  it('never calls YouTube for a mock channel', async (t) => {
    const load = t.mock.method(reelSource, 'load', async () => Buffer.from('x'));
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));

    const result = await uploadShort({ ...UPLOAD, accessToken: 'mock_youtube_access_token' });

    assert.match(result.url, /^https:\/\/youtube\.com\/shorts\/mock_yt_short_/);
    assert.equal(load.mock.callCount() + post.mock.callCount(), 0);
  });
});

describe('publishPost to YouTube', () => {
  it('uploads a reel as a Short with a title from the caption', async (t) => {
    const dealer = await prisma.dealer.create({ data: { name: 'Apex Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
    await prisma.platformConnection.create({
      data: {
        dealer_id: dealer.id, platform: 'youtube', platform_account_id: 'UC-apex', platform_account_name: 'Apex TV',
        access_token: 'ya29.live', refresh_token: '1//r', token_expires_at: new Date(Date.now() + 3_600_000), is_connected: true,
      },
    });
    const post = await prisma.post.create({
      data: {
        dealer_id: dealer.id, prompt_text: 'Reel', caption_text: 'Creta walkaround', caption_hashtags: ['#Creta'], platforms: ['youtube'],
        status: 'publishing', media_type: 'video', video_url: 'https://storage.googleapis.com/bucket/reels/r1.mp4',
      },
    });
    t.mock.method(reelSource, 'load', async () => Buffer.from('mp4'));
    const init = t.mock.method(axios, 'post', async (_url: string, _body: unknown, _config: unknown) => ({ headers: { location: 'https://upload.test/session-1' }, data: {} }));
    t.mock.method(axios, 'put', async () => ({ data: { id: 'vid-9' } }));

    const outcome = await publishPost(post, ['youtube']);

    assert.equal(outcome.status, 'published');
    assert.equal(outcome.results[0]?.url, 'https://youtube.com/shorts/vid-9');
    const body = init.mock.calls[0]!.arguments[1] as { snippet: { title: string; description: string; tags: string[] } };
    assert.deepEqual([body.snippet.title, body.snippet.description, body.snippet.tags], ['Creta walkaround #Shorts', 'Creta walkaround\n\n#Creta', ['Creta']]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/youtube-upload.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/youtubeUpload.js'`).

- [ ] **Step 3: `apps/api/src/lib/youtubeUpload.ts`**

```ts
import axios from 'axios';
import { isMockId } from './platformMock.js';
import { safeFetchBuffer } from './safeUrl.js';
import { NO_YOUTUBE_CHANNEL, bearer } from '../services/youtube.js';

// A reel goes to YouTube as a Short through the Data API's resumable upload: start a session, then PUT the bytes.
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const INIT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const VIDEO_MAX_BYTES = 256 * 1024 * 1024;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;
const TAGS_MAX = 500;
const AUTOS_AND_VEHICLES = '2';

export const SHORTS_TAG = '#Shorts';
export const YOUTUBE_LIMIT_MESSAGE = "YouTube's daily upload limit was reached. Try again tomorrow.";
export const YOUTUBE_EXPIRED_MESSAGE = 'YouTube access expired. Reconnect YouTube on Accounts.';
const LIMIT_REASONS = new Set(['quotaExceeded', 'uploadLimitExceeded', 'dailyLimitExceeded']);

const stripAngles = (text: string) => text.replace(/[<>]/g, '');

/** The caption's first line without hashtags or angle brackets, cut so that "{title} #Shorts" fits in 100. */
export function shortsTitle(caption: string, dealerName: string): string {
  const clean = (text: string) => stripAngles(text.replace(/#[^\s#]+/g, ' ')).replace(/\s+/g, ' ').trim();
  const firstLine = caption.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const base = clean(firstLine) || clean(dealerName) || 'New video';
  const room = TITLE_MAX - SHORTS_TAG.length - 1;
  return `${base.length > room ? base.slice(0, room).trimEnd() : base} ${SHORTS_TAG}`;
}

/** The caption as other platforms get it (hashtags appended), without angle brackets, at most 5000 characters. */
export function shortsDescription(fullCaption: string): string {
  return stripAngles(fullCaption).trim().slice(0, DESCRIPTION_MAX);
}

/** The hashtags without "#", deduplicated, within YouTube's 500-character total. */
export function shortsTags(hashtags: readonly string[]): string[] {
  const tags: string[] = [];
  let used = 0;
  for (const raw of hashtags) {
    const tag = stripAngles(raw.trim().replace(/^#+/, '')).replace(/,/g, '').trim();
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    const cost = tag.length + (tags.length > 0 ? 1 : 0);
    if (used + cost > TAGS_MAX) break;
    tags.push(tag);
    used += cost;
  }
  return tags;
}

export function shortsMetadata(input: { captionText: string; fullCaption: string; hashtags: readonly string[]; dealerName: string }): {
  title: string;
  description: string;
  tags: string[];
} {
  return {
    title: shortsTitle(input.captionText, input.dealerName),
    description: shortsDescription(input.fullCaption),
    tags: shortsTags(input.hashtags),
  };
}

/** Plain copy for YouTube failures; otherwise the API's own message. */
export function youtubeErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: { message?: unknown; errors?: Array<{ reason?: unknown }> } } | undefined;
    const reasons = (body?.error?.errors ?? []).map((e) => e.reason).filter((r): r is string => typeof r === 'string');
    if (reasons.some((r) => LIMIT_REASONS.has(r))) return YOUTUBE_LIMIT_MESSAGE;
    if (reasons.includes('youtubeSignupRequired')) return NO_YOUTUBE_CHANNEL;
    if (err.response?.status === 401) return YOUTUBE_EXPIRED_MESSAGE;
    const message = body?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Where the MP4 comes from: our reels sit in the public media bucket. Tests replace `load`. */
export const reelSource = {
  load: async (url: string): Promise<Buffer> =>
    (await safeFetchBuffer(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS, maxBytes: VIDEO_MAX_BYTES })).buffer,
};

export interface ShortUpload {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const value = (headers as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : null;
}

/** Uploads a reel as a public Short. A mock channel (local and demo) gets a mock Short and no API call. */
export async function uploadShort(input: ShortUpload): Promise<{ platform_post_id: string; url: string }> {
  if (isMockId(input.accessToken)) {
    const id = `mock_yt_short_${Date.now()}`;
    return { platform_post_id: id, url: `https://youtube.com/shorts/${id}` };
  }
  try {
    const video = await reelSource.load(input.videoUrl);
    const session = await axios.post(
      UPLOAD_URL,
      {
        snippet: { title: input.title, description: input.description, tags: input.tags, categoryId: AUTOS_AND_VEHICLES },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
      {
        headers: {
          ...bearer(input.accessToken),
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(video.length),
        },
        timeout: INIT_TIMEOUT_MS,
      },
    );
    const location = headerValue(session.headers, 'location');
    if (!location) throw new Error('YouTube did not return an upload address.');
    const done = await axios.put<{ id?: string }>(location, video, {
      headers: { ...bearer(input.accessToken), 'Content-Type': 'video/mp4' },
      timeout: UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const id = done.data.id;
    if (!id) throw new Error('YouTube did not return a video id.');
    return { platform_post_id: id, url: `https://youtube.com/shorts/${id}` };
  } catch (err) {
    throw new Error(youtubeErrorMessage(err));
  }
}
```

- [ ] **Step 4: `apps/api/src/lib/publishDirect.ts`.** Add `import { shortsMetadata, uploadShort } from './youtubeUpload.js';`. In `sendVideoToPlatform`, before the `if (platform === 'gmb') throw new Error(GMB_NO_VIDEO);` line, add:

```ts
  if (platform === 'youtube') {
    // An empty caption line falls back to the dealership's name as the Short's title.
    const dealer = await prisma.dealer.findUnique({ where: { id: data.dealer_id } });
    const meta = shortsMetadata({ captionText: data.caption_text, fullCaption: caption, hashtags: data.hashtags, dealerName: dealer?.name ?? '' });
    const result = await uploadShort({ accessToken: access_token, videoUrl: video_url, ...meta });
    return { platform_post_id: result.platform_post_id, url: result.url };
  }
```

- [ ] **Step 5: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/youtube-upload.test.ts test/publish-accounts.test.ts test/publish-video.test.ts test/no-key-in-url.test.ts test/http-error-redaction.test.ts
cd ../.. && npm run build
```
Expected: all pass (`youtube-upload`: 7); the build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/youtubeUpload.ts apps/api/src/lib/publishDirect.ts apps/api/test/youtube-upload.test.ts
git commit -m "feat(api): publish reels to YouTube as Shorts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Inbox across accounts

**Files:**
- Modify: `apps/api/src/lib/connectionStore.ts` (add `replyConnection`), `apps/api/src/lib/inboxIngest.ts`, `apps/api/src/routes/inbox.ts`, `apps/api/src/lib/gmbReviewSync.ts`, `apps/api/src/services/autoReplyEngine.ts`
- Test: `apps/api/test/inbox-accounts.test.ts`

**Interfaces:**
- Consumes: `InboxMessage.connection_id` (Task 1), `primaryConnection` (Task 1), `successfulPostRefs` (Task 3).
- Produces:
  - `replyConnection(dealerId, message: { platform; connection_id?: string | null }): Promise<PlatformConnection | null>`: the receiving account while it is connected, else the platform's primary.
  - `InboxIngestInput.connection_id?: string | null`. A new message stores it; a refresh fills it in once and never moves it.
  - Webhook and Google review sync pass the receiving connection. Manual reply and auto-reply send from `replyConnection`.
  - `resolvePostId` matches every account's post id, not only the summary's.

- [ ] **Step 1: Write the failing test** — `apps/api/test/inbox-accounts.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { ingestInboxMessage, resolvePostId } from '../src/lib/inboxIngest.js';
import { replyConnection } from '../src/lib/connectionStore.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function dealerWithPages() {
  const dealer = await prisma.dealer.create({ data: { name: 'Inbox Pages Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const page = (created: string) => prisma.platformConnection.create({
    data: {
      dealer_id: dealer.id, platform: 'facebook', platform_account_id: `page-${randomUUID()}`, access_token: `token-${randomUUID()}`,
      is_connected: true, created_at: new Date(created),
    },
  });
  return { dealerId: dealer.id, first: await page('2026-09-01T00:00:00Z'), second: await page('2026-09-02T00:00:00Z') };
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

describe('messages across Pages', () => {
  it('records which Page received a webhook comment', async () => {
    const g = await dealerWithPages();
    const commentId = `c-${randomUUID()}`;
    const payload = {
      object: 'page',
      entry: [{
        id: g.second.platform_account_id,
        changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: commentId, post_id: `${g.second.platform_account_id}_1`, message: 'Price?', from: { id: 'cust-1', name: 'Ravi' } } }],
      }],
    };

    const res = await fastify.inject({ method: 'POST', url: '/v1/inbox/webhook/meta', payload });

    assert.equal(res.statusCode, 200);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { platform_message_id: commentId } }))?.connection_id, g.second.id);
  });

  it("links a comment to our post through any account's post id", async () => {
    const g = await dealerWithPages();
    const at = '2026-09-20T10:00:00.000Z';
    const post = await prisma.post.create({
      data: {
        dealer_id: g.dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        publish_results: {
          facebook: {
            post_id: 'a-100', url: 'u', published_at: at,
            accounts: {
              [g.first.id]: { account_name: 'A', post_id: 'a-100', url: 'u', published_at: at },
              [g.second.id]: { account_name: 'B', post_id: `${g.second.platform_account_id}_b-200`, url: 'u', published_at: at },
            },
          },
        },
      },
    });

    assert.equal(await resolvePostId(g.dealerId, 'facebook', `${g.second.platform_account_id}_b-200`), post.id);
    assert.equal(await resolvePostId(g.dealerId, 'facebook', 'x_b-200'), post.id);
    assert.equal(await resolvePostId(g.dealerId, 'facebook', 'a-100'), post.id);
  });

  it('replies from the Page that received the message', async (t) => {
    const g = await dealerWithPages();
    const m = await prisma.inboxMessage.create({
      data: {
        dealer_id: g.dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `c-${randomUUID()}`,
        customer_name: 'Ravi', message_text: 'Hi', received_at: new Date(), connection_id: g.second.id,
      },
    });
    const tokens: string[] = [];
    t.mock.method(axios, 'post', async (_url: string, body: { access_token: string }) => {
      tokens.push(body.access_token);
      return { data: { id: 'r1' } };
    });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: headers(g.dealerId), payload: { replyText: 'Thanks!' } });

    assert.equal((res.json() as { delivered: boolean }).delivered, true);
    assert.deepEqual(tokens, [g.second.access_token]);
  });

  it('falls back to the primary Page', async () => {
    const g = await dealerWithPages();
    assert.equal((await replyConnection(g.dealerId, { platform: 'facebook', connection_id: null }))?.id, g.first.id);
    await prisma.platformConnection.update({ where: { id: g.second.id }, data: { is_connected: false } });
    assert.equal((await replyConnection(g.dealerId, { platform: 'facebook', connection_id: g.second.id }))?.id, g.first.id);
    assert.equal(await replyConnection(g.dealerId, { platform: 'gmb', connection_id: null }), null);
  });

  it('fills in the receiving account once and never moves it', async () => {
    const g = await dealerWithPages();
    const input = { dealer_id: g.dealerId, platform: 'facebook', message_type: 'dm' as const, platform_message_id: `dm-${randomUUID()}`, message_text: 'Hi' };
    await ingestInboxMessage(input);

    const filled = await ingestInboxMessage({ ...input, connection_id: g.first.id });
    assert.equal(filled.message.connection_id, g.first.id);

    const kept = await ingestInboxMessage({ ...input, message_text: 'Hi again', connection_id: g.second.id });
    assert.equal(kept.message.connection_id, g.first.id);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/inbox-accounts.test.ts`
Expected: FAIL (`replyConnection` is not exported).

- [ ] **Step 3: `replyConnection`** — in `apps/api/src/lib/connectionStore.ts`, change the connections import to `import { MAX_CONNECTED_ACCOUNTS, primaryConnection } from './connections.js';` and add at the end:

```ts
/** The account a reply goes out from: the one that received the message while it is connected, else the platform's primary. */
export async function replyConnection(
  dealerId: string,
  message: { platform: string; connection_id?: string | null },
): Promise<PlatformConnection | null> {
  const conns = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, platform: message.platform } });
  const receiving = message.connection_id ? conns.find((c) => c.id === message.connection_id && c.is_connected) : undefined;
  return receiving ?? primaryConnection(conns, message.platform);
}
```

- [ ] **Step 4: `apps/api/src/lib/inboxIngest.ts`.**

(a) Replace `import { isSuccessfulResult } from './publishDirect.js';` with `import { successfulPostRefs } from './publishResults.js';`.

(b) In `InboxIngestInput`, after `platform_message_id: string;` add:

```ts
  /** The PlatformConnection that received it; set once and never moved. */
  connection_id?: string | null | undefined;
```

(c) In `refreshPatch`, after the `customer_avatar_url` line add:

```ts
  if (input.connection_id && !existing.connection_id) patch['connection_id'] = input.connection_id;
```

(d) In `ingestInboxMessage`'s create data, after `platform_message_id: input.platform_message_id,` add:

```ts
        ...(input.connection_id ? { connection_id: input.connection_id } : {}),
```

(e) Replace the loop body of `resolvePostId` (the `for (const post of posts) { … }`) with:

```ts
  for (const post of posts) {
    const entry = ((post.publish_results ?? {}) as Record<string, unknown>)[platform];
    // Every account's post: a comment on the second Page matches that Page's post id, not the summary's.
    for (const ref of successfulPostRefs(entry)) {
      const id = ref.post_id;
      if (id === platformPostId || id === tail || id.endsWith(`_${tail}`)) return post.id;
    }
  }
```

Also update the doc comment above `resolvePostId`: "…the dealership's published post whose publish result (any account) has that id…".

- [ ] **Step 5: Senders.**

(a) `apps/api/src/routes/inbox.ts`: add `import { replyConnection } from "../lib/connectionStore.js"`. In `POST /:id/reply`, replace the `prisma.platformConnection.findFirst({ where: { dealer_id, platform: message.platform, is_connected: true } })` line with:

```ts
    // The Page / account that received the message, else the platform's primary account
    const connection = await replyConnection(dealer_id, message)
```

In `POST /webhook/meta`, add `connection_id: connection.id,` to both `ingestInboxMessage({ … })` calls, after `platform,`.

(b) `apps/api/src/lib/gmbReviewSync.ts`: in `importReview`, add `connection_id: conn.id,` after `platform: 'gmb',`.

(c) `apps/api/src/services/autoReplyEngine.ts`: add `import { replyConnection } from "../lib/connectionStore.js";`. In `processIncomingMessage`, replace the `prisma.platformConnection.findFirst({ where: { dealer_id: dealer.id, platform: message.platform, is_connected: true } })` call with:

```ts
    const connection = await replyConnection(dealer.id, message);
```

In `sendReply`, replace `console.error(\`Failed to send auto-reply to ${message.platform}\`, err);` with:

```ts
    console.error(`Failed to send auto-reply to ${message.platform}:`, err instanceof Error ? err.message : String(err));
```

- [ ] **Step 6: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/inbox-accounts.test.ts test/inbox-ingest.test.ts test/inbox-routes.test.ts test/gmb-review-sync.test.ts test/autoReplyEngine.test.ts test/dealer-analytics.test.ts
cd ../.. && npm run build
```
Expected: all pass (`inbox-accounts`: 5); the build exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/connectionStore.ts apps/api/src/lib/inboxIngest.ts apps/api/src/routes/inbox.ts apps/api/src/lib/gmbReviewSync.ts apps/api/src/services/autoReplyEngine.ts apps/api/test/inbox-accounts.test.ts
git commit -m "feat(api): inbox messages remember the receiving account and replies go out from it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Metrics and followers across accounts; YouTube numbers

**Files:**
- Modify: `apps/api/src/services/youtube.ts` (add `fetchYouTubeVideoMetrics`, `fetchYouTubeSubscribers`), `apps/api/src/lib/postMetrics.ts` (`METRIC_PLATFORMS`), `apps/api/src/lib/metricsSync.ts`, `apps/api/src/lib/followerSync.ts`
- Test: `apps/api/test/metrics-accounts.test.ts`

**Interfaces:**
- Consumes: `successfulPostRefs` (Task 3), `primaryConnection` (Task 1), `resolveAccessToken` (Task 3, YouTube refresh), `bearer` / `youtubeCount` / `YOUTUBE_API_BASE` (Task 5).
- Produces:
  - `fetchYouTubeVideoMetrics(videoId, token): Promise<Record<string, number>>`: views count as reach too, plus likes and comments.
  - `fetchYouTubeSubscribers(channelId, token): Promise<number | null>`: null when the channel hides the count.
  - `METRIC_PLATFORMS = ['facebook', 'instagram', 'gmb', 'youtube']`
  - `addMetrics(a, b)` (`lib/metricsSync.ts`)
  - The stored per-platform `Post.metrics` shape is unchanged: a platform's value is the sum over its accounts. Follower snapshot ids are unchanged (`${dealer}_${platform}_${day}`); the value is the sum over the platform's live accounts. YouTube is included in both.

- [ ] **Step 1: Write the failing test** — `apps/api/test/metrics-accounts.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { snapshotId, syncFollowerSnapshots, utcDay } from '../src/lib/followerSync.js';
import { addMetrics, syncPostMetrics } from '../src/lib/metricsSync.js';
import { totalReach } from '../src/lib/postMetrics.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const AT = '2026-09-20T10:00:00.000Z';
type StoredMetrics = Record<string, Record<string, unknown> | undefined>;

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Sum Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

const connect = (dealerId: string, platform: string, accountId: string, token: string, created = new Date()) => prisma.platformConnection.create({
  data: {
    dealer_id: dealerId, platform, platform_account_id: accountId, access_token: token, is_connected: true, created_at: created,
    // Google tokens refresh when stale; a valid one keeps these tests off the token endpoint.
    ...(platform === 'youtube' ? { refresh_token: '1//r', token_expires_at: new Date(Date.now() + HOUR) } : {}),
  },
});

const published = (dealerId: string, platforms: string[], results: Record<string, unknown>, metrics?: Record<string, unknown>) => prisma.post.create({
  data: {
    dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms, status: 'published',
    published_at: new Date(Date.now() - DAY), publish_results: results, ...(metrics ? { metrics } : {}),
  },
});

const account = (postId: string) => ({ account_name: 'Page', post_id: postId, url: 'u', published_at: AT });
const fbInsights = (reach: number, likes: number) => ({
  data: { insights: { data: [{ name: 'post_reach', values: [{ value: reach }] }] }, likes: { summary: { total_count: likes } }, shares: { count: 0 }, comments: { summary: { total_count: 0 } } },
});
const metricsOf = async (id: string) => (await prisma.post.findUnique({ where: { id } }))?.metrics as StoredMetrics;

describe('post metrics across accounts', () => {
  it('adds numbers key by key', () => {
    assert.deepEqual(addMetrics({ reach: 1, likes: 2 }, { reach: 3, shares: 4 }), { reach: 4, likes: 2, shares: 4 });
  });

  it('sums a platform over its accounts, each read with its own token', async (t) => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', `pa-${randomUUID()}`, 'token-a');
    const b = await connect(dealerId, 'facebook', `pb-${randomUUID()}`, 'token-b');
    const post = await published(dealerId, ['facebook'], { facebook: { ...account('fa-1'), accounts: { [a.id]: account('fa-1'), [b.id]: account('fb-2') } } });
    const tokens: Record<string, string> = {};
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      const id = url.split('/').at(-1) ?? '';
      tokens[id] = config.params['access_token'] ?? '';
      if (id === 'fa-1') return fbInsights(100, 10);
      if (id === 'fb-2') return fbInsights(50, 5);
      throw new Error(`unexpected GET ${url}`);
    });

    await syncPostMetrics(new Date());

    const metrics = await metricsOf(post.id);
    assert.deepEqual([metrics['facebook']?.['reach'], metrics['facebook']?.['likes']], [150, 15]);
    assert.deepEqual(tokens, { 'fa-1': 'token-a', 'fb-2': 'token-b' });
  });

  it('reads a result written before accounts with the primary account', async (t) => {
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', `old-${randomUUID()}`, 'token-old', new Date('2026-09-01T00:00:00Z'));
    await connect(dealerId, 'facebook', `new-${randomUUID()}`, 'token-new', new Date('2026-09-02T00:00:00Z'));
    await published(dealerId, ['facebook'], { facebook: account('legacy-1') });
    const tokens: string[] = [];
    t.mock.method(axios, 'get', async (_url: string, config: { params: Record<string, string> }) => {
      tokens.push(config.params['access_token'] ?? '');
      return fbInsights(10, 1);
    });

    await syncPostMetrics(new Date());

    assert.deepEqual(tokens, ['token-old']);
  });

  it('keeps the previous numbers when one account fails', async (t) => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', `pa-${randomUUID()}`, 'token-a');
    const b = await connect(dealerId, 'facebook', `pb-${randomUUID()}`, 'token-b');
    const post = await published(
      dealerId, ['facebook'],
      { facebook: { ...account('ok-1'), accounts: { [a.id]: account('ok-1'), [b.id]: account('down-2') } } },
      { facebook: { reach: 42 } },
    );
    t.mock.method(axios, 'get', async (url: string) => {
      if (url.endsWith('/ok-1')) return fbInsights(100, 10);
      throw new Error('(#100) Unsupported get request');
    });
    t.mock.method(console, 'error', () => {});

    await syncPostMetrics(new Date());

    assert.equal((await metricsOf(post.id))['facebook']?.['reach'], 42);
  });

  it('reads YouTube views, likes and comments with a Bearer token', async (t) => {
    const dealerId = await newDealer();
    const channel = await connect(dealerId, 'youtube', 'UC-apex', 'ya29.yt');
    const post = await published(dealerId, ['youtube'], { youtube: { ...account('vid-1'), accounts: { [channel.id]: account('vid-1') } } });
    const seen: Array<{ url: string; params: Record<string, string>; auth: string }> = [];
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string>; headers: Record<string, string> }) => {
      seen.push({ url, params: config.params, auth: config.headers['Authorization'] ?? '' });
      return { data: { items: [{ statistics: { viewCount: '1200', likeCount: '40', commentCount: '6' } }] } };
    });

    await syncPostMetrics(new Date());

    const metrics = await metricsOf(post.id);
    const yt = metrics['youtube'];
    assert.deepEqual([yt?.['views'], yt?.['reach'], yt?.['likes'], yt?.['comments']], [1200, 1200, 40, 6]);
    assert.equal(totalReach(metrics), 1200);
    assert.deepEqual(seen, [{ url: 'https://www.googleapis.com/youtube/v3/videos', params: { part: 'statistics', id: 'vid-1' }, auth: 'Bearer ya29.yt' }]);
  });
});

describe('follower snapshots across accounts', () => {
  it('sums a platform over its accounts and snapshots YouTube subscribers', async (t) => {
    // Connections from the tests above would otherwise take the batch's slots.
    await prisma.platformConnection.deleteMany({ where: { platform: { in: ['facebook', 'instagram', 'youtube'] } } });
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'fpage-1', 'token-1');
    await connect(dealerId, 'facebook', 'fpage-2', 'token-2');
    await connect(dealerId, 'youtube', 'UC-subs', 'ya29.subs');
    const hidden = await newDealer();
    await connect(hidden, 'youtube', 'UC-hidden', 'ya29.hidden');
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      if (url.endsWith('/fpage-1')) return { data: { fan_count: 1500 } };
      if (url.endsWith('/fpage-2')) return { data: { followers_count: 300 } };
      if (url === 'https://www.googleapis.com/youtube/v3/channels') {
        return config.params['id'] === 'UC-subs'
          ? { data: { items: [{ statistics: { subscriberCount: '820', hiddenSubscriberCount: false } }] } }
          : { data: { items: [{ statistics: { hiddenSubscriberCount: true } }] } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    assert.equal(await syncFollowerSnapshots(now), 2);

    const day = utcDay(now);
    const followers = async (d: string, platform: string) =>
      (await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(d, platform, day) } }))?.followers ?? null;
    assert.deepEqual([await followers(dealerId, 'facebook'), await followers(dealerId, 'youtube'), await followers(hidden, 'youtube')], [1800, 820, null]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/metrics-accounts.test.ts`
Expected: FAIL (`addMetrics` is not exported).

- [ ] **Step 3: YouTube reads** — in `apps/api/src/services/youtube.ts`, add `import { isMockId } from '../lib/platformMock.js';` and, at the end:

```ts
/** A video's public numbers: views also count as reach (as Google Business Profile views do), plus likes and comments. */
export async function fetchYouTubeVideoMetrics(videoId: string, accessToken: string): Promise<Record<string, number>> {
  if (isMockId(videoId) || isMockId(accessToken)) return {};
  const res = await axios.get<{ items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> }>(
    `${YOUTUBE_API_BASE}/videos`,
    { params: { part: 'statistics', id: videoId }, headers: bearer(accessToken), timeout: TIMEOUT_MS },
  );
  const stats = res.data.items?.[0]?.statistics;
  const views = youtubeCount(stats?.viewCount) ?? 0;
  return { views, reach: views, likes: youtubeCount(stats?.likeCount) ?? 0, comments: youtubeCount(stats?.commentCount) ?? 0 };
}

/** A channel's subscribers; null when the channel hides the count. */
export async function fetchYouTubeSubscribers(channelId: string, accessToken: string): Promise<number | null> {
  if (isMockId(channelId) || isMockId(accessToken)) return null;
  const res = await axios.get<{ items?: Array<{ statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }> }>(
    `${YOUTUBE_API_BASE}/channels`,
    { params: { part: 'statistics', id: channelId }, headers: bearer(accessToken), timeout: TIMEOUT_MS },
  );
  const stats = res.data.items?.[0]?.statistics;
  if (!stats || stats.hiddenSubscriberCount) return null;
  return youtubeCount(stats.subscriberCount);
}
```

- [ ] **Step 4: `apps/api/src/lib/postMetrics.ts`.** Replace `export const METRIC_PLATFORMS = ['facebook', 'instagram', 'gmb'] as const;` with:

```ts
export const METRIC_PLATFORMS = ['facebook', 'instagram', 'gmb', 'youtube'] as const;
```

In the header comment, add `youtube: { views, reach, likes, comments }` to the list of stored shapes.

- [ ] **Step 5: `apps/api/src/lib/metricsSync.ts`** — replace everything from the imports down to the end of `syncPostMetrics` (keep the constants and `pickMetricsCandidates` as they are):

```ts
import type { PlatformConnection, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchGmbPostMetrics } from '../services/gmb.js';
import { fetchFacebookPostMetrics, fetchInstagramPostMetrics } from '../services/meta.js';
import { fetchYouTubeVideoMetrics } from '../services/youtube.js';
import { forEachLimited } from './concurrency.js';
import { primaryConnection } from './connections.js';
import { isMockConnection, isMockId } from './platformMock.js';
import { isMetricPlatform, type MetricPlatform } from './postMetrics.js';
import { resolveAccessToken } from './publishDirect.js';
import { successfulPostRefs } from './publishResults.js';

export const METRICS_BATCH = 10;
export const METRICS_CONCURRENCY = 3;
export const METRICS_WINDOW_DAYS = 30;
export const METRICS_REFRESH_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = Pick<Post, 'published_at' | 'metrics_last_fetched'>;

/** Posts published in the last 30 days whose metrics are missing or 6+ hours old; never-fetched, then oldest, first. */
export function pickMetricsCandidates<T extends Candidate>(posts: T[], now: Date, limit = METRICS_BATCH): T[] {
  const windowStart = now.getTime() - METRICS_WINDOW_DAYS * DAY_MS;
  const staleBefore = now.getTime() - METRICS_REFRESH_MS;
  return posts
    .filter((p) => p.published_at && p.published_at.getTime() >= windowStart)
    .filter((p) => !p.metrics_last_fetched || p.metrics_last_fetched.getTime() <= staleBefore)
    .sort((a, b) =>
      (a.metrics_last_fetched?.getTime() ?? 0) - (b.metrics_last_fetched?.getTime() ?? 0)
      || (a.published_at?.getTime() ?? 0) - (b.published_at?.getTime() ?? 0))
    .slice(0, limit);
}

export async function fetchPlatformMetrics(platform: MetricPlatform, platformPostId: string, accessToken: string): Promise<Record<string, number>> {
  if (platform === 'facebook') return fetchFacebookPostMetrics(platformPostId, accessToken);
  if (platform === 'instagram') return fetchInstagramPostMetrics(platformPostId, accessToken);
  if (platform === 'youtube') return fetchYouTubeVideoMetrics(platformPostId, accessToken);
  return fetchGmbPostMetrics(platformPostId, accessToken);
}

/** Adds numbers key by key: several accounts' metrics for one platform. */
export function addMetrics(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

// One platform's numbers for a post, summed over the accounts that have it, each read with its own token.
// A result written before per-account publishing names no account, so the primary account reads it.
// Null when nothing could be measured (mock publishes, accounts no longer connected). A failing account
// throws, so the caller keeps the previous numbers instead of storing a partial sum.
async function platformMetrics(platform: MetricPlatform, entry: unknown, conns: readonly PlatformConnection[]): Promise<Record<string, number> | null> {
  let sum: Record<string, number> | null = null;
  for (const ref of successfulPostRefs(entry)) {
    if (isMockId(ref.post_id)) continue;
    const conn = ref.connection_id
      ? conns.find((c) => c.id === ref.connection_id && c.platform === platform) ?? null
      : primaryConnection(conns, platform);
    if (!conn || isMockConnection(conn)) continue;
    const token = await resolveAccessToken(conn);
    sum = addMetrics(sum ?? {}, await fetchPlatformMetrics(platform, ref.post_id, token));
  }
  return sum;
}

// Fetches each live platform's numbers into metrics[platform] (the metricsWorker merge pattern) and always
// stamps metrics_last_fetched, so a post that cannot be measured waits its turn instead of blocking the batch.
async function refreshPost(post: Post, conns: readonly PlatformConnection[], now: Date): Promise<void> {
  const results = (post.publish_results ?? {}) as Record<string, unknown>;
  const previous = post.metrics && typeof post.metrics === 'object' && !Array.isArray(post.metrics)
    ? (post.metrics as Record<string, unknown>)
    : {};
  const metrics: Record<string, unknown> = { ...previous };
  for (const platform of post.platforms ?? []) {
    if (!isMetricPlatform(platform)) continue;
    try {
      const numbers = await platformMetrics(platform, results[platform], conns);
      if (numbers) metrics[platform] = { ...numbers, fetched_at: now.toISOString() };
    } catch (err) {
      console.error(`[metrics] ${platform} metrics failed for post ${post.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  await prisma.post.update({ where: { id: post.id }, data: { metrics, metrics_last_fetched: now } });
}

/**
 * Cron step: refreshes platform metrics for up to 10 recently published posts, three at a time.
 * Mock publishes and posts without a live connection are stamped but not fetched. Returns how many posts it stamped.
 */
export async function syncPostMetrics(now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);
  const published = await prisma.post.findMany({ where: { status: 'published', published_at: { gte: windowStart } } });
  const due = pickMetricsCandidates(published, now);
  if (due.length === 0) return 0;

  const dealerIds = [...new Set(due.map((p) => p.dealer_id))];
  const connections = await prisma.platformConnection.findMany({ where: { dealer_id: { in: dealerIds }, is_connected: true } });
  const byDealer = new Map<string, PlatformConnection[]>();
  for (const conn of connections) byDealer.set(conn.dealer_id, [...(byDealer.get(conn.dealer_id) ?? []), conn]);

  let refreshed = 0;
  await forEachLimited(due, METRICS_CONCURRENCY, async (post) => {
    try {
      await refreshPost(post, byDealer.get(post.dealer_id) ?? [], now);
      refreshed++;
    } catch (err) {
      console.error(`[metrics] Could not refresh post ${post.id}:`, err instanceof Error ? err.message : String(err));
    }
  });
  return refreshed;
}
```

- [ ] **Step 6: `apps/api/src/lib/followerSync.ts`** — replace the whole file:

```ts
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchInstagramFollowers, fetchPageFollowers } from '../services/meta.js';
import { fetchYouTubeSubscribers } from '../services/youtube.js';
import { isMockConnection } from './platformMock.js';
import { resolveAccessToken } from './publishDirect.js';

export const FOLLOWER_BATCH = 5;
export const FOLLOWER_TTL_DAYS = 400;
const FOLLOWER_PLATFORMS = ['facebook', 'instagram', 'youtube'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day, YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function snapshotId(dealerId: string, platform: string, day: string): string {
  return `${dealerId}_${platform}_${day}`;
}

function fetchFollowers(conn: PlatformConnection, token: string): Promise<number | null> {
  if (conn.platform === 'facebook') return fetchPageFollowers(conn.platform_account_id, token);
  if (conn.platform === 'instagram') return fetchInstagramFollowers(conn.platform_account_id, token);
  return fetchYouTubeSubscribers(conn.platform_account_id, token);
}

interface FollowerGroup {
  id: string;
  dealerId: string;
  platform: string;
  conns: PlatformConnection[];
  lastTried: number;
}

/**
 * Cron step: today's audience for up to 5 dealer + platform pairs that have none yet, summed over the
 * platform's live accounts (Pages, Instagram accounts, YouTube channels), each read with its own token.
 * Every account is claimed (last_sync_at stamped) before it is asked, and the pairs tried least recently go
 * first, so a failing or hanging account cannot starve the others. Accounts that fail are left out of the sum.
 * Returns snapshots saved.
 */
export async function syncFollowerSnapshots(now: Date): Promise<number> {
  const day = utcDay(now);
  const live = (await prisma.platformConnection.findMany({ where: { platform: { in: FOLLOWER_PLATFORMS } } }))
    .filter((c) => c.is_connected && !isMockConnection(c));
  if (live.length === 0) return 0;

  const groups = new Map<string, FollowerGroup>();
  for (const conn of live) {
    const id = snapshotId(conn.dealer_id, conn.platform, day);
    const group = groups.get(id) ?? { id, dealerId: conn.dealer_id, platform: conn.platform, conns: [], lastTried: Number.POSITIVE_INFINITY };
    group.conns.push(conn);
    group.lastTried = Math.min(group.lastTried, conn.last_sync_at?.getTime() ?? 0);
    groups.set(id, group);
  }
  const taken = new Set((await prisma.followerSnapshot.findMany({ where: { id: { in: [...groups.keys()] } } })).map((s) => s.id));
  const due = [...groups.values()]
    .filter((g) => !taken.has(g.id))
    .sort((a, b) => a.lastTried - b.lastTried)
    .slice(0, FOLLOWER_BATCH);

  let saved = 0;
  for (const group of due) {
    let followers = 0;
    let counted = 0;
    for (const conn of group.conns) {
      try {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
      } catch (err) {
        console.error(`[followers] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
        continue;
      }
      try {
        const count = await fetchFollowers(conn, await resolveAccessToken(conn));
        if (count !== null) {
          followers += count;
          counted++;
        }
      } catch (err) {
        console.error(`[followers] ${conn.platform} follower count failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
    if (counted === 0) continue;
    await prisma.followerSnapshot.upsert({
      where: { id: group.id },
      create: {
        id: group.id, dealer_id: group.dealerId, platform: group.platform, followers, captured_on: day,
        expires_at: new Date(now.getTime() + FOLLOWER_TTL_DAYS * DAY_MS),
      },
      update: { followers },
    });
    saved++;
  }
  return saved;
}
```

- [ ] **Step 7: Run the tests**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/metrics-accounts.test.ts test/metrics-sync.test.ts test/post-metrics.test.ts test/dealer-analytics.test.ts test/cron.test.ts
cd ../.. && npm run build
```
Expected: all pass (`metrics-accounts`: 6); the existing metrics and follower tests pass unchanged; the build exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/youtube.ts apps/api/src/lib/postMetrics.ts apps/api/src/lib/metricsSync.ts apps/api/src/lib/followerSync.ts apps/api/test/metrics-accounts.test.ts
git commit -m "feat(api): post metrics and follower counts across accounts, YouTube included

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: A revoked Google account is disconnected and the team is told

This task contains non-ASCII copy (— in the notification body, written as `\u2014`).

**Files:**
- Modify: `apps/api/src/lib/connectionStore.ts` (add `disconnectRevokedConnection`), `apps/api/src/lib/googleToken.ts`
- Test: `apps/api/test/google-token.test.ts`

**Interfaces:**
- Consumes: `guardedWrite` (`lib/guardedWrite.ts`), `notify` (`lib/notifications.ts`, type `platform_disconnected`), `platformLabel` (Task 1).
- Produces:
  - `disconnectRevokedConnection(connectionId): Promise<boolean>` (true only when this call flipped the account off).
  - `GoogleTokenConnection.platform?: string`, which picks the YouTube or Business Profile wording.
  - `getFreshGoogleAccessToken`: on `invalid_grant`, soft-disconnects the account. Only on that true → false flip, it notifies every active team member (`{Label} disconnected`, `{account name} needs reconnecting — access was revoked or expired.`, link `/accounts`). Then it throws as before.

- [ ] **Step 1: Write the failing test** — `apps/api/test/google-token.test.ts`:

```ts
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { getFreshGoogleAccessToken } from '../src/lib/googleToken.js';

const HOUR = 3_600_000;

function setGoogleEnv(t: TestContext) {
  const saved = { id: process.env['GOOGLE_CLIENT_ID'], secret: process.env['GOOGLE_CLIENT_SECRET'] };
  process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
  t.after(() => {
    for (const [key, value] of [['GOOGLE_CLIENT_ID', saved.id], ['GOOGLE_CLIENT_SECRET', saved.secret]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Revoked Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  return { dealerId: dealer.id, admin };
}

const googleAnswer = (body: Record<string, unknown>, status: number) => async () => new Response(JSON.stringify(body), { status });

describe('revoked Google access', () => {
  it('disconnects the account and tells the team once', async (t) => {
    setGoogleEnv(t);
    const { dealerId, admin } = await team();
    const conn = await prisma.platformConnection.create({
      data: {
        dealer_id: dealerId, platform: 'gmb', platform_account_id: 'accounts/1/locations/7', platform_account_name: 'Apex Bandra',
        access_token: 'ya29.old', refresh_token: '1//revoked', token_expires_at: new Date(Date.now() - HOUR), is_connected: true,
      },
    });
    t.mock.method(globalThis, 'fetch', googleAnswer({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));

    await assert.rejects(getFreshGoogleAccessToken(conn), {
      message: 'Could not renew Google Business Profile access (Token has been expired or revoked.). Reconnect Google Business Profile in Settings, then publish again.',
    });

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: conn.id } }))?.is_connected, false);
    const notices = await prisma.notification.findMany({ where: { user_id: admin.id } });
    assert.deepEqual(
      notices.map((n) => [n.type, n.title, n.body, n.link]),
      [['platform_disconnected', 'Google Business Profile disconnected', 'Apex Bandra needs reconnecting \u2014 access was revoked or expired.', '/accounts']],
    );

    await assert.rejects(getFreshGoogleAccessToken(conn));
    assert.equal((await prisma.notification.findMany({ where: { user_id: admin.id } })).length, 1);
  });

  it('words YouTube failures for YouTube and keeps the account on other errors', async (t) => {
    setGoogleEnv(t);
    const { dealerId, admin } = await team();
    const conn = await prisma.platformConnection.create({
      data: {
        dealer_id: dealerId, platform: 'youtube', platform_account_id: 'UC-9', platform_account_name: 'Apex TV',
        access_token: 'ya29.old', refresh_token: '1//r', token_expires_at: new Date(Date.now() - HOUR), is_connected: true,
      },
    });
    t.mock.method(globalThis, 'fetch', googleAnswer({ error: 'internal_failure' }, 500));

    await assert.rejects(getFreshGoogleAccessToken(conn), {
      message: 'Could not renew YouTube access (internal_failure). Reconnect YouTube on Accounts, then publish again.',
    });
    await assert.rejects(getFreshGoogleAccessToken({ ...conn, refresh_token: null }), {
      message: 'YouTube access expired and cannot be renewed. Reconnect YouTube on Accounts, then publish again.',
    });
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: conn.id } }))?.is_connected, true);
    assert.equal((await prisma.notification.findMany({ where: { user_id: admin.id } })).length, 0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/google-token.test.ts`
Expected: FAIL (the account stays connected; YouTube errors are worded for Business Profile).

- [ ] **Step 3: `disconnectRevokedConnection`** — in `apps/api/src/lib/connectionStore.ts`, change the connections import to `import { MAX_CONNECTED_ACCOUNTS, platformLabel, primaryConnection } from './connections.js';`, add:

```ts
import { guardedWrite } from './guardedWrite.js';
import { notify } from './notifications.js';
```

and, at the end:

```ts
/**
 * Google answered invalid_grant for this account: access was revoked, or the refresh token expired.
 * Soft-disconnects it and, only on that first flip, tells the dealership's team (bell, linking to Accounts).
 * Returns whether this call disconnected it.
 */
export async function disconnectRevokedConnection(connectionId: string): Promise<boolean> {
  const flipped = await guardedWrite(
    'platform_connections',
    prisma.platformConnection,
    connectionId,
    (doc) => doc['is_connected'] !== false,
    { is_connected: false },
  );
  if (!flipped) return false;
  const conn = await prisma.platformConnection.findUnique({ where: { id: connectionId } });
  if (conn) {
    const label = platformLabel(conn.platform);
    await notify({
      dealerId: conn.dealer_id,
      type: 'platform_disconnected',
      title: `${label} disconnected`,
      body: `${conn.platform_account_name || label} needs reconnecting \u2014 access was revoked or expired.`,
      link: '/accounts',
    });
  }
  return true;
}
```

- [ ] **Step 4: `apps/api/src/lib/googleToken.ts`** — replace the whole file:

```ts
import { prisma } from '../db/prisma.js';
import { disconnectRevokedConnection } from './connectionStore.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 15_000;

export interface GoogleTokenConnection {
  id: string;
  /** 'gmb' or 'youtube': picks the wording of the reconnect message. */
  platform?: string;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: Date | string | null;
}

function wording(platform: string | undefined): { label: string; hint: string } {
  return platform === 'youtube'
    ? { label: 'YouTube', hint: 'Reconnect YouTube on Accounts, then publish again.' }
    : { label: 'Google Business Profile', hint: 'Reconnect Google Business Profile in Settings, then publish again.' };
}

export function googleTokenNeedsRefresh(expiresAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || expiresMs - now <= REFRESH_MARGIN_MS;
}

// Google access tokens last ~1h. Refreshes with the stored refresh token when the current one is missing an
// expiry, expired, or about to expire, and persists the new token. When Google says the grant is gone
// (invalid_grant), the account is disconnected and the team told (lib/connectionStore.ts).
export async function getFreshGoogleAccessToken(conn: GoogleTokenConnection): Promise<string> {
  if (!googleTokenNeedsRefresh(conn.token_expires_at)) return conn.access_token;
  const { label, hint } = wording(conn.platform);

  if (!conn.refresh_token) {
    throw new Error(`${label} access expired and cannot be renewed. ${hint}`);
  }
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to renew Google access');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    if (body.error === 'invalid_grant') {
      await disconnectRevokedConnection(conn.id).catch((err: unknown) => {
        console.error('[google-token] Could not record the revoked connection:', err instanceof Error ? err.message : String(err));
      });
    }
    const reason = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(`Could not renew ${label} access (${reason}). ${hint}`);
  }

  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: {
      access_token: body.access_token,
      token_expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
      ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}),
    },
  });
  return body.access_token;
}
```

- [ ] **Step 5: Run the tests and the byte check**

Run:
```bash
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/google-token.test.ts test/gmb-review-sync.test.ts test/publish-lifecycle.test.ts test/notifications.test.ts test/connections.test.ts
cd ../.. && npm run build
git diff -U0 -- apps/api/src/lib/connectionStore.ts apps/api/src/lib/googleToken.ts apps/api/test/google-token.test.ts | grep -nP '^\+.*[^\x00-\x7F]'
```
Expected: all pass (`google-token`: 2); the build exits 0; the byte check prints nothing (the em dash is `\u2014` in source).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/connectionStore.ts apps/api/src/lib/googleToken.ts apps/api/test/google-token.test.ts
git commit -m "feat(api): disconnect a Google account whose access was revoked and notify the team

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: One connect flow, the OAuth return page and onboarding connects

This task contains non-ASCII copy (… in "Completing connection…", written as `\u2026`).

**Files:**
- Create: `apps/web/src/utils/connectPlatform.ts`, `apps/web/src/utils/connectPlatform.test.ts`
- Modify: `apps/web/src/pages/OAuthCallbackPage.tsx` (rewritten), `apps/web/src/pages/Onboarding.tsx`, `apps/web/src/App.tsx`
- Delete: `apps/web/src/pages/ConnectProfilesPage.tsx`

**Interfaces:**
- Consumes (HTTP, Tasks 2 and 5): `GET /platforms/connect/:platform` → `{ redirect_url }`; the return query on `/oauth/callback` (`success`, `error`, `platform`, `page_name`, `accounts`, `fb`, `ig`, `google`, `youtube`).
- Produces (`utils/connectPlatform.ts`; pinned for E2):
  - `type OAuthReturnPath = '/accounts' | '/onboarding' | '/settings?tab=platforms'`
  - `type ConnectPlatform = 'facebook' | 'gmb' | 'youtube'`
  - `const OAUTH_RETURN_KEY = 'oauth_return_to'`
  - `parseOAuthReturn(value: string | null | undefined): OAuthReturnPath`
  - `readOAuthReturn(): OAuthReturnPath`: whitelisted; defaults to `/accounts`; clears the key.
  - `startConnect(platform: 'facebook' | 'gmb' | 'youtube', returnTo: OAuthReturnPath): Promise<void>`: throws on failure so the caller can toast.
  - `interface OAuthToast { type: 'success' | 'error'; title; message }`, `oauthToast(params: URLSearchParams): OAuthToast | null`
- Routing: `/oauth/callback` toasts and navigates to the stored path; `/accounts/create` redirects to `/accounts`; onboarding step 2 connects Facebook and Google, and returning reopens step 2.

- [ ] **Step 1: Write the failing test** — `apps/web/src/utils/connectPlatform.test.ts`:

```ts
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OAUTH_RETURN_KEY, oauthToast, parseOAuthReturn, readOAuthReturn } from './connectPlatform.js';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true, writable: true });
});

describe('OAuth return path', () => {
  it('accepts only the three in-app return paths', () => {
    assert.equal(parseOAuthReturn('/onboarding'), '/onboarding');
    assert.equal(parseOAuthReturn('/settings?tab=platforms'), '/settings?tab=platforms');
    assert.equal(parseOAuthReturn('/accounts'), '/accounts');
    assert.equal(parseOAuthReturn('https://evil.test/accounts'), '/accounts');
    assert.equal(parseOAuthReturn('//evil.test'), '/accounts');
    assert.equal(parseOAuthReturn(null), '/accounts');
  });

  it('reads the stored path once', () => {
    globalThis.sessionStorage.setItem(OAUTH_RETURN_KEY, '/onboarding');
    assert.equal(readOAuthReturn(), '/onboarding');
    assert.equal(globalThis.sessionStorage.getItem(OAUTH_RETURN_KEY), null);
    assert.equal(readOAuthReturn(), '/accounts');
    assert.equal(OAUTH_RETURN_KEY, 'oauth_return_to');
  });

  it('falls back to /accounts when storage is blocked', () => {
    Object.defineProperty(globalThis, 'sessionStorage', { get() { throw new Error('blocked'); }, configurable: true });
    assert.equal(readOAuthReturn(), '/accounts');
  });
});

describe('oauthToast', () => {
  const toast = (query: string) => oauthToast(new URLSearchParams(query));

  it('names what was linked', () => {
    assert.deepEqual(toast('success=1&platform=facebook%2Cinstagram&accounts=3&fb=2&ig=1'), {
      type: 'success', title: 'Connected!', message: 'Linked: 2 Facebook page(s), 1 Instagram account(s)',
    });
    assert.equal(toast('success=1&platform=google&accounts=3&google=3')?.message, 'Linked: 3 Google Business location(s)');
    assert.equal(toast('success=1&platform=youtube&accounts=1&youtube=1')?.message, 'Linked: 1 YouTube channel(s)');
    assert.equal(toast('success=1&platform=twitter')?.message, 'Account connected successfully.');
  });

  it('explains failures', () => {
    assert.deepEqual(toast('error=access_denied&platform=google'), {
      type: 'error', title: 'Connection failed', message: 'Access was denied. Please try again and accept the permissions.',
    });
    assert.equal(
      toast('error=Account%20limit%20reached%20(30).%20Disconnect%20an%20account%20to%20add%20another.')?.message,
      'Account limit reached (30). Disconnect an account to add another.',
    );
    assert.equal(toast('error=weird_code')?.message, 'OAuth error: weird_code');
    assert.equal(toast(''), null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web`
Expected: FAIL (`Cannot find module './connectPlatform.js'`).

- [ ] **Step 3: `apps/web/src/utils/connectPlatform.ts`**

```ts
// The one connect flow for Accounts, Onboarding and Settings: ask the API for the provider's consent URL,
// remember where to come back to, then leave the app (a full-page redirect, never a popup).
// /oauth/callback (pages/OAuthCallbackPage.tsx) shows the outcome and returns to that page.

export type OAuthReturnPath = '/accounts' | '/onboarding' | '/settings?tab=platforms';
export type ConnectPlatform = 'facebook' | 'gmb' | 'youtube';

export const OAUTH_RETURN_KEY = 'oauth_return_to';

const RETURN_PATHS: readonly OAuthReturnPath[] = ['/accounts', '/onboarding', '/settings?tab=platforms'];

/** Only the in-app return paths; anything else (another site, a typo) goes to Accounts. */
export function parseOAuthReturn(value: string | null | undefined): OAuthReturnPath {
  return RETURN_PATHS.find((path) => path === value) ?? '/accounts';
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // blocked (privacy settings, sandboxed frames)
  }
}

/** Where to go after a connect; reading clears it. */
export function readOAuthReturn(): OAuthReturnPath {
  const store = storage();
  let value: string | null = null;
  try {
    value = store?.getItem(OAUTH_RETURN_KEY) ?? null;
    store?.removeItem(OAUTH_RETURN_KEY);
  } catch {
    value = null;
  }
  return parseOAuthReturn(value);
}

/** Starts a connect: leaves the app on success, throws (for a toast) when the API gives no consent URL. */
export async function startConnect(platform: 'facebook' | 'gmb' | 'youtube', returnTo: OAuthReturnPath): Promise<void> {
  // Loaded on use, so the pure helpers above stay importable by the node test runner.
  const { default: api } = await import('../services/api');
  const res = await api.get<{ redirect_url?: string }>(`/platforms/connect/${platform}`);
  if (!res.redirect_url) throw new Error('The sign-in link did not come back. Please try again.');
  try {
    storage()?.setItem(OAUTH_RETURN_KEY, returnTo);
  } catch {
    // Storage blocked: the return lands on Accounts.
  }
  window.location.href = res.redirect_url;
}

export interface OAuthToast {
  type: 'success' | 'error';
  title: string;
  message: string;
}

// The reference's error codes; our API mostly sends a sentence, shown as it is.
const OAUTH_ERRORS: Record<string, string> = {
  server_config: 'OAuth is not configured on the server. Contact support.',
  token_exchange_failed: 'Token exchange failed. Please try again.',
  no_code: 'Authorization was cancelled.',
  no_locations: 'No Google Business locations found on this account. Make sure you have a verified Business Profile, then try again.',
  gbp_quota: 'Google Business Profile access is not yet approved for this app (zero API quota). The developer must request Business Profile API access from Google.',
  gbp_disabled: 'The Google Business Profile APIs are not enabled for this app. The developer must enable them in Google Cloud Console.',
  gbp_error: 'Could not read your Google Business Profile. Please try again, or contact support if it persists.',
  access_denied: 'Access was denied. Please try again and accept the permissions.',
};

const LINKED_PARTS: ReadonlyArray<readonly [string, string]> = [
  ['fb', 'Facebook page(s)'],
  ['ig', 'Instagram account(s)'],
  ['google', 'Google Business location(s)'],
  ['youtube', 'YouTube channel(s)'],
];

/** The toast for an OAuth return query; null when the query reports nothing. */
export function oauthToast(params: URLSearchParams): OAuthToast | null {
  const error = params.get('error');
  if (error) {
    const message = OAUTH_ERRORS[error] ?? (/\s/.test(error) ? error : `OAuth error: ${error}`);
    return { type: 'error', title: 'Connection failed', message };
  }
  const success = params.get('success');
  if (success !== '1' && success !== 'true') return null;
  const parts = LINKED_PARTS.flatMap(([key, label]) => {
    const count = params.get(key);
    return count && count !== '0' ? [`${count} ${label}`] : [];
  });
  return { type: 'success', title: 'Connected!', message: parts.length > 0 ? `Linked: ${parts.join(', ')}` : 'Account connected successfully.' };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -w web`
Expected: PASS (`connectPlatform`: 5; the other web tests unchanged).

- [ ] **Step 5: `apps/web/src/pages/OAuthCallbackPage.tsx`** — replace the whole file:

```tsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { oauthToast, readOAuthReturn } from '../utils/connectPlatform';

// Where Meta and Google send the browser after a connect: shows the outcome, then returns to the page that
// started it (Accounts, Onboarding or Settings, stored by startConnect before the redirect).
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return; // StrictMode runs effects twice in development
    handled.current = true;
    const toast = oauthToast(new URLSearchParams(window.location.search));
    if (toast) addToast(toast);
    navigate(readOAuthReturn(), { replace: true });
  }, [addToast, navigate]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-zinc-500">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        {'Completing connection\u2026'}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Routes** — in `apps/web/src/App.tsx`:
- delete `import ConnectProfilesPage from './pages/ConnectProfilesPage';`;
- replace the `/accounts/create` route with:

```tsx
      <Route path="/accounts/create" element={<Navigate to="/accounts" replace />} />
```

Then delete the old page: `git rm apps/web/src/pages/ConnectProfilesPage.tsx`.

- [ ] **Step 7: `apps/web/src/pages/Onboarding.tsx`.**

(a) Imports: add `LoaderCircle` to the `lucide-react` import, and add:

```tsx
import { startConnect } from '../utils/connectPlatform';
```

(b) Above `export default function Onboarding()`, add:

```tsx
// Coming back from a connect flow reopens the "Connect your showroom accounts" step.
const RESUME_STEP_KEY = 'onboarding_resume_step';

function takeResumeStep(): number | null {
  try {
    const value = sessionStorage.getItem(RESUME_STEP_KEY);
    sessionStorage.removeItem(RESUME_STEP_KEY);
    return value === '2' ? 2 : null;
  } catch {
    return null;
  }
}

function rememberResumeStep(step: number | null): void {
  try {
    if (step === null) sessionStorage.removeItem(RESUME_STEP_KEY);
    else sessionStorage.setItem(RESUME_STEP_KEY, String(step));
  } catch {
    // Storage blocked: the wizard starts at step 1.
  }
}
```

(c) Replace `const [step, setStep] = useState(1);` with:

```tsx
  const [step, setStep] = useState(() => takeResumeStep() ?? 1);
```

Replace the comment `// Step 2: Account Link — real connection status; connecting happens on /accounts after setup` with `// Step 2: Account Link: real connection status; Facebook and Google connect from here`, and after the `connectedPlatforms` state add:

```tsx
  const [connecting, setConnecting] = useState<string | null>(null);
```

(d) After `handleOemSelect`, add:

```tsx
  // Leaves for the provider's consent screen; /oauth/callback brings the dealer back to step 2.
  const connectFrom = async (rowId: string, platform: 'facebook' | 'gmb') => {
    setConnecting(rowId);
    rememberResumeStep(2);
    try {
      await startConnect(platform, '/onboarding');
    } catch (err) {
      rememberResumeStep(null);
      setConnecting(null);
      addToast({
        type: 'error',
        title: 'Connection failed',
        message: err instanceof Error && err.message && err.message !== 'Network error' ? err.message : 'Could not start OAuth. Check API configuration.',
      });
    }
  };
```

(e) In step 2, replace the helper paragraph text with `Connect now, or later from the Accounts page. Publishing needs at least one connected account.`, and add a `connect` field to each row:

```tsx
                    { id: 'facebook', name: 'Facebook Page', icon: <FacebookIcon className="w-5 h-5 text-blue-500" />, desc: 'Publish visual posts directly to your official page feed', connect: 'facebook' as const },
                    { id: 'instagram', name: 'Instagram Business', icon: <InstagramIcon className="w-5 h-5 text-pink-500" />, desc: 'Schedule reels, car photos, and local launch promotions', connect: null },
                    { id: 'gmb', name: 'Google My Business', icon: <GlobeIcon className="w-5 h-5 text-orange-500" />, desc: 'Automatically showcase vehicle updates on Google Maps', connect: 'gmb' as const },
```

(f) In the row's `.map((plat) => { … })`, after `const connected = connectedPlatforms.includes(plat.id);` add `const target = plat.connect;`. Then replace the non-connected branch, from the `) : (` after the Connected badge through the `)}` that closes the `Connect after setup` span, with:

```tsx
                          ) : target ? (
                            <Button
                              variant="secondary"
                              disabled={connecting !== null}
                              onClick={() => { void connectFrom(plat.id, target); }}
                              className="bg-slate-800 hover:bg-slate-700 text-white border-slate-800 h-8 text-xs"
                            >
                              {connecting === plat.id && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                              Connect
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700 font-semibold">
                              via Facebook
                            </span>
                          )}
```

(The Instagram row has no button: its account links through the Facebook connect.)

- [ ] **Step 8: Verify**

Run:
```bash
npm test -w web
npm run build
cd apps/web && npx eslint . | tail -1
cd ../.. && git diff -U0 -- apps/web/src/utils/connectPlatform.ts apps/web/src/pages/OAuthCallbackPage.tsx apps/web/src/pages/Onboarding.tsx apps/web/src/App.tsx | grep -nP '^\+.*[^\x00-\x7F]'
grep -rn "ConnectProfilesPage" apps/web/src
```
Expected:
- The tests pass and the build exits 0.
- Lint total ≤ 44 (45 minus the deleted page's problem).
- The byte check and the grep print nothing.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/utils/connectPlatform.ts apps/web/src/utils/connectPlatform.test.ts apps/web/src/pages/OAuthCallbackPage.tsx apps/web/src/pages/Onboarding.tsx apps/web/src/App.tsx
git commit -m "feat(web): one connect flow with an in-app return, used by onboarding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 6 already staged the deletion.)

---

### Task 11: Accounts page

This task contains non-ASCII copy (— ’ …, written as `\u2014`, `\u2019`, `\u2026`).

**Files:**
- Modify (API): `apps/api/src/lib/events.ts`, `apps/api/test/events.test.ts`
- Create: `apps/web/src/utils/accounts.ts`, `apps/web/src/utils/accounts.test.ts`, `apps/web/src/services/accounts.ts`
- Create: `apps/web/src/components/accounts/AccountPills.tsx`, `apps/web/src/components/accounts/PlatformCard.tsx`, `apps/web/src/components/accounts/AccountLibrary.tsx`, `apps/web/src/components/accounts/DisconnectModal.tsx`
- Modify: `apps/web/src/pages/AccountsPage.tsx` (rewritten), `apps/web/src/services/events.ts`, `apps/web/src/components/dashboard/Widgets.tsx`

**Interfaces:**
- Consumes:
  - HTTP: `GET /platform-accounts` (Task 1), `DELETE /platform-accounts/:id` (Task 1), `POST /platforms/sync-instagram` → `{ found, accountName }` / 404 `NO_INSTAGRAM` (Task 2), `POST /events` (Stage D).
  - `startConnect`, `type ConnectPlatform` (Task 10).
- Produces:
  - `utils/accounts.ts`: every name in the interface table (catalogue, token health, card actions, library filter and formatting, toast copy).
  - `services/accounts.ts`: `accountsService.list(): Promise<ConnectedAccount[]>`, `.remove(id)`, `.syncInstagram(): Promise<{ found: number; accountName: string | null }>`.
  - Components: `StatPill`, `StatusPill`, `TokenPill`, `ActivePill`, `PlatformGlyph`, `PlatformCard`, `AccountLibrary`, `DisconnectModal`.
  - `EVENT_ACTIONS` and the web `TrackedAction` gain `platform.notify_requested`.

**Reference layout** (from `AccountsPage-*.js`):
- Root card `max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6 space-y-6`.
- Header: "Accounts & integrations", the subtitle, two stat pills, and an icon Refresh button.
- "Social Platforms" grid `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`, planned platforms last.
- "Connected Account Library": search, platform select, Refresh, and the table.
- A danger disconnect modal.
- Token health: expired / under 7 days left for Meta tokens; Google and YouTube are always ok.
- Refetches on window focus. A failed list load is silent (empty list).

- [ ] **Step 1: Write the failing tests.**

(a) `apps/web/src/utils/accounts.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUE, FILTER_OPTIONS, INSTAGRAM_NEEDS_FACEBOOK, LIVE_CHANNELS, NOTIFY_LABEL, SEARCH_PLACEHOLDER, STATUS_LABELS, TOKEN_WARN_MS,
  accountPlatformName, accountsFor, cardAction, connectedDate, filterAccounts, libraryCountText, needsFacebookFirst, notifyToast,
  shortAccountId, sortedCatalogue, syncInstagramToast, tokenHealth, type CatalogueId, type ConnectedAccount,
} from './accounts.js';

const NOW = Date.parse('2026-09-24T10:00:00Z');
const DAY = 86_400_000;
const account = (over: Partial<ConnectedAccount>): ConnectedAccount => ({
  id: 'a1', platform: 'facebook', accountName: 'Apex Motors', accountId: '1234567890', tokenExpiry: null, createdAt: '2026-09-01T00:00:00.000Z', ...over,
});
const entry = (id: CatalogueId) => CATALOGUE.find((c) => c.id === id)!;

describe('catalogue', () => {
  it('lists live platforms first and counts three live channels', () => {
    assert.deepEqual(sortedCatalogue().map((c) => c.id), ['facebook', 'instagram', 'google', 'youtube', 'twitter', 'linkedin']);
    assert.equal(LIVE_CHANNELS, 3);
    assert.deepEqual(entry('youtube').capabilities, ['Shorts', 'Videos', 'Comments', 'Analytics']);
    assert.deepEqual(STATUS_LABELS, { live: 'Live', 'via-facebook': 'Via Facebook', planned: 'Pipeline' });
  });

  it('keeps the reference copy byte for byte', () => {
    assert.equal(INSTAGRAM_NEEDS_FACEBOOK, 'Connect Facebook first \u2014 your Instagram Business account auto-links from your FB Page.');
    assert.equal(NOTIFY_LABEL, 'Notify me when it\u2019s ready');
    assert.equal(SEARCH_PLACEHOLDER, 'Search accounts\u2026');
    assert.deepEqual(notifyToast('LinkedIn'), { title: 'We\u2019ll let you know', message: 'Your interest in LinkedIn is noted.' });
    assert.equal(libraryCountText(4), '4/30 accounts connected. Search, filter, and manage channel access.');
    assert.equal(entry('facebook').description, 'Publish posts, manage pages, and support boosted campaigns.');
  });
});

describe('token health', () => {
  const inMs = (ms: number) => new Date(NOW + ms).toISOString();

  it('flags expired Meta tokens and warns in their last 7 days', () => {
    assert.equal(tokenHealth(inMs(-1000), 'facebook', NOW), 'expired');
    assert.equal(tokenHealth(inMs(TOKEN_WARN_MS - DAY), 'instagram', NOW), 'warn');
    assert.equal(tokenHealth(inMs(TOKEN_WARN_MS + DAY), 'facebook', NOW), 'ok');
    assert.equal(tokenHealth(null, 'facebook', NOW), 'ok');
  });

  it('never warns for Google tokens, which renew themselves', () => {
    for (const platform of ['google', 'gmb', 'youtube']) assert.equal(tokenHealth(inMs(-DAY), platform, NOW), 'ok');
  });
});

describe('card actions', () => {
  it('connects, adds another account, detects Instagram or asks to be notified', () => {
    const fb = account({ id: 'f1' });
    assert.deepEqual(cardAction(entry('facebook'), []), { kind: 'connect', label: 'Connect Facebook', platform: 'facebook' });
    assert.deepEqual(cardAction(entry('facebook'), [fb]), { kind: 'add', label: 'Add another account', platform: 'facebook' });
    assert.deepEqual(cardAction(entry('google'), []), { kind: 'connect', label: 'Connect Google Business', platform: 'gmb' });
    assert.deepEqual(cardAction(entry('youtube'), [account({ platform: 'youtube' })]), { kind: 'add', label: 'Add another account', platform: 'youtube' });
    assert.deepEqual(cardAction(entry('instagram'), [fb]), { kind: 'detect', label: 'Detect Instagram on connected Page', platform: null });
    assert.deepEqual(cardAction(entry('instagram'), []), { kind: 'connect', label: 'Connect Instagram', platform: 'facebook' });
    assert.deepEqual(cardAction(entry('linkedin'), [fb]), { kind: 'notify', label: NOTIFY_LABEL, platform: null });
  });

  it('asks for Facebook first only while neither Instagram nor Facebook is connected', () => {
    assert.equal(needsFacebookFirst(entry('instagram'), []), true);
    assert.equal(needsFacebookFirst(entry('instagram'), [account({})]), false);
    assert.equal(needsFacebookFirst(entry('instagram'), [account({ platform: 'instagram' })]), false);
    assert.equal(needsFacebookFirst(entry('facebook'), []), false);
  });
});

describe('library', () => {
  const list = [
    account({ id: '1', platform: 'facebook', accountName: 'Apex Motors', accountId: 'page-111' }),
    account({ id: '2', platform: 'google', accountName: 'Apex Bandra', accountId: 'accounts/1/locations/2' }),
    account({ id: '3', platform: 'youtube', accountName: 'Apex TV', accountId: 'UC-apex' }),
  ];

  it('filters by platform and searches name, id and platform', () => {
    assert.deepEqual(filterAccounts(list, '', 'google').map((a) => a.id), ['2']);
    assert.deepEqual(filterAccounts(list, 'apex t', 'all').map((a) => a.id), ['3']);
    assert.deepEqual(filterAccounts(list, 'LOCATIONS/2', 'all').map((a) => a.id), ['2']);
    assert.deepEqual(filterAccounts(list, 'youtube', 'all').map((a) => a.id), ['3']);
    assert.equal(filterAccounts([account({ platform: 'gmb' })], '', 'google').length, 1);
    assert.deepEqual(FILTER_OPTIONS.map((o) => o.label), ['All platforms', 'Facebook', 'Instagram', 'Google Business', 'YouTube']);
    assert.deepEqual(accountsFor(list, 'google').map((a) => a.id), ['2']);
  });

  it('shortens long ids, names platforms and formats dates', () => {
    assert.equal(shortAccountId('accounts/1234567890/locations/1'), 'accounts/1234567\u2026');
    assert.equal(shortAccountId('page-111'), 'page-111');
    assert.equal(accountPlatformName('google'), 'Google Business');
    assert.equal(accountPlatformName('youtube'), 'YouTube');
    assert.match(connectedDate('2026-09-24T10:00:00.000Z'), /2026/);
    assert.equal(connectedDate('not a date'), '');
    assert.deepEqual(syncInstagramToast('@apexmotors'), { title: 'Instagram linked!', message: 'Connected as @apexmotors.' });
    assert.equal(syncInstagramToast(null).message, 'Account added.');
  });
});
```

(b) `apps/api/test/events.test.ts`, inside `describe('POST /v1/events')`, add:

```ts
  it('records interest in a planned platform', async () => {
    const dealerId = await newDealer();
    const res = await send(headersFor(dealerId), { action: 'platform.notify_requested', platform: 'linkedin' });
    assert.equal(res.statusCode, 204);
    const [event] = await prisma.event.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual([event?.action, event?.meta], ['platform.notify_requested', { platform: 'linkedin' }]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web` and `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/events.test.ts`
Expected: web FAIL (`Cannot find module './accounts.js'`); the API test fails with 400 (unknown action).

- [ ] **Step 3: Events.**
- `apps/api/src/lib/events.ts`: add `'platform.notify_requested'` to `EVENT_ACTIONS`, after `'report.downloaded'`.
- `apps/web/src/services/events.ts`: extend the union to:

```ts
export type TrackedAction = 'caption.accepted' | 'caption.edited' | 'caption.rejected' | 'report.downloaded' | 'platform.notify_requested';
```

- [ ] **Step 4: `apps/web/src/utils/accounts.ts`**

```ts
import type { ConnectPlatform } from './connectPlatform.js';

/** A row of GET /v1/platform-accounts (stored `gmb` arrives as `google`). */
export interface ConnectedAccount {
  id: string;
  platform: string;
  accountName: string;
  accountId: string;
  tokenExpiry: string | null;
  createdAt: string;
}

export type CatalogueId = 'facebook' | 'instagram' | 'google' | 'twitter' | 'linkedin' | 'youtube';
export type CatalogueStatus = 'live' | 'via-facebook' | 'planned';

export interface CatalogueEntry {
  id: CatalogueId;
  label: string;
  description: string;
  color: string;
  status: CatalogueStatus;
  capabilities: readonly string[];
  /** The connect flow the card starts; Instagram links through Facebook. Null for planned platforms. */
  connect: ConnectPlatform | null;
}

export const MAX_ACCOUNTS = 30;

// The reference's catalogue, in its order (sortedCatalogue puts planned platforms last).
export const CATALOGUE: readonly CatalogueEntry[] = [
  { id: 'facebook', label: 'Facebook', description: 'Publish posts, manage pages, and support boosted campaigns.', color: '#1877F2', status: 'live', capabilities: ['Posts', 'Pages', 'Inbox', 'Reviews'], connect: 'facebook' },
  { id: 'instagram', label: 'Instagram', description: 'Plan feed posts, reels, and carousel-style campaigns.', color: '#E1306C', status: 'via-facebook', capabilities: ['Posts', 'Reels', 'Carousels'], connect: 'facebook' },
  { id: 'google', label: 'Google Business', description: 'Publish local updates and respond to customer reviews.', color: '#4285F4', status: 'live', capabilities: ['Updates', 'Reviews', 'Locations'], connect: 'gmb' },
  { id: 'twitter', label: 'X / Twitter', description: 'Track conversations, trends, and quick business announcements.', color: '#0F172A', status: 'planned', capabilities: ['Posts', 'Mentions', 'Threads'], connect: null },
  { id: 'linkedin', label: 'LinkedIn', description: 'Share employer brand updates, events, and leadership posts.', color: '#0A66C2', status: 'planned', capabilities: ['Pages', 'Posts', 'Reports'], connect: null },
  { id: 'youtube', label: 'YouTube', description: 'Upload Shorts & videos, and manage comments, views and likes.', color: '#FF0000', status: 'live', capabilities: ['Shorts', 'Videos', 'Comments', 'Analytics'], connect: 'youtube' },
];

export function sortedCatalogue(): CatalogueEntry[] {
  return [...CATALOGUE.filter((c) => c.status !== 'planned'), ...CATALOGUE.filter((c) => c.status === 'planned')];
}

/** The header's "Live channels" pill counts the live connectors, as in the reference (not the connected accounts). */
export const LIVE_CHANNELS = CATALOGUE.filter((c) => c.status === 'live').length;

export const STATUS_LABELS: Record<CatalogueStatus, string> = { live: 'Live', 'via-facebook': 'Via Facebook', planned: 'Pipeline' };

export const INSTAGRAM_NEEDS_FACEBOOK = 'Connect Facebook first \u2014 your Instagram Business account auto-links from your FB Page.';
export const SEARCH_PLACEHOLDER = 'Search accounts\u2026';
export const NOTIFY_LABEL = 'Notify me when it\u2019s ready';

export type TokenHealth = 'ok' | 'warn' | 'expired';
export const TOKEN_WARN_MS = 7 * 24 * 60 * 60 * 1000;

/** Google tokens (Business Profile, YouTube) renew themselves, so they are always ok; Meta tokens warn in their last 7 days. */
export function tokenHealth(expiry: string | null, platform: string, now: number): TokenHealth {
  if (!expiry || platform === 'google' || platform === 'gmb' || platform === 'youtube') return 'ok';
  const left = new Date(expiry).getTime() - now;
  if (Number.isNaN(left)) return 'ok';
  if (left < 0) return 'expired';
  return left < TOKEN_WARN_MS ? 'warn' : 'ok';
}

const belongsTo = (account: ConnectedAccount, id: string) => account.platform === id || (id === 'google' && account.platform === 'gmb');

export function accountsFor(accounts: readonly ConnectedAccount[], id: string): ConnectedAccount[] {
  return accounts.filter((a) => belongsTo(a, id));
}

export interface CardAction {
  kind: 'connect' | 'add' | 'detect' | 'notify';
  label: string;
  platform: ConnectPlatform | null;
}

export function cardAction(entry: CatalogueEntry, accounts: readonly ConnectedAccount[]): CardAction {
  if (entry.status === 'planned') return { kind: 'notify', label: NOTIFY_LABEL, platform: null };
  if (accountsFor(accounts, entry.id).length > 0) return { kind: 'add', label: 'Add another account', platform: entry.connect };
  if (entry.id === 'instagram' && accountsFor(accounts, 'facebook').length > 0) {
    return { kind: 'detect', label: 'Detect Instagram on connected Page', platform: null };
  }
  return { kind: 'connect', label: `Connect ${entry.label}`, platform: entry.connect };
}

/** Instagram with nothing to link through yet: the card shows the "Connect Facebook first" note. */
export function needsFacebookFirst(entry: CatalogueEntry, accounts: readonly ConnectedAccount[]): boolean {
  return entry.id === 'instagram' && accountsFor(accounts, 'instagram').length === 0 && accountsFor(accounts, 'facebook').length === 0;
}

export type PlatformFilter = 'all' | 'facebook' | 'instagram' | 'google' | 'youtube';

export const FILTER_OPTIONS: ReadonlyArray<{ value: PlatformFilter; label: string }> = [
  { value: 'all', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google Business' },
  { value: 'youtube', label: 'YouTube' },
];

/** The library rows for a platform filter and a search over name, id and platform. */
export function filterAccounts(accounts: readonly ConnectedAccount[], query: string, filter: PlatformFilter): ConnectedAccount[] {
  const q = query.trim().toLowerCase();
  return accounts.filter((a) => (filter === 'all' || belongsTo(a, filter))
    && (!q || `${a.accountName} ${a.accountId} ${a.platform}`.toLowerCase().includes(q)));
}

export function shortAccountId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}\u2026` : id;
}

export function connectedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', google: 'Google Business', gmb: 'Google Business',
  youtube: 'YouTube', twitter: 'X / Twitter', linkedin: 'LinkedIn',
};

export function accountPlatformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

export function libraryCountText(count: number): string {
  return `${count}/${MAX_ACCOUNTS} accounts connected. Search, filter, and manage channel access.`;
}

/** Nothing sends an email yet, so the message only confirms the interest was recorded. */
export function notifyToast(label: string): { title: string; message: string } {
  return { title: 'We\u2019ll let you know', message: `Your interest in ${label} is noted.` };
}

export function syncInstagramToast(accountName: string | null | undefined): { title: string; message: string } {
  return { title: 'Instagram linked!', message: accountName ? `Connected as ${accountName}.` : 'Account added.' };
}
```

- [ ] **Step 5: `apps/web/src/services/accounts.ts`**

```ts
import api from './api';
import type { ConnectedAccount } from '../utils/accounts';

export const accountsService = {
  list: async (): Promise<ConnectedAccount[]> =>
    (await api.get<{ accounts?: ConnectedAccount[] }>('/platform-accounts')).accounts ?? [],

  remove: (id: string) => api.delete<{ success: boolean }>(`/platform-accounts/${id}`),

  syncInstagram: () => api.post<{ found: number; accountName: string | null }>('/platforms/sync-instagram', {}),
};
```

- [ ] **Step 6: Run the tests**

Run: `npm test -w web` and `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/events.test.ts`
Expected: PASS (`accounts`: 8; events +1).

- [ ] **Step 7: `apps/web/src/components/accounts/AccountPills.tsx`**

```tsx
import { Briefcase, Link2 } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { STATUS_LABELS, type CatalogueStatus, type TokenHealth } from '../../utils/accounts';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

const ICON_PLATFORMS: Record<string, IconPlatform> = {
  facebook: 'facebook', instagram: 'instagram', google: 'gmb', gmb: 'gmb', youtube: 'youtube', twitter: 'twitter',
};
const GLYPH_SIZE = { sm: 'w-4 h-4', md: 'w-5 h-5' } as const;
const PILL = 'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';

export function PlatformGlyph({ platform, size = 'md' }: { platform: string; size?: 'sm' | 'md' }) {
  const icon = ICON_PLATFORMS[platform];
  if (icon) return <PlatformIcon platform={icon} size={size} />;
  const Glyph = platform === 'linkedin' ? Briefcase : Link2;
  return <Glyph className={GLYPH_SIZE[size]} />;
}

export function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1">
      <span className="text-sm font-bold text-zinc-900">{value}</span>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </span>
  );
}

const STATUS_STYLE: Record<CatalogueStatus, { pill: string; dot: string }> = {
  live: { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  'via-facebook': { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  planned: { pill: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
};

export function StatusPill({ status }: { status: CatalogueStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={cn(PILL, style.pill)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const TOKEN_STYLE = {
  expired: { pill: 'bg-red-50 text-red-600 ring-1 ring-red-100', dot: 'bg-red-500', label: 'Reconnect' },
  warn: { pill: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100', dot: 'bg-amber-400', label: 'Expiring' },
} as const;

export function TokenPill({ health }: { health: TokenHealth }) {
  if (health === 'ok') return null;
  const style = TOKEN_STYLE[health];
  return (
    <span className={cn(PILL, style.pill)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

export function ActivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {' Active'}
    </span>
  );
}
```

- [ ] **Step 8: `apps/web/src/components/accounts/PlatformCard.tsx`**

```tsx
import { AlertTriangle, CheckCircle2, Clock, LoaderCircle, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { PlatformGlyph, StatusPill, TokenPill } from './AccountPills';
import {
  INSTAGRAM_NEEDS_FACEBOOK, accountsFor, cardAction, needsFacebookFirst, tokenHealth,
  type CardAction, type CatalogueEntry, type ConnectedAccount, type TokenHealth,
} from '../../utils/accounts';

interface PlatformCardProps {
  entry: CatalogueEntry;
  /** Every connected account; the card picks its platform's own. */
  accounts: ConnectedAccount[];
  now: number;
  busy: boolean;
  onAction: (entry: CatalogueEntry, action: CardAction) => void;
  onDisconnect: (account: ConnectedAccount) => void;
}

const ROW_TINT: Record<TokenHealth, string> = {
  expired: 'bg-red-50/60 border-red-200',
  warn: 'bg-amber-50/60 border-amber-200',
  ok: 'bg-emerald-50/60 border-emerald-200',
};

function AccountRow({ account, health, onDisconnect }: { account: ConnectedAccount; health: TokenHealth; onDisconnect: (account: ConnectedAccount) => void }) {
  const Icon = health === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 border transition-colors', ROW_TINT[health])}>
      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', health === 'ok' ? 'text-emerald-600' : health === 'warn' ? 'text-amber-600' : 'text-red-600')} />
      <span className="text-xs font-medium text-zinc-800 truncate flex-1 min-w-0">{account.accountName}</span>
      <TokenPill health={health} />
      <button
        type="button"
        onClick={() => onDisconnect(account)}
        aria-label={`Disconnect ${account.accountName}`}
        title="Disconnect account"
        className="p-1 rounded-md text-zinc-400 hover:text-red-600 hover:bg-white transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function PlatformCard({ entry, accounts, now, busy, onAction, onDisconnect }: PlatformCardProps) {
  const mine = accountsFor(accounts, entry.id);
  const action = cardAction(entry, accounts);
  const planned = entry.status === 'planned';
  const connected = mine.length > 0;

  return (
    <div
      className={cn(
        'relative bg-white rounded-xl border shadow-sm transition-all duration-200 overflow-hidden',
        connected ? 'border-emerald-300 hover:border-emerald-400 hover:shadow-md'
          : planned ? 'border-zinc-200/80'
            : 'border-zinc-200/80 hover:border-zinc-300 hover:shadow-md',
      )}
    >
      {planned && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
          <Clock className="w-3 h-3" /> Coming soon
        </span>
      )}
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${entry.color}18`, color: entry.color }}>
            <PlatformGlyph platform={entry.id} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn('flex items-center gap-2 flex-wrap', planned && 'pr-20')}>
              <h3 className="text-sm font-semibold text-zinc-900">{entry.label}</h3>
              <StatusPill status={entry.status} />
            </div>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{entry.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {entry.capabilities.map((capability) => (
            <span key={capability} className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{capability}</span>
          ))}
        </div>

        {connected && (
          <div className="mt-3 space-y-1.5">
            {mine.map((account) => (
              <AccountRow key={account.id} account={account} health={tokenHealth(account.tokenExpiry, account.platform, now)} onDisconnect={onDisconnect} />
            ))}
          </div>
        )}

        {needsFacebookFirst(entry, accounts) && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-amber-700 leading-relaxed">{INSTAGRAM_NEEDS_FACEBOOK}</p>
          </div>
        )}

        <div className="mt-auto pt-4">
          <Button
            variant={action.kind === 'connect' ? 'primary' : 'secondary'}
            className="w-full"
            disabled={busy}
            onClick={() => onAction(entry, action)}
          >
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            {action.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: `apps/web/src/components/accounts/AccountLibrary.tsx`**

```tsx
import type { ReactNode } from 'react';
import { ChevronDown, Filter, Link2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { ActivePill, PlatformGlyph, TokenPill } from './AccountPills';
import {
  FILTER_OPTIONS, SEARCH_PLACEHOLDER, accountPlatformName, connectedDate, filterAccounts, libraryCountText, shortAccountId, tokenHealth,
  type ConnectedAccount, type PlatformFilter,
} from '../../utils/accounts';

interface AccountLibraryProps {
  accounts: ConnectedAccount[];
  loading: boolean;
  now: number;
  query: string;
  onQuery: (query: string) => void;
  filter: PlatformFilter;
  onFilter: (filter: PlatformFilter) => void;
  onRefresh: () => void;
  onDisconnect: (account: ConnectedAccount) => void;
}

const FIELD = 'h-8 rounded-lg border border-zinc-200 bg-white pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 transition-colors';
const HEADERS = ['Platform', 'Account', 'Account ID', 'Connected', 'Status', ''];

function SkeletonRows() {
  return (
    <div className="divide-y divide-zinc-100">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-zinc-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 rounded bg-zinc-100" />
            <div className="h-2.5 w-24 rounded bg-zinc-100" />
          </div>
          <div className="h-6 w-16 rounded-full bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-12 px-4 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center mb-3">
        <Link2 className="w-5 h-5 text-zinc-400" />
      </div>
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="text-xs text-zinc-500 mt-1">{text}</p>
    </div>
  );
}

export function AccountLibrary({ accounts, loading, now, query, onQuery, filter, onFilter, onRefresh, onDisconnect }: AccountLibraryProps) {
  const shown = filterAccounts(accounts, query, filter);

  let body: ReactNode;
  if (loading && accounts.length === 0) body = <SkeletonRows />;
  else if (accounts.length === 0) body = <Empty title="No accounts connected yet" text="Connect Facebook or Google Business above to start publishing from Social AI." />;
  else if (shown.length === 0) body = <Empty title="No accounts match this filter" text="Clear the search or switch back to all platforms." />;
  else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50/80 border-b border-zinc-100 text-left">
              {HEADERS.map((header, i) => (
                <th key={i} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {shown.map((account) => {
              const health = tokenHealth(account.tokenExpiry, account.platform, now);
              return (
                <tr key={account.id} className="group hover:bg-zinc-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 whitespace-nowrap">
                      <PlatformGlyph platform={account.platform} size="sm" />
                      {accountPlatformName(account.platform)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-medium text-zinc-900">{account.accountName}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-zinc-500" title={account.accountId}>{shortAccountId(account.accountId)}</td>
                  <td className="px-5 py-3.5 text-xs text-zinc-500 whitespace-nowrap">{connectedDate(account.createdAt)}</td>
                  <td className="px-5 py-3.5">{health === 'ok' ? <ActivePill /> : <TokenPill health={health} />}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onDisconnect(account)}
                      aria-label={`Disconnect ${account.accountName}`}
                      title="Disconnect account"
                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Connected Account Library</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{libraryCountText(accounts.length)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label="Search accounts"
              className={cn(FIELD, 'w-full pr-3')}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <select
              value={filter}
              onChange={(e) => onFilter(e.target.value as PlatformFilter)}
              aria-label="Filter by platform"
              className={cn(FIELD, 'appearance-none pr-8')}
            >
              {FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          </div>
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={onRefresh}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 overflow-hidden">{body}</div>
    </section>
  );
}
```

- [ ] **Step 10: `apps/web/src/components/accounts/DisconnectModal.tsx`**

```tsx
import { LoaderCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { ConnectedAccount } from '../../utils/accounts';

interface DisconnectModalProps {
  account: ConnectedAccount | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DisconnectModal({ account, busy, onClose, onConfirm }: DisconnectModalProps) {
  return (
    <Modal
      isOpen={account !== null}
      onClose={busy ? () => {} : onClose}
      title="Disconnect this account?"
      size="sm"
      variant="danger"
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Keep connected</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Disconnect
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-600">
        This will remove <strong className="font-semibold text-zinc-900">{account?.accountName}</strong> from Social AI. Any scheduled posts for this account will fail to publish.
      </p>
      <p className="text-xs text-zinc-400 mt-3">You can reconnect at any time from the Accounts page.</p>
    </Modal>
  );
}
```

- [ ] **Step 11: `apps/web/src/pages/AccountsPage.tsx`** — replace the whole file:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AccountLibrary } from '../components/accounts/AccountLibrary';
import { StatPill } from '../components/accounts/AccountPills';
import { DisconnectModal } from '../components/accounts/DisconnectModal';
import { PlatformCard } from '../components/accounts/PlatformCard';
import { cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { useToast } from '../components/ui/Toast';
import { ApiError } from '../services/api';
import { accountsService } from '../services/accounts';
import { trackEvent } from '../services/events';
import {
  LIVE_CHANNELS, notifyToast, sortedCatalogue, syncInstagramToast,
  type CardAction, type CatalogueEntry, type ConnectedAccount, type PlatformFilter,
} from '../utils/accounts';
import { startConnect } from '../utils/connectPlatform';

const CATALOGUE = sortedCatalogue();

export default function AccountsPage() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConnectedAccount | null>(null);
  const [removing, setRemoving] = useState(false);

  // A failed load shows an empty list, as in the reference; only actions toast.
  const load = useCallback(() => accountsService.list()
    .then((list) => {
      setAccounts(list);
      setNow(Date.now());
    })
    .catch(() => setAccounts([]))
    .finally(() => setLoading(false)), []);

  // Refetch when the dealer comes back to the tab (e.g. after connecting in another window).
  useEffect(() => {
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  const onAction = (entry: CatalogueEntry, action: CardAction) => {
    if (action.kind === 'notify') {
      trackEvent('platform.notify_requested', { platform: entry.id });
      addToast({ type: 'success', ...notifyToast(entry.label) });
      return;
    }
    setBusyCard(entry.id);
    if (action.kind === 'detect') {
      accountsService.syncInstagram()
        .then((res) => {
          addToast({ type: 'success', ...syncInstagramToast(res.accountName) });
          return load();
        })
        .catch((err: unknown) => addToast({
          type: 'error',
          title: 'No Instagram found',
          message: err instanceof ApiError && err.message ? err.message : 'Could not detect Instagram.',
        }))
        .finally(() => setBusyCard(null));
      return;
    }
    if (!action.platform) {
      setBusyCard(null);
      return;
    }
    // Leaves for the provider's consent screen; /oauth/callback brings the dealer back here.
    startConnect(action.platform, '/accounts').catch((err: unknown) => {
      setBusyCard(null);
      const fallback = entry.id === 'youtube' ? 'Could not start YouTube connection' : 'Could not start OAuth. Check API configuration.';
      addToast({ type: 'error', title: 'Connection failed', message: err instanceof ApiError && err.message ? err.message : fallback });
    });
  };

  const disconnect = () => {
    const target = confirm;
    if (!target) return;
    setRemoving(true);
    accountsService.remove(target.id)
      .then(() => {
        setAccounts((list) => list.filter((a) => a.id !== target.id));
        setConfirm(null);
        addToast({ type: 'success', title: 'Disconnected', message: 'Account removed successfully.' });
      })
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Could not remove account. Please try again.' }))
      .finally(() => setRemoving(false));
  };

  return (
    <PageCard className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Accounts &amp; integrations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Connect your social platforms to publish, schedule and engage.</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <StatPill value={accounts.length} label="Connected" />
            <StatPill value={LIVE_CHANNELS} label="Live channels" />
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh"
          title="Refresh"
          className="p-2 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      <section>
        <h2 className="text-base font-semibold text-zinc-900">Social Platforms</h2>
        <p className="text-sm text-zinc-500 mt-0.5 mb-4">Live connectors are ready to use; upcoming channels show the product roadmap.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {CATALOGUE.map((entry) => (
            <PlatformCard
              key={entry.id}
              entry={entry}
              accounts={accounts}
              now={now}
              busy={busyCard === entry.id}
              onAction={onAction}
              onDisconnect={setConfirm}
            />
          ))}
        </div>
      </section>

      <AccountLibrary
        accounts={accounts}
        loading={loading}
        now={now}
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        onRefresh={refresh}
        onDisconnect={setConfirm}
      />

      <DisconnectModal account={confirm} busy={removing} onClose={() => setConfirm(null)} onConfirm={disconnect} />
    </PageCard>
  );
}
```

- [ ] **Step 12: Dashboard widget** — in `apps/web/src/components/dashboard/Widgets.tsx`, add a YouTube entry to `ACCOUNT_STYLE`:

```tsx
  youtube: { color: '#FF0000', label: 'YouTube' },
```

- [ ] **Step 13: Verify**

Run:
```bash
npm test -w web
cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/events.test.ts && cd ../..
npm run build
cd apps/web && npx eslint src/components/accounts src/pages/AccountsPage.tsx src/utils/accounts.ts && npx eslint . | tail -1
cd ../.. && git diff -U0 -- apps/web/src/utils/accounts.ts apps/web/src/components/accounts apps/web/src/pages/AccountsPage.tsx | grep -nP '^\+.*[^\x00-\x7F]'
```
Expected: the tests pass; the build exits 0; the named files have no lint problems; the total stays ≤ 44; the byte check prints nothing.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/lib/events.ts apps/api/test/events.test.ts apps/web/src/utils/accounts.ts apps/web/src/utils/accounts.test.ts apps/web/src/services/accounts.ts apps/web/src/services/events.ts apps/web/src/components/accounts apps/web/src/pages/AccountsPage.tsx apps/web/src/components/dashboard/Widgets.tsx
git commit -m "feat(web): Accounts page with every connected account, Instagram detect and the account library

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Create Studio account chips

**Files:**
- Modify: `apps/web/src/utils/createStudio.ts`, `apps/web/src/utils/createStudio.test.ts`, `apps/web/src/services/createStudio.ts`, `apps/web/src/services/creative.ts`, `apps/web/src/components/create/EditorSections.tsx`, `apps/web/src/pages/CreateStudio.tsx`

**Interfaces:**
- Consumes:
  - `accountsService.list()`, `type ConnectedAccount` (Task 11).
  - HTTP `POST /publisher` and `PATCH /publisher/posts/:id` with `connectionIds`; posts return `connection_ids` (Task 4). The server refuses a YouTube image post (Task 3).
- Produces (`utils/createStudio.ts`):
  - `interface PlatformOption { id; label; disabled?; hint? }`, `YOUTUBE_VIDEO_ONLY_HINT`
  - `platformOptions(type, connected): PlatformOption[]`: image posts list a connected YouTube as disabled. `defaultPlatforms` skips disabled options.
  - `type StudioAccount = Pick<ConnectedAccount, 'id' | 'platform' | 'accountName' | 'createdAt'>`
  - `postPlatform(platform)`, `connectedPlatformIds(accounts)`, `platformAccounts(accounts, platform)` (primary first)
  - `accountSelection(accounts, platforms, picked): Record<string, string[]>`, `toggleAccount(selection, platform, id): string[]`, `selectedConnectionIds(selection): string[]`
  - `services/creative.ts`: `Post.connection_ids?`; `postService.create` and `PostUpdate` take `connectionIds?: string[]`.
  - `PlatformPicker` takes `accountChoices` and `onToggleAccount`.

- [ ] **Step 1: Write the failing tests** — in `apps/web/src/utils/createStudio.test.ts`:

(a) Add to the import list: `accountSelection, connectedPlatformIds, platformAccounts, selectedConnectionIds, toggleAccount`.

(b) In `it("offers only connected platforms, in the type’s order", …)`, the image options now include a disabled YouTube. Replace its first assertion with:

```ts
    assert.deepEqual(platformOptions('image', connected).map((p) => p.id), ['instagram', 'gmb', 'youtube']);
```

(c) Add:

```ts
describe('accounts per platform', () => {
  const accounts = [
    { id: 'fb-new', platform: 'facebook', accountName: 'Apex Used', createdAt: '2026-09-02T00:00:00.000Z' },
    { id: 'fb-old', platform: 'facebook', accountName: 'Apex Motors', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'g-1', platform: 'google', accountName: 'Apex Bandra', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'yt-1', platform: 'youtube', accountName: 'Apex TV', createdAt: '2026-09-03T00:00:00.000Z' },
  ];

  it('lists connected platforms with Google as gmb, and each platform primary first', () => {
    assert.deepEqual(connectedPlatformIds(accounts), ['facebook', 'gmb', 'youtube']);
    assert.deepEqual(platformAccounts(accounts, 'facebook').map((a) => a.id), ['fb-old', 'fb-new']);
  });

  it('offers account chips only where a platform has several accounts, with the primary preselected', () => {
    assert.deepEqual(accountSelection(accounts, ['facebook', 'gmb'], null), { facebook: ['fb-old'] });
    assert.deepEqual(accountSelection(accounts, ['facebook'], ['fb-new', 'g-1']), { facebook: ['fb-new'] });
    assert.deepEqual(accountSelection(accounts, ['gmb'], ['fb-new']), {});
  });

  it('keeps at least one account selected per platform', () => {
    assert.deepEqual(toggleAccount({ facebook: ['fb-old'] }, 'facebook', 'fb-new'), ['fb-old', 'fb-new']);
    assert.deepEqual(toggleAccount({ facebook: ['fb-old'] }, 'facebook', 'fb-old'), ['fb-old']);
    assert.deepEqual(toggleAccount({ facebook: ['fb-old', 'fb-new'] }, 'facebook', 'fb-old'), ['fb-new']);
    assert.deepEqual(selectedConnectionIds({ facebook: ['fb-old', 'fb-new'], instagram: ['ig-2'] }), ['fb-old', 'fb-new', 'ig-2']);
  });

  it('shows YouTube as a disabled chip on image posts', () => {
    assert.deepEqual(platformOptions('image', ['facebook', 'youtube']).find((o) => o.id === 'youtube'), {
      id: 'youtube', label: 'YouTube', disabled: true, hint: 'YouTube takes video (Shorts) only',
    });
    assert.deepEqual(defaultPlatforms('image', ['facebook', 'youtube']), ['facebook']);
    assert.equal(platformOptions('reel', ['youtube'])[0]?.disabled, undefined);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL (`accountSelection` is not exported; the image options lack YouTube).

- [ ] **Step 3: `apps/web/src/utils/createStudio.ts`.**

(a) Add at the top: `import type { ConnectedAccount } from './accounts.js';`

(b) Replace `platformOptions` and `defaultPlatforms` with:

```ts
export interface PlatformOption {
  id: string;
  label: string;
  /** Shown but not selectable; `hint` says why (YouTube on image posts). */
  disabled?: boolean;
  hint?: string;
}

export const YOUTUBE_VIDEO_ONLY_HINT = 'YouTube takes video (Shorts) only';

export function platformOptions(type: CreateType, connected: readonly string[]): PlatformOption[] {
  const options: PlatformOption[] = (type === 'reel' ? REEL_PLATFORMS : IMAGE_PLATFORMS)
    .filter((p) => connected.includes(p.id))
    .map((p) => ({ ...p }));
  if (type === 'image' && connected.includes('youtube')) {
    options.push({ id: 'youtube', label: 'YouTube', disabled: true, hint: YOUTUBE_VIDEO_ONLY_HINT });
  }
  return options;
}

export function defaultPlatforms(type: CreateType, connected: readonly string[]): string[] {
  return platformOptions(type, connected).filter((p) => !p.disabled).map((p) => p.id);
}
```

(c) After `platformLabel`, add:

```ts
export type StudioAccount = Pick<ConnectedAccount, 'id' | 'platform' | 'accountName' | 'createdAt'>;

/** Posts call Google Business Profile `gmb`; the account list calls it `google`. */
export function postPlatform(platform: string): string {
  return platform === 'google' ? 'gmb' : platform;
}

/** The platforms with a connected account, in the list's order. */
export function connectedPlatformIds(accounts: readonly StudioAccount[]): string[] {
  return [...new Set(accounts.map((a) => postPlatform(a.platform)))];
}

/** A platform's accounts, primary first: the oldest, ties by id (as the API picks it). */
export function platformAccounts<T extends StudioAccount>(accounts: readonly T[], platform: string): T[] {
  return accounts
    .filter((a) => postPlatform(a.platform) === platform)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The chosen accounts of each selected platform that has several. Platforms with one account are left out
 * (the server sends those to their primary). With nothing chosen yet, the primary is preselected.
 */
export function accountSelection(
  accounts: readonly StudioAccount[],
  platforms: readonly string[],
  picked: readonly string[] | null,
): Record<string, string[]> {
  const selection: Record<string, string[]> = {};
  for (const platform of platforms) {
    const mine = platformAccounts(accounts, platform);
    const primary = mine[0];
    if (!primary || mine.length < 2) continue;
    const chosen = mine.filter((a) => picked?.includes(a.id)).map((a) => a.id);
    selection[platform] = chosen.length > 0 ? chosen : [primary.id];
  }
  return selection;
}

/** Toggles one account of a platform, keeping at least one selected; returns every chosen id. */
export function toggleAccount(selection: Readonly<Record<string, readonly string[]>>, platform: string, id: string): string[] {
  const current = selection[platform] ?? [];
  const next = current.includes(id)
    ? (current.length > 1 ? current.filter((x) => x !== id) : [...current])
    : [...current, id];
  return Object.entries({ ...selection, [platform]: next }).flatMap(([, ids]) => [...ids]);
}

export function selectedConnectionIds(selection: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.values(selection).flat();
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -w web`
Expected: PASS.

- [ ] **Step 5: Services.**

(a) `apps/web/src/services/createStudio.ts`: delete `connectedPlatforms` (Create Studio now reads `/platform-accounts`).

(b) `apps/web/src/services/creative.ts`:
- In `interface Post`, after `platforms: string[];` add `connection_ids?: string[];`.
- In `postService.create`'s data type, after `platforms: string[];` add `connectionIds?: string[];`.
- In `interface PostUpdate`, after `platforms?: string[];` add `connectionIds?: string[];`.

- [ ] **Step 6: `PlatformPicker`** — in `apps/web/src/components/create/EditorSections.tsx`:

(a) Change the utils import to:

```tsx
import { outputFormatNote, type CreateType, type PlatformOption, type StudioAccount, type VisualSource } from '../../utils/createStudio';
```

(b) Replace `interface PlatformPickerProps` and `PlatformPicker` with:

```tsx
interface AccountChoice {
  platform: string;
  accounts: StudioAccount[];
  selected: string[];
}

interface PlatformPickerProps {
  type: CreateType;
  options: PlatformOption[];
  selected: string[];
  format: string;
  /** Account chips for each selected platform that has several connected accounts. */
  accountChoices: AccountChoice[];
  onToggle: (id: string) => void;
  onToggleAccount: (platform: string, accountId: string) => void;
  onConnect: () => void;
}

export function PlatformPicker({ type, options, selected, format, accountChoices, onToggle, onToggleAccount, onConnect }: PlatformPickerProps) {
  const hints = options.flatMap((p) => (p.disabled && p.hint ? [p.hint] : []));
  return (
    <div>
      <label className={LABEL_CLASS}>Post to</label>
      {options.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-zinc-500">
          No {type === 'reel' ? 'video-capable ' : ''}accounts connected.{' '}
          <button type="button" onClick={onConnect} className="font-semibold text-orange-600 hover:text-orange-700">Connect accounts</button>
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {options.map((p) => {
            const active = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                disabled={p.disabled}
                title={p.hint}
                onClick={() => onToggle(p.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl border px-3 py-2 transition-all',
                  active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50',
                  p.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                )}
              >
                <PlatformIcon platform={p.id as IconPlatform} size="sm" />
                <span className={cn('text-sm font-semibold', active ? 'text-orange-700' : 'text-zinc-700')}>{p.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-orange-500" />}
              </button>
            );
          })}
        </div>
      )}
      {hints.map((hint) => (
        <p key={hint} className="text-[11px] text-zinc-400 mt-1.5 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" /> {hint}
        </p>
      ))}
      {accountChoices.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {accountChoices.map((choice) => (
            <div key={choice.platform} className="flex flex-wrap items-center gap-1.5">
              <PlatformIcon platform={choice.platform as IconPlatform} size="sm" />
              {choice.accounts.map((account) => {
                const on = choice.selected.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleAccount(choice.platform, account.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all',
                      on ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                    )}
                  >
                    {on && <Check className="w-3 h-3" />}
                    {account.accountName}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[11px] text-zinc-400 mt-1.5">
          Output format: <span className="font-semibold text-zinc-600">{format}</span> {outputFormatNote(selected)}
        </p>
      )}
      {type === 'reel' && (selected.includes('facebook') || selected.includes('instagram')) && (
        <p className="text-[11px] text-zinc-400 mt-1 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" /> Facebook &amp; Instagram reels publish only on a live (non-localhost) deployment.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `apps/web/src/pages/CreateStudio.tsx`.**

(a) Imports: add `accountSelection, connectedPlatformIds, platformAccounts, selectedConnectionIds, toggleAccount, type StudioAccount` to the `../utils/createStudio` import, and add `import { accountsService } from '../services/accounts';`.

(b) State: replace `const [connected, setConnected] = useState<string[]>([]);` with:

```tsx
  const [accounts, setAccounts] = useState<StudioAccount[]>([]);
```

and after `const [picked, setPicked] = useState<string[] | null>(null);` add:

```tsx
  // Account ids chosen in the "Post to" account chips; null until the dealer picks (the primary is preselected).
  const [pickedAccounts, setPickedAccounts] = useState<string[] | null>(null);
```

(c) Derived values: immediately before `const selected = picked ?? defaultPlatforms(type, connected);` add:

```tsx
  const connected = connectedPlatformIds(accounts);
```

and immediately after it add:

```tsx
  const selection = accountSelection(accounts, selected, pickedAccounts);
```

(d) In the first effect, replace the `createStudioService.connectedPlatforms()` chain with:

```tsx
    accountsService.list()
      .then((list) => { if (!cancelled) setAccounts(list); })
      .catch(() => {});
```

(e) In the `?edit=` effect, after `setPicked(data.platforms);` add:

```tsx
        setPickedAccounts(data.connection_ids?.length ? data.connection_ids : null);
```

(f) In `savePost`, add to `content`, after `platforms: selected,`:

```tsx
      connectionIds: selectedConnectionIds(selection),
```

(g) In `createAnother`, after `setPicked(null);` add `setPickedAccounts(null);`.

(h) Add two props to `<PlatformPicker … />`:

```tsx
            accountChoices={Object.entries(selection).map(([platform, ids]) => ({ platform, accounts: platformAccounts(accounts, platform), selected: ids }))}
            onToggleAccount={(platform, id) => setPickedAccounts(toggleAccount(selection, platform, id))}
```

- [ ] **Step 8: Verify**

Run:
```bash
npm test -w web
npm run build
cd apps/web && npx eslint src/pages/CreateStudio.tsx src/components/create/EditorSections.tsx src/utils/createStudio.ts && npx eslint . | tail -1
cd ../.. && git diff -U0 -- apps/web/src | grep -nP '^\+.*[^\x00-\x7F]'
```
Expected: the tests pass; the build exits 0; the named files have no new lint problems; the total stays ≤ 44; the byte check prints nothing.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/utils/createStudio.ts apps/web/src/utils/createStudio.test.ts apps/web/src/services/createStudio.ts apps/web/src/services/creative.ts apps/web/src/components/create/EditorSections.tsx apps/web/src/pages/CreateStudio.tsx
git commit -m "feat(web): choose which accounts a post goes to in Create Studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Per-account results on Posts

**Files:**
- Modify: `apps/web/src/utils/posts.ts`, `apps/web/src/utils/posts.test.ts`, `apps/web/src/utils/publishResult.ts`, `apps/web/src/utils/publishResult.test.ts`, `apps/web/src/components/posts/PostDialogs.tsx`

**Interfaces:**
- Consumes (Task 3): the stored `publish_results[platform].accounts` map, and the publish response's `results[].accounts` (`{ connection_id, account_name, success, post_id?, url?, error? }`).
- Produces:
  - `utils/posts.ts`: `interface AccountResult { id; name; url?; error? }`, `interface PlatformResult { platform; url?; error?; accounts? }`, `platformResults(results): PlatformResult[]`. `accounts` is present only when stored, so older results keep their exact shape.
  - `utils/publishResult.ts`: `interface PublishAccountResult`, `PublishPlatformResult.accounts?`, `platformName('youtube') === 'YouTube'`. `summarizePublishResult` warns about accounts that failed on a platform that went live elsewhere.
  - The post detail lists each account's outcome under its platform. Row "View" links and `deliveryRows` are unchanged; they read the platform summary.

- [ ] **Step 1: Write the failing tests.**

(a) `apps/web/src/utils/posts.test.ts`, inside `describe('platformResults')`:

```ts
  it('lists per-account results under a platform', () => {
    assert.deepEqual(platformResults({
      facebook: {
        post_id: 'p-a', url: 'https://fb.test/a',
        accounts: {
          c1: { account_name: 'Apex Motors', post_id: 'p-a', url: 'https://fb.test/a' },
          c2: { account_name: 'Apex Used', error: 'Token expired' },
        },
      },
    }), [{
      platform: 'facebook', url: 'https://fb.test/a',
      accounts: [
        { id: 'c1', name: 'Apex Motors', url: 'https://fb.test/a' },
        { id: 'c2', name: 'Apex Used', error: 'Token expired' },
      ],
    }]);
  });
```

(b) `apps/web/src/utils/publishResult.test.ts`, inside `describe('summarizePublishResult')`:

```ts
  it('names accounts that failed on a platform that still went live', () => {
    const out = summarizePublishResult({
      success: true,
      status: 'published',
      results: [
        { platform: 'facebook', success: true, accounts: [{ account_name: 'Apex Motors', success: true }, { account_name: 'Apex Used', success: false, error: 'Token expired' }] },
        { platform: 'youtube', success: true },
      ],
    }, ['facebook', 'youtube']);
    assert.deepEqual(out, { ok: true, message: 'Facebook (Apex Used): Token expired' });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL (no `accounts` in the platform results; no account warning).

- [ ] **Step 3: `apps/web/src/utils/posts.ts`** — replace `platformResults` with:

```ts
export interface AccountResult {
  id: string;
  name: string;
  url?: string;
  error?: string;
}

export interface PlatformResult {
  platform: string;
  url?: string;
  error?: string;
  /** Each account's outcome, when the platform was published per account. */
  accounts?: AccountResult[];
}

function accountResults(value: unknown): AccountResult[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const list = Object.entries(value as Record<string, unknown>).flatMap(([id, raw]): AccountResult[] => {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as { account_name?: unknown; url?: unknown; error?: unknown };
    return [{
      id,
      name: typeof r.account_name === 'string' && r.account_name ? r.account_name : id,
      ...(typeof r.url === 'string' && r.url ? { url: r.url } : {}),
      ...(typeof r.error === 'string' ? { error: r.error } : {}),
    }];
  });
  return list.length > 0 ? list : undefined;
}

/** Per-platform publish results (with each account's, when stored), without internal keys such as `_rejection`. */
export function platformResults(results: unknown): PlatformResult[] {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return [];
  return Object.entries(results as Record<string, unknown>)
    .filter(([key, value]) => !key.startsWith('_') && !!value && typeof value === 'object')
    .map(([platform, value]) => {
      const r = value as { url?: unknown; error?: unknown; accounts?: unknown };
      const accounts = accountResults(r.accounts);
      return {
        platform,
        ...(typeof r.url === 'string' ? { url: r.url } : {}),
        ...(typeof r.error === 'string' ? { error: r.error } : {}),
        ...(accounts ? { accounts } : {}),
      };
    });
}
```

- [ ] **Step 4: `apps/web/src/utils/publishResult.ts`.**

(a) After `interface PublishPlatformResult`'s opening, add the account type, and the field:

```ts
export interface PublishAccountResult {
  connection_id?: string;
  account_name?: string;
  success?: boolean;
  error?: ErrorLike;
}
```

In `PublishPlatformResult`, after `message?: string;` add `accounts?: PublishAccountResult[];`.

(b) Add `youtube: 'YouTube',` to `PLATFORM_NAMES`.

(c) After `describeFailures`, add:

```ts
// Accounts that failed on a platform that still went live on another of its accounts.
function describeAccountFailures(results: PublishPlatformResult[]): string | null {
  const parts = results
    .filter((r) => !isFailed(r))
    .flatMap((r) => (r.accounts ?? [])
      .filter((a) => a.success === false)
      .map((a) => {
        const name = `${r.platform ? platformName(r.platform) : 'A platform'} (${a.account_name ?? 'an account'})`;
        const reason = errorText(a.error);
        return reason ? `${name}: ${reason}` : `${name} failed`;
      }));
  return parts.length ? parts.join('; ') : null;
}
```

(d) In `summarizePublishResult`, after `if (failureText) warnings.push(failureText);` add:

```ts
  const accountText = describeAccountFailures(results);
  if (accountText) warnings.push(accountText);
```

- [ ] **Step 5: `apps/web/src/components/posts/PostDialogs.tsx`.**

(a) Add `import { platformName } from '../../utils/publishResult';`.

(b) Above `export function PostDetailDialog`, add:

```tsx
function ResultStatus({ url, error }: { url?: string; error?: string }) {
  if (error) return <span className="text-red-600 truncate">{error}</span>;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium inline-flex items-center gap-1 shrink-0">
        <ExternalLink className="w-3 h-3" /> View post
      </a>
    );
  }
  return <span className="text-emerald-700">Published</span>;
}
```

(c) Replace the `{results.length > 0 && ( … )}` block with:

```tsx
        {results.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 mb-1.5">Per-platform result</p>
            <div className="space-y-1.5">
              {results.map((r) => (
                <div key={r.platform} className="text-xs border border-zinc-100 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-700">{platformName(r.platform)}</span>
                    {!r.accounts && <ResultStatus url={r.url} error={r.error} />}
                  </div>
                  {r.accounts && (
                    <div className="mt-1.5 space-y-1">
                      {r.accounts.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 pl-2">
                          <span className="text-zinc-500 truncate">{a.name}</span>
                          <ResultStatus url={a.url} error={a.error} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 6: Verify**

Run:
```bash
npm test -w web
npm run build
cd apps/web && npx eslint src/components/posts src/utils/posts.ts src/utils/publishResult.ts && npx eslint . | tail -1
```
Expected: the tests pass; the build exits 0; no new lint problems; the total stays ≤ 44.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/posts.ts apps/web/src/utils/posts.test.ts apps/web/src/utils/publishResult.ts apps/web/src/utils/publishResult.test.ts apps/web/src/components/posts/PostDialogs.tsx
git commit -m "feat(web): show each account's publish result on posts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verify and ship (controller)

The controller runs this task, not a subagent.

- [ ] **Step 1: Full gate**

```bash
npm run build
cd apps/api && npx prisma generate && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && cd ../..
npm test -w web
cd apps/web && npx eslint . | tail -1 && cd ../..
grep -rn 'key=\${' apps/api/src
grep -rn "dealer_id_platform:" apps/api/src/routes apps/api/src/services apps/api/src/lib
grep -rn "socialConnection\." apps/api/src/routes apps/api/src/services apps/api/src/lib
grep -rn "ConnectProfilesPage\|createStudioService.connectedPlatforms" apps/web/src
git diff -U0 main -- apps | grep -nP '^\+.*[^\x00-\x7F]'
```

Expected:
- The build exits 0 (it type-checks `apps/api/test`).
- API: all tests pass, including the 9 new files (`connections`, `platform-connect`, `publish-accounts`, `publisher-accounts`, `youtube-connect`, `youtube-upload`, `inbox-accounts`, `metrics-accounts`, `google-token`).
- Web: all tests pass. Lint total ≤ 44.
- Every grep and the byte check print nothing.

- [ ] **Step 2: Local end-to-end** (the `api-verify` and `web-local` launch configs)

Setup:
- `api-verify` runs the in-memory store (`FIRESTORE_MEMORY=true`), `NODE_ENV=development`, no Redis, and a local-only `JWT_SECRET`.
- Sign in through the local dev flow (as in the Stage D check), never with production secrets. Take the session token from `localStorage.access_token` as `$TOKEN`.
- `?mock=true` connects mock accounts even though `apps/api/.env` configures Google and Meta. Never finish a real provider consent screen during this check.

Data:
1. Two mock Pages and their Instagram account:

```bash
REDIRECT=$(curl -s -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:3001/v1/platforms/connect/facebook?mock=true' | node -pe 'JSON.parse(require("fs").readFileSync(0)).redirect_url')
curl -s -o /dev/null -w '%{redirect_url}\n' "$REDIRECT"
```

   Expected: the printed return URL ends with `success=1&platform=facebook%2Cinstagram&page_name=Mock+Dealership+Page&accounts=3&fb=2&ig=1`.

2. A mock YouTube channel: the same two commands with `connect/youtube?mock=true`. Expected: `…&platform=youtube&…&accounts=1&youtube=1`.

3. The account list:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3001/v1/platform-accounts
```

   Expected: four rows (two `facebook`, one `instagram`, one `youtube`) with exactly `id, platform, accountName, accountId, tokenExpiry, createdAt`. Note the second Page's `id` as `$PAGE2`.

Checks at `/accounts` (1280 px):
- Header: "Accounts & integrations", the subtitle, "4 Connected" and "3 Live channels".
- Grid order: Facebook, Instagram, Google Business, YouTube, then X / Twitter and LinkedIn with "Coming soon" and "Pipeline".
  - Facebook shows two green account rows and "Add another account".
  - YouTube shows its channel. Google Business shows "Connect Google Business".
- LinkedIn → "Notify me when it’s ready" shows "We’ll let you know" and sends `POST /v1/events` (204).
- Library:
  - "4/30 accounts connected. …".
  - Searching "page 2" leaves one row; the YouTube filter leaves one; a nonsense search shows "No accounts match this filter".
- Disconnect the Instagram row (modal: "Disconnect this account?", Keep connected / Disconnect) → "Disconnected".
- The Instagram card now shows "Detect Instagram on connected Page". Clicking it shows "Instagram linked!" and "Connected as @mock_dealership_instagram.".
- Visit `http://localhost:5173/oauth/callback?error=access_denied&platform=google` → the "Connection failed" toast ("Access was denied. …"), then `/accounts`.
- `/accounts/create` redirects to `/accounts`.

Checks in Create Studio (`/create`):
- Image Post:
  - Facebook, Instagram and a disabled YouTube chip with "YouTube takes video (Shorts) only".
  - Below the chips, the two Facebook Pages as account chips with "Mock Dealership Page" preselected. Deselecting the last one is refused.
- Reel: YouTube is selectable.

Per-account publishing (no AI key needed):

```bash
POST=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' http://127.0.0.1:3001/v1/publisher \
  -d "{\"promptText\":\"Creta walkaround\",\"captionText\":\"Creta walkaround\",\"captionHashtags\":[\"#Creta\"],\"platforms\":[\"facebook\",\"youtube\"],\"mediaType\":\"video\",\"videoUrl\":\"https://storage.googleapis.com/example/reels/sample.mp4\",\"connectionIds\":[\"$PAGE2\"]}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).item.id')
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' http://127.0.0.1:3001/v1/publisher/publish -d "{\"post_id\":\"$POST\",\"platforms\":[\"facebook\",\"youtube\"]}"
curl -s -X POST http://127.0.0.1:3001/v1/cron/publish
```

Expected:
- The publish call answers `scheduled`: video goes through the cron.
- The cron run publishes: Facebook to Mock Dealership Page 2 only (a mock video), YouTube to the mock channel (a `mock_yt_short_…` Short).
- The bell shows "Post published".
- At `/posts` → Published → the post's detail lists "Facebook" with "Mock Dealership Page 2" and "YouTube" with its channel, each with "View post".

General:
- The browser console has no errors.
- Check `/accounts` at 390 px and once in dark mode.

- [ ] **Step 3: Final whole-branch review.** Run an independent review of `main..HEAD` focused on:
- The web ↔ API contract: `ConnectedAccount` against `toAccount` in `routes/platformAccounts.ts`; the OAuth return query against `oauthToast`; `connectionIds` / `connection_ids`; `results[].accounts` against `utils/publishResult.ts`.
- Every `publish_results` reader still works with summaries plus `accounts`: `cron.ts` recovery, `inboxView.ts`, `inboxIngest.resolvePostId`, `metricsSync.ts`, the Posts page and `deliveryRows`.
- Mock-id skips and Bearer headers in every YouTube call; message-only logging.

Fix anything found before the PR.

- [ ] **Step 4: Pull request.** Push `feature/stage-e1-accounts` and open a PR against `main`:
- A summary per area:
  - API: several accounts per platform and the 30 cap, connect flows saving every account, Instagram detect, per-account publishing and results, YouTube connect and Shorts, inbox/metrics/followers across accounts, the revoked-token notice.
  - Web: the connect flow and OAuth return, Accounts page, Create Studio account chips, per-account results.
- The "Decisions and deviations" list, shortened.
- A test plan (Steps 1 and 2).
- Owner steps (Step 5).
- Neutral wording, no credentials. End the body with the attribution line.

- [ ] **Step 5: Owner steps before YouTube goes live** (list them in the PR; the owner does them in Google Cloud):
- Enable **YouTube Data API v3** in the project that owns the Google OAuth client.
- On the OAuth consent screen, add the `youtube.upload` and `youtube.readonly` scopes. While the app is unverified, add the dealers who will test as test users.
- Uploads from an unverified API project stay **private** until Google's YouTube API audit passes. Apply for the audit before promising public Shorts.
- Uploads have their own daily quota bucket; request more before a wide rollout.
- No new redirect URI is needed: YouTube uses the registered `/v1/platforms/callback/google`.
- No Firestore index or TTL change is needed. The new selectors are equality filters, and existing rows already carry `platform_account_id`, so no data migration is needed either.

- [ ] **Step 6: Merge and deploy** (only when the user says so)
- Merge the PR (the user may need to run `gh pr merge`; check `.merged` before deploying).
- Deploy the API from a clean `git archive` of the current `origin/main`, with the usual `gcloud run deploy cardekho-api --source .` flow. First check `gcloud builds list --region asia-south1 --project gen-lang-client-0078524499 --ongoing`.
- Hosting deploys the web.
- Smoke test on production:
  - `GET /v1/platform-accounts` answers 200 with the pinned fields.
  - `GET /v1/platforms/connect/youtube` answers 200 with an `accounts.google.com` URL (or 501 if the Google client is missing).
  - `POST /v1/platforms/sync-instagram` answers 404 `NO_INSTAGRAM` for a dealer without Pages.
  - `/accounts` and `/create` load; `/accounts/create` redirects.
- Update `memory/progress.md` and `memory/decisions.md`.
