# Stage D: Inbox, Analytics and Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Port the reference app's Inbox, Analytics and printable Report pages, wired to real data only.
- Collect the data those pages need: Google reviews, post metrics, follower counts, message classification and usage events.
- Notify the team about new messages and reviews, and make "convert to lead" idempotent.
- Remove the old fabricated analytics (`/v1/analytics/*` mock data and the page that showed it).

**Architecture:**
- **API: data collection in the cron.**
  - The every-minute `POST /v1/cron/publish` gains a maintenance run, started with the reel sweep and awaited after publishing.
  - It runs four steps one after another: classify new messages, sync Google reviews, refresh post metrics, snapshot follower counts.
  - Each step is isolated and time-boxed, so none can fail or stall publishing.
  - Metrics and follower snapshots scan more documents, so they run on every 10th minute only.
- **API: ingestion.**
  - One ingestion path (`lib/inboxIngest.ts`) serves the Meta webhook and the Google review sync.
  - A new message notifies everyone with `view_inbox` (coalesced to one unread notification per 15 minutes) and is flagged for classification.
- **API: analytics.**
  - `lib/postMetrics.ts` turns `Post.metrics` into comparable numbers, shared by the Dashboard reach, `GET /v1/dealer/analytics` and `GET /v1/dealer/analytics/posts`.
  - `lib/dealerAnalytics.ts` holds the pure builders; `routes/dealerAnalytics.ts` serves them.
- **API: inbox routes** enforce `view_inbox` / `reply_inbox`, add a cheap pending count, return post context and the dealer reply, and suggest up to three replies (Gemini first).
- **Web.**
  - Pure logic lives in `utils/inbox.ts` and `utils/analytics.ts`, where the web tests run.
  - Inbox components live in `components/inbox/`, Analytics components in `components/analytics/`, Report parts in `components/report/`.
  - Pages: `pages/InboxPage.tsx` (replaced), `pages/AnalyticsPage.tsx` (new; `pages/Analytics.tsx` deleted) and `pages/ReportPage.tsx` (new, outside the app shell so it prints cleanly).
  - Our extras inside their layout:
    - an "Auto-reply" modal with the existing rules and templates;
    - "Turn into post" on 4–5★ reviews;
    - working Quick Actions.

**Tech Stack:**
- API: Fastify 5, Prisma 5 schema with the Firestore adapter (in-memory under `NODE_ENV=test`), node:test via tsx.
- Web: React 19, react-router-dom 7, Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md`:
- §6 Inbox, Analytics and Report.
- §7: `GET /dealer/analytics`, `GET /dealer/analytics/posts`, `POST /events`, metrics collection, notifications on a new inbox message or review.
- §8 Stage D.

**Reference:** `~/Documents/Coder/social-ai-reference-2026-09-23/chunks/InboxPage-*.js`, `Analytics-*.js` and `ReportPage-*.js`. The classes and copy below were extracted from them. Never copy the bundle into this repo.

## Global Constraints

- **Look:**
  - Keep the reference's `orange-*` / `amber-*` / `zinc-*` / `teal-*` classes; `index.css` remaps orange/amber to the coral brand and warm greys.
  - `h1`–`h3` render in the serif display font.
  - Each dealer page sits in `PageCard` (`max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6`).
- **Copy** from the reference is verbatim, including — … ’ → · ★ ↗ ₹ and the curly quotes “ ”. If an editor flattens them, write them via `\uXXXX` escapes in a script: — `\u2014`, … `\u2026`, ’ `\u2019`, → `\u2192`, · `\u00b7`, ★ `\u2605`, ↗ `\u2197`, ₹ `\u20b9`, “ `\u201c`, ” `\u201d`.
- **Nothing fabricated:** real data, or the reference's empty states. No sample numbers anywhere.
- **Meta credentials are missing in production:**
  - Every Meta and Google call skips `mock_` ids and tokens (`isMockId` / `isMockConnection`) and missing connections, quietly.
  - The UI shows the reference's empty states.
- **Keys and logs:**
  - Gemini calls use `generateContentUrl(model)` + `googleAiHeaders(key)` from `lib/googleAi.ts`, and models from `resolveAiModels()` (`text`, then `textFallbacks`).
  - Keys never go in URLs. Meta Graph calls keep the `access_token` parameter like every existing Meta call; the central axios redaction (`lib/httpErrorRedaction.ts`) strips it from logged errors.
  - Log `err instanceof Error ? err.message : String(err)`, never a raw error object.
  - Groq and OpenAI stay as fallbacks only where they already exist (inbox replies, testimonial captions).
- **Permissions** (`requirePermissionHook` / `can` from `lib/permissions.ts`):
  - `view_inbox`: list, get, `PATCH` `isRead`, mark-all-read, pending-count.
  - `reply_inbox`: reply, suggest-reply, `PATCH` `tag`, generate-post-draft, settings, rules, templates, mock seed, and `POST /v1/leads`.
  - `view_reports`: `GET /v1/dealer/analytics/posts`.
  - `GET /v1/dealer/analytics` stays authenticate-only: the Dashboard shows it to every role (Stage B).
  - Role defaults: owner and admin have everything; `user` has `view_inbox` and `reply_inbox` but not `view_reports`.
- **Plan gate:** the whole inbox is gated for Starter dealers by `checkPlanLimit('inbox')` (403 `PLAN_GATED`). The web treats `PLAN_GATED` where the reference checked `FEATURE_NOT_IN_PLAN`.
- **Time:** API month and day boundaries are UTC (Cloud Run's clock).
- **API conventions:**
  - Existing inbox/leads errors keep their `{ error: "…" }` strings.
  - New errors use `{ error: { code, message } }` with codes `INVALID_INPUT`, `FORBIDDEN`, `AI_NOT_CONFIGURED` (503) and `AI_FAILED` (502).
- **Tests:**
  - API: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`
  - Full API suite: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'`
  - Web: `npm test -w web` (only `src/utils/**/*.test.ts`; tests import siblings with a `.js` suffix).
  - Before a PR: `npm run build` from the repo root (it type-checks `apps/api/test`).
  - API tsconfig is strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
  - Inbox route tests need a dealer with `plan: 'growth'` (Starter is plan-gated).
  - Tests that touch AI delete `GEMINI_API_KEY`, `GROQ_API_KEY` and `OPENAI_API_KEY` first and call `invalidateAiKeyCache()` + `invalidateAiModelCache()`, because `apps/api/.env` may hold real keys.
- **After `schema.prisma` changes:** `cd apps/api && npx prisma generate`.
- **Web lint:** `cd apps/web && npx eslint . | tail -1` must stay ≤ **55** problems. It is 55 today; deleting the old Inbox and Analytics pages should bring it to about 45.
  - Set React state only in handlers, promise callbacks, timers or `useState` initialisers, never synchronously in an effect body.
  - No `Date.now()` / `new Date()` during render; take "now" from a `useState` initialiser or a handler.
  - Component files export only components; types are fine.
- **Commits:**
  - Every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model writes it.
  - Use neutral wording; the repo is public.
  - Never commit `AGENTS.md`, `CLAUDE.md`, `memory/`, `.superpowers/` or `apps/web/dist/`.

## Decisions and deviations from the reference (intended)

1. **"replied" and response rate come from `repliedAt`.** The reference counted read messages as replied (`messages.length - unread`). Here a message is replied when it has a reply. Response rate = replied ÷ total, rounded. Pending Replies = total − replied.
2. **Platform Breakdown counts this week.** The reference labelled all-time counts "this week". Here the rows count messages received in the last 7 days. The filter dropdown labels keep all-time counts, as in the reference.
3. **Quick Actions work:**
   - "Reply to all positive reviews" sets the filters to Reviews · Positive · Unresponded.
   - "Flag unresolved complaints" sets Negative · Unresponded.
   - "Request more Google reviews" opens `/create?prompt=…` with a short ask-for-reviews prompt.
   The reference buttons did nothing.
4. **No nested thread composer.** We store one dealer reply per message. It renders as a thread item ("You · dealer"), without "View replies" or a per-reply composer.
5. **Auto-reply (our extra):** an "Auto-reply" header button opens a modal with the existing auto-reply toggle, rules and templates, using the same API calls as the old page.
6. **Turn into post (our extra):** 4–5★ reviews get "Turn into post". It calls the existing `generate-post-draft` endpoint (now Gemini first, OpenAI fallback) and opens `/create?edit=<draftId>`.
7. **Google is `gmb` in the API.** The web shows it as "Google" and passes `gmb` to `PlatformIcon`. The YouTube row and filter option stay and show 0 until Stage E.
8. **Fabricated analytics removed.** `routes/analytics.ts` (`/v1/analytics/*` with `getMockOverviewData` / `getMockPostsData`), `pages/Analytics.tsx` and `services/analytics.ts` are deleted in Task 11. `security-routes.test.ts` then checks `view_reports` on `/v1/dealer/analytics/posts`.
9. **Plan gating:**
   - A Starter dealer gets 403 `PLAN_GATED` on every inbox route, so the page shows the existing `PlanGatedNotice` instead of the list.
   - Reply and AI failures with `PLAN_GATED` show the reference's upgrade toasts.
10. **Delivery honesty (our extra):**
    - A reply that is saved but not delivered (no live connection, or a `mock_` connection) shows "Reply saved, not delivered" instead of "Reply sent".
    - Instagram comment replies use `/{comment-id}/replies` (the Graph API's endpoint for Instagram); Facebook keeps `/comments`.
11. **AI not configured:** a 503 `AI_NOT_CONFIGURED` shows "AI replies aren’t set up yet — Write your reply manually for now." The reference had only a generic failure toast.
12. **Suggestions are always fresh.** `suggest-reply` no longer returns the cached `ai_suggested_reply`, so "Regenerate" gives new options. It still stores the first option there. A stored suggestion (from auto-reply rules awaiting approval) seeds the AI panel when the card opens.
13. **Classification candidates are flagged at ingestion.** New messages without a sentiment get `needs_classification: true`. The cron classifies up to 20 of those. The design said "sentiment is null", but that filter cannot be pushed down to Firestore, so it would read every message every minute. A boolean with no schema default is pushed down (see `pushable()` in `src/db/firestore.ts`).
14. **Cadence:**
    - Classification and Google reviews run every tick.
    - Post metrics and follower snapshots run when the UTC minute is a multiple of 10. They scan all published posts or all Meta connections, and their data changes over hours, not minutes.
15. **Engagement by type lists only formats with reach.** Published posts without metrics would show 0% bars. Instead the reference's empty state shows until metrics exist.
16. **"Posts Published" counts published posts.** The reference's number (and our `postsThisMonth`) counts posts created. `/v1/dealer/dashboard` gains `publishedThisMonth` and `publishedChange`, used by the Analytics KPI, the monthly recap and the Report's "Posts published".
17. **Ad spend is this month's boost spend** (`GET /v1/boost` → `stats.totalSpendThisMonth`), matching the monthly leads it is divided by. The reference summed the latest 50 campaigns' `totalSpent`. Boost still only records campaigns, so this is ₹0 → "—" until the Ads integration exists.
18. **"Inbox tracked" tooltip.** The reference said the count includes Page-authored comments. Our webhook skips the Page's own comments, so the tooltip reads: "Counts the comments, DMs and reviews our inbox sync linked to these posts. It can differ from Meta’s own comment count."
19. **Webhook hygiene:**
    - Skips Messenger echoes, the Page's own comments, and feed events that are not comments.
    - Maps the platform post id to our `Post.id` (match on `publish_results[platform].post_id`, including Facebook's `<pageId>_<postId>` form), so post context and per-post inbox counts work.
20. **Instagram metrics parse fix.** `fetchInstagramPostMetrics` read top-level fields, but `/{media-id}/insights` answers `{ data: [{ name, values: [{ value }] }] }`. It now reads the `data` array (metrics `reach,likes,comments,saved`).
21. **Follower sync rotation.** Facebook and Instagram connections stamp `last_sync_at` after each follower attempt. Attempts go oldest first, so a failing connection cannot starve the others.
22. **Idempotent ingestion.** New messages get a document id derived from the platform message id. Two concurrent webhook deliveries create one message and one notification.
23. **Report:**
    - Branding reads "Social AI" (our product name since PR #9).
    - Loading states follow each request instead of the reference's combined flag.
24. **Dropped:** the old page's dev-only "Seed Mock Emails" card. `POST /v1/inbox/mock/seed` stays for local testing and now works without AI keys.
25. **Unchanged, known limitation:** the auto-reply engine (`processIncomingMessage`) still runs only for seeded messages. Wiring it into real ingestion (auto-posting public replies) is a separate decision.
26. **Analytics without `view_reports`:** the Post Performance and Top Posts sections show their empty states (the API answers 403). The rest of the page still loads.
27. **Events from accounts without a dealership** (the platform owner) are accepted with 204 but not stored.
28. **Auto-reply rules save fully.** The old page sent snake_case fields (`message_type`, …), but `POST/PUT /v1/inbox/rules` reads camelCase (`messageType`, …), so rules saved empty. The web service now sends camelCase (Task 10).
29. **The 3-month review trend is empty without reviews.** `reviewTrend` is `[]` when none of the three months has a review, so Analytics hides "3-month trend" (the reference shows it only when non-empty) instead of three blank tiles.

## File Map

**API** (paths under `apps/api/`)
- Create:
  - `src/lib/postMetrics.ts`
  - `src/lib/platformMock.ts`
  - `src/lib/geminiJson.ts`
  - `src/lib/inboxView.ts`
  - `src/lib/inboxReplies.ts`
  - `src/lib/inboxNotifications.ts`
  - `src/lib/inboxIngest.ts`
  - `src/lib/inboxClassifier.ts`
  - `src/lib/gmbReviewSync.ts`
  - `src/lib/concurrency.ts`
  - `src/lib/metricsSync.ts`
  - `src/lib/followerSync.ts`
  - `src/lib/cronMaintenance.ts`
  - `src/lib/dealerAnalytics.ts`
  - `src/routes/dealerAnalytics.ts`
  - `src/lib/events.ts`
  - `src/routes/events.ts`
- Modify:
  - `prisma/schema.prisma`: `InboxMessage.rating`, `InboxMessage.needs_classification`, models `Event` and `FollowerSnapshot`.
  - `src/db/prisma.ts`: `event` and `followerSnapshot` collections.
  - `src/routes/inbox.ts`: permissions, pending-count, mapping, suggestions, delivery, webhook.
  - `src/services/emailMock.ts`: seeding survives auto-reply failures.
  - `src/services/gmb.ts`: `GmbReview` with `reviewReply`.
  - `src/services/meta.ts`: follower fetchers; Instagram insights parse.
  - `src/routes/cron.ts`: maintenance run; `forEachLimited` moves to `lib/concurrency.ts`.
  - `src/routes/dealer.ts`: `/analytics` moves out; Dashboard reach and published counts.
  - `src/routes/leads.ts`: idempotent create, tag the message, `reply_inbox`.
  - `src/index.ts`: register `dealerAnalyticsRoutes` and `eventRoutes`; unregister `analyticsRoutes` (Task 11).
- Delete (Task 11): `src/routes/analytics.ts`.
- Tests (create): `post-metrics`, `inbox-routes`, `inbox-ingest`, `gmb-review-sync`, `metrics-sync`, `dealer-analytics`, `events`, `leads`.
- Tests (modify): `cron.test.ts` (axios GET guard), `post-stats.test.ts` (old analytics block moves to `dealer-analytics`), `security-routes.test.ts` (Task 11).

**Web** (paths under `apps/web/`)
- Create:
  - `src/utils/inbox.ts` (+ `inbox.test.ts`)
  - `src/utils/analytics.ts` (+ `analytics.test.ts`)
  - `src/services/events.ts`
  - `src/components/inbox/{Badges,FilterBar,MessageList,ReplyComposer,MessageCard,InboxSidebar,MarkAllReadModal,AutoReplySettings}.tsx`
  - `src/components/analytics/{AnalyticsParts,KpiRow,PostPerformance,InsightCards,Recap}.tsx`
  - `src/components/report/ReportParts.tsx`
  - `src/pages/AnalyticsPage.tsx`
  - `src/pages/ReportPage.tsx`
- Modify:
  - `src/services/api.ts`: 204 responses.
  - `src/services/inbox.ts`: message type from `utils/inbox`, `pendingCount`, suggestion and draft response types.
  - `src/services/dashboard.ts`: `DealerAnalytics` from `utils/analytics`, `postPerformance`, new dashboard stats.
  - `src/pages/InboxPage.tsx`: replaced.
  - `src/components/shell/Sidebar.tsx`: badge from `/inbox/pending-count`.
  - `src/App.tsx`: `/analytics` → `AnalyticsPage`, new `/report`.
  - `src/pages/CreateStudio.tsx`: caption events.
- Delete (Task 11): `src/pages/Analytics.tsx`, `src/services/analytics.ts`.

### Cross-task interface table (pre-flight)

| Produced name | Where | Task | Consumed by |
|---|---|---|---|
| `InboxMessage.rating`, `InboxMessage.needs_classification`, `Event`, `FollowerSnapshot`, `prisma.event`, `prisma.followerSnapshot` | schema / `db/prisma.ts` | 1 | 2, 3, 4, 5, 6, 7 |
| `MetricsBag`, `MetricPlatform`, `METRIC_PLATFORMS`, `isMetricPlatform`, `emptyBag`, `addBags`, `platformBag`, `postMetricsBags`, `totalReach` | `lib/postMetrics.ts` | 1 | 5, 6 |
| `isMockId`, `isMockConnection` | `lib/platformMock.ts` | 2 | 2, 4, 5 |
| `geminiJson`, `parseJsonText` | `lib/geminiJson.ts` | 2 | 2, 3 |
| `truncateText`, `firstCreativeUrl`, `mapMessage`, `mapMessages`, `InboxMessageView` | `lib/inboxView.ts` | 2 | 2, 3, 6 |
| `toneFor`, `dealerReplyContext`, `inboxReplyType`, `parseReplies`, `suggestReplies`, `parseTestimonial`, `draftTestimonial` | `lib/inboxReplies.ts` | 2 | 2 |
| HTTP `GET /v1/inbox/pending-count` → `{ pending }`; list items gain `rating`, `postContext`, `postThumbnail`, `postExternalUrl`, `replies`; `suggest-reply` → `{ suggestedReply, suggestions }` | `routes/inbox.ts` | 2 | 8, 10 |
| `INBOX_NOTIFY_COALESCE_MS`, `inboxNotificationCopy`, `notifyInboxMessage` | `lib/inboxNotifications.ts` | 3 | 3 |
| `InboxIngestInput`, `inboxMessageDocId`, `ingestInboxMessage`, `resolvePostId` | `lib/inboxIngest.ts` | 3 | 3, 4 |
| `Sentiment`, `InboxTag`, `Classification`, `CLASSIFY_BATCH`, `classifyFromRating`, `classifyHeuristic`, `parseAiClassifications`, `classifyWithAi`, `classifyPendingMessages` | `lib/inboxClassifier.ts` | 3 | 4, 5 |
| `GmbReview`, `fetchGmbReviews` (typed) | `services/gmb.ts` | 4 | 4 |
| `REVIEW_SYNC_BATCH`, `REVIEW_SYNC_INTERVAL_MS`, `starRating`, `pickReviewConnections`, `syncGoogleReviews` | `lib/gmbReviewSync.ts` | 4 | 5 |
| `fetchPageFollowers`, `fetchInstagramFollowers` | `services/meta.ts` | 5 | 5 |
| `forEachLimited` | `lib/concurrency.ts` | 5 | 5 (cron, metrics) |
| `pickMetricsCandidates`, `fetchPlatformMetrics`, `syncPostMetrics` | `lib/metricsSync.ts` | 5 | 5 |
| `utcDay`, `snapshotId`, `FOLLOWER_TTL_DAYS`, `syncFollowerSnapshots` | `lib/followerSync.ts` | 5 | 5, 6 |
| `MaintenanceCounts`, `MaintenanceLogger`, `isHeavyTick`, `runMaintenance` | `lib/cronMaintenance.ts` | 5 | 5 (cron) |
| cron response `maintenance: { classified, reviews, metrics, followers }` | `routes/cron.ts` | 5 | 13 |
| `DAY_MS`, `ANALYTICS_DAYS`, `engagementByType`, `followerTrend`, `reviewSummary`, `reviewTrend`, `trendStart`, `postPerformance`, `PostPerformance` | `lib/dealerAnalytics.ts` | 6 | 6 |
| HTTP `GET /v1/dealer/analytics` → `{ engagementByType, followerTrend, reviewSummary, reviewTrend }`; `GET /v1/dealer/analytics/posts` → `{ posts, byPlatform, totals }`; dashboard stats gain `publishedThisMonth`, `publishedChange` | routes | 6 | 8, 11, 12 |
| HTTP `POST /v1/events` → 204; `POST /v1/leads` idempotent on `sourceMessageId` | routes | 7 | 8, 10, 12 |
| `ApiInboxMessage`, `InboxItem`, `InboxReplyItem`, `InboxPlatform`, `Sentiment`, `InboxTag`, `InboxFilters`, `DEFAULT_FILTERS`, `DraftState`, `QuickAction`, `REVIEW_REQUEST_PROMPT`, `toInboxItem`, `displayPlatform`, `apiPlatform`, `iconPlatform`, `initials`, `formatTimestamp`, `inboxStats`, `typeCounts`, `platformCounts`, `weeklyPlatformCounts`, `unreadByPlatform`, `sentimentCounts`, `avgRatingFor`, `filterMessages`, `quickActionFilters`, `toneLabel`, `draftFromSuggestions`, `selectDraftOption`, `markAllDescription`, `canTurnIntoPost` | `utils/inbox.ts` | 8 | 9, 10 |
| `MetricsBag`, `PerformanceBag`, `AnalyticsPlatform`, `PostMetric`, `PostPerformance`, `DealerAnalytics`, `PostSort`, `PERIOD_OPTIONS`, `PLATFORM_PILLS`, `POST_SORTS`, `emptyPerformance`, `engagementRate`, `formatPercent`, `platformName`, `platformAbbrev`, `topPlatform`, `sortPosts`, `costPerLead`, `formatDuration`, `monthLabel`, `shortDate`, `relativeWidth`, `metricParts`, `formatINR`, `signed`, `captionEventFor`, `responseRateColor` | `utils/analytics.ts` | 8 | 11, 12 |
| `trackEvent`, `TrackedAction` | `services/events.ts` | 8 | 12 |
| `inboxService.pendingCount`, `inboxService.generateReply` → `{ suggestedReply, suggestions }`, `inboxService.updateTag` | `services/inbox.ts` | 8 | 10 |
| `RuleInput`, `inboxService.createRule/updateRule` (camelCase bodies), `inboxService.generatePostDraft` → `{ post: { id } }` | `services/inbox.ts` | 10 | 10 |
| `dashboardService.postPerformance(days, platform?)`, `DashboardStats.publishedThisMonth/publishedChange` | `services/dashboard.ts` | 8 | 11, 12 |
| `SentimentBadge`, `TagBadge`, `StarRating`, `StatPill` | `components/inbox/Badges.tsx` | 9 | 9, 10 |
| `FilterBar`, `MessageSkeleton`, `NoMessages`, `NoResults`, `MessageCard`, `ResponseStatsCard`, `PlatformBreakdownCard`, `QuickActionsCard`, `MarkAllReadModal` | `components/inbox/*` | 9 | 10 |
| `AutoReplyModal` | `components/inbox/AutoReplySettings.tsx` | 10 | 10 |
| `SectionShell`, `StatTile`, `DeltaBadge`, `CardEmpty`, `PlatformIconRow`, `MetricRow`, `KpiRow`, `PostPerformanceCard`, `EngagementByTypeCard`, `FollowerGrowthCard`, `ReviewSummaryCard`, `TopPostsCard`, `MonthlyRecapCard` | `components/analytics/*` | 11 | 11 |
| `ReportStatTile`, `SectionHeading`, `ReportDelta`, `HalfStarRating`, `RateBar`, `PlatformCell`, `ReportEmpty`, `TableHead`, `SkeletonRows` | `components/report/ReportParts.tsx` | 12 | 12 |

---

### Task 1: Schema additions and the post metrics library

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `InboxMessage`, new `Event`, new `FollowerSnapshot`), `apps/api/src/db/prisma.ts`
- Create: `apps/api/src/lib/postMetrics.ts`
- Test: `apps/api/test/post-metrics.test.ts`

**Interfaces:**
- Consumes: the generated Prisma client; `FirestoreCollection` (`src/db/firestore.ts`), whose `collectionName` is public.
- Produces:
  - `InboxMessage.rating: number | null` (1–5, Google `starRating`), `InboxMessage.needs_classification: boolean | null`
  - `Event { id, dealer_id, user_id, action, meta, created_at, expires_at }`, `FollowerSnapshot { id, dealer_id, platform, followers, captured_on, created_at, expires_at }`
  - `prisma.event` (collection `events`), `prisma.followerSnapshot` (collection `follower_snapshots`)
  - `METRIC_FIELDS`, `type MetricField`, `type MetricsBag = Record<MetricField, number>`
  - `METRIC_PLATFORMS = ['facebook', 'instagram', 'gmb'] as const`, `type MetricPlatform`, `isMetricPlatform(value: unknown): value is MetricPlatform`
  - `emptyBag(): MetricsBag`, `addBags(a: MetricsBag, b: MetricsBag): MetricsBag`
  - `platformBag(platform: string, raw: unknown): MetricsBag`
  - `interface PostBags { byPlatform: Partial<Record<MetricPlatform, MetricsBag>>; total: MetricsBag }`, `postMetricsBags(metrics: unknown, only?: MetricPlatform): PostBags`
  - `totalReach(metrics: unknown): number`

- [ ] **Step 1: Schema.** In `apps/api/prisma/schema.prisma`:

(a) In `model InboxMessage`, after `tag                  String?` add:

```prisma
  rating               Int?      // 1–5 for Google reviews (starRating); null for comments and DMs
  // true until the cron classifies sentiment and tag. No schema default, so the pending filter is
  // pushed down to Firestore (see pushable() in src/db/firestore.ts).
  needs_classification Boolean?
```

(b) After `model VideoJob { … }` add:

```prisma
// Product usage events from the web app (POST /v1/events).
model Event {
  id         String    @id @default(uuid())
  dealer_id  String
  user_id    String    // DealerUser.id
  action     String    // 'caption.accepted' | 'caption.edited' | 'caption.rejected' | 'report.downloaded'
  meta       Json?
  created_at DateTime  @default(now())
  expires_at DateTime? // Firestore TTL policy on events.expires_at deletes the row after this time

  @@index([dealer_id, created_at])
}

// One follower count per Facebook/Instagram connection per UTC day, for the 30-day growth figures.
model FollowerSnapshot {
  id          String    @id // `${dealer_id}_${platform}_${captured_on}`, so a day is written once
  dealer_id   String
  platform    String    // 'facebook' | 'instagram'
  followers   Int
  captured_on String    // YYYY-MM-DD (UTC)
  created_at  DateTime  @default(now())
  expires_at  DateTime? // Firestore TTL policy on follower_snapshots.expires_at deletes the row after this time

  @@index([dealer_id, captured_on])
}
```

Run: `cd apps/api && npx prisma generate`

- [ ] **Step 2: Collections.** In `apps/api/src/db/prisma.ts`:
- add `Event,` and `FollowerSnapshot,` to the type import list from `'../generated/client/index.js'` (after `VideoJob,`);
- in `class FirestoreDb`, after the `videoJob = …` line, add:

```ts
  event = new FirestoreCollection<Event>('events', 'Event');
  followerSnapshot = new FirestoreCollection<FollowerSnapshot>('follower_snapshots', 'FollowerSnapshot');
```

(These names equal `defaultCollectionName('Event')` / `defaultCollectionName('FollowerSnapshot')`, so the proxy fallback would agree. The explicit entries give `prisma.event` a type. Importing the type `Event` shadows the DOM `Event` inside this module only.)

- [ ] **Step 3: Write the failing test** — `apps/api/test/post-metrics.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { addBags, emptyBag, isMetricPlatform, platformBag, postMetricsBags, totalReach } from '../src/lib/postMetrics.js';

describe('platformBag', () => {
  it('reads Facebook and Instagram metrics and sums engagement', () => {
    const fb = platformBag('facebook', { reach: 120, likes: 10, comments: 2, shares: 1, fetched_at: '2026-09-24T00:00:00.000Z' });
    assert.equal(fb.reach, 120);
    assert.equal(fb.engagement, 13);
    const ig = platformBag('instagram', { reach: 80, likes: 5, comments: 1, saved: 4, video_views: 30, plays: 12 });
    assert.deepEqual([ig.engagement, ig.videoViews, ig.plays], [10, 30, 12]);
  });

  it('counts Google Business Profile views as reach', () => {
    const gmb = platformBag('gmb', { views: 40, clicks: 3, direction_requests: 1 });
    assert.deepEqual([gmb.reach, gmb.views, gmb.clicks, gmb.engagement], [40, 40, 3, 0]);
  });

  it('treats missing, negative and non-numeric values as zero', () => {
    assert.deepEqual(platformBag('facebook', { reach: '120', likes: -4, comments: Number.NaN }), emptyBag());
    assert.deepEqual(platformBag('facebook', null), emptyBag());
    assert.deepEqual(platformBag('facebook', [1, 2]), emptyBag());
  });
});

describe('postMetricsBags and totalReach', () => {
  const metrics = {
    facebook: { reach: 120, likes: 10, comments: 2, shares: 1 },
    instagram: { reach: 80, likes: 5, comments: 1, saved: 4 },
    gmb: { views: 40, clicks: 3 },
    twitter: { impressions: 999 },
  };

  it('totals Facebook, Instagram and Google and ignores other keys', () => {
    const { byPlatform, total } = postMetricsBags(metrics);
    assert.deepEqual(Object.keys(byPlatform), ['facebook', 'instagram', 'gmb']);
    assert.equal(total.reach, 240);
    assert.equal(total.engagement, 23);
    assert.equal(totalReach(metrics), 240);
  });

  it('keeps one platform when filtered', () => {
    const { byPlatform, total } = postMetricsBags(metrics, 'instagram');
    assert.deepEqual(Object.keys(byPlatform), ['instagram']);
    assert.equal(total.reach, 80);
  });

  it('handles posts without metrics', () => {
    assert.equal(totalReach(null), 0);
    assert.deepEqual(postMetricsBags(undefined).byPlatform, {});
  });

  it('adds bags field by field and knows the metric platforms', () => {
    const a = { ...emptyBag(), reach: 1, likes: 2 };
    assert.deepEqual(addBags(a, a), { ...emptyBag(), reach: 2, likes: 4 });
    assert.equal(isMetricPlatform('gmb'), true);
    assert.equal(isMetricPlatform('twitter'), false);
  });
});

describe('Stage D schema', () => {
  it('maps the new models to their Firestore collections', () => {
    assert.equal(prisma.event.collectionName, 'events');
    assert.equal(prisma.followerSnapshot.collectionName, 'follower_snapshots');
  });

  it('stores review ratings, the classification flag, events and snapshots', async () => {
    const message = await prisma.inboxMessage.create({
      data: {
        dealer_id: 'd-schema', platform: 'gmb', message_type: 'review', platform_message_id: `r-${randomUUID()}`,
        customer_name: 'Asha', message_text: 'Great', received_at: new Date(), rating: 5, needs_classification: true,
      },
    });
    assert.equal(message.rating, 5);
    assert.equal(message.needs_classification, true);
    const event = await prisma.event.create({ data: { dealer_id: 'd-schema', user_id: 'u1', action: 'report.downloaded', meta: { source: 'test' } } });
    assert.deepEqual(event.meta, { source: 'test' });
    const snapshot = await prisma.followerSnapshot.create({
      data: { id: 'd-schema_facebook_2026-09-24', dealer_id: 'd-schema', platform: 'facebook', followers: 1200, captured_on: '2026-09-24' },
    });
    assert.equal(snapshot.id, 'd-schema_facebook_2026-09-24');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/post-metrics.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/postMetrics.js'`).

- [ ] **Step 5: Implement** — `apps/api/src/lib/postMetrics.ts`:

```ts
// Post.metrics holds one object per platform, written by the metrics sync (lib/metricsSync.ts):
// { facebook: { reach, likes, comments, shares }, instagram: { reach, likes, comments, saved }, gmb: { views, clicks } }.
// These helpers turn it into comparable numbers. Nothing is invented: a missing value is 0.

export const METRIC_FIELDS = [
  'reach', 'impressions', 'likes', 'comments', 'shares', 'saved',
  'videoViews', 'plays', 'clicks', 'views', 'engagedUsers', 'engagement',
] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];
export type MetricsBag = Record<MetricField, number>;

export const METRIC_PLATFORMS = ['facebook', 'instagram', 'gmb'] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];

export function isMetricPlatform(value: unknown): value is MetricPlatform {
  return typeof value === 'string' && (METRIC_PLATFORMS as readonly string[]).includes(value);
}

export function emptyBag(): MetricsBag {
  return Object.fromEntries(METRIC_FIELDS.map((field) => [field, 0])) as MetricsBag;
}

export function addBags(a: MetricsBag, b: MetricsBag): MetricsBag {
  const out = emptyBag();
  for (const field of METRIC_FIELDS) out[field] = a[field] + b[field];
  return out;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

type StoredField = Exclude<MetricField, 'engagement'>;

// Stored names (snake_case from the fetchers; camelCase accepted too) for each bag field.
const STORED_NAMES: Record<StoredField, string[]> = {
  reach: ['reach'],
  impressions: ['impressions'],
  likes: ['likes'],
  comments: ['comments'],
  shares: ['shares'],
  saved: ['saved'],
  videoViews: ['video_views', 'videoViews'],
  plays: ['plays'],
  clicks: ['clicks'],
  views: ['views'],
  engagedUsers: ['engaged_users', 'engagedUsers'],
};

/** One platform's stored metrics as a bag. Google Business Profile reports views, which count as reach. */
export function platformBag(platform: string, raw: unknown): MetricsBag {
  const bag = emptyBag();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bag;
  const stored = raw as Record<string, unknown>;
  for (const [field, names] of Object.entries(STORED_NAMES) as Array<[StoredField, string[]]>) {
    bag[field] = Math.max(0, ...names.map((name) => count(stored[name])));
  }
  if (platform === 'gmb' && bag.reach === 0) bag.reach = bag.views;
  bag.engagement = bag.likes + bag.comments + bag.shares + bag.saved;
  return bag;
}

export interface PostBags {
  byPlatform: Partial<Record<MetricPlatform, MetricsBag>>;
  total: MetricsBag;
}

/** Per-platform bags for one post plus their total. With `only`, just that platform. */
export function postMetricsBags(metrics: unknown, only?: MetricPlatform): PostBags {
  const byPlatform: Partial<Record<MetricPlatform, MetricsBag>> = {};
  let total = emptyBag();
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return { byPlatform, total };
  const stored = metrics as Record<string, unknown>;
  for (const platform of METRIC_PLATFORMS) {
    if (only && platform !== only) continue;
    if (stored[platform] === undefined) continue;
    const bag = platformBag(platform, stored[platform]);
    byPlatform[platform] = bag;
    total = addBags(total, bag);
  }
  return { byPlatform, total };
}

/** Reach across Facebook, Instagram and Google Business Profile (views). */
export function totalReach(metrics: unknown): number {
  return postMetricsBags(metrics).total.reach;
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/post-metrics.test.ts && npx tsc --noEmit`
Expected: PASS (9 tests); `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/db/prisma.ts apps/api/src/lib/postMetrics.ts apps/api/test/post-metrics.test.ts
git commit -m "feat(api): review ratings, usage events, follower snapshots and a shared post metrics helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Inbox routes — permissions, pending count, richer messages and reply suggestions

**Files:**
- Create: `apps/api/src/lib/platformMock.ts`, `apps/api/src/lib/geminiJson.ts`, `apps/api/src/lib/inboxView.ts`, `apps/api/src/lib/inboxReplies.ts`
- Modify: `apps/api/src/routes/inbox.ts`, `apps/api/src/services/emailMock.ts`
- Test: `apps/api/test/inbox-routes.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `InboxMessage.rating`.
  - Existing:
    - `requirePermissionHook`, `can`, `PERMISSIONS` (`lib/permissions.ts`);
    - `resolveAccessToken`, `isSuccessfulResult` (`lib/publishDirect.ts`);
    - `getGeminiApiKey` (`lib/aiKeys.ts`), `resolveAiModels` (`lib/aiModels.ts`), `generateContentUrl`, `googleAiHeaders` (`lib/googleAi.ts`);
    - `generateInboxReply` and `isGroqAvailable` (`services/groq.ts`); `generateInboxReply`, `generateTestimonialCaption` and `type DealerContext` (`services/openai.ts`);
    - `replyToGmbReview` (`services/gmb.ts`).
- Produces:
  - `lib/platformMock.ts`: `isMockId(value: unknown): boolean`, `isMockConnection(conn: { access_token: string; platform_account_id: string }): boolean`
  - `lib/geminiJson.ts`: `parseJsonText(text: string): unknown`, `geminiJson(prompt: string, options?: { timeoutMs?: number }): Promise<{ value: unknown } | null>` (null = no key; throws when every model failed)
  - `lib/inboxView.ts`:
    - `truncateText(text: string, max: number): string`
    - `firstCreativeUrl(value: unknown): string | undefined`
    - `type PostContextSource`, `mapMessage(m: InboxMessage, post?: PostContextSource | null)`, `type InboxMessageView = ReturnType<typeof mapMessage>`
    - `mapMessages(dealerId: string, messages: InboxMessage[]): Promise<InboxMessageView[]>`
  - `lib/inboxReplies.ts`:
    - `type ReplyTone = 'positive' | 'recovery' | 'neutral'`, `toneFor(sentiment): ReplyTone`
    - `inboxReplyType(value: string): 'comment' | 'dm' | 'review'`
    - `dealerReplyContext(dealer): DealerContext`
    - `interface SuggestRepliesInput`, `parseReplies(value: unknown): string[]`, `suggestReplies(input): Promise<string[] | null>`
    - `parseTestimonial(value: unknown): { caption: string; hashtags: string[] } | null`, `draftTestimonial(input): Promise<{ caption: string; hashtags: string[] } | null>`
  - HTTP (all under `/v1/inbox`, session + inbox plan):
    - `GET /pending-count` → `{ pending: number }` (`view_inbox`).
    - List, get, `PATCH`, reply and mock-seed items gain `rating?`, `postContext?` (≤ 80 chars), `postThumbnail?`, `postExternalUrl?` and `replies: Array<{ id, text, createdAt, isDealerOwn: true }>`.
    - `POST /:id/suggest-reply { tone? }` → `{ suggestedReply: string; suggestions: string[] }` (1–3 options); 503 `AI_NOT_CONFIGURED`; 502 `AI_FAILED`.
    - `PATCH /:id`: `isRead` must be a boolean; `tag` must be `lead|complaint|general|spam` or null and needs `reply_inbox`.
    - `POST /:id/generate-post-draft` → `{ post }`: a draft with `created_by`; 503 / 502 as above.

- [ ] **Step 1: Write the failing test** — `apps/api/test/inbox-routes.test.ts`:

```ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { parseJsonText } from '../src/lib/geminiJson.js';
import { parseReplies, parseTestimonial, toneFor } from '../src/lib/inboxReplies.js';
import { truncateText } from '../src/lib/inboxView.js';
import { resolvePermissions, type JwtUser, type Permission } from '../src/lib/permissions.js';

const TEST_KEY = 'test-key-not-real-0000';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

async function newDealer(plan = 'growth'): Promise<string> {
  const dealer = await prisma.dealer.create({ data: { name: 'Inbox Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan } });
  return dealer.id;
}

function headers(dealerId: string, role: 'admin' | 'user' = 'admin', overrides: Partial<Record<Permission, boolean>> = {}) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function newMessage(dealerId: string, data: Record<string, unknown> = {}) {
  return prisma.inboxMessage.create({
    data: {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `m-${randomUUID()}`,
      customer_name: 'Ravi Kumar', message_text: 'What is the on-road price?', received_at: new Date(), ...data,
    },
  });
}

const geminiAnswer = (text: string) => ({ data: { candidates: [{ content: { parts: [{ text }] } }] } });

type Item = {
  id: string; rating?: number; tag?: string; isRead: boolean; repliedAt?: string;
  postContext?: string; postThumbnail?: string; postExternalUrl?: string;
  replies: Array<{ id: string; text: string; isDealerOwn: boolean }>;
};
const errorCode = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;

describe('helpers', () => {
  it('parse model answers and shorten text', () => {
    assert.deepEqual(parseJsonText('```json\n{"replies":["a"]}\n```'), { replies: ['a'] });
    assert.deepEqual(parseReplies({ replies: [' One ', '', 2, 'Two', 'Three', 'Four'] }), ['One', 'Two', 'Three']);
    assert.deepEqual(parseReplies(['x']), ['x']);
    assert.deepEqual(parseReplies('nope'), []);
    assert.deepEqual(parseTestimonial({ caption: ' Thanks! ', hashtags: ['#A', 'B', 3] }), { caption: 'Thanks!', hashtags: ['#A', '#B'] });
    assert.equal(parseTestimonial({ hashtags: [] }), null);
    assert.equal(toneFor('negative'), 'recovery');
    assert.equal(toneFor(null), 'neutral');
    assert.equal(truncateText('  a  b  ', 10), 'a b');
    assert.equal(truncateText('abcdefghij', 5), 'abcd…');
  });
});

describe('GET /v1/inbox', () => {
  it("lists the dealership's messages with rating, post context and the dealer reply", async () => {
    const dealerId = await newDealer();
    const other = await newDealer();
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'Diwali offer', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        caption_text: 'Diwali offer on the new Creta: free insurance for every buyer this week only. Visit us today for a test drive!',
        thumbnail_url: 'https://cdn.test/creta.jpg',
        publish_results: { facebook: { post_id: '123_456', url: 'https://facebook.com/123/posts/456', published_at: '2026-09-20T10:00:00.000Z' } },
      },
    });
    const mine = await newMessage(dealerId, { post_id: post.id, rating: 4, reply_text: 'Thanks Ravi!', replied_at: new Date() });
    await newMessage(other);

    const res = await fastify.inject({ method: 'GET', url: '/v1/inbox?pageSize=50', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const { items } = res.json() as { items: Item[] };
    assert.deepEqual(items.map((i) => i.id), [mine.id]);
    const item = items[0]!;
    assert.equal(item.rating, 4);
    assert.ok(item.postContext!.startsWith('Diwali offer on the new Creta'));
    assert.ok(item.postContext!.length <= 80 && item.postContext!.endsWith('…'));
    assert.equal(item.postThumbnail, 'https://cdn.test/creta.jpg');
    assert.equal(item.postExternalUrl, 'https://facebook.com/123/posts/456');
    assert.deepEqual(item.replies.map((r) => [r.id, r.text, r.isDealerOwn]), [[`${mine.id}-reply`, 'Thanks Ravi!', true]]);
  });

  it('never links to a mock publish and falls back to the first creative', async () => {
    const dealerId = await newDealer();
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'Weekend sale', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        creative_urls: { facebook: 'https://cdn.test/fb.jpg' },
        publish_results: { facebook: { post_id: 'mock_fb_post_1', url: 'https://www.facebook.com/mock_fb_page_id/posts/mock_fb_post_1' } },
      },
    });
    await newMessage(dealerId, { post_id: post.id });

    const { items } = (await fastify.inject({ method: 'GET', url: '/v1/inbox', headers: headers(dealerId) })).json() as { items: Item[] };

    assert.equal(items[0]!.postContext, 'Weekend sale');
    assert.equal(items[0]!.postThumbnail, 'https://cdn.test/fb.jpg');
    assert.equal(items[0]!.postExternalUrl, undefined);
    assert.deepEqual(items[0]!.replies, []);
  });

  it('needs view_inbox', async () => {
    const dealerId = await newDealer();
    const denied = headers(dealerId, 'user', { view_inbox: false });
    for (const url of ['/v1/inbox', '/v1/inbox/pending-count']) {
      const res = await fastify.inject({ method: 'GET', url, headers: denied });
      assert.equal(res.statusCode, 403, url);
      assert.equal(errorCode(res), 'FORBIDDEN');
    }
  });
});

describe('GET /v1/inbox/pending-count', () => {
  it('counts unread messages of the dealership only', async () => {
    const dealerId = await newDealer();
    const other = await newDealer();
    await newMessage(dealerId);
    await newMessage(dealerId);
    await newMessage(dealerId, { is_read: true });
    await newMessage(other);

    const res = await fastify.inject({ method: 'GET', url: '/v1/inbox/pending-count', headers: headers(dealerId, 'user') });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { pending: 2 });
  });

  it('is plan-gated like the rest of the inbox', async () => {
    const starter = await newDealer('starter');
    const res = await fastify.inject({ method: 'GET', url: '/v1/inbox/pending-count', headers: headers(starter) });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res), 'PLAN_GATED');
  });
});

describe('PATCH /v1/inbox/:id', () => {
  it('lets a viewer mark read but only a replier change the tag', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const viewer = headers(dealerId, 'user', { reply_inbox: false });

    const read = await fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: viewer, payload: { isRead: true } });
    assert.equal(read.statusCode, 200);
    assert.equal((read.json() as { item: Item }).item.isRead, true);

    const tag = await fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: viewer, payload: { tag: 'lead' } });
    assert.equal(tag.statusCode, 403);

    const ok = await fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: headers(dealerId, 'user'), payload: { tag: 'lead' } });
    assert.equal((ok.json() as { item: Item }).item.tag, 'lead');
  });

  it("rejects bad values and other dealerships' messages", async () => {
    const dealerId = await newDealer();
    const m = await newMessage(await newDealer());
    const h = headers(dealerId);
    const patch = (payload: object) => fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: h, payload });

    assert.equal((await patch({ tag: 'vip' })).statusCode, 400);
    assert.equal((await patch({ isRead: 'yes' })).statusCode, 400);
    assert.equal((await patch({})).statusCode, 400);
    assert.equal((await patch({ isRead: true })).statusCode, 404);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.is_read, false);
  });
});

describe('POST /v1/inbox/:id/reply', () => {
  it('saves the reply without calling a platform for a mock connection', async (t) => {
    const dealerId = await newDealer();
    await prisma.platformConnection.create({
      data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: 'mock_fb_page_id', access_token: 'mock_fb_page_token', is_connected: true },
    });
    const m = await newMessage(dealerId);
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: headers(dealerId), payload: { replyText: '  Thanks Ravi!  ' } });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { item: Item; delivered: boolean };
    assert.equal(body.delivered, false);
    assert.equal(post.mock.callCount(), 0);
    assert.equal(body.item.replies[0]!.text, 'Thanks Ravi!');
    assert.ok(body.item.repliedAt);
  });

  it('replies to Instagram comments through /replies', async (t) => {
    const dealerId = await newDealer();
    await prisma.platformConnection.create({ data: { dealer_id: dealerId, platform: 'instagram', platform_account_id: 'ig-1', access_token: 'ig-token', is_connected: true } });
    const m = await newMessage(dealerId, { platform: 'instagram', platform_message_id: `ig-comment-${randomUUID()}` });
    const urls: string[] = [];
    t.mock.method(axios, 'post', async (url: string) => { urls.push(url); return { data: { id: 'r1' } }; });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: headers(dealerId), payload: { replyText: 'Thanks!' } });

    assert.equal((res.json() as { delivered: boolean }).delivered, true);
    assert.match(urls[0]!, /\/ig-comment-[^/]+\/replies$/);
  });

  it('needs reply_inbox and some text', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const send = (h: Record<string, string>, replyText: string) =>
      fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: h, payload: { replyText } });
    assert.equal((await send(headers(dealerId, 'user', { reply_inbox: false }), 'Hi')).statusCode, 403);
    assert.equal((await send(headers(dealerId), '   ')).statusCode, 400);
  });
});

describe('POST /v1/inbox/:id/suggest-reply', () => {
  it('asks Gemini for three options with header auth and stores the first', async (t) => {
    process.env['GEMINI_API_KEY'] = TEST_KEY;
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, { sentiment: 'negative', message_text: 'Worst service ever' });
    const calls: Array<{ url: string; key: string | undefined; prompt: string }> = [];
    t.mock.method(axios, 'post', async (url: string, body: { contents: Array<{ parts: Array<{ text: string }> }> }, config: { headers: Record<string, string> }) => {
      calls.push({ url, key: config.headers['x-goog-api-key'], prompt: body.contents[0]!.parts[0]!.text });
      return geminiAnswer('```json\n{"replies":["Sorry Ravi, our manager will call you.","We apologise.","Please call us."]}\n```');
    });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId), payload: {} });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      suggestedReply: 'Sorry Ravi, our manager will call you.',
      suggestions: ['Sorry Ravi, our manager will call you.', 'We apologise.', 'Please call us.'],
    });
    assert.match(calls[0]!.url, /generativelanguage\.googleapis\.com\/.+:generateContent$/);
    assert.doesNotMatch(calls[0]!.url, /key=/);
    assert.equal(calls[0]!.key, TEST_KEY);
    assert.match(calls[0]!.prompt, /call-back from the manager/);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.ai_suggested_reply, 'Sorry Ravi, our manager will call you.');
  });

  it('answers 503 when no AI provider is configured', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId), payload: {} });
    assert.equal(res.statusCode, 503);
    assert.equal(errorCode(res), 'AI_NOT_CONFIGURED');
  });

  it('answers 502 when the configured provider fails', async (t) => {
    process.env['GEMINI_API_KEY'] = TEST_KEY;
    t.mock.method(axios, 'post', async () => { throw new Error('quota'); });
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId), payload: {} });
    assert.equal(res.statusCode, 502);
    assert.equal(errorCode(res), 'AI_FAILED');
  });

  it('needs reply_inbox', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId, 'user', { reply_inbox: false }), payload: {} });
    assert.equal(res.statusCode, 403);
  });
});

describe('POST /v1/inbox/:id/generate-post-draft', () => {
  it('drafts a thank-you post from a review with Gemini', async (t) => {
    process.env['GEMINI_API_KEY'] = TEST_KEY;
    t.mock.method(axios, 'post', async () => geminiAnswer('{"caption":"Thank you Asha for the 5★ review!","hashtags":["#HappyCustomer","Creta"]}'));
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, { platform: 'gmb', message_type: 'review', rating: 5, customer_name: 'Asha', message_text: 'Smooth delivery' });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/generate-post-draft`, headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const { post } = res.json() as { post: { id: string; dealer_id: string; status: string; caption_text: string; caption_hashtags: string[]; created_by: string | null } };
    assert.deepEqual([post.dealer_id, post.status, post.caption_text], [dealerId, 'draft', 'Thank you Asha for the 5★ review!']);
    assert.deepEqual(post.caption_hashtags, ['#HappyCustomer', '#Creta']);
    assert.equal(typeof post.created_by, 'string');
  });

  it('answers 503 without an AI provider', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, { message_type: 'review', rating: 5 });
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/generate-post-draft`, headers: headers(dealerId) });
    assert.equal(res.statusCode, 503);
  });
});

describe('POST /v1/inbox/mock/seed', () => {
  it('seeds five sample emails even without an AI provider', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const dealerId = await newDealer();
    const res = await fastify.inject({ method: 'POST', url: '/v1/inbox/mock/seed', headers: headers(dealerId) });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { items: unknown[] }).items.length, 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/inbox-routes.test.ts`
Expected: FAIL (missing modules `geminiJson.js`, `inboxReplies.js`, `inboxView.js`).

- [ ] **Step 3: `apps/api/src/lib/platformMock.ts`**

```ts
// Local and demo connections carry ids and tokens that start with "mock_" (see routes/platform.ts),
// and so do their "published" post ids. Nothing may call a real platform API with them.
export function isMockId(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('mock_');
}

export function isMockConnection(conn: { access_token: string; platform_account_id: string }): boolean {
  return isMockId(conn.access_token) || isMockId(conn.platform_account_id);
}
```

- [ ] **Step 4: `apps/api/src/lib/geminiJson.ts`**

```ts
import axios from 'axios';
import { getGeminiApiKey } from './aiKeys.js';
import { resolveAiModels } from './aiModels.js';
import { generateContentUrl, googleAiHeaders } from './googleAi.js';

/** Parses a model's JSON answer, tolerating ```json fences around it. Throws on invalid JSON. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

/**
 * One JSON-mode call to the chosen Gemini text model, then its fallbacks (resolveAiModels).
 * The key travels in the x-goog-api-key header only.
 * Returns null when no Gemini key is configured; throws (with a message, no key) when every model failed.
 */
export async function geminiJson(prompt: string, options: { timeoutMs?: number } = {}): Promise<{ value: unknown } | null> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return null;
  const models = await resolveAiModels();
  let lastError = 'no model answered';
  for (const model of [models.text, ...models.textFallbacks]) {
    try {
      const res = await axios.post(
        generateContentUrl(model),
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
        { headers: googleAiHeaders(apiKey), timeout: options.timeoutMs ?? 20_000 },
      );
      const text: unknown = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) {
        lastError = `${model} returned no text`;
        continue;
      }
      return { value: parseJsonText(text) };
    } catch (err) {
      lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(`Gemini JSON request failed (${lastError})`);
}
```

- [ ] **Step 5: `apps/api/src/lib/inboxView.ts`**

```ts
import type { InboxMessage, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { isMockId } from './platformMock.js';
import { isSuccessfulResult } from './publishDirect.js';

const POST_CONTEXT_MAX = 80;

/** Collapses whitespace and cuts to `max` characters, ending with "…" when cut. */
export function truncateText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function firstCreativeUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.values(value as Record<string, unknown>).find((v): v is string => typeof v === 'string' && v.length > 0);
}

export type PostContextSource = Pick<Post, 'caption_text' | 'prompt_text' | 'thumbnail_url' | 'creative_urls' | 'publish_results' | 'platforms'>;

/** The live link on the message's platform, else the post's first live link. Mock publishes have none. */
function externalUrl(post: PostContextSource, platform: string): string | undefined {
  const results = (post.publish_results ?? {}) as Record<string, unknown>;
  for (const p of [platform, ...(post.platforms ?? []).filter((name) => name !== platform)]) {
    const entry = results[p];
    if (!isSuccessfulResult(entry)) continue;
    const { post_id, url } = entry as { post_id: string; url?: unknown };
    if (!isMockId(post_id) && typeof url === 'string' && url) return url;
  }
  return undefined;
}

// The API shape of a message. The dealer's single stored reply is returned as a one-item thread.
export function mapMessage(m: InboxMessage, post?: PostContextSource | null) {
  const postContext = post ? truncateText(post.caption_text || post.prompt_text || '', POST_CONTEXT_MAX) : '';
  const postThumbnail = post ? post.thumbnail_url || firstCreativeUrl(post.creative_urls) : undefined;
  const postExternalUrl = post ? externalUrl(post, m.platform) : undefined;
  return {
    id: m.id,
    dealerId: m.dealer_id,
    platform: m.platform,
    messageType: m.message_type,
    platformMessageId: m.platform_message_id,
    postId: m.post_id ?? undefined,
    customerName: m.customer_name,
    customerAvatarUrl: m.customer_avatar_url ?? undefined,
    customerPlatformId: m.customer_platform_id ?? undefined,
    emailSubject: m.email_subject ?? undefined,
    messageText: m.message_text,
    sentiment: m.sentiment ?? undefined,
    tag: m.tag ?? undefined,
    rating: m.rating ?? undefined,
    aiSuggestedReply: m.ai_suggested_reply ?? undefined,
    replyText: m.reply_text ?? undefined,
    repliedAt: m.replied_at?.toISOString() ?? undefined,
    isRead: m.is_read,
    requiresApproval: m.requires_approval,
    receivedAt: m.received_at.toISOString(),
    postContext: postContext || undefined,
    postThumbnail: postThumbnail || undefined,
    postExternalUrl,
    replies: m.reply_text
      ? [{ id: `${m.id}-reply`, text: m.reply_text, createdAt: (m.replied_at ?? m.updated_at).toISOString(), isDealerOwn: true as const }]
      : [],
  };
}

export type InboxMessageView = ReturnType<typeof mapMessage>;

/** Maps a page of messages, loading their linked posts in one query (no lookup per message). */
export async function mapMessages(dealerId: string, messages: InboxMessage[]): Promise<InboxMessageView[]> {
  const ids = [...new Set(messages.map((m) => m.post_id).filter((id): id is string => !!id))];
  const posts = ids.length ? await prisma.post.findMany({ where: { id: { in: ids }, dealer_id: dealerId } }) : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  return messages.map((m) => mapMessage(m, m.post_id ? byId.get(m.post_id) ?? null : null));
}
```

- [ ] **Step 6: `apps/api/src/lib/inboxReplies.ts`**

```ts
import type { Dealer, InboxMessage } from '../generated/client/index.js';
import { generateInboxReply as groqInboxReply, isGroqAvailable } from '../services/groq.js';
import { generateInboxReply as openaiInboxReply, generateTestimonialCaption, type DealerContext } from '../services/openai.js';
import { geminiJson } from './geminiJson.js';

export type ReplyTone = 'positive' | 'recovery' | 'neutral';

export function toneFor(sentiment: string | null | undefined): ReplyTone {
  if (sentiment === 'positive') return 'positive';
  if (sentiment === 'negative') return 'recovery';
  return 'neutral';
}

const TONE_GUIDE: Record<ReplyTone, string> = {
  positive: 'Warm and grateful: thank them by first name and invite them back.',
  recovery: 'Apologetic and calm: acknowledge the problem, never argue, and offer a call-back from the manager.',
  neutral: 'Helpful and friendly: answer what they asked and invite them to visit or call.',
};

/** Comments are public and short; DMs and emails are private messages. */
export function inboxReplyType(value: string): 'comment' | 'dm' | 'review' {
  const lower = value.toLowerCase();
  if (lower === 'review' || lower === 'reviews') return 'review';
  if (lower === 'dm' || lower === 'message' || lower === 'messaging' || lower === 'email') return 'dm';
  return 'comment';
}

type DealerFields = Pick<Dealer, 'name' | 'city' | 'brands' | 'phone' | 'contact_phone' | 'whatsapp_number' | 'language_preferences'>;

export function dealerReplyContext(dealer: DealerFields): DealerContext {
  return {
    name: dealer.name,
    city: dealer.city,
    brands: Array.isArray(dealer.brands) ? (dealer.brands as unknown[]).filter((b): b is string => typeof b === 'string') : [],
    phone: dealer.contact_phone ?? dealer.phone,
    whatsapp: dealer.whatsapp_number ?? dealer.phone,
    language_preferences: dealer.language_preferences ?? [],
  };
}

export interface SuggestRepliesInput {
  message: Pick<InboxMessage, 'message_text' | 'message_type' | 'customer_name' | 'sentiment' | 'rating'>;
  dealer: DealerContext;
  /** A tone the user asked for; otherwise it follows the message's sentiment. */
  tone?: string | undefined;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const openAiConfigured = () => !!process.env['OPENAI_API_KEY']?.trim();

function repliesPrompt({ message, dealer, tone }: SuggestRepliesInput): string {
  const type = inboxReplyType(message.message_type);
  const rating = message.rating ? ` (${message.rating}★ review)` : '';
  return [
    `You write replies for ${dealer.name}, a car dealership in ${dealer.city}, India.`,
    `Customer ${type} from ${message.customer_name}${rating}:`,
    `"""${message.message_text}"""`,
    'Write 3 different reply options.',
    `- ${tone ? `Use a ${tone} tone.` : TONE_GUIDE[toneFor(message.sentiment)]}`,
    "- Reply in the customer's language and script (English, Hindi or Hinglish).",
    `- At most ${type === 'comment' ? 60 : 120} words each.${type === 'comment' ? ' It is a public comment, so keep it short.' : ''}`,
    `- When useful, invite them to call ${dealer.phone} or WhatsApp ${dealer.whatsapp}.`,
    '- Never promise prices, discounts or delivery dates.',
    'Return JSON only: {"replies": ["…", "…", "…"]}',
  ].join('\n');
}

/** Reply options from a model answer: a { replies: [] } object or a bare array. At most three, trimmed. */
export function parseReplies(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { replies?: unknown }).replies : null;
  if (!Array.isArray(list)) return [];
  return list.filter((r): r is string => typeof r === 'string').map((r) => r.trim()).filter(Boolean).slice(0, 3);
}

/**
 * Up to three reply options: Gemini first (one JSON call), then Groq or OpenAI (one option).
 * Returns null when no AI provider is configured; throws when every configured provider failed.
 */
export async function suggestReplies(input: SuggestRepliesInput): Promise<string[] | null> {
  const failures: string[] = [];
  try {
    const answer = await geminiJson(repliesPrompt(input));
    if (answer) {
      const replies = parseReplies(answer.value);
      if (replies.length > 0) return replies;
      failures.push('Gemini returned no replies');
    }
  } catch (err) {
    failures.push(errorText(err));
  }

  const type = inboxReplyType(input.message.message_type);
  const sentiment = input.message.sentiment ?? 'neutral';
  const tone = input.tone ?? toneFor(input.message.sentiment);
  if (isGroqAvailable()) {
    try {
      const reply = (await groqInboxReply(input.message.message_text, sentiment, input.dealer, type, tone)).trim();
      if (reply) return [reply];
      failures.push('Groq returned no reply');
    } catch (err) {
      failures.push(`Groq: ${errorText(err)}`);
    }
  }
  if (openAiConfigured()) {
    try {
      const reply = (await openaiInboxReply(input.message.message_text, sentiment, input.dealer, type, undefined, tone)).trim();
      if (reply) return [reply];
      failures.push('OpenAI returned no reply');
    } catch (err) {
      failures.push(`OpenAI: ${errorText(err)}`);
    }
  }
  if (failures.length === 0) return null;
  throw new Error(`No reply suggestions: ${failures.join('; ')}`);
}

/** A caption and #-prefixed hashtags (at most 10) from a model answer, or null. */
export function parseTestimonial(value: unknown): { caption: string; hashtags: string[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { caption, hashtags } = value as { caption?: unknown; hashtags?: unknown };
  if (typeof caption !== 'string' || !caption.trim()) return null;
  const tags = Array.isArray(hashtags) ? hashtags.filter((h): h is string => typeof h === 'string') : [];
  return {
    caption: caption.trim(),
    hashtags: tags.map((t) => t.trim().replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`).slice(0, 10),
  };
}

/**
 * A thank-you post caption from a customer review ("Turn into post"): Gemini first, then OpenAI.
 * Returns null when no AI provider is configured; throws when every configured provider failed.
 */
export async function draftTestimonial(input: {
  reviewText: string;
  customerName: string;
  rating: number | null;
  dealer: { name: string; city: string };
}): Promise<{ caption: string; hashtags: string[] } | null> {
  const failures: string[] = [];
  try {
    const answer = await geminiJson([
      `Write a social media post for ${input.dealer.name}, a car dealership in ${input.dealer.city}, India, thanking a customer for their review.`,
      `Review by ${input.customerName}${input.rating ? ` (${input.rating}★)` : ''}:`,
      `"""${input.reviewText}"""`,
      'Keep it under 100 words, warm and specific to what they said. Use their first name only.',
      'Return JSON only: {"caption": "…", "hashtags": ["#HappyCustomer", "…"]} with 3 to 6 hashtags.',
    ].join('\n'));
    if (answer) {
      const draft = parseTestimonial(answer.value);
      if (draft) return draft;
      failures.push('Gemini returned no caption');
    }
  } catch (err) {
    failures.push(errorText(err));
  }
  if (openAiConfigured()) {
    try {
      const draft = parseTestimonial(await generateTestimonialCaption(input.reviewText, input.customerName, input.dealer));
      if (draft) return draft;
      failures.push('OpenAI returned no caption');
    } catch (err) {
      failures.push(`OpenAI: ${errorText(err)}`);
    }
  }
  if (failures.length === 0) return null;
  throw new Error(`No testimonial draft: ${failures.join('; ')}`);
}
```

- [ ] **Step 7: `apps/api/src/routes/inbox.ts`.** Make these edits, in order.

(a) Replace everything from line 1 down to and including `const META_GRAPH_BASE = "https://graph.facebook.com/v19.0"` (the imports, `generateReplyAI`, and the stray `replyToGmbReview` import) with:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify"
import axios from "axios"
import { prisma } from "../db/prisma.js"
import type { InboxMessage, PlatformConnection } from "../generated/client/index.js"
import { generateMockEmails } from "../services/emailMock.js"
import { replyToGmbReview } from "../services/gmb.js"
import { dealerReplyContext, draftTestimonial, suggestReplies } from "../lib/inboxReplies.js"
import { mapMessages, truncateText } from "../lib/inboxView.js"
import { can, PERMISSIONS, requirePermissionHook } from "../lib/permissions.js"
import { isMockConnection, isMockId } from "../lib/platformMock.js"
import { resolveAccessToken } from "../lib/publishDirect.js"

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0"
const INBOX_TAGS = new Set(["lead", "complaint", "general", "spam"])
const AI_NOT_CONFIGURED = { error: { code: "AI_NOT_CONFIGURED", message: "AI replies are not set up yet." } }
const AI_FAILED = { error: { code: "AI_FAILED", message: "The AI request failed. Please try again." } }
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
```

(b) Delete `function mapMessage(…) { … }` (now `lib/inboxView.ts`) and `function normalizeInboxType(…) { … }` (now `inboxReplyType` in `lib/inboxReplies.ts`). Keep `upsertInboxMessage`, `extractTextFromMetaMessage` and `extractTextFromMetaChange` unchanged; Task 3 replaces `upsertInboxMessage`.

(c) Replace the whole `async function sendReplyToPlatform(…) { … }` with:

```ts
// Sends a reply on the platform. False (the reply is still saved) when it cannot be delivered.
async function sendReplyToPlatform(message: InboxMessage, replyText: string, connection: PlatformConnection): Promise<boolean> {
  // Local and demo connections carry mock_ ids; nothing may reach a real platform with them.
  if (isMockConnection(connection) || isMockId(message.platform_message_id)) return false
  try {
    const accessToken = await resolveAccessToken(connection)
    if (connection.platform === "gmb") {
      await replyToGmbReview(message.platform_message_id, accessToken, replyText)
      return true
    }
    if (connection.platform === "facebook" || connection.platform === "instagram") {
      if (message.message_type === "comment") {
        // Instagram answers a comment through /replies, Facebook through /comments.
        const edge = connection.platform === "instagram" ? "replies" : "comments"
        await axios.post(`${META_GRAPH_BASE}/${message.platform_message_id}/${edge}`, { message: replyText, access_token: accessToken })
        return true
      }
      if (message.customer_platform_id) {
        await axios.post(`${META_GRAPH_BASE}/me/messages`, {
          recipient: { id: message.customer_platform_id },
          message: { text: replyText },
          access_token: accessToken,
        })
        return true
      }
    }
  } catch (err) {
    console.error("[inbox] Could not deliver a reply to the platform:", errorText(err))
  }
  return false
}
```

(d) Replace everything from `export default async function inboxRoutes(fastify: FastifyInstance) {` down to (not including) the `// POST /v1/inbox/webhook/meta — receive Meta webhook events` comment with:

```ts
export default async function inboxRoutes(fastify: FastifyInstance) {
  // Meta calls the webhook routes directly; every other route needs a session and
  // a plan that includes the inbox. Matched on the route, not the raw URL, so a
  // query string or path segment containing "/webhook" cannot skip the checks.
  const webhookRoutes = new Set([`${fastify.prefix}/webhook/meta`])
  fastify.addHook('preHandler', async (request, reply) => {
    if (webhookRoutes.has(request.routeOptions.url ?? '')) return

    await fastify.authenticate(request, reply)
    if (reply.sent) return reply

    const planGateHook = fastify.checkPlanLimit('inbox')
    return planGateHook(request, reply)
  })

  // Reading the inbox needs view_inbox; answering, tagging and configuring it need reply_inbox.
  const canView = requirePermissionHook(PERMISSIONS.VIEW_INBOX)
  const canReply = requirePermissionHook(PERMISSIONS.REPLY_INBOX)
  const dealerOf = (request: FastifyRequest) => request.user.dealer_id as string

  // GET /v1/inbox — list messages, newest first
  fastify.get("/", { preHandler: [canView] }, async (request) => {
    const dealer_id = dealerOf(request)
    const { platform, tag, isRead, search, page = "1", pageSize = "30" } = request.query as Record<string, string>

    const where: Record<string, unknown> = { dealer_id }
    if (platform) where["platform"] = platform
    if (tag) where["tag"] = tag
    if (isRead !== undefined) where["is_read"] = isRead === "true"
    if (search) where["message_text"] = { contains: search, mode: "insensitive" }

    const size = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 30))
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * size
    const [messages, total, unreadCount] = await Promise.all([
      prisma.inboxMessage.findMany({ where, orderBy: { received_at: "desc" }, skip, take: size }),
      prisma.inboxMessage.count({ where }),
      prisma.inboxMessage.count({ where: { dealer_id, is_read: false } }),
    ])

    return { items: await mapMessages(dealer_id, messages), total, unreadCount }
  })

  // GET /v1/inbox/pending-count — unread messages, for the sidebar badge
  fastify.get("/pending-count", { preHandler: [canView] }, async (request) => {
    const pending = await prisma.inboxMessage.count({ where: { dealer_id: dealerOf(request), is_read: false } })
    return { pending }
  })

  // GET /v1/inbox/:id — single message
  fastify.get("/:id", { preHandler: [canView] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Not found" })
    const [item] = await mapMessages(dealer_id, [message])
    return { item }
  })

  // PATCH /v1/inbox/:id — { isRead } needs view_inbox; { tag } also needs reply_inbox
  fastify.patch("/:id", { preHandler: [canView] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { isRead?: unknown; tag?: unknown }

    const update: Record<string, unknown> = {}
    if (body.isRead !== undefined) {
      if (typeof body.isRead !== "boolean") {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "isRead must be true or false" } })
      }
      update["is_read"] = body.isRead
    }
    if (body.tag !== undefined) {
      if (!can(request.user, PERMISSIONS.REPLY_INBOX)) {
        return reply.code(403).send({ error: { code: "FORBIDDEN", message: `Missing permission: ${PERMISSIONS.REPLY_INBOX}` } })
      }
      if (body.tag !== null && (typeof body.tag !== "string" || !INBOX_TAGS.has(body.tag))) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "tag must be lead, complaint, general or spam" } })
      }
      update["tag"] = body.tag
    }
    if (Object.keys(update).length === 0) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "Send isRead or tag" } })
    }

    const result = await prisma.inboxMessage.updateMany({ where: { id, dealer_id }, data: update })
    if (result.count === 0) return reply.code(404).send({ error: "Not found" })

    const updated = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!updated) return reply.code(404).send({ error: "Not found" })
    const [item] = await mapMessages(dealer_id, [updated])
    return { item }
  })

  // POST /v1/inbox/mark-all-read
  fastify.post("/mark-all-read", { preHandler: [canView] }, async (request) => {
    await prisma.inboxMessage.updateMany({ where: { dealer_id: dealerOf(request), is_read: false }, data: { is_read: true } })
    return { success: true }
  })

  // POST /v1/inbox/:id/reply — saves the reply; `delivered` says whether the customer got it
  fastify.post("/:id/reply", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const { replyText } = (request.body ?? {}) as { replyText?: unknown }
    if (typeof replyText !== "string" || !replyText.trim()) return reply.code(400).send({ error: "replyText is required" })

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Not found" })

    const text = replyText.trim()
    const connection = await prisma.platformConnection.findFirst({ where: { dealer_id, platform: message.platform, is_connected: true } })
    const delivered = connection ? await sendReplyToPlatform(message, text, connection) : false

    const updated = await prisma.inboxMessage.update({ where: { id }, data: { reply_text: text, replied_at: new Date() } })
    const [item] = await mapMessages(dealer_id, [updated])
    return { item, delivered }
  })

  // POST /v1/inbox/:id/suggest-reply — up to three AI reply options; the first is stored
  fastify.post("/:id/suggest-reply", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const { tone } = (request.body ?? {}) as { tone?: unknown }
    if (tone !== undefined && (typeof tone !== "string" || tone.length > 40)) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "tone must be a short word" } })
    }

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Not found" })

    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })

    let suggestions: string[] | null
    try {
      suggestions = await suggestReplies({ message, dealer: dealerReplyContext(dealer), ...(typeof tone === "string" && tone ? { tone } : {}) })
    } catch (err) {
      request.log.error({ message: errorText(err) }, "[inbox] reply suggestions failed")
      return reply.code(502).send(AI_FAILED)
    }
    if (!suggestions) return reply.code(503).send(AI_NOT_CONFIGURED)
    const [first] = suggestions
    if (!first) return reply.code(502).send(AI_FAILED)

    await prisma.inboxMessage.update({ where: { id }, data: { ai_suggested_reply: first } })
    return { suggestedReply: first, suggestions }
  })

```

(e) In every route from `// GET /v1/inbox/settings` through `// POST /v1/inbox/mock/seed` (settings GET/POST, rules GET/POST/PUT/DELETE, templates GET/POST/PUT/DELETE, mock seed: 11 routes), replace `{ preHandler: [fastify.authenticate] }` with `{ preHandler: [canReply] }`. In the mock seed route, change its return to `return { items: await mapMessages(dealer_id, items) }`.

(f) Replace the whole `// POST /v1/inbox/:id/generate-post-draft` route with:

```ts
  // POST /v1/inbox/:id/generate-post-draft — a thank-you post draft from a review ("Turn into post")
  fastify.post("/:id/generate-post-draft", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Message not found" })

    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })

    let draft: { caption: string; hashtags: string[] } | null
    try {
      draft = await draftTestimonial({
        reviewText: message.message_text,
        customerName: message.customer_name,
        rating: message.rating,
        dealer: { name: dealer.name, city: dealer.city },
      })
    } catch (err) {
      request.log.error({ message: errorText(err) }, "[inbox] testimonial draft failed")
      return reply.code(502).send(AI_FAILED)
    }
    if (!draft) return reply.code(503).send(AI_NOT_CONFIGURED)

    const post = await prisma.post.create({
      data: {
        dealer_id,
        created_by: request.user.dealer_user_id,
        prompt_text: `Thank-you post for ${message.customer_name}'s review: "${truncateText(message.message_text, 300)}"`,
        caption_text: draft.caption,
        caption_hashtags: draft.hashtags,
        platforms: ["facebook", "instagram"],
        status: "draft",
      },
    })

    return { post }
  })
```

- [ ] **Step 8: `apps/api/src/services/emailMock.ts`.** In `generateMockEmails`, replace `await processIncomingMessage(msg.id);` with:

```ts
    // Auto-reply needs an AI provider; seeding sample messages must work without one.
    try {
      await processIncomingMessage(msg.id);
    } catch (err) {
      console.warn("[emailMock] Auto-reply skipped for a sample email:", err instanceof Error ? err.message : String(err));
    }
```

- [ ] **Step 9: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/inbox-routes.test.ts test/security-routes.test.ts test/no-key-in-url.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean. (`security-routes` still checks the webhook token and the plan gate.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/lib/platformMock.ts apps/api/src/lib/geminiJson.ts apps/api/src/lib/inboxView.ts apps/api/src/lib/inboxReplies.ts apps/api/src/routes/inbox.ts apps/api/src/services/emailMock.ts apps/api/test/inbox-routes.test.ts
git commit -m "feat(api): inbox permissions, pending count, post context and multi-option reply suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Message ingestion, new-message notifications and classification

**Files:**
- Create: `apps/api/src/lib/inboxNotifications.ts`, `apps/api/src/lib/inboxIngest.ts`, `apps/api/src/lib/inboxClassifier.ts`
- Modify: `apps/api/src/routes/inbox.ts` (the Meta webhook; delete `upsertInboxMessage`)
- Test: `apps/api/test/inbox-ingest.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `InboxMessage.rating`, `InboxMessage.needs_classification`.
  - Task 2: `truncateText` (`lib/inboxView.ts`), `geminiJson` (`lib/geminiJson.ts`).
  - Existing: `notify` (`lib/notifications.ts`, type `'inbox_message'` already exists), `usersWithPermission` (`lib/teamMembers.ts`), `PERMISSIONS.VIEW_INBOX`, `isSuccessfulResult` (`lib/publishDirect.ts`).
- Produces:
  - `lib/inboxNotifications.ts`:
    - `INBOX_NOTIFY_COALESCE_MS = 15 * 60 * 1000`
    - `inboxNotificationCopy(m): { title: string; body: string }`
    - `notifyInboxMessage(message, now?: Date): Promise<number>` (never throws)
  - `lib/inboxIngest.ts`:
    - `interface InboxIngestInput`
    - `inboxMessageDocId(platformMessageId: string): string`
    - `ingestInboxMessage(input: InboxIngestInput): Promise<{ message: InboxMessage; created: boolean }>`
    - `resolvePostId(dealerId: string, platform: string, platformPostId: string | undefined): Promise<string | null>`
  - `lib/inboxClassifier.ts`:
    - `type Sentiment`, `type InboxTag`, `interface Classification { sentiment: Sentiment; tag: InboxTag }`, `CLASSIFY_BATCH = 20`
    - `classifyFromRating(rating: number): Classification`, `classifyHeuristic(text: string): Classification`
    - `parseAiClassifications(value: unknown): Map<string, Classification>`
    - `classifyWithAi(items: Array<{ id: string; text: string; type: string }>): Promise<Map<string, Classification> | null>`
    - `classifyPendingMessages(limit?: number): Promise<number>`

- [ ] **Step 1: Write the failing test** — `apps/api/test/inbox-ingest.test.ts`:

```ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { classifyFromRating, classifyHeuristic, classifyPendingMessages, parseAiClassifications } from '../src/lib/inboxClassifier.js';
import { inboxMessageDocId, ingestInboxMessage, resolvePostId } from '../src/lib/inboxIngest.js';
import { INBOX_NOTIFY_COALESCE_MS, inboxNotificationCopy, notifyInboxMessage } from '../src/lib/inboxNotifications.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

async function dealerWithTeam() {
  const dealer = await prisma.dealer.create({ data: { name: 'Ingest Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const noInbox = await prisma.dealerUser.create({
    data: { phone: `u-${randomUUID()}`, name: 'Sales', role: 'user', dealer_id: dealer.id, is_active: true, permissions: { view_inbox: false } },
  });
  return { dealerId: dealer.id, admin, noInbox };
}

const inboxNotices = (userId: string) => prisma.notification.findMany({ where: { user_id: userId, type: 'inbox_message' } });

describe('classification rules', () => {
  it('reads reviews from their stars', () => {
    assert.deepEqual(classifyFromRating(5), { sentiment: 'positive', tag: 'general' });
    assert.deepEqual(classifyFromRating(3), { sentiment: 'neutral', tag: 'general' });
    assert.deepEqual(classifyFromRating(1), { sentiment: 'negative', tag: 'complaint' });
  });

  it('falls back to English and Hinglish keywords', () => {
    assert.deepEqual(classifyHeuristic('What is the on-road price and EMI for Creta?'), { sentiment: 'neutral', tag: 'lead' });
    assert.deepEqual(classifyHeuristic('Kitna discount milega?'), { sentiment: 'neutral', tag: 'lead' });
    assert.deepEqual(classifyHeuristic('Worst service, delivery delayed'), { sentiment: 'negative', tag: 'complaint' });
    assert.deepEqual(classifyHeuristic('Not happy with the staff'), { sentiment: 'negative', tag: 'complaint' });
    assert.deepEqual(classifyHeuristic('Thanks, great experience!'), { sentiment: 'positive', tag: 'general' });
    // Whole words only: "premium" is not "emi", "Facebook" is not "book".
    assert.deepEqual(classifyHeuristic('Loved the premium interiors I saw on Facebook'), { sentiment: 'positive', tag: 'general' });
  });

  it('keeps only well-formed AI verdicts', () => {
    const parsed = parseAiClassifications([
      { id: 'a', sentiment: 'negative', tag: 'complaint' },
      { id: 'b', sentiment: 'happy', tag: 'lead' },
      { id: 'c', sentiment: 'neutral' },
      'junk',
    ]);
    assert.deepEqual([...parsed.entries()], [['a', { sentiment: 'negative', tag: 'complaint' }]]);
  });
});

describe('notifyInboxMessage', () => {
  it('names the message type and the customer', () => {
    const base = { dealer_id: 'd', customer_name: 'Asha', message_text: 'Great service', rating: null };
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'review', rating: 5 }).title, 'New 5★ Google review from Asha');
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'comment' }).title, 'New comment from Asha');
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'dm' }).title, 'New message from Asha');
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'comment' }).body, 'Great service');
  });

  it('notifies inbox viewers once per 15 minutes while the last notice is unread', async () => {
    const { dealerId, admin, noInbox } = await dealerWithTeam();
    const message = { dealer_id: dealerId, message_type: 'comment', customer_name: 'Ravi', message_text: 'Price?', rating: null };
    const t0 = new Date();

    assert.equal(await notifyInboxMessage(message, t0), 1);
    assert.equal(await notifyInboxMessage(message, new Date(t0.getTime() + 60_000)), 0);
    assert.equal((await inboxNotices(noInbox.id)).length, 0);
    const [first] = await inboxNotices(admin.id);
    assert.deepEqual([first?.title, first?.link], ['New comment from Ravi', '/inbox']);

    assert.equal(await notifyInboxMessage(message, new Date(t0.getTime() + INBOX_NOTIFY_COALESCE_MS + 60_000)), 1);
  });

  it('notifies again once the last notice was read', async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const message = { dealer_id: dealerId, message_type: 'dm', customer_name: 'Ravi', message_text: 'Hi', rating: null };
    await notifyInboxMessage(message);
    await prisma.notification.updateMany({ where: { user_id: admin.id }, data: { is_read: true } });
    assert.equal(await notifyInboxMessage(message), 1);
  });

  it('never throws', async (t) => {
    const { dealerId } = await dealerWithTeam();
    t.mock.method(prisma.notification, 'createMany', async () => { throw new Error('store down'); });
    t.mock.method(console, 'error', () => {});
    assert.equal(await notifyInboxMessage({ dealer_id: dealerId, message_type: 'dm', customer_name: 'R', message_text: 'Hi', rating: null }), 0);
  });
});

describe('ingestInboxMessage', () => {
  it('creates a message once, notifies, and flags it for classification', async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const platformMessageId = `c-${randomUUID()}`;
    const input = {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment' as const,
      platform_message_id: platformMessageId, message_text: 'Is the Creta available?', customer_name: 'Ravi',
    };

    const first = await ingestInboxMessage(input);
    assert.equal(first.created, true);
    assert.equal(first.message.id, inboxMessageDocId(platformMessageId));
    assert.equal(first.message.needs_classification, true);

    await prisma.inboxMessage.update({ where: { id: first.message.id }, data: { tag: 'complaint' } });
    const again = await ingestInboxMessage({ ...input, message_text: 'Is the Creta available in white?', tag: 'lead' });
    assert.equal(again.created, false);
    assert.equal(again.message.message_text, 'Is the Creta available in white?');
    assert.equal(again.message.tag, 'complaint');
    assert.equal(again.message.received_at.getTime(), first.message.received_at.getTime());
    assert.equal((await inboxNotices(admin.id)).length, 1);
  });

  it('creates one message when the same delivery arrives twice at once', async () => {
    const { dealerId } = await dealerWithTeam();
    const input = { dealer_id: dealerId, platform: 'facebook', message_type: 'dm' as const, platform_message_id: `dm-${randomUUID()}`, message_text: 'Hi' };
    const results = await Promise.all([ingestInboxMessage(input), ingestInboxMessage(input)]);
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal((await prisma.inboxMessage.findMany({ where: { platform_message_id: input.platform_message_id } })).length, 1);
  });

  it("maps a platform post id to the dealership's post", async () => {
    const { dealerId } = await dealerWithTeam();
    const other = await dealerWithTeam();
    const published = (dealer: string, results: Record<string, unknown>) => prisma.post.create({
      data: { dealer_id: dealer, prompt_text: 'p', caption_hashtags: [], platforms: Object.keys(results), status: 'published', publish_results: results },
    });
    const fb = await published(dealerId, { facebook: { post_id: '4455', url: 'https://facebook.com/x', published_at: '2026-09-20T10:00:00.000Z' } });
    const ig = await published(dealerId, { instagram: { post_id: '17890', url: 'https://instagram.com/p/x', published_at: '2026-09-20T10:00:00.000Z' } });
    await published(other.dealerId, { facebook: { post_id: '7788', url: 'https://facebook.com/y', published_at: '2026-09-20T10:00:00.000Z' } });

    assert.equal(await resolvePostId(dealerId, 'facebook', 'page1_4455'), fb.id);
    assert.equal(await resolvePostId(dealerId, 'instagram', '17890'), ig.id);
    assert.equal(await resolvePostId(dealerId, 'facebook', 'page1_7788'), null);
    assert.equal(await resolvePostId(dealerId, 'facebook', undefined), null);
  });
});

describe('POST /v1/inbox/webhook/meta', () => {
  it("imports customer comments, links them to our post and skips the Page's own activity", async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const pageId = `page-${randomUUID()}`;
    await prisma.platformConnection.create({ data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: pageId, access_token: 'page-token', is_connected: true } });
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'Creta offer', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        publish_results: { facebook: { post_id: '5566', url: 'https://facebook.com/x', published_at: '2026-09-20T10:00:00.000Z' } },
      },
    });
    const commentId = `c-${randomUUID()}`;
    const feed = (value: Record<string, unknown>) => ({ field: 'feed', value });
    const payload = {
      object: 'page',
      entry: [{
        id: pageId,
        changes: [
          feed({ item: 'comment', verb: 'add', comment_id: commentId, post_id: `${pageId}_5566`, message: 'What is the EMI on the Creta?', from: { id: 'cust-1', name: 'Ravi Kumar' } }),
          feed({ item: 'comment', verb: 'add', comment_id: `c-${randomUUID()}`, post_id: `${pageId}_5566`, message: 'Thanks for asking!', from: { id: pageId, name: 'Our Page' } }),
          feed({ item: 'status', verb: 'add', post_id: `${pageId}_9999`, message: 'New arrivals this week' }),
        ],
        messaging: [{ sender: { id: pageId }, recipient: { id: 'cust-2' }, message: { mid: `mid-${randomUUID()}`, text: 'Our reply', is_echo: true } }],
      }],
    };

    const res = await fastify.inject({ method: 'POST', url: '/v1/inbox/webhook/meta', payload });

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { imported: number }).imported, 1);
    const stored = await prisma.inboxMessage.findUnique({ where: { platform_message_id: commentId } });
    assert.deepEqual([stored?.post_id, stored?.customer_name, stored?.needs_classification], [post.id, 'Ravi Kumar', true]);
    assert.equal((await inboxNotices(admin.id)).length, 1);

    await fastify.inject({ method: 'POST', url: '/v1/inbox/webhook/meta', payload });
    assert.equal((await prisma.inboxMessage.findMany({ where: { platform_message_id: commentId } })).length, 1);
    assert.equal((await inboxNotices(admin.id)).length, 1);
  });
});

describe('classifyPendingMessages', () => {
  // Messages flagged by earlier tests in this file would otherwise join these batches.
  beforeEach(async () => {
    await prisma.inboxMessage.updateMany({ where: { needs_classification: true }, data: { needs_classification: false } });
  });

  const pending = (dealerId: string, data: Record<string, unknown>) => prisma.inboxMessage.create({
    data: {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `p-${randomUUID()}`,
      customer_name: 'C', message_text: 'hi', received_at: new Date(), needs_classification: true, ...data,
    },
  });
  const read = (id: string) => prisma.inboxMessage.findUnique({ where: { id } });

  it('uses stars for reviews and keywords without a Gemini key, keeping tags already set', async () => {
    const { dealerId } = await dealerWithTeam();
    const lead = await pending(dealerId, { message_text: 'What is the on-road price and EMI?' });
    const angry = await pending(dealerId, { message_text: 'Worst service, delivery delayed', tag: 'lead' });
    const review = await pending(dealerId, { platform: 'gmb', message_type: 'review', message_text: '', rating: 2 });

    assert.equal(await classifyPendingMessages(), 3);

    const l = await read(lead.id);
    assert.deepEqual([l?.sentiment, l?.tag, l?.needs_classification], ['neutral', 'lead', false]);
    const a = await read(angry.id);
    assert.deepEqual([a?.sentiment, a?.tag], ['negative', 'lead']);
    const r = await read(review.id);
    assert.deepEqual([r?.sentiment, r?.tag], ['negative', 'complaint']);
    assert.equal(await classifyPendingMessages(), 0);
  });

  it('asks Gemini once for the batch and uses keywords for anything it skipped', async (t) => {
    process.env['GEMINI_API_KEY'] = 'test-key-not-real-0000';
    const { dealerId } = await dealerWithTeam();
    const one = await pending(dealerId, { message_text: 'Kab milega delivery?' });
    const two = await pending(dealerId, { message_text: 'Thanks, great experience!' });
    const answer = JSON.stringify([{ id: one.id, sentiment: 'neutral', tag: 'lead' }, { id: 'unknown', sentiment: 'happy', tag: 'x' }]);
    const post = t.mock.method(axios, 'post', async () => ({ data: { candidates: [{ content: { parts: [{ text: answer }] } }] } }));

    assert.equal(await classifyPendingMessages(), 2);

    assert.equal(post.mock.callCount(), 1);
    assert.equal((await read(one.id))?.tag, 'lead');
    const second = await read(two.id);
    assert.deepEqual([second?.sentiment, second?.tag], ['positive', 'general']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/inbox-ingest.test.ts`
Expected: FAIL (missing modules).

- [ ] **Step 3: `apps/api/src/lib/inboxNotifications.ts`**

```ts
import type { InboxMessage } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { truncateText } from './inboxView.js';
import { notify } from './notifications.js';
import { PERMISSIONS } from './permissions.js';
import { usersWithPermission } from './teamMembers.js';

/** Someone with an unread inbox notice newer than this isn't notified again. */
export const INBOX_NOTIFY_COALESCE_MS = 15 * 60 * 1000;

type NoticeSource = Pick<InboxMessage, 'dealer_id' | 'message_type' | 'customer_name' | 'message_text' | 'rating'>;

export function inboxNotificationCopy(m: NoticeSource): { title: string; body: string } {
  const name = m.customer_name?.trim() || 'a customer';
  const title = m.message_type === 'review'
    ? `New ${m.rating ? `${m.rating}★ ` : ''}Google review from ${name}`
    : m.message_type === 'comment' ? `New comment from ${name}` : `New message from ${name}`;
  return { title, body: truncateText(m.message_text || '', 120) };
}

/**
 * Tells everyone who can see the inbox about a new message or review, with a link to /inbox.
 * Coalesced: a person who still has an unread inbox notice from the last 15 minutes is skipped.
 * Never throws: a notification problem must not break ingestion. Returns how many were notified.
 */
export async function notifyInboxMessage(message: NoticeSource, now: Date = new Date()): Promise<number> {
  try {
    const recipients = await usersWithPermission(message.dealer_id, PERMISSIONS.VIEW_INBOX);
    if (recipients.length === 0) return 0;
    const since = now.getTime() - INBOX_NOTIFY_COALESCE_MS;
    const unread = await prisma.notification.findMany({ where: { dealer_id: message.dealer_id, type: 'inbox_message', is_read: false } });
    const busy = new Set(unread.filter((n) => n.created_at.getTime() >= since).map((n) => n.user_id));
    const userIds = recipients.filter((id) => !busy.has(id));
    if (userIds.length === 0) return 0;
    const { title, body } = inboxNotificationCopy(message);
    return await notify({ dealerId: message.dealer_id, type: 'inbox_message', title, ...(body ? { body } : {}), link: '/inbox', userIds });
  } catch (err) {
    console.error('[notifications] Could not notify about a new inbox message:', err instanceof Error ? err.message : String(err));
    return 0;
  }
}
```

- [ ] **Step 4: `apps/api/src/lib/inboxIngest.ts`**

```ts
import { createHash } from 'node:crypto';
import type { InboxMessage } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { notifyInboxMessage } from './inboxNotifications.js';
import { isSuccessfulResult } from './publishDirect.js';

export interface InboxIngestInput {
  dealer_id: string;
  platform: string;
  message_type: 'comment' | 'dm' | 'review';
  platform_message_id: string;
  message_text: string;
  customer_name?: string | undefined;
  customer_platform_id?: string | undefined;
  customer_avatar_url?: string | undefined;
  /** Our Post.id (see resolvePostId); null clears the link. */
  post_id?: string | null | undefined;
  received_at?: Date | undefined;
  rating?: number | null | undefined;
  /** A reply the platform already shows (Google's reviewReply). */
  reply_text?: string | undefined;
  replied_at?: Date | undefined;
  /** Known up front for rated reviews; otherwise the classifier decides. */
  sentiment?: string | undefined;
  tag?: string | undefined;
}

/** Document id for a new message, derived from its platform id so concurrent deliveries collide instead of duplicating. */
export function inboxMessageDocId(platformMessageId: string): string {
  return `im_${createHash('sha256').update(platformMessageId).digest('hex').slice(0, 32)}`;
}

const isDuplicate = (err: unknown) => (err as { code?: unknown } | null)?.code === 'P2002';

async function refresh(existing: InboxMessage, input: InboxIngestInput, shared: Record<string, unknown>): Promise<InboxMessage> {
  // Platform ids are unique, but never move a message between dealerships.
  if (existing.dealer_id !== input.dealer_id) return existing;
  return prisma.inboxMessage.update({
    where: { id: existing.id },
    data: {
      ...shared,
      ...(input.sentiment ? { sentiment: input.sentiment } : {}),
      // A tag someone chose, or the classifier set, is never overwritten.
      ...(input.tag && !existing.tag ? { tag: input.tag } : {}),
    },
  });
}

/**
 * Creates or refreshes a message by its platform id (Meta webhook, Google review sync).
 * - New: notifies the team, and waits for the classifier unless a sentiment was given.
 * - Known: updates text, customer, post, rating and a platform reply; never moves received_at or a tag.
 */
export async function ingestInboxMessage(input: InboxIngestInput): Promise<{ message: InboxMessage; created: boolean }> {
  const where = { platform_message_id: input.platform_message_id };
  const shared = {
    message_text: input.message_text,
    customer_name: input.customer_name?.trim() || 'Customer',
    customer_platform_id: input.customer_platform_id ?? null,
    customer_avatar_url: input.customer_avatar_url ?? null,
    ...(input.post_id !== undefined ? { post_id: input.post_id } : {}),
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.reply_text ? { reply_text: input.reply_text, replied_at: input.replied_at ?? new Date() } : {}),
  };

  const existing = await prisma.inboxMessage.findUnique({ where });
  if (existing) return { message: await refresh(existing, input, shared), created: false };

  let message: InboxMessage;
  try {
    message = await prisma.inboxMessage.create({
      data: {
        id: inboxMessageDocId(input.platform_message_id),
        dealer_id: input.dealer_id,
        platform: input.platform,
        message_type: input.message_type,
        platform_message_id: input.platform_message_id,
        ...shared,
        received_at: input.received_at ?? new Date(),
        sentiment: input.sentiment ?? null,
        tag: input.tag ?? null,
        ...(input.sentiment ? {} : { needs_classification: true }),
      },
    });
  } catch (err) {
    const raced = isDuplicate(err) ? await prisma.inboxMessage.findUnique({ where }) : null;
    if (!raced) throw err;
    return { message: raced, created: false };
  }
  await notifyInboxMessage(message);
  return { message, created: true };
}

/**
 * Our Post.id for a platform post/media id from a webhook: the dealership's published post whose
 * publish result has that id. Facebook comment events use "<pageId>_<postId>", so the part after
 * the last underscore is matched too.
 */
export async function resolvePostId(dealerId: string, platform: string, platformPostId: string | undefined): Promise<string | null> {
  if (!platformPostId) return null;
  const tail = platformPostId.slice(platformPostId.lastIndexOf('_') + 1);
  const posts = await prisma.post.findMany({ where: { dealer_id: dealerId, status: 'published' } });
  for (const post of posts) {
    const entry = ((post.publish_results ?? {}) as Record<string, unknown>)[platform];
    if (!isSuccessfulResult(entry)) continue;
    const id = (entry as { post_id: string }).post_id;
    if (id === platformPostId || id === tail || id.endsWith(`_${tail}`)) return post.id;
  }
  return null;
}
```

- [ ] **Step 5: `apps/api/src/lib/inboxClassifier.ts`**

```ts
import { prisma } from '../db/prisma.js';
import { geminiJson } from './geminiJson.js';

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type InboxTag = 'lead' | 'complaint' | 'general' | 'spam';
export interface Classification { sentiment: Sentiment; tag: InboxTag }

export const CLASSIFY_BATCH = 20;
const SENTIMENTS: readonly string[] = ['positive', 'neutral', 'negative'];
const TAGS: readonly string[] = ['lead', 'complaint', 'general', 'spam'];

/** Reviews carry their own verdict: 4–5★ positive, 3★ neutral, 1–2★ negative and a complaint. */
export function classifyFromRating(rating: number): Classification {
  if (rating >= 4) return { sentiment: 'positive', tag: 'general' };
  if (rating === 3) return { sentiment: 'neutral', tag: 'general' };
  return { sentiment: 'negative', tag: 'complaint' };
}

// English, Hinglish and a few Hindi words seen in dealership comments and DMs.
const COMPLAINT_WORDS = [
  'bad', 'worst', 'poor', 'problem', 'issue', 'delay', 'delayed', 'late', 'rude', 'refund', 'complaint', 'complain',
  'pathetic', 'disappointed', 'not happy', 'never again', 'cheated', 'fraud', 'bekaar', 'bakwas', 'ghatiya', 'kharab', 'dhoka',
  'बेकार', 'खराब',
];
const SPAM_WORDS = ['lottery', 'prize', 'gift card', 'free followers', 'click this link', 'crypto', 'bitcoin', 'earn money'];
const LEAD_WORDS = [
  'price', 'pricing', 'quote', 'quotation', 'on-road', 'on road', 'finance', 'loan', 'emi', 'test drive', 'book', 'booking',
  'offer', 'offers', 'discount', 'exchange', 'interested', 'available', 'kitna', 'kitne', 'kimat', 'keemat', 'daam', 'कीमत',
];
const POSITIVE_WORDS = [
  'great', 'thanks', 'thank you', 'thank u', 'excellent', 'love', 'loved', 'best', 'awesome', 'amazing', 'happy', 'satisfied',
  'wonderful', 'superb', 'badhiya', 'shukriya', 'dhanyavad', 'mast', 'zabardast', 'धन्यवाद', 'शुक्रिया',
];

const escapeRegExp = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words only, in any script: "premium" does not mention "emi".
function mentions(text: string, words: readonly string[]): boolean {
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escapeRegExp(w)}(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'iu').test(text));
}

/** Keyword fallback when there is no Gemini key or the AI call failed. */
export function classifyHeuristic(text: string): Classification {
  if (mentions(text, COMPLAINT_WORDS)) return { sentiment: 'negative', tag: 'complaint' };
  if (mentions(text, SPAM_WORDS)) return { sentiment: 'neutral', tag: 'spam' };
  const sentiment: Sentiment = mentions(text, POSITIVE_WORDS) ? 'positive' : 'neutral';
  return { sentiment, tag: mentions(text, LEAD_WORDS) ? 'lead' : 'general' };
}

/** The model's verdicts by message id. Anything malformed is left out, so the caller falls back to keywords. */
export function parseAiClassifications(value: unknown): Map<string, Classification> {
  const out = new Map<string, Classification>();
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as { items?: unknown }).items : null;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, sentiment, tag } = entry as { id?: unknown; sentiment?: unknown; tag?: unknown };
    if (typeof id !== 'string' || typeof sentiment !== 'string' || typeof tag !== 'string') continue;
    if (!SENTIMENTS.includes(sentiment) || !TAGS.includes(tag)) continue;
    out.set(id, { sentiment: sentiment as Sentiment, tag: tag as InboxTag });
  }
  return out;
}

/** One Gemini JSON call for a batch. Null when no key is configured; throws when the call failed. */
export async function classifyWithAi(items: Array<{ id: string; text: string; type: string }>): Promise<Map<string, Classification> | null> {
  const answer = await geminiJson([
    'Classify each customer message sent to an Indian car dealership (English, Hindi or Hinglish).',
    'sentiment: positive | neutral | negative.',
    'tag: lead (asks about price, EMI, finance, a test drive, booking, offers or availability) | complaint (unhappy with service, delivery, staff or the car) | spam (ads, scams, unrelated links) | general (anything else).',
    'Return JSON only: an array of {"id": "…", "sentiment": "…", "tag": "…"} with one entry per message.',
    `Messages: ${JSON.stringify(items.map((i) => ({ id: i.id, type: i.type, text: i.text.slice(0, 500) })))}`,
  ].join('\n'));
  return answer ? parseAiClassifications(answer.value) : null;
}

/**
 * Cron step: sentiment and tag for up to `limit` new messages (flagged needs_classification at ingestion), oldest first.
 * Rated reviews use their stars; the rest go to Gemini in one call, with keywords as the fallback.
 * Never overwrites a sentiment or tag that is already set. Returns how many messages it classified.
 */
export async function classifyPendingMessages(limit = CLASSIFY_BATCH): Promise<number> {
  const pending = (await prisma.inboxMessage.findMany({ where: { needs_classification: true } }))
    .sort((a, b) => a.received_at.getTime() - b.received_at.getTime())
    .slice(0, limit);
  if (pending.length === 0) return 0;

  const verdicts = new Map<string, Classification>();
  const forAi: Array<{ id: string; text: string; type: string }> = [];
  for (const m of pending) {
    if (m.rating) verdicts.set(m.id, classifyFromRating(m.rating));
    else if (m.message_text.trim()) forAi.push({ id: m.id, text: m.message_text, type: m.message_type });
    else verdicts.set(m.id, { sentiment: 'neutral', tag: 'general' });
  }
  if (forAi.length > 0) {
    let ai: Map<string, Classification> | null = null;
    try {
      ai = await classifyWithAi(forAi);
    } catch (err) {
      console.error('[inbox] AI classification failed; using keywords:', err instanceof Error ? err.message : String(err));
    }
    for (const item of forAi) verdicts.set(item.id, ai?.get(item.id) ?? classifyHeuristic(item.text));
  }

  let classified = 0;
  for (const m of pending) {
    const verdict: Classification = verdicts.get(m.id) ?? { sentiment: 'neutral', tag: 'general' };
    try {
      await prisma.inboxMessage.update({
        where: { id: m.id },
        data: {
          needs_classification: false,
          ...(m.sentiment ? {} : { sentiment: verdict.sentiment }),
          ...(m.tag ? {} : { tag: verdict.tag }),
        },
      });
      classified++;
    } catch (err) {
      console.error(`[inbox] Could not save the classification of message ${m.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return classified;
}
```

- [ ] **Step 6: The webhook in `apps/api/src/routes/inbox.ts`.**

(a) Add to the imports: `import { ingestInboxMessage, resolvePostId } from "../lib/inboxIngest.js"`.

(b) Delete `async function upsertInboxMessage(…) { … }`.

(c) In the `// POST /v1/inbox/webhook/meta` route, keep the signature check and the `payload` / log lines unchanged. Replace everything from `const entries = Array.isArray(payload?.entry) ? payload.entry : []` down to (not including) `return reply.code(200).send({ success: true, imported })` with:

```ts
    const entries = Array.isArray(payload?.entry) ? payload.entry : []
    let imported = 0

    for (const entry of entries) {
      const platformAccountId =
        entry.id ||
        entry.messaging?.[0]?.recipient?.id ||
        entry.changes?.[0]?.value?.page_id
      if (!platformAccountId) continue

      const connection = await prisma.platformConnection.findFirst({
        where: { platform_account_id: platformAccountId, is_connected: true },
      })
      if (!connection) continue

      const platform = connection.platform
      const dealer_id = connection.dealer_id

      if (Array.isArray(entry.messaging)) {
        for (const event of entry.messaging) {
          if (event.message?.is_echo) continue // the Page's own outgoing message
          const text = extractTextFromMetaMessage(event)
          const messageId =
            event.message?.mid ||
            event.message?.id ||
            event.standby?.[0]?.message?.mid
          if (!text || !messageId) continue

          await ingestInboxMessage({
            dealer_id,
            platform,
            message_type: "dm",
            platform_message_id: messageId,
            message_text: text,
            customer_name: event.sender?.name,
            customer_platform_id: event.sender?.id,
            customer_avatar_url: event.sender?.profile_pic,
          })
          imported += 1
        }
      }

      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const value = change.value ?? {}
          // Facebook "feed" events also cover new posts, reactions and edits; only comments belong in the inbox.
          if (change.field === "feed" && value.item && value.item !== "comment") continue
          if (value.verb === "remove") continue
          const text = extractTextFromMetaChange(change)
          const messageId = value.comment_id || value.message_id || value.id
          if (!text || !messageId) continue
          const customerId = value.from?.id ?? value.sender_id
          if (customerId && customerId === connection.platform_account_id) continue // the Page's own comment

          await ingestInboxMessage({
            dealer_id,
            platform,
            message_type: "comment",
            platform_message_id: messageId,
            message_text: text,
            customer_name: value.from?.name ?? value.from?.username ?? value.sender_name,
            customer_platform_id: customerId,
            post_id: await resolvePostId(dealer_id, platform, value.post_id ?? value.media?.id),
          })
          imported += 1
        }
      }
    }

```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/inbox-ingest.test.ts test/inbox-routes.test.ts test/notifications.test.ts test/security-routes.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/inboxNotifications.ts apps/api/src/lib/inboxIngest.ts apps/api/src/lib/inboxClassifier.ts apps/api/src/routes/inbox.ts apps/api/test/inbox-ingest.test.ts
git commit -m "feat(api): notify the team about new messages and classify them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Google review sync

**Files:**
- Modify: `apps/api/src/services/gmb.ts` (`fetchGmbReviews` types)
- Create: `apps/api/src/lib/gmbReviewSync.ts`
- Test: `apps/api/test/gmb-review-sync.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `isMockConnection`.
  - Task 3: `ingestInboxMessage`, `classifyFromRating`.
  - Existing: `resolveAccessToken` (`lib/publishDirect.ts`; refreshes Google tokens through `getFreshGoogleAccessToken`), `PlatformConnection.last_sync_at` (unused until now).
- Produces:
  - `services/gmb.ts`: `interface GmbReview { name: string; reviewer?: { displayName?: string }; starRating?: string; comment?: string; createTime?: string; reviewReply?: { comment?: string; updateTime?: string } }`, `fetchGmbReviews(locationName, accessToken, pageToken?): Promise<{ reviews: GmbReview[]; nextPageToken?: string }>`
  - `lib/gmbReviewSync.ts`:
    - `REVIEW_SYNC_BATCH = 3`, `REVIEW_SYNC_INTERVAL_MS = 30 * 60 * 1000`
    - `starRating(value: unknown): number | null`
    - `pickReviewConnections<T>(conns: T[], now: Date, limit?: number): T[]`
    - `syncGoogleReviews(now: Date): Promise<number>` (reviews newly created)

- [ ] **Step 1: Write the failing test** — `apps/api/test/gmb-review-sync.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { pickReviewConnections, REVIEW_SYNC_INTERVAL_MS, starRating, syncGoogleReviews } from '../src/lib/gmbReviewSync.js';

const HOUR = 3_600_000;

async function googleDealer() {
  const dealer = await prisma.dealer.create({ data: { name: 'Review Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const location = `accounts/1/locations/${randomUUID()}`;
  const connection = await prisma.platformConnection.create({
    data: {
      dealer_id: dealer.id, platform: 'gmb', platform_account_id: location, access_token: 'ya29.test-token',
      token_expires_at: new Date(Date.now() + 2 * HOUR), is_connected: true,
    },
  });
  return { dealerId: dealer.id, admin, location, connection };
}

const review = (location: string, n: number, extra: Record<string, unknown> = {}) => ({
  name: `${location}/reviews/r${n}`,
  reviewer: { displayName: `Customer ${n}` },
  starRating: 'FIVE',
  comment: 'Smooth delivery, thank you!',
  createTime: '2026-09-20T08:00:00Z',
  ...extra,
});

const byPlatformId = (id: string) => prisma.inboxMessage.findUnique({ where: { platform_message_id: id } });

describe('helpers', () => {
  it('maps star ratings', () => {
    assert.equal(starRating('FIVE'), 5);
    assert.equal(starRating('ONE'), 1);
    assert.equal(starRating('STAR_RATING_UNSPECIFIED'), null);
    assert.equal(starRating(undefined), null);
  });

  it('picks live, non-mock connections not synced for 30 minutes, never-synced first', () => {
    const now = new Date('2026-09-24T10:00:00Z');
    const conn = (id: string, last: Date | null, extra: Partial<{ is_connected: boolean; access_token: string }> = {}) => ({
      id, is_connected: true, access_token: 'tok', platform_account_id: `accounts/1/locations/${id}`, last_sync_at: last, ...extra,
    });
    const picked = pickReviewConnections([
      conn('recent', new Date(now.getTime() - 10 * 60_000)),
      conn('old', new Date(now.getTime() - 2 * HOUR)),
      conn('never', null),
      conn('off', null, { is_connected: false }),
      conn('mock', null, { access_token: 'mock_google' }),
      conn('older', new Date(now.getTime() - 5 * HOUR)),
    ], now, 3);
    assert.deepEqual(picked.map((c) => c.id), ['never', 'older', 'old']);
  });
});

describe('syncGoogleReviews', () => {
  it('imports reviews with stars, replies and a verdict, and notifies once', async (t) => {
    const g = await googleDealer();
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    t.mock.method(axios, 'get', async (url: string, config: { headers: Record<string, string> }) => {
      calls.push({ url, auth: config.headers['Authorization'] });
      if (url.endsWith(`${g.location}/reviews`)) {
        return {
          data: {
            reviews: [
              review(g.location, 1, { reviewReply: { comment: 'Thank you!', updateTime: '2026-09-20T09:30:00Z' } }),
              review(g.location, 2, { starRating: 'TWO', comment: 'Delivery was late' }),
            ],
          },
        };
      }
      return { data: { reviews: [] } };
    });
    const now = new Date();

    await syncGoogleReviews(now);

    const five = await byPlatformId(`${g.location}/reviews/r1`);
    assert.deepEqual(
      [five?.platform, five?.message_type, five?.rating, five?.sentiment, five?.tag, five?.reply_text, five?.customer_name],
      ['gmb', 'review', 5, 'positive', 'general', 'Thank you!', 'Customer 1'],
    );
    assert.equal(five?.replied_at?.toISOString(), '2026-09-20T09:30:00.000Z');
    assert.equal(five?.received_at.toISOString(), '2026-09-20T08:00:00.000Z');
    assert.equal(five?.needs_classification, null);
    const two = await byPlatformId(`${g.location}/reviews/r2`);
    assert.deepEqual([two?.rating, two?.sentiment, two?.tag, two?.reply_text], [2, 'negative', 'complaint', null]);
    assert.equal(calls.find((c) => c.url.includes(g.location))?.auth, 'Bearer ya29.test-token');
    assert.equal((await prisma.notification.findMany({ where: { user_id: g.admin.id } })).length, 1);
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: g.connection.id } }))?.last_sync_at?.getTime(), now.getTime());

    await syncGoogleReviews(new Date(now.getTime() + 60_000));
    assert.equal(calls.filter((c) => c.url.includes(g.location)).length, 1);
  });

  it('refreshes known reviews without notifying again or touching the tag', async (t) => {
    const g = await googleDealer();
    let withReply = false;
    t.mock.method(axios, 'get', async (url: string) => (url.endsWith(`${g.location}/reviews`)
      ? { data: { reviews: [review(g.location, 1, withReply ? { reviewReply: { comment: 'Thanks a lot!', updateTime: '2026-09-21T10:00:00Z' } } : {})] } }
      : { data: { reviews: [] } }));
    const now = new Date();
    await syncGoogleReviews(now);
    const stored = await byPlatformId(`${g.location}/reviews/r1`);
    await prisma.inboxMessage.update({ where: { id: stored!.id }, data: { tag: 'lead' } });

    withReply = true;
    await syncGoogleReviews(new Date(now.getTime() + REVIEW_SYNC_INTERVAL_MS + 60_000));

    const updated = await byPlatformId(`${g.location}/reviews/r1`);
    assert.deepEqual([updated?.reply_text, updated?.tag], ['Thanks a lot!', 'lead']);
    assert.equal((await prisma.notification.findMany({ where: { user_id: g.admin.id } })).length, 1);
  });

  it('stamps the sync time and logs only the message when Google fails', async (t) => {
    const g = await googleDealer();
    t.mock.method(axios, 'get', async (url: string) => {
      if (url.includes(g.location)) throw new Error('Request failed: 403 PERMISSION_DENIED');
      return { data: { reviews: [] } };
    });
    const errors = t.mock.method(console, 'error', () => {});
    const now = new Date();

    assert.equal(await syncGoogleReviews(now), 0);

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: g.connection.id } }))?.last_sync_at?.getTime(), now.getTime());
    const logged = errors.mock.calls.map((call) => call.arguments);
    assert.ok(logged.some((args) => args.some((a) => typeof a === 'string' && a.includes('PERMISSION_DENIED'))));
    assert.ok(logged.every((args) => args.every((a) => typeof a === 'string')));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/gmb-review-sync.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/gmbReviewSync.js'`).

- [ ] **Step 3: `apps/api/src/services/gmb.ts`.** Replace the whole `export async function fetchGmbReviews(…) { … }` with:

```ts
export interface GmbReview {
  name: string; // accounts/{a}/locations/{l}/reviews/{r}
  reviewer?: { displayName?: string };
  starRating?: string; // ONE … FIVE, or STAR_RATING_UNSPECIFIED
  comment?: string;
  createTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export async function fetchGmbReviews(
  locationName: string,
  accessToken: string,
  pageToken?: string,
): Promise<{ reviews: GmbReview[]; nextPageToken?: string }> {
  const res = await axios.get<{ reviews?: GmbReview[]; nextPageToken?: string }>(
    `${GMB_BASE}/${locationName}/reviews`,
    {
      params: pageToken ? { pageToken } : {},
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const reviews = res.data.reviews ?? [];
  return res.data.nextPageToken ? { reviews, nextPageToken: res.data.nextPageToken } : { reviews };
}
```

(`fetchGmbReviews` has no other callers.)

- [ ] **Step 4: `apps/api/src/lib/gmbReviewSync.ts`**

```ts
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchGmbReviews, type GmbReview } from '../services/gmb.js';
import { classifyFromRating } from './inboxClassifier.js';
import { ingestInboxMessage } from './inboxIngest.js';
import { isMockConnection } from './platformMock.js';
import { resolveAccessToken } from './publishDirect.js';

export const REVIEW_SYNC_BATCH = 3;
export const REVIEW_SYNC_INTERVAL_MS = 30 * 60 * 1000;

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function starRating(value: unknown): number | null {
  return typeof value === 'string' ? STARS[value] ?? null : null;
}

type SyncCandidate = Pick<PlatformConnection, 'is_connected' | 'access_token' | 'platform_account_id' | 'last_sync_at'>;

/** Live Google connections not synced in the last 30 minutes, never-synced and then oldest first. */
export function pickReviewConnections<T extends SyncCandidate>(conns: T[], now: Date, limit = REVIEW_SYNC_BATCH): T[] {
  const due = now.getTime() - REVIEW_SYNC_INTERVAL_MS;
  return conns
    .filter((c) => c.is_connected && !isMockConnection(c) && (!c.last_sync_at || c.last_sync_at.getTime() <= due))
    .sort((a, b) => (a.last_sync_at?.getTime() ?? 0) - (b.last_sync_at?.getTime() ?? 0))
    .slice(0, limit);
}

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function importReview(conn: PlatformConnection, review: GmbReview): Promise<boolean> {
  const rating = starRating(review.starRating);
  const verdict = rating ? classifyFromRating(rating) : null;
  const receivedAt = validDate(review.createTime);
  const repliedAt = validDate(review.reviewReply?.updateTime);
  const { created } = await ingestInboxMessage({
    dealer_id: conn.dealer_id,
    platform: 'gmb',
    message_type: 'review',
    platform_message_id: review.name,
    message_text: review.comment ?? '',
    customer_name: review.reviewer?.displayName,
    rating,
    ...(receivedAt ? { received_at: receivedAt } : {}),
    ...(review.reviewReply?.comment ? { reply_text: review.reviewReply.comment, ...(repliedAt ? { replied_at: repliedAt } : {}) } : {}),
    ...(verdict ? { sentiment: verdict.sentiment, tag: verdict.tag } : {}),
  });
  return created;
}

/**
 * Cron step: brings Google reviews into the inbox for up to 3 due connections (first page, newest reviews).
 * New reviews notify the team (coalesced). last_sync_at is stamped even when Google fails, so a broken
 * connection waits its turn instead of blocking the others. Returns how many reviews were new.
 */
export async function syncGoogleReviews(now: Date): Promise<number> {
  const conns = pickReviewConnections(await prisma.platformConnection.findMany({ where: { platform: 'gmb' } }), now);
  let created = 0;
  for (const conn of conns) {
    try {
      const token = await resolveAccessToken(conn);
      const { reviews } = await fetchGmbReviews(conn.platform_account_id, token);
      for (const review of reviews) {
        if (review.name && (await importReview(conn, review))) created++;
      }
    } catch (err) {
      console.error(`[reviews] Google review sync failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
    } finally {
      try {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
      } catch (err) {
        console.error(`[reviews] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
  return created;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/gmb-review-sync.test.ts test/inbox-ingest.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/gmb.ts apps/api/src/lib/gmbReviewSync.ts apps/api/test/gmb-review-sync.test.ts
git commit -m "feat(api): bring Google reviews into the inbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Post metrics, follower snapshots and the cron maintenance run

**Files:**
- Modify: `apps/api/src/services/meta.ts` (follower fetchers; Instagram insights parse), `apps/api/src/routes/cron.ts`, `apps/api/test/cron.test.ts` (axios GET guard)
- Create: `apps/api/src/lib/concurrency.ts`, `apps/api/src/lib/metricsSync.ts`, `apps/api/src/lib/followerSync.ts`, `apps/api/src/lib/cronMaintenance.ts`
- Test: `apps/api/test/metrics-sync.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `isMetricPlatform`, `MetricPlatform`, `prisma.followerSnapshot`.
  - Task 2: `isMockId`, `isMockConnection`.
  - Task 3: `classifyPendingMessages`.
  - Task 4: `syncGoogleReviews`.
  - Existing: `fetchFacebookPostMetrics` (`services/meta.ts`), `fetchGmbPostMetrics` (`services/gmb.ts`), `isSuccessfulResult`, `resolveAccessToken` (`lib/publishDirect.ts`), `sweepVideoJobs`.
- Produces:
  - `services/meta.ts`: `fetchPageFollowers(pageId, accessToken): Promise<number | null>`, `fetchInstagramFollowers(igUserId, accessToken): Promise<number | null>` (null for `mock_` ids/tokens); `fetchInstagramPostMetrics` reads the insights `data` array (same signature).
  - `lib/concurrency.ts`: `forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void>`
  - `lib/metricsSync.ts`: `METRICS_BATCH = 10`, `METRICS_CONCURRENCY = 3`, `METRICS_WINDOW_DAYS = 30`, `METRICS_REFRESH_MS`, `pickMetricsCandidates<T>(posts, now, limit?): T[]`, `fetchPlatformMetrics(platform, platformPostId, accessToken): Promise<Record<string, number>>`, `syncPostMetrics(now: Date): Promise<number>`
  - `lib/followerSync.ts`: `FOLLOWER_BATCH = 5`, `FOLLOWER_TTL_DAYS = 400`, `utcDay(date: Date): string`, `snapshotId(dealerId, platform, day): string`, `syncFollowerSnapshots(now: Date): Promise<number>`
  - `lib/cronMaintenance.ts`: `interface MaintenanceCounts { classified; reviews; metrics; followers }`, `interface MaintenanceLogger { error: (obj: Record<string, unknown>, msg: string) => void }`, `MAINTENANCE_STEP_TIMEOUT_MS = 20_000`, `HEAVY_TICK_EVERY_MINUTES = 10`, `isHeavyTick(now: Date): boolean`, `runMaintenance(now, log, timeoutMs?): Promise<MaintenanceCounts>`
  - HTTP: `POST /v1/cron/publish` answers `maintenance: MaintenanceCounts` as well.

- [ ] **Step 1: Write the failing test** — `apps/api/test/metrics-sync.test.ts`:

```ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import axios from 'axios';
import cronRoutes from '../src/routes/cron.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { isHeavyTick, runMaintenance } from '../src/lib/cronMaintenance.js';
import { snapshotId, syncFollowerSnapshots, utcDay } from '../src/lib/followerSync.js';
import { pickMetricsCandidates, syncPostMetrics } from '../src/lib/metricsSync.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

beforeEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

async function newDealer(): Promise<string> {
  const dealer = await prisma.dealer.create({ data: { name: 'Metrics Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  return dealer.id;
}

const connect = (dealerId: string, platform: string, accountId: string, token = 'page-token') =>
  prisma.platformConnection.create({ data: { dealer_id: dealerId, platform, platform_account_id: accountId, access_token: token, is_connected: true } });

const result = (postId: string) => ({ post_id: postId, url: 'https://example.test/p', published_at: '2026-09-20T10:00:00.000Z' });
type StoredMetrics = Record<string, Record<string, unknown> | undefined>;

describe('pickMetricsCandidates', () => {
  it('takes posts from the last 30 days whose metrics are missing or 6+ hours old, never-fetched first', () => {
    const now = new Date('2026-09-24T10:00:00Z');
    const post = (id: string, publishedDaysAgo: number | null, fetchedHoursAgo: number | null) => ({
      id,
      published_at: publishedDaysAgo === null ? null : new Date(now.getTime() - publishedDaysAgo * DAY),
      metrics_last_fetched: fetchedHoursAgo === null ? null : new Date(now.getTime() - fetchedHoursAgo * HOUR),
    });
    const picked = pickMetricsCandidates([
      post('fresh', 1, 1), post('stale', 2, 7), post('never', 3, null), post('old', 31, null), post('unpublished', null, null), post('staler', 1, 12),
    ], now, 10);
    assert.deepEqual(picked.map((p) => p.id), ['never', 'staler', 'stale']);
  });
});

describe('syncPostMetrics', () => {
  it('merges live Facebook and Instagram metrics, skips mock publishes and stamps every post', async (t) => {
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'page-m1');
    await connect(dealerId, 'instagram', 'ig-m1');
    const published = (data: Record<string, unknown>) => prisma.post.create({
      data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], status: 'published', published_at: new Date(now.getTime() - 2 * DAY), ...data },
    });
    const live = await published({ platforms: ['facebook', 'instagram'], metrics: { facebook: { reach: 1 } }, publish_results: { facebook: result('fb-m1'), instagram: result('ig-media-m1') } });
    const mock = await published({ platforms: ['facebook'], publish_results: { facebook: result('mock_fb_post_1') } });
    const old = await published({ platforms: ['facebook'], published_at: new Date(now.getTime() - 40 * DAY), publish_results: { facebook: result('fb-old') } });
    const urls: string[] = [];
    t.mock.method(axios, 'get', async (url: string) => {
      urls.push(url);
      if (url.endsWith('/fb-m1')) {
        return { data: { insights: { data: [{ name: 'post_reach', values: [{ value: 150 }] }] }, likes: { summary: { total_count: 12 } }, shares: { count: 3 }, comments: { summary: { total_count: 4 } } } };
      }
      if (url.endsWith('/ig-media-m1/insights')) {
        return { data: { data: [
          { name: 'reach', values: [{ value: 90 }] }, { name: 'likes', values: [{ value: 7 }] },
          { name: 'comments', values: [{ value: 2 }] }, { name: 'saved', values: [{ value: 5 }] },
        ] } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    assert.ok((await syncPostMetrics(now)) >= 2);

    const stored = await prisma.post.findUnique({ where: { id: live.id } });
    const metrics = stored?.metrics as StoredMetrics;
    assert.deepEqual([metrics['facebook']?.['reach'], metrics['facebook']?.['likes'], metrics['facebook']?.['shares']], [150, 12, 3]);
    assert.deepEqual([metrics['instagram']?.['reach'], metrics['instagram']?.['likes'], metrics['instagram']?.['saved']], [90, 7, 5]);
    assert.equal(stored?.metrics_last_fetched?.getTime(), now.getTime());
    assert.equal((await prisma.post.findUnique({ where: { id: mock.id } }))?.metrics_last_fetched?.getTime(), now.getTime());
    assert.equal((await prisma.post.findUnique({ where: { id: old.id } }))?.metrics_last_fetched, null);
    assert.ok(urls.every((u) => !u.includes('mock_') && !u.includes('fb-old')));
  });

  it('keeps the previous numbers when a platform fails', async (t) => {
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'page-m2');
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        published_at: new Date(now.getTime() - DAY), metrics: { facebook: { reach: 42 } }, publish_results: { facebook: result('fb-m2') },
      },
    });
    t.mock.method(axios, 'get', async () => { throw new Error('(#100) Unsupported get request'); });
    t.mock.method(console, 'error', () => {});

    await syncPostMetrics(now);

    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal((stored?.metrics as StoredMetrics)['facebook']?.['reach'], 42);
    assert.equal(stored?.metrics_last_fetched?.getTime(), now.getTime());
  });

  it("never uses another dealership's connection", async (t) => {
    const now = new Date();
    const mine = await newDealer();
    await connect(await newDealer(), 'facebook', 'page-m3');
    await prisma.post.create({
      data: {
        dealer_id: mine, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        published_at: new Date(now.getTime() - DAY), publish_results: { facebook: result('fb-m3') },
      },
    });
    const get = t.mock.method(axios, 'get', async () => ({ data: {} }));

    await syncPostMetrics(now);

    assert.equal(get.mock.calls.filter((c) => String(c.arguments[0]).endsWith('/fb-m3')).length, 0);
  });
});

describe('syncFollowerSnapshots', () => {
  it('saves one snapshot per live connection per day and skips mock connections', async (t) => {
    // Connections from the metrics tests above would otherwise take the batch's five slots.
    await prisma.platformConnection.deleteMany({ where: { platform: { in: ['facebook', 'instagram'] } } });
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'page-f1');
    await connect(dealerId, 'instagram', 'ig-f1');
    await connect(await newDealer(), 'facebook', 'mock_fb_page_id', 'mock_fb_page_token');
    const urls: string[] = [];
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      urls.push(url);
      if (url.endsWith('/page-f1')) {
        assert.equal(config.params['fields'], 'followers_count,fan_count');
        return { data: { fan_count: 1500 } };
      }
      if (url.endsWith('/ig-f1')) return { data: { followers_count: 820 } };
      return { data: {} };
    });

    assert.equal(await syncFollowerSnapshots(now), 2);

    const day = utcDay(now);
    const fb = await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'facebook', day) } });
    const ig = await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'instagram', day) } });
    assert.deepEqual([fb?.followers, fb?.captured_on, fb?.platform, ig?.followers], [1500, day, 'facebook', 820]);
    assert.ok(fb?.expires_at && fb.expires_at.getTime() > now.getTime() + 399 * DAY);
    assert.ok(urls.every((u) => !u.includes('mock_')));

    assert.equal(await syncFollowerSnapshots(new Date(now.getTime() + 60_000)), 0);
    assert.equal(urls.length, 2);
  });
});

describe('runMaintenance', () => {
  it('runs metrics and follower counts on 10-minute ticks only', () => {
    assert.equal(isHeavyTick(new Date('2026-09-24T10:00:00Z')), true);
    assert.equal(isHeavyTick(new Date('2026-09-24T10:20:30Z')), true);
    assert.equal(isHeavyTick(new Date('2026-09-24T10:05:00Z')), false);
  });

  it('time-boxes a stuck step and still runs the next one', async (t) => {
    t.mock.method(prisma.inboxMessage, 'findMany', () => new Promise<never>(() => {}));
    const connections = t.mock.method(prisma.platformConnection, 'findMany', async () => []);
    const logged: Array<Record<string, unknown>> = [];

    const counts = await runMaintenance(new Date('2026-09-24T10:05:00Z'), { error: (obj) => { logged.push(obj); } }, 50);

    assert.deepEqual(counts, { classified: 0, reviews: 0, metrics: 0, followers: 0 });
    assert.equal(logged[0]?.['step'], 'classify');
    assert.match(String(logged[0]?.['message']), /timed out/);
    assert.equal(connections.mock.callCount(), 1);
  });

  it('isolates a failing step and logs only its message', async (t) => {
    t.mock.method(prisma.inboxMessage, 'findMany', async () => { throw new Error('Firestore is down'); });
    const logged: Array<Record<string, unknown>> = [];

    const counts = await runMaintenance(new Date('2026-09-24T10:05:00Z'), { error: (obj) => { logged.push(obj); } });

    assert.equal(counts.classified, 0);
    assert.deepEqual(logged.map((l) => [l['step'], l['message']]), [['classify', 'Firestore is down']]);
  });
});

describe('POST /v1/cron/publish maintenance', () => {
  let app: FastifyInstance;
  const originalSecret = process.env['CRON_SECRET'];

  before(async () => {
    delete process.env['CRON_SECRET'];
    app = Fastify();
    await app.register(cronRoutes, { prefix: '/v1/cron' });
    await app.ready();
  });

  after(async () => {
    if (originalSecret !== undefined) process.env['CRON_SECRET'] = originalSecret;
    await app.close();
  });

  it('classifies new messages after publishing and reports the counts', async (t) => {
    const dealerId = await newDealer();
    const message = await prisma.inboxMessage.create({
      data: {
        dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `m-${randomUUID()}`,
        customer_name: 'Ravi', message_text: 'Worst delay ever', received_at: new Date(), needs_classification: true,
      },
    });
    t.mock.method(axios, 'get', async (url: string) => { throw new Error(`unexpected GET ${url}`); });
    const lightTick = Date.parse('2026-09-24T10:03:00.000Z');
    t.mock.timers.enable({ apis: ['Date'], now: lightTick });

    const res = await app.inject({ method: 'POST', url: '/v1/cron/publish' });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { success: boolean; maintenance: { classified: number; reviews: number; metrics: number; followers: number } };
    assert.equal(body.success, true);
    assert.ok(body.maintenance.classified >= 1);
    assert.deepEqual([body.maintenance.metrics, body.maintenance.followers], [0, 0]);
    const stored = await prisma.inboxMessage.findUnique({ where: { id: message.id } });
    assert.deepEqual([stored?.sentiment, stored?.tag], ['negative', 'complaint']);
  });

  it('still answers when maintenance fails', async (t) => {
    t.mock.method(prisma.inboxMessage, 'findMany', async () => { throw new Error('Firestore is down'); });
    const res = await app.inject({ method: 'POST', url: '/v1/cron/publish' });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { maintenance: { classified: number } }).maintenance.classified, 0);
  });
});
```

- [ ] **Step 2: Guard `apps/api/test/cron.test.ts` against real platform calls.** The maintenance run can fetch metrics and follower counts for the Facebook connections and published posts these tests create.
- Change the first import to `import { describe, it, before, after, afterEach, mock } from 'node:test';`.
- In `describe('POST /v1/cron/publish sweep (cron.ts)', …)`:
  - at the start of its `before`, add:

```ts
    // The cron's maintenance run (post metrics, follower counts) must never reach a real platform from these tests.
    mock.method(axios, 'get', async (url: string) => { throw new Error(`unexpected GET ${url}`); });
```

  - at the start of its `after`, add `mock.restoreAll();`.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/metrics-sync.test.ts`
Expected: FAIL (missing modules).

- [ ] **Step 4: `apps/api/src/services/meta.ts`.**

(a) Replace the whole `export async function fetchInstagramPostMetrics(…) { … }` with:

```ts
type InsightRow = { name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } };

// /{id}/insights answers { data: [{ name, values: [{ value }] }] } (or total_value on newer metrics).
function insightValue(rows: InsightRow[] | undefined, name: string): number {
  const row = rows?.find((r) => r.name === name);
  const raw = row?.values?.[0]?.value ?? row?.total_value?.value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

export async function fetchInstagramPostMetrics(
  mediaId: string,
  accessToken: string,
): Promise<{ reach: number; likes: number; comments: number; saved: number }> {
  const res = await axios.get<{ data?: InsightRow[] }>(
    `${META_GRAPH_BASE}/${mediaId}/insights`,
    { params: { metric: 'reach,likes,comments,saved', access_token: accessToken } },
  );
  const rows = res.data.data;
  return {
    reach: insightValue(rows, 'reach'),
    likes: insightValue(rows, 'likes'),
    comments: insightValue(rows, 'comments'),
    saved: insightValue(rows, 'saved'),
  };
}
```

(b) Append:

```ts
// ─── Followers (daily audience snapshots) ─────────────────────────────────────
// Mock connections (local and demo) have no audience: null means "skip".

function followerCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function fetchPageFollowers(pageId: string, accessToken: string): Promise<number | null> {
  if (pageId.startsWith('mock_') || accessToken.startsWith('mock_')) return null;
  const res = await axios.get<{ followers_count?: number; fan_count?: number }>(
    `${META_GRAPH_BASE}/${pageId}`,
    { params: { fields: 'followers_count,fan_count', access_token: accessToken } },
  );
  return followerCount(res.data.followers_count ?? res.data.fan_count);
}

export async function fetchInstagramFollowers(igUserId: string, accessToken: string): Promise<number | null> {
  if (igUserId.startsWith('mock_') || accessToken.startsWith('mock_')) return null;
  const res = await axios.get<{ followers_count?: number }>(
    `${META_GRAPH_BASE}/${igUserId}`,
    { params: { fields: 'followers_count', access_token: accessToken } },
  );
  return followerCount(res.data.followers_count);
}
```

- [ ] **Step 5: `apps/api/src/lib/concurrency.ts`** (moved out of `routes/cron.ts`):

```ts
/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function forEachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}
```

- [ ] **Step 6: `apps/api/src/lib/metricsSync.ts`**

```ts
import type { PlatformConnection, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchGmbPostMetrics } from '../services/gmb.js';
import { fetchFacebookPostMetrics, fetchInstagramPostMetrics } from '../services/meta.js';
import { forEachLimited } from './concurrency.js';
import { isMockConnection, isMockId } from './platformMock.js';
import { isMetricPlatform, type MetricPlatform } from './postMetrics.js';
import { isSuccessfulResult, resolveAccessToken } from './publishDirect.js';

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
  return fetchGmbPostMetrics(platformPostId, accessToken);
}

// Fetches each live platform's numbers into metrics[platform] (the metricsWorker merge pattern) and always
// stamps metrics_last_fetched, so a post that cannot be measured waits its turn instead of blocking the batch.
async function refreshPost(post: Post, connections: Map<string, PlatformConnection>, now: Date): Promise<void> {
  const results = (post.publish_results ?? {}) as Record<string, unknown>;
  const previous = post.metrics && typeof post.metrics === 'object' && !Array.isArray(post.metrics)
    ? (post.metrics as Record<string, unknown>)
    : {};
  const metrics: Record<string, unknown> = { ...previous };
  for (const platform of post.platforms ?? []) {
    if (!isMetricPlatform(platform)) continue;
    const entry = results[platform];
    if (!isSuccessfulResult(entry)) continue;
    const platformPostId = (entry as { post_id: string }).post_id;
    const conn = connections.get(`${post.dealer_id}:${platform}`);
    if (isMockId(platformPostId) || !conn || isMockConnection(conn)) continue;
    try {
      const token = await resolveAccessToken(conn);
      metrics[platform] = { ...(await fetchPlatformMetrics(platform, platformPostId, token)), fetched_at: now.toISOString() };
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
  const byKey = new Map(connections.map((c) => [`${c.dealer_id}:${c.platform}`, c]));

  let refreshed = 0;
  await forEachLimited(due, METRICS_CONCURRENCY, async (post) => {
    try {
      await refreshPost(post, byKey, now);
      refreshed++;
    } catch (err) {
      console.error(`[metrics] Could not refresh post ${post.id}:`, err instanceof Error ? err.message : String(err));
    }
  });
  return refreshed;
}
```

- [ ] **Step 7: `apps/api/src/lib/followerSync.ts`**

```ts
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { fetchInstagramFollowers, fetchPageFollowers } from '../services/meta.js';
import { isMockConnection } from './platformMock.js';
import { resolveAccessToken } from './publishDirect.js';

export const FOLLOWER_BATCH = 5;
export const FOLLOWER_TTL_DAYS = 400;
const FOLLOWER_PLATFORMS = ['facebook', 'instagram'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day, YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function snapshotId(dealerId: string, platform: string, day: string): string {
  return `${dealerId}_${platform}_${day}`;
}

/**
 * Cron step: today's follower count for up to 5 live Facebook/Instagram connections that have none yet.
 * Uses the connection's own (page) token. Each attempt stamps the connection's last_sync_at, and the
 * least recently tried go first, so a failing connection cannot starve the others. Returns snapshots saved.
 */
export async function syncFollowerSnapshots(now: Date): Promise<number> {
  const day = utcDay(now);
  const live = (await prisma.platformConnection.findMany({ where: { platform: { in: FOLLOWER_PLATFORMS } } }))
    .filter((c) => c.is_connected && !isMockConnection(c));
  if (live.length === 0) return 0;

  const idOf = (c: PlatformConnection) => snapshotId(c.dealer_id, c.platform, day);
  const taken = new Set((await prisma.followerSnapshot.findMany({ where: { id: { in: live.map(idOf) } } })).map((s) => s.id));
  const due = live
    .filter((c) => !taken.has(idOf(c)))
    .sort((a, b) => (a.last_sync_at?.getTime() ?? 0) - (b.last_sync_at?.getTime() ?? 0))
    .slice(0, FOLLOWER_BATCH);

  let saved = 0;
  for (const conn of due) {
    try {
      const token = await resolveAccessToken(conn);
      const followers = conn.platform === 'facebook'
        ? await fetchPageFollowers(conn.platform_account_id, token)
        : await fetchInstagramFollowers(conn.platform_account_id, token);
      if (followers !== null) {
        const id = idOf(conn);
        await prisma.followerSnapshot.upsert({
          where: { id },
          create: {
            id, dealer_id: conn.dealer_id, platform: conn.platform, followers, captured_on: day,
            expires_at: new Date(now.getTime() + FOLLOWER_TTL_DAYS * DAY_MS),
          },
          update: { followers },
        });
        saved++;
      }
    } catch (err) {
      console.error(`[followers] ${conn.platform} follower count failed for connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
    } finally {
      try {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { last_sync_at: now } });
      } catch (err) {
        console.error(`[followers] Could not stamp connection ${conn.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
  return saved;
}
```

- [ ] **Step 8: `apps/api/src/lib/cronMaintenance.ts`**

```ts
import { syncFollowerSnapshots } from './followerSync.js';
import { syncGoogleReviews } from './gmbReviewSync.js';
import { classifyPendingMessages } from './inboxClassifier.js';
import { syncPostMetrics } from './metricsSync.js';

export interface MaintenanceCounts {
  classified: number;
  reviews: number;
  metrics: number;
  followers: number;
}

export interface MaintenanceLogger {
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export const MAINTENANCE_STEP_TIMEOUT_MS = 20_000;
export const HEAVY_TICK_EVERY_MINUTES = 10;

/** Post metrics and follower counts scan every published post or Meta connection, so they run every 10th minute. */
export function isHeavyTick(now: Date): boolean {
  return now.getUTCMinutes() % HEAVY_TICK_EVERY_MINUTES === 0;
}

async function step(name: string, run: () => Promise<number>, log: MaintenanceLogger, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<number>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    log.error({ step: name, message: err instanceof Error ? err.message : String(err) }, '[cron] maintenance step failed');
    return 0;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Inbox and analytics upkeep for the every-minute cron: classify new messages, sync Google reviews,
 * then (every 10th minute) refresh post metrics and snapshot follower counts. Steps run one after
 * another; each is isolated and time-boxed, so none can fail or stall the publish sweep.
 */
export async function runMaintenance(now: Date, log: MaintenanceLogger, timeoutMs = MAINTENANCE_STEP_TIMEOUT_MS): Promise<MaintenanceCounts> {
  const classified = await step('classify', () => classifyPendingMessages(), log, timeoutMs);
  const reviews = await step('reviews', () => syncGoogleReviews(now), log, timeoutMs);
  const heavy = isHeavyTick(now);
  const metrics = heavy ? await step('metrics', () => syncPostMetrics(now), log, timeoutMs) : 0;
  const followers = heavy ? await step('followers', () => syncFollowerSnapshots(now), log, timeoutMs) : 0;
  return { classified, reviews, metrics, followers };
}
```

- [ ] **Step 9: `apps/api/src/routes/cron.ts`.**

(a) Add imports:

```ts
import { forEachLimited } from '../lib/concurrency.js';
import { runMaintenance, type MaintenanceCounts } from '../lib/cronMaintenance.js';
```

(b) Delete the local `async function forEachLimited…` (now in `lib/concurrency.ts`). Below `export const STUCK_PUBLISHING_ERROR = …;` add:

```ts
const NO_MAINTENANCE: MaintenanceCounts = { classified: 0, reviews: 0, metrics: 0, followers: 0 };
```

(c) Directly after the `const videoSweep = sweepVideoJobs(now).catch(…);` statement add:

```ts
    // Inbox and analytics upkeep (classification, Google reviews, post metrics, follower counts). Started with
    // the reel sweep and awaited after publishing; runMaintenance isolates and time-boxes every step.
    const maintenance = runMaintenance(now, {
      error: (obj, msg) => fastify.log.error(obj, msg),
    }).catch((err: unknown) => {
      fastify.log.error({ message: err instanceof Error ? err.message : String(err) }, '[cron] maintenance failed');
      return NO_MAINTENANCE;
    });
```

(d) Replace everything from `const videoJobs = await videoSweep;` to the end of the handler's `return` statement with:

```ts
    const videoJobs = await videoSweep;
    const maintenanceCounts = await maintenance;
    const maintained = Object.values(maintenanceCounts).some((n) => n > 0);

    if (processed || skipped || recovered.length || videoJobs.ran.length || videoJobs.expired.length || maintained) {
      fastify.log.info(
        { results, skipped, recovered, videoJobs, maintenance: maintenanceCounts },
        `[cron] published ${processed} scheduled posts`,
      );
    }
    return { success: true, processed, skipped, recovered: recovered.length, results, videoJobs, maintenance: maintenanceCounts };
```

- [ ] **Step 10: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/metrics-sync.test.ts test/cron.test.ts test/workers.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean. (`workers.test.ts` still covers the BullMQ metrics worker, which is unchanged.)

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/services/meta.ts apps/api/src/lib/concurrency.ts apps/api/src/lib/metricsSync.ts apps/api/src/lib/followerSync.ts apps/api/src/lib/cronMaintenance.ts apps/api/src/routes/cron.ts apps/api/test/metrics-sync.test.ts apps/api/test/cron.test.ts
git commit -m "feat(api): collect post metrics and follower counts in the cron

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Analytics endpoints and Dashboard reach

**Files:**
- Create: `apps/api/src/lib/dealerAnalytics.ts`, `apps/api/src/routes/dealerAnalytics.ts`
- Modify: `apps/api/src/routes/dealer.ts` (remove `/analytics`; Dashboard reach and published counts), `apps/api/src/index.ts`, `apps/api/test/post-stats.test.ts`
- Test: `apps/api/test/dealer-analytics.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `postMetricsBags`, `addBags`, `emptyBag`, `isMetricPlatform`, `totalReach`, `MetricsBag`, `MetricPlatform`.
  - Task 2: `firstCreativeUrl`.
  - Task 5: `utcDay`.
  - Existing: `requirePermissionHook`, `PERMISSIONS.VIEW_REPORTS`.
- Produces:
  - `lib/dealerAnalytics.ts`:
    - `DAY_MS`, `ANALYTICS_DAYS = [7, 30, 90] as const`, `round1(n)`
    - `interface EngagementByTypeRow { type: 'image' | 'reel'; posts: number; reach: number; engagementRate: number }`, `engagementByType(posts): EngagementByTypeRow[]`
    - `interface FollowerTrendRow { platform: string; current: number; delta: number | null }`, `followerTrend(snapshots): FollowerTrendRow[]`
    - `interface ReviewSummary { avgRating: number | null; responseRate: number | null; avgResponseMinutes: number | null; totalReviews: number }`, `reviewSummary(reviews): ReviewSummary`
    - `interface ReviewTrendRow { label: string; month: string; avgRating: number | null; totalReviews: number; responded: number }`, `trendStart(now): Date`, `reviewTrend(reviews, now): ReviewTrendRow[]`
    - `type PerformanceBag = MetricsBag & { inboxMessages: number }`, `interface PostMetricRow`, `interface PostPerformance { posts; byPlatform; totals }`, `postPerformance(posts, messages, platform?): PostPerformance`
  - HTTP:
    - `GET /v1/dealer/analytics` (authenticated) → `{ success, engagementByType, followerTrend, reviewSummary, reviewTrend }`.
    - `GET /v1/dealer/analytics/posts?days=7|30|90&platform=facebook|instagram|gmb` (`view_reports`) → `{ success, posts, byPlatform, totals }`; 400 `INVALID_INPUT` for other values.
    - `GET /v1/dealer/dashboard` → `stats.totalReach` from `totalReach()`; `stats.publishedThisMonth`, `stats.publishedChange` added.

- [ ] **Step 1: Write the failing test** — `apps/api/test/dealer-analytics.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { engagementByType, followerTrend, postPerformance, reviewSummary, reviewTrend, trendStart } from '../src/lib/dealerAnalytics.js';
import { utcDay } from '../src/lib/followerSync.js';
import { resolvePermissions, type JwtUser, type Permission } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const DAY = 86_400_000;

async function dealer() {
  const d = await prisma.dealer.create({ data: { name: 'Analytics Motors', city: 'Surat', phone: `phone-${randomUUID()}` } });
  return d.id;
}

function headers(dealerId: string, role: 'admin' | 'user' = 'admin', overrides: Partial<Record<Permission, boolean>> = {}) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const publishedPost = (dealerId: string, data: Record<string, unknown>) => prisma.post.create({
  data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published', published_at: new Date(), ...data },
});

describe('analytics builders', () => {
  it('groups engagement by format and leaves out formats without reach', () => {
    assert.deepEqual(engagementByType([
      { media_type: 'image', metrics: { facebook: { reach: 100, likes: 5, comments: 3 } } },
      { media_type: 'image', metrics: null },
      { media_type: 'video', metrics: { instagram: { reach: 50, likes: 5, saved: 5 } } },
    ]), [
      { type: 'reel', posts: 1, reach: 50, engagementRate: 20 },
      { type: 'image', posts: 2, reach: 100, engagementRate: 8 },
    ]);
    assert.deepEqual(engagementByType([{ media_type: 'image', metrics: null }]), []);
  });

  it('reports follower counts with a 30-day change', () => {
    assert.deepEqual(followerTrend([
      { platform: 'instagram', followers: 820, captured_on: '2026-09-24' },
      { platform: 'facebook', followers: 1100, captured_on: '2026-09-24' },
      { platform: 'facebook', followers: 1000, captured_on: '2026-09-01' },
    ]), [
      { platform: 'facebook', current: 1100, delta: 100 },
      { platform: 'instagram', current: 820, delta: null },
    ]);
  });

  it('summarises reviews: average stars, response rate and response time', () => {
    const at = (iso: string) => new Date(iso);
    assert.deepEqual(reviewSummary([
      { rating: 5, received_at: at('2026-09-20T10:00:00Z'), replied_at: at('2026-09-20T10:30:00Z') },
      { rating: 4, received_at: at('2026-09-21T10:00:00Z'), replied_at: at('2026-09-21T11:30:00Z') },
      { rating: 2, received_at: at('2026-09-22T10:00:00Z'), replied_at: null },
    ]), { avgRating: 3.7, responseRate: 67, avgResponseMinutes: 60, totalReviews: 3 });
    assert.deepEqual(reviewSummary([]), { avgRating: null, responseRate: null, avgResponseMinutes: null, totalReviews: 0 });
  });

  it('builds a three-month review trend across a year boundary', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    assert.deepEqual(reviewTrend([
      { rating: 5, received_at: new Date('2025-11-03T10:00:00Z'), replied_at: new Date('2025-11-03T12:00:00Z') },
      { rating: 3, received_at: new Date('2026-01-02T10:00:00Z'), replied_at: null },
      { rating: 4, received_at: new Date('2025-10-30T10:00:00Z'), replied_at: null },
    ], now), [
      { label: 'Nov', month: '2025-11', avgRating: 5, totalReviews: 1, responded: 1 },
      { label: 'Dec', month: '2025-12', avgRating: null, totalReviews: 0, responded: 0 },
      { label: 'Jan', month: '2026-01', avgRating: 3, totalReviews: 1, responded: 0 },
    ]);
    assert.deepEqual(reviewTrend([], now), []);
    assert.equal(trendStart(now).toISOString(), '2025-11-01T00:00:00.000Z');
  });

  it('builds per-post performance, one platform when filtered', () => {
    const base = { caption_text: null, prompt_text: 'p', thumbnail_url: null, creative_urls: null, published_at: new Date('2026-09-20T10:00:00Z') };
    const posts = [
      { ...base, id: 'a', platforms: ['facebook', 'gmb'], metrics: { facebook: { reach: 100, likes: 10 }, gmb: { views: 40, clicks: 2 } }, creative_urls: { facebook: 'https://cdn.test/a.jpg' } },
      { ...base, id: 'b', platforms: ['facebook'], caption_text: 'Second', metrics: { facebook: { reach: 300, likes: 1 } } },
    ];
    const messages = [
      { post_id: 'a', platform: 'facebook' }, { post_id: 'a', platform: 'gmb' },
      { post_id: 'b', platform: 'facebook' }, { post_id: null, platform: 'facebook' },
    ];

    const all = postPerformance(posts, messages);
    assert.deepEqual(all.posts.map((p) => [p.id, p.reach, p.inboxMessages]), [['b', 300, 1], ['a', 140, 2]]);
    assert.deepEqual([all.posts[1]!.caption, all.posts[1]!.thumbnail, all.posts[0]!.caption], ['p', 'https://cdn.test/a.jpg', 'Second']);
    assert.deepEqual([all.totals.reach, all.totals.likes, all.totals.inboxMessages], [440, 11, 3]);
    assert.deepEqual([all.byPlatform.facebook?.reach, all.byPlatform.gmb?.reach, all.byPlatform.gmb?.inboxMessages], [400, 40, 1]);

    const gmbOnly = postPerformance([posts[0]!], messages, 'gmb');
    assert.deepEqual([gmbOnly.posts[0]!.reach, gmbOnly.posts[0]!.views, gmbOnly.posts[0]!.inboxMessages], [40, 40, 1]);
    assert.deepEqual(Object.keys(gmbOnly.byPlatform), ['gmb']);
  });
});

describe('GET /v1/dealer/analytics', () => {
  it('reports engagement, followers and reviews for the dealership only, to every role', async () => {
    const dealerId = await dealer();
    const other = await dealer();
    const now = Date.now();
    await publishedPost(dealerId, { published_at: new Date(now - 3 * DAY), metrics: { facebook: { reach: 200, likes: 10, comments: 5, shares: 5 } } });
    await publishedPost(dealerId, { published_at: new Date(now - 45 * DAY), metrics: { facebook: { reach: 9999, likes: 1 } } });
    await publishedPost(other, { metrics: { facebook: { reach: 500, likes: 50 } } });
    await prisma.followerSnapshot.create({ data: { id: `${dealerId}_facebook_a`, dealer_id: dealerId, platform: 'facebook', followers: 1000, captured_on: utcDay(new Date(now - 20 * DAY)) } });
    await prisma.followerSnapshot.create({ data: { id: `${dealerId}_facebook_b`, dealer_id: dealerId, platform: 'facebook', followers: 1080, captured_on: utcDay(new Date(now)) } });
    const received = new Date(now - 40 * 60_000);
    const inbox = (data: Record<string, unknown>) => prisma.inboxMessage.create({
      data: { dealer_id: dealerId, platform: 'gmb', message_type: 'review', platform_message_id: `r-${randomUUID()}`, customer_name: 'Asha', message_text: 'Nice', received_at: received, ...data },
    });
    await inbox({ rating: 5, replied_at: new Date(received.getTime() + 30 * 60_000) });
    await inbox({ rating: 3 });
    await inbox({ platform: 'facebook', message_type: 'comment', replied_at: new Date() });

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: headers(dealerId, 'user') });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      engagementByType: unknown; followerTrend: unknown; reviewSummary: unknown;
      reviewTrend: Array<{ totalReviews: number; responded: number }>;
    };
    assert.deepEqual(body.engagementByType, [{ type: 'image', posts: 1, reach: 200, engagementRate: 10 }]);
    assert.deepEqual(body.followerTrend, [{ platform: 'facebook', current: 1080, delta: 80 }]);
    assert.deepEqual(body.reviewSummary, { avgRating: 4, responseRate: 50, avgResponseMinutes: 30, totalReviews: 2 });
    assert.equal(body.reviewTrend.length, 3);
    assert.deepEqual([body.reviewTrend[2]!.totalReviews, body.reviewTrend[2]!.responded], [2, 1]);
  });

  it('is empty, not invented, for a new dealership', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: headers(await dealer()) });
    assert.deepEqual(res.json(), {
      success: true, engagementByType: [], followerTrend: [], reviewTrend: [],
      reviewSummary: { avgRating: null, responseRate: null, avgResponseMinutes: null, totalReviews: 0 },
    });
  });
});

describe('GET /v1/dealer/analytics/posts', () => {
  it('validates days and platform', async () => {
    const h = headers(await dealer());
    for (const url of ['/v1/dealer/analytics/posts?days=14', '/v1/dealer/analytics/posts?days=abc', '/v1/dealer/analytics/posts?platform=twitter']) {
      const res = await fastify.inject({ method: 'GET', url, headers: h });
      assert.equal(res.statusCode, 400, url);
    }
  });

  it('needs view_reports', async () => {
    const dealerId = await dealer();
    assert.equal((await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts', headers: headers(dealerId, 'user') })).statusCode, 403);
    assert.equal((await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts', headers: headers(dealerId, 'user', { view_reports: true }) })).statusCode, 200);
  });

  it("returns the window's posts by reach with inbox counts, one platform when filtered", async () => {
    const dealerId = await dealer();
    const now = Date.now();
    const small = await publishedPost(dealerId, { platforms: ['facebook', 'instagram'], metrics: { facebook: { reach: 50, likes: 2 }, instagram: { reach: 70, likes: 9 } } });
    const big = await publishedPost(dealerId, { metrics: { facebook: { reach: 300, likes: 20, comments: 4 } } });
    await publishedPost(dealerId, { published_at: new Date(now - 10 * DAY), metrics: { facebook: { reach: 1000 } } });
    await publishedPost(await dealer(), { metrics: { facebook: { reach: 5000 } } });
    await prisma.inboxMessage.create({
      data: { dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `c-${randomUUID()}`, customer_name: 'R', message_text: 'Price?', received_at: new Date(), post_id: big.id },
    });

    const week = (await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts?days=7', headers: headers(dealerId) })).json() as {
      posts: Array<{ id: string; reach: number; inboxMessages: number }>; totals: { reach: number; inboxMessages: number };
    };
    assert.deepEqual(week.posts.map((p) => [p.id, p.reach, p.inboxMessages]), [[big.id, 300, 1], [small.id, 120, 0]]);
    assert.deepEqual([week.totals.reach, week.totals.inboxMessages], [420, 1]);

    const insta = (await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts?days=30&platform=instagram', headers: headers(dealerId) })).json() as {
      posts: Array<{ id: string; reach: number; likes: number }>;
    };
    assert.deepEqual(insta.posts.map((p) => [p.id, p.reach, p.likes]), [[small.id, 70, 9]]);
  });
});

describe('GET /v1/dealer/dashboard', () => {
  it('counts Google views in total reach and reports posts published this month', async () => {
    const dealerId = await dealer();
    await publishedPost(dealerId, { platforms: ['facebook', 'instagram', 'gmb'], metrics: { facebook: { reach: 100 }, instagram: { reach: 50 }, gmb: { views: 40 } } });
    await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'draft', caption_hashtags: [], platforms: ['facebook'], status: 'draft' } });

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/dashboard', headers: headers(dealerId) });

    const { stats } = res.json() as { stats: { totalReach: number; postsThisMonth: number; publishedThisMonth: number; publishedChange: number } };
    assert.deepEqual([stats.totalReach, stats.postsThisMonth, stats.publishedThisMonth, stats.publishedChange], [190, 2, 1, 1]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/dealer-analytics.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/dealerAnalytics.js'`).

- [ ] **Step 3: `apps/api/src/lib/dealerAnalytics.ts`**

```ts
import type { FollowerSnapshot, InboxMessage, Post } from '../generated/client/index.js';
import { firstCreativeUrl } from './inboxView.js';
import { addBags, emptyBag, postMetricsBags, type MetricPlatform, type MetricsBag } from './postMetrics.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ANALYTICS_DAYS = [7, 30, 90] as const;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Engagement by post type ─────────────────────────────────────────────────

export interface EngagementByTypeRow { type: 'image' | 'reel'; posts: number; reach: number; engagementRate: number }

/**
 * Published posts grouped by format (video posts are reels), rate = engagement ÷ reach × 100 (1 decimal).
 * Formats whose posts have no reach yet are left out, so the page shows its empty state instead of 0% bars.
 */
export function engagementByType(posts: Array<Pick<Post, 'media_type' | 'metrics'>>): EngagementByTypeRow[] {
  const groups = new Map<'image' | 'reel', { posts: number; bag: MetricsBag }>();
  for (const post of posts) {
    const type = post.media_type === 'video' ? 'reel' : 'image';
    const group = groups.get(type) ?? { posts: 0, bag: emptyBag() };
    group.posts += 1;
    group.bag = addBags(group.bag, postMetricsBags(post.metrics).total);
    groups.set(type, group);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.bag.reach > 0)
    .map(([type, g]) => ({ type, posts: g.posts, reach: g.bag.reach, engagementRate: round1((g.bag.engagement / g.bag.reach) * 100) }))
    .sort((a, b) => b.engagementRate - a.engagementRate);
}

// ─── Followers ───────────────────────────────────────────────────────────────

export interface FollowerTrendRow { platform: string; current: number; delta: number | null }

const PLATFORM_ORDER = ['facebook', 'instagram'];

/** The latest count per platform, and its change since the oldest snapshot in the window (null with only one). */
export function followerTrend(snapshots: Array<Pick<FollowerSnapshot, 'platform' | 'followers' | 'captured_on'>>): FollowerTrendRow[] {
  const byPlatform = new Map<string, Array<Pick<FollowerSnapshot, 'followers' | 'captured_on'>>>();
  for (const s of snapshots) byPlatform.set(s.platform, [...(byPlatform.get(s.platform) ?? []), s]);
  const rank = (platform: string) => (PLATFORM_ORDER.indexOf(platform) + 1) || PLATFORM_ORDER.length + 1;
  return [...byPlatform.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([platform, rows]) => {
      const sorted = [...rows].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
      const oldest = sorted[0]!;
      const latest = sorted[sorted.length - 1]!;
      return { platform, current: latest.followers, delta: sorted.length > 1 ? latest.followers - oldest.followers : null };
    });
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface ReviewSummary { avgRating: number | null; responseRate: number | null; avgResponseMinutes: number | null; totalReviews: number }
export interface ReviewTrendRow { label: string; month: string; avgRating: number | null; totalReviews: number; responded: number }

type ReviewRow = Pick<InboxMessage, 'rating' | 'received_at' | 'replied_at'>;

/** Average stars (1 decimal), share replied (%), mean minutes to reply, and the count. */
export function reviewSummary(reviews: ReviewRow[]): ReviewSummary {
  const rated = reviews.filter((r) => typeof r.rating === 'number' && r.rating > 0);
  const minutes = reviews
    .filter((r): r is ReviewRow & { replied_at: Date } => r.replied_at !== null)
    .map((r) => Math.max(0, (r.replied_at.getTime() - r.received_at.getTime()) / 60_000));
  return {
    avgRating: rated.length ? round1(rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) : null,
    responseRate: reviews.length ? Math.round((minutes.length / reviews.length) * 100) : null,
    avgResponseMinutes: minutes.length ? Math.round(minutes.reduce((sum, m) => sum + m, 0) / minutes.length) : null,
    totalReviews: reviews.length,
  };
}

/** The first day (UTC) of the month two months before `now`: the start of the 3-month trend. */
export function trendStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
}

/** This calendar month and the two before it (UTC), oldest first. Empty when none of them has a review. */
export function reviewTrend(reviews: ReviewRow[], now: Date): ReviewTrendRow[] {
  const rows: ReviewTrendRow[] = [];
  for (let back = 2; back >= 0; back--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const inMonth = reviews.filter((r) => r.received_at >= start && r.received_at < end);
    rows.push({
      label: start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      avgRating: reviewSummary(inMonth).avgRating,
      totalReviews: inMonth.length,
      responded: inMonth.filter((r) => r.replied_at).length,
    });
  }
  return rows.some((r) => r.totalReviews > 0) ? rows : [];
}

// ─── Post performance ────────────────────────────────────────────────────────

export type PerformanceBag = MetricsBag & { inboxMessages: number };

export interface PostMetricRow extends PerformanceBag {
  id: string;
  caption: string;
  platforms: string[];
  thumbnail: string | null;
  publishedAt: string | null;
}

export interface PostPerformance {
  posts: PostMetricRow[];
  byPlatform: Partial<Record<MetricPlatform, PerformanceBag>>;
  totals: PerformanceBag;
}

type PerformancePost = Pick<Post, 'id' | 'caption_text' | 'prompt_text' | 'platforms' | 'thumbnail_url' | 'creative_urls' | 'published_at' | 'metrics'>;
type LinkedMessage = Pick<InboxMessage, 'post_id' | 'platform'>;

const zeroPerformance = (): PerformanceBag => ({ ...emptyBag(), inboxMessages: 0 });

/**
 * Per-post numbers (sorted by reach, highest first), per-platform totals and overall totals.
 * With `platform`, each post counts that platform's numbers and inbox messages only.
 */
export function postPerformance(posts: PerformancePost[], messages: LinkedMessage[], platform?: MetricPlatform): PostPerformance {
  const inboxByPost = new Map<string, Map<string, number>>();
  for (const m of messages) {
    if (!m.post_id) continue;
    const perPlatform = inboxByPost.get(m.post_id) ?? new Map<string, number>();
    perPlatform.set(m.platform, (perPlatform.get(m.platform) ?? 0) + 1);
    inboxByPost.set(m.post_id, perPlatform);
  }

  const byPlatform: Partial<Record<MetricPlatform, PerformanceBag>> = {};
  let totals = zeroPerformance();
  const rows = posts.map((post): PostMetricRow => {
    const bags = postMetricsBags(post.metrics, platform);
    const inbox = inboxByPost.get(post.id) ?? new Map<string, number>();
    const inboxMessages = platform ? inbox.get(platform) ?? 0 : [...inbox.values()].reduce((sum, n) => sum + n, 0);
    for (const [name, bag] of Object.entries(bags.byPlatform) as Array<[MetricPlatform, MetricsBag]>) {
      const previous = byPlatform[name] ?? zeroPerformance();
      byPlatform[name] = { ...addBags(previous, bag), inboxMessages: previous.inboxMessages + (inbox.get(name) ?? 0) };
    }
    totals = { ...addBags(totals, bags.total), inboxMessages: totals.inboxMessages + inboxMessages };
    return {
      id: post.id,
      caption: post.caption_text || post.prompt_text || '',
      platforms: post.platforms ?? [],
      thumbnail: post.thumbnail_url || firstCreativeUrl(post.creative_urls) || null,
      publishedAt: post.published_at ? post.published_at.toISOString() : null,
      ...bags.total,
      inboxMessages,
    };
  });
  rows.sort((a, b) => b.reach - a.reach);
  return { posts: rows, byPlatform, totals };
}
```

- [ ] **Step 4: `apps/api/src/routes/dealerAnalytics.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import {
  ANALYTICS_DAYS, DAY_MS, engagementByType, followerTrend, postPerformance, reviewSummary, reviewTrend, trendStart,
} from '../lib/dealerAnalytics.js';
import { utcDay } from '../lib/followerSync.js';
import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';
import { isMetricPlatform } from '../lib/postMetrics.js';

const INVALID = (message: string) => ({ error: { code: 'INVALID_INPUT', message } });

// Registered under /v1/dealer, next to routes/dealer.ts.
export default async function dealerAnalyticsRoutes(fastify: FastifyInstance) {
  // GET /v1/dealer/analytics — engagement by post type, follower growth and review health over the
  // last 30 days, plus a 3-month review trend. Open to every signed-in user: the Dashboard shows it to all roles.
  fastify.get('/analytics', { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!;
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [posts, reviews, snapshots] = await Promise.all([
      prisma.post.findMany({ where: { dealer_id, status: 'published', published_at: { gte: since } } }),
      prisma.inboxMessage.findMany({ where: { dealer_id, message_type: 'review', received_at: { gte: trendStart(now) } } }),
      prisma.followerSnapshot.findMany({ where: { dealer_id, captured_on: { gte: utcDay(since) } } }),
    ]);
    return {
      success: true,
      engagementByType: engagementByType(posts),
      followerTrend: followerTrend(snapshots),
      reviewSummary: reviewSummary(reviews.filter((r) => r.received_at >= since)),
      reviewTrend: reviewTrend(reviews, now),
    };
  });

  // GET /v1/dealer/analytics/posts?days=7|30|90&platform=facebook|instagram|gmb — per-post reach and engagement
  fastify.get('/analytics/posts', {
    preHandler: [fastify.authenticate, requirePermissionHook(PERMISSIONS.VIEW_REPORTS)],
  }, async (request, reply) => {
    const query = request.query as { days?: string; platform?: string };
    const days = query.days === undefined ? 30 : Number(query.days);
    if (!(ANALYTICS_DAYS as readonly number[]).includes(days)) return reply.code(400).send(INVALID('days must be 7, 30 or 90'));
    const platform = query.platform === undefined ? undefined : isMetricPlatform(query.platform) ? query.platform : null;
    if (platform === null) return reply.code(400).send(INVALID('platform must be facebook, instagram or gmb'));

    const dealer_id = request.user.dealer_id!;
    const since = new Date(Date.now() - days * DAY_MS);
    const posts = (await prisma.post.findMany({ where: { dealer_id, status: 'published', published_at: { gte: since } } }))
      .filter((p) => !platform || (p.platforms ?? []).includes(platform));
    const ids = posts.map((p) => p.id);
    const messages = ids.length ? await prisma.inboxMessage.findMany({ where: { dealer_id, post_id: { in: ids } } }) : [];
    return { success: true, ...postPerformance(posts, messages, platform) };
  });
}
```

- [ ] **Step 5: `apps/api/src/routes/dealer.ts`.**

(a) Add `import { totalReach as postReach } from '../lib/postMetrics.js';` after the `getUpcomingFestivals` import.

(b) Delete the whole `// GET /v1/dealer/analytics — dashboard insights…` route (now `routes/dealerAnalytics.ts`).

(c) Replace the whole `// GET /v1/dealer/dashboard` route with:

```ts
  // GET /v1/dealer/dashboard — stats + recent posts + upcoming festivals + active boosts
  fastify.get('/dashboard', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);

    // Fetch dealer's profile to resolve their city/state for regional festivals
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealer_id },
      select: { city: true, state: true },
    });

    const [
      postsThisMonth,
      postsLastMonth,
      publishedPosts,
      leadsThisMonth,
      leadsLastWeek,
      inboxPending,
      negativeReviews,
      recentPosts,
      activeBoosts,
    ] = await Promise.all([
      prisma.post.count({ where: { dealer_id, created_at: { gte: monthStart } } }),
      prisma.post.count({ where: { dealer_id, created_at: { gte: lastMonthStart, lt: monthStart } } }),
      prisma.post.findMany({ where: { dealer_id, status: 'published' }, select: { metrics: true, published_at: true } }),
      prisma.lead.count({ where: { dealer_id, created_at: { gte: monthStart } } }),
      prisma.lead.count({ where: { dealer_id, created_at: { gte: weekStart } } }),
      prisma.inboxMessage.count({ where: { dealer_id, is_read: false } }),
      prisma.inboxMessage.count({ where: { dealer_id, sentiment: 'negative', is_read: false } }),
      prisma.post.findMany({
        where: { dealer_id },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, prompt_text: true, platforms: true, status: true, scheduled_at: true, published_at: true, created_at: true },
      }),
      prisma.boostCampaign.findMany({
        where: { dealer_id, status: 'active' },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: { id: true, daily_budget: true, duration_days: true, total_spent: true, end_date: true, metrics: true, post_id: true },
      }),
    ]);

    const upcomingFestivals = getUpcomingFestivals(dealer?.city, dealer?.state, 3);

    // Facebook + Instagram reach plus Google Business Profile views (lib/postMetrics.ts), as Analytics counts it.
    const totalReach = publishedPosts.reduce((sum, p) => sum + postReach(p.metrics), 0);
    const publishedBetween = (from: Date, to?: Date) =>
      publishedPosts.filter((p) => p.published_at && p.published_at >= from && (!to || p.published_at < to)).length;
    const publishedThisMonth = publishedBetween(monthStart);

    return {
      success: true,
      stats: {
        postsThisMonth,
        postsChange: postsThisMonth - postsLastMonth,
        publishedThisMonth,
        publishedChange: publishedThisMonth - publishedBetween(lastMonthStart, monthStart),
        totalReach,
        leadsGenerated: leadsThisMonth,
        leadsThisWeek: leadsLastWeek,
        inboxPending,
        negativeReviews,
      },
      recentPosts,
      upcomingFestivals,
      activeBoosts,
    };
  });
```

- [ ] **Step 6: `apps/api/src/index.ts`.** Add `import dealerAnalyticsRoutes from './routes/dealerAnalytics.js';` after the `dealerRoutes` import, and register it right after `dealerRoutes`:

```ts
fastify.register(dealerAnalyticsRoutes, { prefix: '/v1/dealer' });
```

- [ ] **Step 7: `apps/api/test/post-stats.test.ts`.** Delete the whole `describe('GET /v1/dealer/analytics', …)` block (its three cases). `dealer-analytics.test.ts` now covers that endpoint with the new response shape.

- [ ] **Step 8: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/dealer-analytics.test.ts test/post-stats.test.ts test/security-routes.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/lib/dealerAnalytics.ts apps/api/src/routes/dealerAnalytics.ts apps/api/src/routes/dealer.ts apps/api/src/index.ts apps/api/test/dealer-analytics.test.ts apps/api/test/post-stats.test.ts
git commit -m "feat(api): dealer analytics from collected metrics, and one reach figure everywhere

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Usage events and idempotent leads

**Files:**
- Create: `apps/api/src/lib/events.ts`, `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/routes/leads.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/events.test.ts`, `apps/api/test/leads.test.ts`

**Interfaces:**
- Consumes: Task 1 `prisma.event`; existing `requirePermissionHook`, `PERMISSIONS.REPLY_INBOX`; the global rate limiter (per user, keyed in `src/index.ts`) with a per-route `config.rateLimit`.
- Produces:
  - `lib/events.ts`:
    - `EVENT_ACTIONS`, `type EventAction`, `isEventAction(value: unknown): value is EventAction`
    - `EVENT_TTL_DAYS = 365`, `EVENT_META_MAX_KEYS = 10`, `EVENT_META_MAX_STRING = 200`
    - `type EventMeta = Record<string, string | number | boolean>`
    - `eventMeta(fields: Record<string, unknown>): { ok: true; meta: EventMeta } | { ok: false; message: string }`
  - HTTP:
    - `POST /v1/events { action, ...meta }` → 204 (authenticated, 60 per minute per user); 400 `INVALID_INPUT`.
    - `POST /v1/leads` needs `reply_inbox`. A `sourceMessageId` that already has a lead in this dealership returns that lead with 200. It also tags that message `lead` when its tag is null or `general`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/events.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const DAY = 86_400_000;

function headersFor(dealerId: string | null, userId = `u-${randomUUID()}`) {
  const payload: JwtUser = {
    dealer_user_id: userId, dealer_id: dealerId, role: dealerId ? 'admin' : 'owner', phone: '+910000000000',
    permissions: resolvePermissions(dealerId ? 'admin' : 'owner'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Event Motors', city: 'Pune', phone: `phone-${randomUUID()}` } })).id;
}

const send = (headers: Record<string, string>, payload: unknown) =>
  fastify.inject({ method: 'POST', url: '/v1/events', headers, payload: payload as object });

describe('POST /v1/events', () => {
  it('stores an allowed action with its meta for a year', async () => {
    const dealerId = await newDealer();
    const userId = `u-${randomUUID()}`;

    const res = await send(headersFor(dealerId, userId), { action: 'caption.edited', type: 'image', length: 120, fromTemplate: false });

    assert.equal(res.statusCode, 204);
    assert.equal(res.body, '');
    const [event] = await prisma.event.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual([event?.action, event?.user_id, event?.meta], ['caption.edited', userId, { type: 'image', length: 120, fromTemplate: false }]);
    const days = (event!.expires_at!.getTime() - Date.now()) / DAY;
    assert.ok(days > 364 && days <= 365, String(days));
  });

  it('rejects unknown actions and unsafe meta', async () => {
    const h = headersFor(await newDealer());
    const tooMany = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    const bad: unknown[] = [
      { action: 'post.deleted' },
      { type: 'image' },
      { action: 'report.downloaded', nested: { a: 1 } },
      { action: 'report.downloaded', note: 'x'.repeat(201) },
      { action: 'report.downloaded', ...tooMany },
      { action: 'report.downloaded', 'bad key': 1 },
      [1, 2],
    ];
    for (const payload of bad) {
      assert.equal((await send(h, payload)).statusCode, 400, JSON.stringify(payload));
    }
  });

  it('accepts but does not store events from an account without a dealership', async () => {
    const userId = `u-${randomUUID()}`;
    assert.equal((await send(headersFor(null, userId), { action: 'report.downloaded' })).statusCode, 204);
    assert.equal((await prisma.event.findMany({ where: { user_id: userId } })).length, 0);
  });

  it('requires a signed-in user', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.equal((await fastify.inject({ method: 'POST', url: '/v1/events', payload: { action: 'report.downloaded' } })).statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });

  it('limits each user to 60 events a minute', async () => {
    const h = headersFor(await newDealer());
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await send(h, { action: 'report.downloaded' })).statusCode);
    assert.equal(statuses[59], 204);
    assert.equal(statuses[60], 429);
  });
});
```

`apps/api/test/leads.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Permission } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Lead Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string, role: 'admin' | 'user' = 'admin', overrides: Partial<Record<Permission, boolean>> = {}) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const newMessage = (dealerId: string, tag: string | null) => prisma.inboxMessage.create({
  data: {
    dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `m-${randomUUID()}`,
    customer_name: 'Ravi Kumar', message_text: 'Price?', received_at: new Date(), tag,
  },
});

const createLead = (h: Record<string, string>, payload: object) => fastify.inject({ method: 'POST', url: '/v1/leads', headers: h, payload });
const leadId = (res: { json: () => unknown }) => (res.json() as { item: { id: string } }).item.id;

describe('POST /v1/leads', () => {
  it('creates one lead per inbox message and tags the message', async () => {
    const dealerId = await newDealer();
    const h = headers(dealerId);
    const m = await newMessage(dealerId, null);
    const body = { customerName: 'Ravi Kumar', sourcePlatform: 'facebook', sourceMessageId: m.id };

    const first = await createLead(h, body);
    const again = await createLead(h, body);

    assert.equal(first.statusCode, 201);
    assert.equal(again.statusCode, 200);
    assert.equal(leadId(again), leadId(first));
    assert.equal((await prisma.lead.findMany({ where: { dealer_id: dealerId, source_message_id: m.id } })).length, 1);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.tag, 'lead');
  });

  it('keeps a tag someone already chose', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, 'complaint');
    await createLead(headers(dealerId), { customerName: 'Ravi', sourceMessageId: m.id });
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.tag, 'complaint');
  });

  it("never tags another dealership's message", async () => {
    const mine = await newDealer();
    const theirs = await newMessage(await newDealer(), 'general');
    const res = await createLead(headers(mine), { customerName: 'Ravi', sourceMessageId: theirs.id });
    assert.equal(res.statusCode, 201);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: theirs.id } }))?.tag, 'general');
  });

  it('needs reply_inbox and a customer name', async () => {
    const dealerId = await newDealer();
    assert.equal((await createLead(headers(dealerId, 'user', { reply_inbox: false }), { customerName: 'Ravi' })).statusCode, 403);
    assert.equal((await createLead(headers(dealerId), {})).statusCode, 400);
    assert.equal((await createLead(headers(dealerId), { customerName: 'Ravi', sourceMessageId: 42 })).statusCode, 400);
  });
});

describe('/v1/leads scoping', () => {
  it('keeps list, read, update and delete inside the dealership', async () => {
    const mine = await newDealer();
    const theirs = await newDealer();
    const other = await prisma.lead.create({ data: { dealer_id: theirs, customer_name: 'Other', source_type: 'inbox' } });
    await prisma.lead.create({ data: { dealer_id: mine, customer_name: 'Mine', source_type: 'inbox' } });
    const h = headers(mine);

    const list = (await fastify.inject({ method: 'GET', url: '/v1/leads', headers: h })).json() as { items: Array<{ customerName: string }> };
    assert.deepEqual(list.items.map((l) => l.customerName), ['Mine']);
    assert.equal((await fastify.inject({ method: 'GET', url: `/v1/leads/${other.id}`, headers: h })).statusCode, 404);
    assert.equal((await fastify.inject({ method: 'PATCH', url: `/v1/leads/${other.id}`, headers: h, payload: { notes: 'x' } })).statusCode, 404);
    assert.equal((await fastify.inject({ method: 'DELETE', url: `/v1/leads/${other.id}`, headers: h })).statusCode, 404);
    assert.ok(await prisma.lead.findUnique({ where: { id: other.id } }));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/events.test.ts test/leads.test.ts`
Expected: FAIL (`/v1/events` answers 404; the second lead is created with 201; the user without `reply_inbox` gets 201).

- [ ] **Step 3: `apps/api/src/lib/events.ts`**

```ts
export const EVENT_ACTIONS = ['caption.accepted', 'caption.edited', 'caption.rejected', 'report.downloaded'] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];
export type EventMeta = Record<string, string | number | boolean>;

export const EVENT_TTL_DAYS = 365;
export const EVENT_META_MAX_KEYS = 10;
export const EVENT_META_MAX_STRING = 200;

const META_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export function isEventAction(value: unknown): value is EventAction {
  return typeof value === 'string' && (EVENT_ACTIONS as readonly string[]).includes(value);
}

/** The body's other top-level fields as meta: strings up to 200 characters, finite numbers and booleans, at most 10. */
export function eventMeta(fields: Record<string, unknown>): { ok: true; meta: EventMeta } | { ok: false; message: string } {
  const entries = Object.entries(fields);
  if (entries.length > EVENT_META_MAX_KEYS) return { ok: false, message: `At most ${EVENT_META_MAX_KEYS} extra fields are allowed` };
  const meta: EventMeta = {};
  for (const [key, value] of entries) {
    if (!META_KEY.test(key)) return { ok: false, message: 'Field names must be letters, digits or _' };
    if (typeof value === 'string' && value.length <= EVENT_META_MAX_STRING) meta[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) meta[key] = value;
    else if (typeof value === 'boolean') meta[key] = value;
    else return { ok: false, message: `${key} must be a short string, a number or true/false` };
  }
  return { ok: true, meta };
}
```

- [ ] **Step 4: `apps/api/src/routes/events.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { EVENT_TTL_DAYS, eventMeta, isEventAction } from '../lib/events.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Per signed-in user (the global keyGenerator in src/index.ts).
const EVENT_RATE_LIMIT = { rateLimit: { max: 60, timeWindow: '1 minute' } };
const invalid = (message: string) => ({ error: { code: 'INVALID_INPUT', message } });

export default async function eventRoutes(fastify: FastifyInstance) {
  // POST /v1/events { action, ...meta } — product usage events, sent fire-and-forget by the web app
  fastify.post('/', { preHandler: [fastify.authenticate], config: EVENT_RATE_LIMIT }, async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply.code(400).send(invalid('Send a JSON object with an action'));
    const { action, ...fields } = body as Record<string, unknown>;
    if (!isEventAction(action)) return reply.code(400).send(invalid('Unknown action'));
    const parsed = eventMeta(fields);
    if (!parsed.ok) return reply.code(400).send(invalid(parsed.message));

    const { dealer_id, dealer_user_id } = request.user;
    // The platform owner has no dealership, so there is nothing to attribute the event to.
    if (dealer_id) {
      await prisma.event.create({
        data: { dealer_id, user_id: dealer_user_id, action, meta: parsed.meta, expires_at: new Date(Date.now() + EVENT_TTL_DAYS * DAY_MS) },
      });
    }
    return reply.code(204).send();
  });
}
```

- [ ] **Step 5: Register it.** In `apps/api/src/index.ts` add `import eventRoutes from './routes/events.js';` with the other route imports and, after `notificationRoutes`:

```ts
fastify.register(eventRoutes,           { prefix: '/v1/events' });
```

- [ ] **Step 6: `apps/api/src/routes/leads.ts`.**

(a) Add `import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';` after the `Lead` type import.

(b) Above `export default async function leadsRoutes`, add:

```ts
// A message turned into a lead is tagged "lead", unless someone already chose another tag.
async function tagMessageAsLead(dealerId: string, messageId: string): Promise<void> {
  const message = await prisma.inboxMessage.findFirst({ where: { id: messageId, dealer_id: dealerId } });
  if (message && (message.tag === null || message.tag === 'general')) {
    await prisma.inboxMessage.update({ where: { id: message.id }, data: { tag: 'lead' } });
  }
}
```

(c) Replace the whole `// POST /v1/leads — create lead` route with:

```ts
  // POST /v1/leads — create a lead. Leads come from the Inbox ("Mark as lead"), so this needs reply_inbox.
  // One lead per inbox message: a repeat for the same sourceMessageId returns the existing lead (200).
  fastify.post('/', { preHandler: [fastify.authenticate, requirePermissionHook(PERMISSIONS.REPLY_INBOX)] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const body = (request.body ?? {}) as {
      customerName?: string;
      customerPhone?: string;
      sourcePlatform?: string;
      sourceType?: string;
      sourcePostId?: string;
      sourceCampaignId?: string;
      sourceMessageId?: unknown;
      vehicleInterest?: string;
      notes?: string;
    };

    if (!body.customerName) return reply.code(400).send({ error: 'customerName is required' });
    if (body.sourceMessageId !== undefined && typeof body.sourceMessageId !== 'string') {
      return reply.code(400).send({ error: 'sourceMessageId must be a string' });
    }
    const sourceMessageId = body.sourceMessageId;

    if (sourceMessageId) {
      const existing = await prisma.lead.findFirst({ where: { dealer_id, source_message_id: sourceMessageId } });
      if (existing) {
        await tagMessageAsLead(dealer_id, sourceMessageId);
        return reply.code(200).send({ item: mapLead(existing) });
      }
    }

    const lead = await prisma.lead.create({
      data: {
        dealer_id,
        customer_name: body.customerName,
        ...(body.customerPhone !== undefined ? { customer_phone: body.customerPhone } : {}),
        ...(body.sourcePlatform !== undefined ? { source_platform: body.sourcePlatform } : {}),
        source_type: body.sourceType ?? 'inbox',
        ...(body.sourcePostId !== undefined ? { source_post_id: body.sourcePostId } : {}),
        ...(body.sourceCampaignId !== undefined ? { source_campaign_id: body.sourceCampaignId } : {}),
        ...(sourceMessageId !== undefined ? { source_message_id: sourceMessageId } : {}),
        ...(body.vehicleInterest !== undefined ? { vehicle_interest: body.vehicleInterest } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    if (sourceMessageId) await tagMessageAsLead(dealer_id, sourceMessageId);

    return reply.code(201).send({ item: mapLead(lead) });
  });
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/events.test.ts test/leads.test.ts test/security-routes.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 8: Run the whole API suite once** (all API tasks are in)

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/lib/events.ts apps/api/src/routes/events.ts apps/api/src/routes/leads.ts apps/api/src/index.ts apps/api/test/events.test.ts apps/api/test/leads.test.ts
git commit -m "feat(api): usage events endpoint and one lead per inbox message

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web logic and services for Inbox, Analytics and events

**Files:**
- Create: `apps/web/src/utils/inbox.ts` + `apps/web/src/utils/inbox.test.ts`, `apps/web/src/utils/analytics.ts` + `apps/web/src/utils/analytics.test.ts`, `apps/web/src/services/events.ts`
- Modify: `apps/web/src/services/api.ts` (204), `apps/web/src/services/inbox.ts`, `apps/web/src/services/dashboard.ts`

**Interfaces:**
- Consumes (HTTP):
  - Task 2: inbox items (`rating`, `postContext`, `postThumbnail`, `postExternalUrl`, `replies`), `GET /inbox/pending-count`, `suggest-reply` → `{ suggestedReply, suggestions }`, `generate-post-draft` → `{ post }`.
  - Task 6: `GET /dealer/analytics`, `GET /dealer/analytics/posts`, dashboard `publishedThisMonth` / `publishedChange`.
  - Task 7: `POST /events` → 204.
- Produces:
  - `utils/inbox.ts`:
    - types `ApiPlatform`, `InboxPlatform`, `InboxType`, `Sentiment`, `InboxTag`, `ApiInboxMessage`, `InboxReplyItem`, `InboxItem`, `InboxStats`, `TypeFilter`, `StatusFilter`, `InboxFilters`, `QuickAction`, `DraftState`
    - `DEFAULT_FILTERS`, `REVIEW_REQUEST_PROMPT`, `WEEK_MS`
    - `displayPlatform`, `apiPlatform`, `iconPlatform`, `initials`, `formatTimestamp`, `toInboxItem`
    - `inboxStats`, `typeCounts`, `platformCounts`, `weeklyPlatformCounts`, `unreadByPlatform`, `sentimentCounts`, `avgRatingFor`
    - `filterMessages`, `quickActionFilters`, `toneLabel`, `draftFromSuggestions`, `selectDraftOption`, `markAllDescription`, `canTurnIntoPost`
  - `utils/analytics.ts`:
    - types `MetricsBag`, `PerformanceBag`, `AnalyticsPlatform`, `PostMetric`, `PostPerformance`, `DealerAnalytics`, `PostSort`, `MetricPart`, `CaptionEvent`
    - `PERIOD_OPTIONS`, `PLATFORM_PILLS`, `POST_SORTS`, `emptyPerformance`
    - `engagementRate`, `formatPercent`, `platformName`, `platformAbbrev`, `topPlatform`, `sortPosts`, `costPerLead`, `formatDuration`, `monthLabel`, `shortDate`, `relativeWidth`, `metricParts`, `formatINR`, `signed`, `captionEventFor`, `responseRateColor`
  - `services/events.ts`: `type TrackedAction`, `trackEvent(action, meta?)`
  - `services/inbox.ts`:
    - `InboxMessage` = `ApiInboxMessage`
    - `inboxService.pendingCount()`, `inboxService.generateReply(id, tone?)` → `{ suggestedReply, suggestions }`, `inboxService.updateTag(id, tag: InboxTag | null)` (`generatePostDraft` is retyped in Task 10, once the old page that reads its caption fields is gone)
    - `CreateLeadRequest.sourcePlatform: ApiPlatform`
  - `services/dashboard.ts`: `DashboardStats` gains `publishedThisMonth`, `publishedChange`; `DealerAnalytics` re-exported from `utils/analytics`; `dashboardService.postPerformance(days: number, platform?: AnalyticsPlatform)`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/utils/inbox.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiPlatform, avgRatingFor, canTurnIntoPost, DEFAULT_FILTERS, displayPlatform, draftFromSuggestions, filterMessages, iconPlatform,
  inboxStats, initials, markAllDescription, platformCounts, quickActionFilters, REVIEW_REQUEST_PROMPT, selectDraftOption,
  sentimentCounts, toInboxItem, toneLabel, typeCounts, unreadByPlatform, weeklyPlatformCounts, type ApiInboxMessage,
} from './inbox.js';

const NOW = Date.parse('2026-09-24T10:00:00Z');
const DAY = 86_400_000;

const api = (over: Partial<ApiInboxMessage>): ApiInboxMessage => ({
  id: 'm1', dealerId: 'd1', platform: 'facebook', messageType: 'comment', platformMessageId: 'p1',
  customerName: 'Ravi Kumar', messageText: 'Price of Creta?', isRead: false, requiresApproval: false,
  receivedAt: new Date(NOW - DAY).toISOString(), ...over,
});

describe('toInboxItem', () => {
  it('maps API messages for display', () => {
    const item = toInboxItem(api({
      platform: 'gmb', messageType: 'review', rating: 5, repliedAt: '2026-09-23T11:00:00Z',
      replies: [{ id: 'm1-reply', text: 'Thanks!', createdAt: '2026-09-23T11:00:00Z', isDealerOwn: true }],
    }));
    assert.equal(item.platform, 'google');
    assert.equal(item.type, 'review');
    assert.equal(item.customerInitials, 'RK');
    assert.equal(item.sentiment, 'neutral');
    assert.equal(item.tag, 'general');
    assert.equal(item.responded, true);
    assert.equal(item.rating, 5);
    assert.deepEqual(item.replies.map((r) => [r.id, r.text]), [['m1-reply', 'Thanks!']]);
    assert.ok(item.replies[0]!.timestamp.length > 0);
    assert.ok(item.timestamp.length > 0);
    assert.equal(toInboxItem(api({ repliedAt: undefined })).responded, false);
  });

  it('maps platforms between the API, the page and PlatformIcon', () => {
    assert.equal(displayPlatform('gmb'), 'google');
    assert.equal(displayPlatform('email'), 'email');
    assert.equal(displayPlatform('whatever'), 'email');
    assert.equal(apiPlatform('google'), 'gmb');
    assert.equal(apiPlatform('instagram'), 'instagram');
    assert.equal(iconPlatform('google'), 'gmb');
    assert.equal(iconPlatform('email'), null);
    assert.equal(initials('  asha  '), 'A');
    assert.equal(initials(''), '?');
  });
});

describe('stats and counts', () => {
  const items = [
    toInboxItem(api({ id: 'a', platform: 'gmb', messageType: 'review', rating: 5, isRead: true, repliedAt: '2026-09-23T11:00:00Z', sentiment: 'positive' })),
    toInboxItem(api({ id: 'b', platform: 'gmb', messageType: 'review', rating: 2, isRead: true, sentiment: 'negative' })),
    toInboxItem(api({ id: 'c', platform: 'facebook', messageType: 'comment', receivedAt: new Date(NOW - 10 * DAY).toISOString() })),
    toInboxItem(api({ id: 'd', platform: 'instagram', messageType: 'dm' })),
  ];

  it('counts replies from repliedAt, not from reading', () => {
    assert.deepEqual(inboxStats(items), { total: 4, unread: 2, replied: 1, pending: 3, avgRating: 3.5, responseRate: 25 });
    assert.deepEqual(inboxStats([]), { total: 0, unread: 0, replied: 0, pending: 0, avgRating: 0, responseRate: 0 });
  });

  it('counts types, platforms, sentiment and this week', () => {
    assert.deepEqual(typeCounts(items), { review: 2, comment: 1, dm: 1 });
    assert.deepEqual(platformCounts(items), { google: 2, facebook: 1, instagram: 1, youtube: 0, email: 0 });
    assert.deepEqual(weeklyPlatformCounts(items, NOW), { google: 2, facebook: 0, instagram: 1, youtube: 0, email: 0 });
    assert.deepEqual(unreadByPlatform(items), { google: 0, facebook: 1, instagram: 1, youtube: 0, email: 0 });
    assert.deepEqual(sentimentCounts(items), { positive: 1, neutral: 2, negative: 1 });
    assert.equal(avgRatingFor(items, 'google'), 3.5);
    assert.equal(avgRatingFor(items, 'facebook'), 0);
  });
});

describe('filters and quick actions', () => {
  const items = [
    toInboxItem(api({ id: 'a', platform: 'gmb', messageType: 'review', sentiment: 'positive', customerName: 'Asha', messageText: 'Lovely' })),
    toInboxItem(api({ id: 'b', platform: 'gmb', messageType: 'review', sentiment: 'positive', repliedAt: '2026-09-23T11:00:00Z' })),
    toInboxItem(api({ id: 'c', platform: 'facebook', messageType: 'comment', sentiment: 'negative', messageText: 'Delivery DELAYED' })),
  ];
  const ids = (list: Array<{ id: string }>) => list.map((i) => i.id);

  it('filters by search, type, platform, sentiment and status', () => {
    assert.deepEqual(ids(filterMessages(items, DEFAULT_FILTERS)), ['a', 'b', 'c']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, search: 'delayed' })), ['c']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, search: 'asha' })), ['a']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, platform: 'facebook' })), ['c']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, status: 'responded' })), ['b']);
    assert.deepEqual(ids(filterMessages(items, { ...DEFAULT_FILTERS, type: 'comment', sentiment: 'negative' })), ['c']);
  });

  it('turns quick actions into filters', () => {
    assert.deepEqual(ids(filterMessages(items, quickActionFilters('reply-positive'))), ['a']);
    assert.deepEqual(ids(filterMessages(items, quickActionFilters('flag-complaints'))), ['c']);
    assert.ok(REVIEW_REQUEST_PROMPT.length > 10);
  });
});

describe('labels and drafts', () => {
  it('names the reply tone', () => {
    assert.equal(toneLabel('positive'), 'POSITIVE TONE');
    assert.equal(toneLabel('negative'), 'RECOVERY TONE');
    assert.equal(toneLabel('neutral'), 'NEUTRAL TONE');
  });

  it('keeps AI options and the chosen one', () => {
    const draft = draftFromSuggestions([' First ', '', 'Second']);
    assert.deepEqual(draft, { options: ['First', 'Second'], index: 0, text: 'First', editing: false });
    assert.deepEqual(selectDraftOption({ ...draft, editing: true }, 1), { options: ['First', 'Second'], index: 1, text: 'Second', editing: false });
    assert.equal(selectDraftOption(draft, 5), draft);
  });

  it('words the mark-all dialog and offers posts for good reviews only', () => {
    assert.equal(markAllDescription(1), 'This will mark all 1 unread message as read.');
    assert.equal(markAllDescription(3), 'This will mark all 3 unread messages as read.');
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'review', rating: 4 }))), true);
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'review', rating: 3 }))), false);
    assert.equal(canTurnIntoPost(toInboxItem(api({ messageType: 'comment', rating: 5 }))), false);
  });
});
```

`apps/web/src/utils/analytics.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  captionEventFor, costPerLead, emptyPerformance, engagementRate, formatDuration, formatINR, formatPercent, metricParts,
  monthLabel, platformAbbrev, platformName, relativeWidth, responseRateColor, signed, sortPosts, topPlatform, type PostMetric,
} from './analytics.js';

const post = (id: string, over: Partial<PostMetric> = {}): PostMetric => ({
  ...emptyPerformance().totals, id, caption: id, platforms: ['facebook'], thumbnail: null, publishedAt: null, ...over,
});

describe('rates and platforms', () => {
  it('computes and formats the engagement rate', () => {
    assert.equal(engagementRate(45, 1000), 4.5);
    assert.equal(engagementRate(1, 3), 33.3);
    assert.equal(engagementRate(5, 0), null);
    assert.equal(formatPercent(4.5), '4.5%');
    assert.equal(formatPercent(null), '—');
  });

  it('names platforms and picks the one with most reach', () => {
    assert.equal(platformName('gmb'), 'GMB');
    assert.equal(platformName('facebook'), 'Facebook');
    assert.equal(platformAbbrev('instagram'), 'IG');
    assert.equal(platformAbbrev('x'), 'X');
    const zero = emptyPerformance().totals;
    assert.deepEqual(topPlatform({ facebook: { ...zero, reach: 90 }, gmb: { ...zero, reach: 120 } }), { platform: 'gmb', reach: 120 });
    assert.equal(topPlatform({ facebook: zero }), null);
  });
});

describe('sortPosts', () => {
  it('sorts by reach, engagement or recency without changing the input', () => {
    const posts = [
      post('a', { reach: 10, engagement: 9, publishedAt: '2026-09-20T10:00:00Z' }),
      post('b', { reach: 30, engagement: 1, publishedAt: null }),
      post('c', { reach: 20, engagement: 5, publishedAt: '2026-09-22T10:00:00Z' }),
    ];
    assert.deepEqual(sortPosts(posts, 'reach').map((p) => p.id), ['b', 'c', 'a']);
    assert.deepEqual(sortPosts(posts, 'engagement').map((p) => p.id), ['a', 'c', 'b']);
    assert.deepEqual(sortPosts(posts, 'recent').map((p) => p.id), ['c', 'a', 'b']);
    assert.deepEqual(posts.map((p) => p.id), ['a', 'b', 'c']);
  });
});

describe('formatting', () => {
  it('formats money, cost per lead, durations, months and signs', () => {
    assert.equal(formatINR(150000), '₹1,50,000');
    assert.equal(costPerLead(3000, 4), 750);
    assert.equal(costPerLead(0, 4), null);
    assert.equal(costPerLead(3000, 0), null);
    assert.equal(costPerLead(null, 4), null);
    assert.equal(formatDuration(null), '—');
    assert.equal(formatDuration(45), '45m');
    assert.equal(formatDuration(90), '1.5h');
    assert.equal(formatDuration(2160), '1.5d');
    assert.equal(monthLabel(new Date(2026, 8, 24)), 'September 2026');
    assert.equal(signed(3), '+3');
    assert.equal(signed(0), '+0');
    assert.equal(signed(-2), '-2');
  });

  it('scales bars to the largest value and colours response rates', () => {
    assert.equal(relativeWidth(2, 8), 25);
    assert.equal(relativeWidth(9, 8), 100);
    assert.equal(relativeWidth(3, 0), 0);
    assert.equal(responseRateColor(85), 'bg-emerald-500');
    assert.equal(responseRateColor(60), 'bg-amber-500');
    assert.equal(responseRateColor(10), 'bg-red-500');
  });

  it('lists only the metrics that have a value, combining views and clicks', () => {
    const parts = metricParts({ ...emptyPerformance().totals, reach: 120, likes: 4, videoViews: 3, plays: 2, clicks: 1, views: 6, inboxMessages: 2 });
    assert.deepEqual(parts, [
      { label: 'Reach', value: 120 }, { label: 'Likes', value: 4 }, { label: 'Video views', value: 5 },
      { label: 'Clicks', value: 7 }, { label: 'Inbox', value: 2 },
    ]);
    assert.deepEqual(metricParts(emptyPerformance().totals), []);
  });
});

describe('captionEventFor', () => {
  it('tells an accepted caption from an edited one', () => {
    assert.equal(captionEventFor(null, 'Anything'), null);
    assert.equal(captionEventFor('New Creta is here!', '  New Creta is here!\n'), 'caption.accepted');
    assert.equal(captionEventFor('New Creta is here!', 'New Creta is here! Book today.'), 'caption.edited');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL (`Cannot find module './inbox.js'` and `'./analytics.js'`).

- [ ] **Step 3: `apps/web/src/utils/inbox.ts`**

```ts
// Inbox page logic: API messages → display items, stats, filters and labels.
// Pure, so it runs in the web tests (src/utils/**/*.test.ts).

export type ApiPlatform = 'facebook' | 'instagram' | 'gmb' | 'youtube' | 'email';
export type InboxPlatform = 'google' | 'facebook' | 'instagram' | 'youtube' | 'email';
export type InboxType = 'review' | 'comment' | 'dm' | 'email';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type InboxTag = 'lead' | 'complaint' | 'general' | 'spam';

/** A message as GET /v1/inbox returns it. */
export interface ApiInboxMessage {
  id: string;
  dealerId: string;
  platform: string;
  messageType: string;
  platformMessageId: string;
  postId?: string;
  customerName: string;
  customerAvatarUrl?: string;
  customerPlatformId?: string;
  emailSubject?: string;
  messageText: string;
  sentiment?: Sentiment;
  tag?: InboxTag;
  rating?: number;
  aiSuggestedReply?: string;
  replyText?: string;
  repliedAt?: string;
  isRead: boolean;
  requiresApproval: boolean;
  receivedAt: string;
  postContext?: string;
  postThumbnail?: string;
  postExternalUrl?: string;
  replies?: Array<{ id: string; text: string; createdAt: string; isDealerOwn?: boolean }>;
}

export interface InboxReplyItem {
  id: string;
  text: string;
  timestamp: string;
}

export interface InboxItem {
  id: string;
  platform: InboxPlatform;
  type: InboxType;
  customerName: string;
  customerInitials: string;
  text: string;
  receivedAt: string;
  timestamp: string;
  sentiment: Sentiment;
  tag: InboxTag;
  isRead: boolean;
  /** Has a dealer reply (repliedAt), not merely read. */
  responded: boolean;
  rating?: number;
  postContext?: string;
  postThumbnail?: string;
  postExternalUrl?: string;
  replies: InboxReplyItem[];
  aiSuggestedReply?: string;
  emailSubject?: string;
}

export function displayPlatform(platform: string): InboxPlatform {
  if (platform === 'gmb' || platform === 'google') return 'google';
  if (platform === 'facebook' || platform === 'instagram' || platform === 'youtube') return platform;
  return 'email';
}

export function apiPlatform(platform: InboxPlatform): ApiPlatform {
  return platform === 'google' ? 'gmb' : platform;
}

/** PlatformIcon's key: Google is "gmb"; email has no icon. */
export function iconPlatform(platform: InboxPlatform): 'gmb' | 'facebook' | 'instagram' | 'youtube' | null {
  if (platform === 'google') return 'gmb';
  return platform === 'email' ? null : platform;
}

export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase());
  return letters.slice(0, 2).join('') || '?';
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function toType(value: string): InboxType {
  return value === 'review' || value === 'comment' || value === 'dm' || value === 'email' ? value : 'comment';
}

export function toInboxItem(m: ApiInboxMessage): InboxItem {
  const name = m.customerName?.trim() || 'Customer';
  return {
    id: m.id,
    platform: displayPlatform(m.platform),
    type: toType(m.messageType),
    customerName: name,
    customerInitials: initials(name),
    text: m.messageText ?? '',
    receivedAt: m.receivedAt,
    timestamp: formatTimestamp(m.receivedAt),
    sentiment: m.sentiment ?? 'neutral',
    tag: m.tag ?? 'general',
    isRead: m.isRead,
    responded: !!m.repliedAt,
    rating: typeof m.rating === 'number' ? m.rating : undefined,
    postContext: m.postContext || undefined,
    postThumbnail: m.postThumbnail || undefined,
    postExternalUrl: m.postExternalUrl || undefined,
    replies: (m.replies ?? []).map((r) => ({ id: r.id, text: r.text, timestamp: formatTimestamp(r.createdAt) })),
    aiSuggestedReply: m.aiSuggestedReply || undefined,
    emailSubject: m.emailSubject || undefined,
  };
}

// ─── Stats and counts (always over the full list, never the filtered view) ───

export interface InboxStats {
  total: number;
  unread: number;
  replied: number;
  pending: number;
  avgRating: number;
  responseRate: number;
}

export function inboxStats(items: readonly InboxItem[]): InboxStats {
  const unread = items.filter((m) => !m.isRead).length;
  const replied = items.filter((m) => m.responded).length;
  const rated = items.filter((m) => typeof m.rating === 'number');
  return {
    total: items.length,
    unread,
    replied,
    pending: items.length - replied,
    avgRating: rated.length ? rated.reduce((sum, m) => sum + (m.rating ?? 0), 0) / rated.length : 0,
    responseRate: items.length ? Math.round((replied / items.length) * 100) : 0,
  };
}

const PLATFORMS: readonly InboxPlatform[] = ['google', 'facebook', 'instagram', 'youtube', 'email'];

function countByPlatform(items: readonly InboxItem[]): Record<InboxPlatform, number> {
  const counts = Object.fromEntries(PLATFORMS.map((p) => [p, 0])) as Record<InboxPlatform, number>;
  for (const m of items) counts[m.platform] += 1;
  return counts;
}

export function platformCounts(items: readonly InboxItem[]): Record<InboxPlatform, number> {
  return countByPlatform(items);
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Messages received in the 7 days before `now`, per platform. */
export function weeklyPlatformCounts(items: readonly InboxItem[], now: number): Record<InboxPlatform, number> {
  return countByPlatform(items.filter((m) => now - Date.parse(m.receivedAt) <= WEEK_MS));
}

export function unreadByPlatform(items: readonly InboxItem[]): Record<InboxPlatform, number> {
  return countByPlatform(items.filter((m) => !m.isRead));
}

export function typeCounts(items: readonly InboxItem[]): { review: number; comment: number; dm: number } {
  return {
    review: items.filter((m) => m.type === 'review').length,
    comment: items.filter((m) => m.type === 'comment').length,
    dm: items.filter((m) => m.type === 'dm').length,
  };
}

export function sentimentCounts(items: readonly InboxItem[]): Record<Sentiment, number> {
  return {
    positive: items.filter((m) => m.sentiment === 'positive').length,
    neutral: items.filter((m) => m.sentiment === 'neutral').length,
    negative: items.filter((m) => m.sentiment === 'negative').length,
  };
}

/** Average stars of one platform's rated messages (0 when none). */
export function avgRatingFor(items: readonly InboxItem[], platform: InboxPlatform): number {
  return inboxStats(items.filter((m) => m.platform === platform)).avgRating;
}

// ─── Filters and quick actions ───────────────────────────────────────────────

export type TypeFilter = 'all' | 'review' | 'comment' | 'dm';
export type StatusFilter = 'all' | 'pending' | 'responded';

export interface InboxFilters {
  type: TypeFilter;
  platform: 'all' | InboxPlatform;
  sentiment: 'all' | Sentiment;
  status: StatusFilter;
  search: string;
}

export const DEFAULT_FILTERS: InboxFilters = { type: 'all', platform: 'all', sentiment: 'all', status: 'all', search: '' };

export function filterMessages(items: readonly InboxItem[], f: InboxFilters): InboxItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((m) =>
    (!q || m.customerName.toLowerCase().includes(q) || m.text.toLowerCase().includes(q))
    && (f.type === 'all' || m.type === f.type)
    && (f.platform === 'all' || m.platform === f.platform)
    && (f.sentiment === 'all' || m.sentiment === f.sentiment)
    && (f.status === 'all' || (f.status === 'pending' ? !m.responded : m.responded)));
}

export type QuickAction = 'reply-positive' | 'flag-complaints';

export function quickActionFilters(action: QuickAction): InboxFilters {
  return action === 'reply-positive'
    ? { ...DEFAULT_FILTERS, type: 'review', sentiment: 'positive', status: 'pending' }
    : { ...DEFAULT_FILTERS, sentiment: 'negative', status: 'pending' };
}

/** Create Studio prompt for "Request more Google reviews". */
export const REVIEW_REQUEST_PROMPT = 'Thank our happy customers and ask them to rate us on Google';

// ─── Labels and AI drafts ────────────────────────────────────────────────────

export function toneLabel(sentiment: Sentiment): 'POSITIVE TONE' | 'RECOVERY TONE' | 'NEUTRAL TONE' {
  if (sentiment === 'positive') return 'POSITIVE TONE';
  if (sentiment === 'negative') return 'RECOVERY TONE';
  return 'NEUTRAL TONE';
}

/** An AI reply being reviewed: the options, the chosen one, and its (editable) text. */
export interface DraftState {
  options: string[];
  index: number;
  text: string;
  editing: boolean;
}

export function draftFromSuggestions(options: readonly string[]): DraftState {
  const clean = options.map((o) => o.trim()).filter(Boolean);
  return { options: clean, index: 0, text: clean[0] ?? '', editing: false };
}

export function selectDraftOption(draft: DraftState, index: number): DraftState {
  const text = draft.options[index];
  return text === undefined ? draft : { ...draft, index, text, editing: false };
}

export function markAllDescription(count: number): string {
  return `This will mark all ${count} unread message${count === 1 ? '' : 's'} as read.`;
}

/** 4–5★ reviews can become a thank-you post ("Turn into post"). */
export function canTurnIntoPost(item: InboxItem): boolean {
  return item.type === 'review' && (item.rating ?? 0) >= 4;
}
```

- [ ] **Step 4: `apps/web/src/utils/analytics.ts`**

```ts
// Analytics and Report page logic. Pure, so it runs in the web tests.

export interface MetricsBag {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  videoViews: number;
  plays: number;
  clicks: number;
  views: number;
  engagedUsers: number;
  engagement: number;
}

export interface PerformanceBag extends MetricsBag {
  inboxMessages: number;
}

export type AnalyticsPlatform = 'facebook' | 'instagram' | 'gmb';

/** GET /v1/dealer/analytics/posts → posts[] */
export interface PostMetric extends PerformanceBag {
  id: string;
  caption: string;
  platforms: string[];
  thumbnail: string | null;
  publishedAt: string | null;
}

/** GET /v1/dealer/analytics/posts */
export interface PostPerformance {
  posts: PostMetric[];
  byPlatform: Partial<Record<AnalyticsPlatform, PerformanceBag>>;
  totals: PerformanceBag;
}

/** GET /v1/dealer/analytics */
export interface DealerAnalytics {
  engagementByType: Array<{ type: string; posts: number; reach: number; engagementRate: number }>;
  followerTrend: Array<{ platform: string; current: number; delta: number | null }>;
  reviewSummary: { avgRating: number | null; responseRate: number | null; avgResponseMinutes: number | null; totalReviews: number };
  reviewTrend: Array<{ label: string; month: string; avgRating: number | null; totalReviews: number; responded: number }>;
}

export type PostSort = 'reach' | 'engagement' | 'recent';

// In the reference's order (30 first).
export const PERIOD_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '90', label: 'Last 90 days' },
];

export const PLATFORM_PILLS: Array<{ id: 'all' | AnalyticsPlatform; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'gmb', label: 'GMB' },
];

export const POST_SORTS: Array<{ id: PostSort; label: string }> = [
  { id: 'reach', label: 'Reach' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'recent', label: 'Recent' },
];

export function emptyPerformance(): PostPerformance {
  return {
    posts: [],
    byPlatform: {},
    totals: {
      reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saved: 0, videoViews: 0, plays: 0,
      clicks: 0, views: 0, engagedUsers: 0, engagement: 0, inboxMessages: 0,
    },
  };
}

/** Engagement ÷ reach × 100, one decimal; null without reach. */
export function engagementRate(engagement: number, reach: number): number | null {
  return reach > 0 ? Math.round((engagement / reach) * 1000) / 10 : null;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1)}%`;
}

const NAMES: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', gmb: 'GMB', youtube: 'YouTube' };
const ABBREVIATIONS: Record<string, string> = { facebook: 'FB', instagram: 'IG', gmb: 'GMB' };

export function platformName(platform: string): string {
  return NAMES[platform] ?? platform.toUpperCase();
}

/** Text fallback where there is no PlatformIcon. */
export function platformAbbrev(platform: string): string {
  return ABBREVIATIONS[platform] ?? platform.toUpperCase();
}

export function topPlatform(byPlatform: PostPerformance['byPlatform']): { platform: string; reach: number } | null {
  const best = Object.entries(byPlatform)
    .map(([platform, bag]) => ({ platform, reach: bag?.reach ?? 0 }))
    .filter((p) => p.reach > 0)
    .sort((a, b) => b.reach - a.reach)[0];
  return best ?? null;
}

export function sortPosts(posts: readonly PostMetric[], sort: PostSort): PostMetric[] {
  const time = (p: PostMetric) => (p.publishedAt ? Date.parse(p.publishedAt) : 0);
  return [...posts].sort((a, b) => {
    if (sort === 'engagement') return b.engagement - a.engagement;
    if (sort === 'recent') return time(b) - time(a);
    return b.reach - a.reach;
  });
}

/** Ad spend ÷ leads, rounded; null when either is missing. */
export function costPerLead(adSpend: number | null, leads: number): number | null {
  return adSpend !== null && adSpend > 0 && leads > 0 ? Math.round(adSpend / leads) : null;
}

/** — , 45m, 1.5h (under a day) or 1.5d. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/** "September 2026" */
export function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** "24 Sept" */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Bar width in % relative to the largest value in the set, capped at 100. */
export function relativeWidth(value: number, max: number): number {
  return max > 0 ? Math.min(100, (value / max) * 100) : 0;
}

export interface MetricPart {
  label: string;
  value: number;
}

/** The "Reach · Impressions · Likes · …" line of a post, only the metrics above zero. */
export function metricParts(m: PerformanceBag): MetricPart[] {
  const parts: MetricPart[] = [
    { label: 'Reach', value: m.reach },
    { label: 'Impressions', value: m.impressions },
    { label: 'Likes', value: m.likes },
    { label: 'Comments', value: m.comments },
    { label: 'Shares', value: m.shares },
    { label: 'Saved', value: m.saved },
    { label: 'Video views', value: m.videoViews + m.plays },
    { label: 'Clicks', value: m.clicks + m.views },
    { label: 'Engaged', value: m.engagedUsers },
    { label: 'Engagement', value: m.engagement },
    { label: 'Inbox', value: m.inboxMessages },
  ];
  return parts.filter((p) => p.value > 0);
}

export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export type CaptionEvent = 'caption.accepted' | 'caption.edited';

/** Whether the saved caption is the AI's (accepted) or was changed (edited). Null when nothing was generated. */
export function captionEventFor(generated: string | null, final: string): CaptionEvent | null {
  if (generated === null) return null;
  return generated.trim() === final.trim() ? 'caption.accepted' : 'caption.edited';
}

/** Report response-rate bar: green from 80%, amber from 50%, else red. */
export function responseRateColor(rate: number): string {
  if (rate >= 80) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}
```

- [ ] **Step 5: `apps/web/src/services/events.ts`**

```ts
import api from './api';

export type TrackedAction = 'caption.accepted' | 'caption.edited' | 'caption.rejected' | 'report.downloaded';

/** Records a usage event (POST /v1/events). Fire-and-forget: failures are ignored. */
export function trackEvent(action: TrackedAction, meta: Record<string, string | number | boolean> = {}): void {
  api.post('/events', { ...meta, action }).catch(() => {});
}
```

- [ ] **Step 6: `apps/web/src/services/api.ts`.** In `request`, replace `const data = await response.json();` with:

```ts
    // 204 No Content (e.g. POST /events) has no body to parse.
    const data = response.status === 204 ? undefined : await response.json();
```

- [ ] **Step 7: `apps/web/src/services/inbox.ts`.**

(a) Replace the `export interface InboxMessage { … }` block with:

```ts
import type { ApiInboxMessage, ApiPlatform, InboxTag } from '../utils/inbox';

export type InboxMessage = ApiInboxMessage;
```

(Move the new `import type` line to the top, below `import api from './api';`.)

(b) In `interface Lead` and `interface CreateLeadRequest`, change `sourcePlatform` to `sourcePlatform?: ApiPlatform;` (Lead) and `sourcePlatform: ApiPlatform;` (CreateLeadRequest).

(c) In `inboxService`, replace the `updateTag` and `generateReply` entries, and add `pendingCount` after `list`. Leave `generatePostDraft` as it is for now: the old `pages/InboxPage.tsx` still reads `caption_text` and friends from it until Task 10 replaces the page.

```ts
  pendingCount: () =>
    api.get<{ pending: number }>('/inbox/pending-count'),

  updateTag: (id: string, tag: InboxTag | null) =>
    api.patch<{ item: InboxMessage }>(`/inbox/${id}`, { tag }),

  generateReply: (id: string, tone?: string) =>
    api.post<{ suggestedReply: string; suggestions?: string[] }>(`/inbox/${id}/suggest-reply`, tone ? { tone } : {}),
```

- [ ] **Step 8: `apps/web/src/services/dashboard.ts`.** Replace the file with:

```ts
import api from './api';
import type { AnalyticsPlatform, DealerAnalytics, PostPerformance } from '../utils/analytics';

export type { DealerAnalytics } from '../utils/analytics';

export interface DashboardStats {
  postsThisMonth: number;
  postsChange: number;
  /** Posts published this month (Analytics "Posts Published", the Report). */
  publishedThisMonth: number;
  publishedChange: number;
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

export const dashboardService = {
  get: () => api.get<DashboardData>('/dealer/dashboard'),
  analytics: () => api.get<DealerAnalytics>('/dealer/analytics'),
  postPerformance: (days: number, platform?: AnalyticsPlatform) =>
    api.get<PostPerformance>('/dealer/analytics/posts', { days, platform }),
};
```

- [ ] **Step 9: Verify**

Run: `npm test -w web && npm run build -w web`
Expected: tests pass; the build exits 0. The old `pages/InboxPage.tsx` and `pages/Analytics.tsx` still compile: they only read fields that still exist (`suggestedReply`, `item`, the `generatePostDraft` post). `components/dashboard/Insights.tsx` reads `type` and `engagementRate`, which are unchanged.

Run: `cd apps/web && npx eslint src/utils/inbox.ts src/utils/analytics.ts src/services && npx eslint . | tail -1`
Expected: no problems in the new files; total ≤ 55.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/utils/inbox.ts apps/web/src/utils/inbox.test.ts apps/web/src/utils/analytics.ts apps/web/src/utils/analytics.test.ts apps/web/src/services/events.ts apps/web/src/services/api.ts apps/web/src/services/inbox.ts apps/web/src/services/dashboard.ts
git commit -m "feat(web): inbox and analytics logic, event tracking and service types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Inbox components

**Files:**
- Create in `apps/web/src/components/inbox/`: `Badges.tsx`, `FilterBar.tsx`, `MessageList.tsx`, `ReplyComposer.tsx`, `MessageCard.tsx`, `InboxSidebar.tsx`, `MarkAllReadModal.tsx`

**Interfaces:**
- Consumes:
  - Task 8 (`utils/inbox.ts`): `InboxItem`, `InboxReplyItem`, `InboxFilters`, `TypeFilter`, `InboxTag`, `Sentiment`, `InboxStats`, `DraftState`, `InboxPlatform`, `typeCounts`, `platformCounts`, `sentimentCounts`, `weeklyPlatformCounts`, `unreadByPlatform`, `avgRatingFor`, `iconPlatform`, `toneLabel`, `selectDraftOption`, `markAllDescription`, `canTurnIntoPost`.
  - Existing: `Button`, `cn` (`ui/Button`), `Modal` (`ui/Modal`), `PlatformIcon` (`ui/PlatformIcon`).
- Produces:
  - `Badges.tsx`: `SentimentBadge({ sentiment })`, `TagBadge({ tag })` (nothing for `general`), `StarRating({ rating, size? })`, `StatPill({ value, label, dot, strong? })`
  - `FilterBar.tsx`: `FilterBar({ items, filters, onChange })`
  - `MessageList.tsx`: `MessageSkeleton()`, `NoMessages()`, `NoResults()`
  - `ReplyComposer.tsx`: `AiSuggestionPanel`, `ManualComposer`, `ReplyStarter`, `LeadPrompt`, `TurnIntoPostRow`, `SpamNotice`, `ReplySent`
  - `MessageCard.tsx`: `interface MessageCardProps`, `MessageCard(props)`
  - `InboxSidebar.tsx`: `ResponseStatsCard({ stats })`, `PlatformBreakdownCard({ items, now })`, `QuickActionsCard({ onReplyPositive, onFlagComplaints, onRequestReviews })`
  - `MarkAllReadModal.tsx`: `MarkAllReadModal({ open, count, busy, onClose, onConfirm })`

- [ ] **Step 1: `Badges.tsx`**

```tsx
import { Star } from 'lucide-react';
import { cn } from '../ui/Button';
import type { InboxTag, Sentiment } from '../../utils/inbox';

const BADGE = 'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';

const SENTIMENTS: Record<Sentiment, { label: string; className: string; dot: string }> = {
  positive: { label: 'Positive', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  neutral: { label: 'Neutral', className: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
  negative: { label: 'Negative', className: 'bg-red-50 text-red-700 ring-1 ring-red-100', dot: 'bg-red-500' },
};

const TAGS: Record<Exclude<InboxTag, 'general'>, { label: string; className: string }> = {
  lead: { label: 'Lead', className: 'bg-green-50 text-green-700 ring-1 ring-green-100' },
  complaint: { label: 'Complaint', className: 'bg-red-50 text-red-700 ring-1 ring-red-100' },
  spam: { label: 'Spam', className: 'bg-zinc-100 text-zinc-500' },
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const s = SENTIMENTS[sentiment];
  return (
    <span className={cn(BADGE, s.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

// "general" has no badge, as in the reference.
export function TagBadge({ tag }: { tag: InboxTag }) {
  if (tag === 'general') return null;
  const t = TAGS[tag];
  return <span className={cn(BADGE, t.className)}>{t.label}</span>;
}

export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'xs' }) {
  const star = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(star, i <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-200 fill-zinc-200')} />
      ))}
    </span>
  );
}

// Header stat pill: value, then a lowercase label ("unread", "replied", "★ avg", "response rate").
export function StatPill({ value, label, dot, strong = false }: { value: string | number; label: string; dot: string; strong?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg ring-1 px-2.5 py-1', strong ? 'bg-orange-50 ring-orange-100' : 'bg-zinc-50 ring-zinc-100')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      <span className="text-sm font-bold text-zinc-900">{value}</span>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </span>
  );
}
```

- [ ] **Step 2: `FilterBar.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../ui/Button';
import { platformCounts, sentimentCounts, typeCounts, type InboxFilters, type InboxItem, type TypeFilter } from '../../utils/inbox';

interface Option {
  value: string;
  label: string;
}

// The reference's inline filter dropdown: the closed trigger shows the chosen option; `label` names it for screen readers.
function FilterDropdown({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/30',
          value !== 'all' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 focus:border-zinc-400',
        )}
      >
        {selected?.label}
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 z-50 mt-1.5 min-w-[180px] bg-white rounded-xl border border-zinc-200 shadow-lg py-1">
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  'w-full text-left flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium transition-colors',
                  isSelected ? 'bg-orange-50/60 text-orange-700' : 'text-zinc-600 hover:bg-zinc-50',
                )}
              >
                {o.label}
                {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ items, filters, onChange }: { items: InboxItem[]; filters: InboxFilters; onChange: (next: InboxFilters) => void }) {
  const types = typeCounts(items);
  const platforms = platformCounts(items);
  const sentiments = sentimentCounts(items);
  const tabs: Array<{ id: TypeFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'review', label: `Reviews · ${types.review}` },
    { id: 'comment', label: `Comments · ${types.comment}` },
    { id: 'dm', label: `DMs · ${types.dm}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1" role="tablist" aria-label="Message type">
        {tabs.map((tab) => {
          const active = filters.type === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ ...filters, type: tab.id })}
              className={cn('px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all', active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <FilterDropdown
          label="Platform"
          value={filters.platform}
          onChange={(v) => onChange({ ...filters, platform: v as InboxFilters['platform'] })}
          options={[
            { value: 'all', label: 'All platforms' },
            { value: 'google', label: `Google · ${platforms.google}` },
            { value: 'facebook', label: `Facebook · ${platforms.facebook}` },
            { value: 'instagram', label: `Instagram · ${platforms.instagram}` },
            { value: 'youtube', label: `YouTube · ${platforms.youtube}` },
          ]}
        />
        <FilterDropdown
          label="Sentiment"
          value={filters.sentiment}
          onChange={(v) => onChange({ ...filters, sentiment: v as InboxFilters['sentiment'] })}
          options={[
            { value: 'all', label: 'All sentiment' },
            { value: 'positive', label: `Positive · ${sentiments.positive}` },
            { value: 'neutral', label: `Neutral · ${sentiments.neutral}` },
            { value: 'negative', label: `Negative · ${sentiments.negative}` },
          ]}
        />
        <FilterDropdown
          label="Status"
          value={filters.status}
          onChange={(v) => onChange({ ...filters, status: v as InboxFilters['status'] })}
          options={[
            { value: 'all', label: 'All status' },
            { value: 'pending', label: 'Unresponded' },
            { value: 'responded', label: 'Responded' },
          ]}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `MessageList.tsx`**

```tsx
import type { ReactNode } from 'react';
import { MessageSquare, SearchX } from 'lucide-react';

export function MessageSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-zinc-100 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-28 bg-zinc-100 rounded" />
            <div className="h-4 w-16 bg-zinc-100 rounded-full" />
          </div>
          <div className="h-3 w-full bg-zinc-100 rounded" />
          <div className="h-3 w-2/3 bg-zinc-100 rounded" />
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 p-10 text-center">
      <div className="w-11 h-11 mx-auto rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-400 mb-3">{icon}</div>
      <p className="text-sm font-semibold text-zinc-800">{title}</p>
      <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">{text}</p>
    </div>
  );
}

export function NoMessages() {
  return (
    <EmptyCard
      icon={<MessageSquare className="w-5 h-5" />}
      title="No messages yet"
      text="Connect your Facebook, Instagram, and Google Business Profile in Accounts to receive customer reviews and comments here."
    />
  );
}

export function NoResults() {
  return <EmptyCard icon={<SearchX className="w-5 h-5" />} title="No results found" text="Try adjusting your search or filters." />;
}
```

- [ ] **Step 4: `ReplyComposer.tsx`**

```tsx
import { useState } from 'react';
import { ChevronDown, CircleCheck, LoaderCircle, Megaphone, PenLine, Send, Sparkles, UserPlus } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { selectDraftOption, toneLabel, type DraftState, type InboxTag, type Sentiment } from '../../utils/inbox';

const TEXTAREA = 'w-full h-24 text-sm p-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-white';
// Send buttons are teal (red for a negative message), not the orange primary.
const SEND = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-colors h-8 px-3 disabled:opacity-50 disabled:pointer-events-none';
const SMALL = 'h-8 px-3 text-xs';

interface AiSuggestionPanelProps {
  sentiment: Sentiment;
  draft: DraftState;
  generating: boolean;
  sending: boolean;
  onChange: (draft: DraftState) => void;
  onRegenerate: () => void;
  onSend: (text: string) => void;
}

export function AiSuggestionPanel({ sentiment, draft, generating, sending, onChange, onRegenerate, onSend }: AiSuggestionPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const negative = sentiment === 'negative';
  const link = cn('text-[11px] font-semibold transition-colors disabled:opacity-50', negative ? 'text-red-600 hover:text-red-800' : 'text-teal-600 hover:text-teal-800');

  return (
    <div className={cn('rounded-xl p-4 border', negative ? 'bg-red-50 border-red-100' : 'bg-teal-50 border-teal-100')}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className={cn('text-xs font-bold flex items-center gap-1.5', negative ? 'text-red-700' : 'text-teal-700')}>
          <Sparkles className="w-3.5 h-3.5" />
          AI Suggested Reply
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full ml-1', negative ? 'bg-red-100 text-red-600' : 'bg-teal-100 text-teal-600')}>
            {toneLabel(sentiment)}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button type="button" className={link} onClick={onRegenerate} disabled={generating}>
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button type="button" className={link} onClick={() => onChange({ ...draft, editing: !draft.editing })}>
            {draft.editing ? 'Preview' : 'Edit'}
          </button>
        </div>
      </div>

      {draft.options.length > 1 && (
        <div className="relative mb-2">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-white transition-colors',
              negative ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-teal-200 text-teal-700 hover:bg-teal-50',
            )}
          >
            Option {draft.index + 1} of {draft.options.length}
            <ChevronDown className={cn('w-3 h-3 transition-transform', pickerOpen && 'rotate-180')} />
          </button>
          {pickerOpen && (
            <div role="listbox" className="absolute left-0 z-20 mt-1 w-72 max-w-full bg-white rounded-xl border border-zinc-200 shadow-lg py-1">
              {draft.options.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={i === draft.index}
                  onClick={() => { onChange(selectDraftOption(draft, i)); setPickerOpen(false); }}
                  className={cn('w-full text-left px-3 py-2 transition-colors', i === draft.index ? 'bg-zinc-50' : 'hover:bg-zinc-50')}
                >
                  <span className="block text-[11px] font-semibold text-zinc-800">Option {i + 1}</span>
                  <span className="block text-xs text-zinc-500 truncate">{option}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {draft.editing ? (
        <textarea className={TEXTAREA} value={draft.text} aria-label="Reply" onChange={(e) => onChange({ ...draft, text: e.target.value })} />
      ) : (
        <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{draft.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          disabled={sending || !draft.text.trim()}
          onClick={() => onSend(draft.text)}
          className={cn(SEND, negative ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700')}
        >
          {sending ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending…' : 'Approve & Send'}
        </button>
        {!draft.editing && (
          <Button variant="secondary" className={SMALL} onClick={() => onChange({ ...draft, editing: true })}>Edit</Button>
        )}
      </div>
    </div>
  );
}

interface ManualComposerProps {
  customerName: string;
  text: string;
  generating: boolean;
  sending: boolean;
  onText: (text: string) => void;
  onCancel: () => void;
  onTryAi: () => void;
  onSend: (text: string) => void;
}

export function ManualComposer({ customerName, text, generating, sending, onText, onCancel, onTryAi, onSend }: ManualComposerProps) {
  return (
    <div className="rounded-xl p-4 border border-zinc-200 bg-zinc-50/50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">Your reply</p>
        <button type="button" onClick={onCancel} className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 transition-colors">Cancel</button>
      </div>
      <textarea className={TEXTAREA} value={text} placeholder={`Reply to ${customerName}…`} onChange={(e) => onText(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <button
          type="button"
          onClick={onTryAi}
          disabled={generating}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating ? 'Generating…' : 'Try AI instead'}
        </button>
        <button type="button" onClick={() => onSend(text)} disabled={sending || !text.trim()} className={cn(SEND, 'bg-teal-600 hover:bg-teal-700')}>
          {sending ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}

export function ReplyStarter({ generating, onGenerate, onManual }: { generating: boolean; onGenerate: () => void; onManual: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" className={SMALL} onClick={onGenerate} disabled={generating}>
        {generating ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {generating ? 'Generating…' : 'Generate AI Reply'}
      </Button>
      <Button variant="secondary" className={SMALL} onClick={onManual}>
        <PenLine className="w-3.5 h-3.5" />
        Write manually
      </Button>
    </div>
  );
}

export function LeadPrompt({ tag, created, busy, onCreate }: { tag: InboxTag; created: boolean; busy: boolean; onCreate: () => void }) {
  if (created) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
        <CircleCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-xs font-medium text-green-700">Lead created successfully</p>
      </div>
    );
  }
  const isLead = tag === 'lead';
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg p-3 border', isLead ? 'bg-green-50 border-green-200' : 'bg-zinc-50 border-zinc-200')}>
      <p className={cn('text-xs font-medium', isLead ? 'text-green-700' : 'text-zinc-600')}>
        {isLead ? 'This looks like a sales lead!' : 'Track this customer as a lead?'}
      </p>
      <Button variant="secondary" className="h-7 px-2.5 text-xs" onClick={onCreate} disabled={busy}>
        {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
        {isLead ? 'Create Lead' : 'Mark as lead'}
      </Button>
    </div>
  );
}

// Our extra: a 4–5★ review becomes a thank-you post draft in Create.
export function TurnIntoPostRow({ rating, busy, onClick }: { rating: number; busy: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg p-3 border border-orange-100 bg-orange-50/50">
      <p className="text-xs font-medium text-zinc-700">Share this {rating}★ review as a post.</p>
      <Button variant="secondary" className="h-7 px-2.5 text-xs" onClick={onClick} disabled={busy}>
        {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
        Turn into post
      </Button>
    </div>
  );
}

export function SpamNotice({ onNotSpam }: { onNotSpam: () => void }) {
  return (
    <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-lg p-3">
      <p className="text-xs text-zinc-500">Spam messages are hidden from responses.</p>
      <button type="button" onClick={onNotSpam} className="text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">Not spam</button>
    </div>
  );
}

export function ReplySent() {
  return (
    <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3">
      <CircleCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
      <p className="text-xs font-medium text-teal-700">Reply sent successfully</p>
    </div>
  );
}
```

- [ ] **Step 5: `MessageCard.tsx`**

```tsx
import { useState } from 'react';
import { ChevronDown, Mail, TriangleAlert } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { canTurnIntoPost, iconPlatform, type DraftState, type InboxItem, type InboxReplyItem } from '../../utils/inbox';
import { SentimentBadge, StarRating, TagBadge } from './Badges';
import { AiSuggestionPanel, LeadPrompt, ManualComposer, ReplySent, ReplyStarter, SpamNotice, TurnIntoPostRow } from './ReplyComposer';

export interface MessageCardProps {
  item: InboxItem;
  expanded: boolean;
  /** reply_inbox: answering, leads and "Turn into post". */
  canReply: boolean;
  draft: DraftState | undefined;
  generating: boolean;
  sending: boolean;
  sent: boolean;
  leadBusy: boolean;
  leadCreated: boolean;
  converting: boolean;
  onToggle: (item: InboxItem) => void;
  onDraftChange: (id: string, draft: DraftState) => void;
  onGenerate: (item: InboxItem) => void;
  onSend: (item: InboxItem, text: string) => void;
  onCreateLead: (item: InboxItem) => void;
  onNotSpam: (item: InboxItem) => void;
  onTurnIntoPost: (item: InboxItem) => void;
}

function PostContextBlock({ item }: { item: InboxItem }) {
  const text = item.postContext ?? 'View original post';
  return (
    <div className="flex items-center gap-2.5 bg-zinc-50 rounded-lg border border-zinc-100 px-3 py-2">
      {item.postThumbnail && <img src={item.postThumbnail} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0 border border-zinc-200" />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">In response to</p>
        {item.postExternalUrl ? (
          <a href={item.postExternalUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium text-zinc-700 hover:text-orange-600 transition-colors">
            {text} ↗
          </a>
        ) : (
          <p className="truncate text-xs font-medium text-zinc-700">{text}</p>
        )}
      </div>
    </div>
  );
}

// We store one dealer reply per message; it shows as a thread item without a nested composer.
function ReplyThread({ replies }: { replies: InboxReplyItem[] }) {
  return (
    <div className="space-y-2 pl-3 border-l-2 border-zinc-100">
      {replies.map((r) => (
        <div key={r.id} className="flex items-start gap-2.5">
          <span className="w-7 h-7 rounded-full bg-orange-50 text-orange-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">You</span>
          <div className="min-w-0">
            <p className="text-xs">
              <span className="font-semibold text-zinc-800">You</span>
              <span className="text-zinc-400"> · dealer</span>
              {r.timestamp && <span className="text-zinc-400 ml-2">{r.timestamp}</span>}
            </p>
            <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap mt-0.5">{r.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageCard(props: MessageCardProps) {
  const { item, expanded, canReply, draft, generating, sending, sent, leadBusy, leadCreated, converting } = props;
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState('');
  const negative = item.sentiment === 'negative';
  const icon = iconPlatform(item.platform);

  const replyArea = () => {
    if (sent) return <ReplySent />;
    if (item.tag === 'spam') return <SpamNotice onNotSpam={() => props.onNotSpam(item)} />;
    if (item.responded) return null;
    if (draft) {
      return (
        <AiSuggestionPanel
          sentiment={item.sentiment}
          draft={draft}
          generating={generating}
          sending={sending}
          onChange={(next) => props.onDraftChange(item.id, next)}
          onRegenerate={() => props.onGenerate(item)}
          onSend={(text) => props.onSend(item, text)}
        />
      );
    }
    if (manual) {
      return (
        <ManualComposer
          customerName={item.customerName}
          text={manualText}
          generating={generating}
          sending={sending}
          onText={setManualText}
          onCancel={() => setManual(false)}
          onTryAi={() => props.onGenerate(item)}
          onSend={(text) => props.onSend(item, text)}
        />
      );
    }
    return <ReplyStarter generating={generating} onGenerate={() => props.onGenerate(item)} onManual={() => setManual(true)} />;
  };

  return (
    <div
      className={cn(
        'rounded-xl border shadow-sm transition-all duration-200 relative overflow-hidden',
        !item.isRead && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-orange-500',
        item.isRead ? 'bg-zinc-50/60' : 'bg-white',
        expanded
          ? cn('shadow-md', negative ? 'border-red-200' : 'border-zinc-300')
          : cn('hover:shadow-md', negative ? 'border-red-200/80' : 'border-zinc-200/80 hover:border-zinc-300'),
      )}
    >
      <button type="button" onClick={() => props.onToggle(item)} aria-expanded={expanded} className="w-full text-left flex items-start gap-3 p-4">
        <span className="relative w-9 h-9 rounded-full bg-zinc-100 text-zinc-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {item.customerInitials}
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center">
            {icon ? <PlatformIcon platform={icon} size="sm" className="w-3 h-3" /> : <Mail className="w-2.5 h-2.5 text-zinc-500" />}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('text-sm leading-tight', item.isRead ? 'font-medium text-zinc-600' : 'font-bold text-zinc-900')}>{item.customerName}</span>
            {!item.isRead && <span aria-label="Unread" title="Unread" className="w-2 h-2 bg-orange-600 rounded-full flex-shrink-0" />}
            <SentimentBadge sentiment={item.sentiment} />
            <TagBadge tag={item.tag} />
            <span className="ml-auto text-[11px] text-zinc-400 whitespace-nowrap">{item.timestamp}</span>
          </span>
          {item.rating !== undefined && (
            <span className="mt-1 flex"><StarRating rating={item.rating} /></span>
          )}
          {item.text && (
            <span className={cn('mt-1 block text-sm text-zinc-600 leading-relaxed', !expanded && 'line-clamp-2')}>{item.text}</span>
          )}
          {!expanded && item.postContext && (
            <span className="mt-1 block truncate text-[11px] text-zinc-400">on “{item.postContext}”</span>
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 flex-shrink-0 mt-1 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 space-y-3">
          {(item.postContext || item.postThumbnail) && <PostContextBlock item={item} />}
          {negative && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <TriangleAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs font-medium text-red-700">Negative sentiment — review carefully before sending.</p>
            </div>
          )}
          {item.replies.length > 0 && <ReplyThread replies={item.replies} />}
          {canReply && replyArea()}
          {canReply && !sent && item.tag !== 'spam' && (
            <LeadPrompt tag={item.tag} created={leadCreated} busy={leadBusy} onCreate={() => props.onCreateLead(item)} />
          )}
          {canReply && canTurnIntoPost(item) && (
            <TurnIntoPostRow rating={item.rating ?? 0} busy={converting} onClick={() => props.onTurnIntoPost(item)} />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `InboxSidebar.tsx`**

```tsx
import type { ComponentType, ReactNode } from 'react';
import { Flag, MessageSquare, Send, Star, ThumbsUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { avgRatingFor, unreadByPlatform, weeklyPlatformCounts, type InboxItem, type InboxPlatform, type InboxStats } from '../../utils/inbox';

const CARD = 'bg-white rounded-xl border border-zinc-200/80 p-5 shadow-sm';

function StatRow({ label, value, valueClass, sub, icon, iconBg }: { label: string; value: string; valueClass: string; sub: string; icon: ReactNode; iconBg: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
        <p className="text-[11px] text-zinc-400">{sub}</p>
      </div>
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', iconBg)}>{icon}</div>
    </div>
  );
}

export function ResponseStatsCard({ stats }: { stats: InboxStats }) {
  return (
    <div className={cn(CARD, 'space-y-4')}>
      <h3 className="text-sm font-semibold text-zinc-900">Response Stats</h3>
      <div>
        <StatRow
          label="Response Rate"
          value={`${stats.responseRate}%`}
          valueClass="text-teal-600"
          sub="this month"
          icon={<Send className="w-4 h-4 text-teal-500" />}
          iconBg="bg-teal-50"
        />
        <div className="mt-3 w-full bg-zinc-100 rounded-full h-1.5">
          <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${stats.responseRate}%` }} />
        </div>
      </div>
      <div className="pt-4 border-t border-zinc-100">
        <StatRow
          label="Pending Replies"
          value={String(stats.pending)}
          valueClass={stats.pending > 0 ? 'text-orange-600' : 'text-zinc-900'}
          sub={stats.pending > 0 ? 'need attention' : 'all caught up'}
          icon={<MessageSquare className="w-4 h-4 text-orange-600" />}
          iconBg="bg-orange-50"
        />
      </div>
    </div>
  );
}

const BREAKDOWN: Array<{ platform: Exclude<InboxPlatform, 'email'>; label: string; icon: 'gmb' | 'facebook' | 'instagram' | 'youtube' }> = [
  { platform: 'google', label: 'Google Reviews', icon: 'gmb' },
  { platform: 'facebook', label: 'Facebook', icon: 'facebook' },
  { platform: 'instagram', label: 'Instagram', icon: 'instagram' },
  { platform: 'youtube', label: 'YouTube', icon: 'youtube' },
];

/** `now` comes from page state (set when the list loads), never from render. */
export function PlatformBreakdownCard({ items, now }: { items: InboxItem[]; now: number }) {
  const weekly = weeklyPlatformCounts(items, now);
  const unread = unreadByPlatform(items);
  const googleAvg = avgRatingFor(items, 'google');
  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Platform Breakdown</h3>
      <div className="space-y-2">
        {BREAKDOWN.map((row) => (
          <div key={row.platform} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center">
                <PlatformIcon platform={row.icon} size="sm" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-800">{row.label}</p>
                <p className="text-[10px] text-zinc-400">
                  {row.platform === 'google' && googleAvg > 0 ? `${googleAvg.toFixed(1)} avg · ` : ''}{weekly[row.platform]} this week
                </p>
              </div>
            </div>
            {unread[row.platform] > 0 && (
              <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{unread[row.platform]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface QuickActionsProps {
  onReplyPositive: () => void;
  onFlagComplaints: () => void;
  onRequestReviews: () => void;
}

export function QuickActionsCard({ onReplyPositive, onFlagComplaints, onRequestReviews }: QuickActionsProps) {
  const actions: Array<{ label: string; icon: ComponentType<{ className?: string }>; iconBg: string; iconColor: string; onClick: () => void }> = [
    { label: 'Reply to all positive reviews', icon: ThumbsUp, iconBg: 'bg-teal-50', iconColor: 'text-teal-600', onClick: onReplyPositive },
    { label: 'Flag unresolved complaints', icon: Flag, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', onClick: onFlagComplaints },
    { label: 'Request more Google reviews', icon: Star, iconBg: 'bg-yellow-50', iconColor: 'text-yellow-500', onClick: onRequestReviews },
  ];
  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Quick Actions</h3>
      <div className="space-y-1">
        {actions.map(({ label, icon: Icon, iconBg, iconColor, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-all duration-150 text-left"
          >
            <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
              <Icon className={cn('w-3.5 h-3.5', iconColor)} />
            </span>
            <span className="text-xs font-semibold text-zinc-700">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `MarkAllReadModal.tsx`**

```tsx
import { LoaderCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { markAllDescription } from '../../utils/inbox';

interface MarkAllReadModalProps {
  open: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function MarkAllReadModal({ open, count, busy, onClose, onConfirm }: MarkAllReadModalProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="sm"
      title="Mark all as read?"
      description={markAllDescription(count)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Mark all read
          </Button>
        </>
      }
    >
      <p className="text-sm text-zinc-600">Unread indicators will be cleared for all messages in your inbox.</p>
    </Modal>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npm run build -w web`
Expected: exits 0 (the components are not used yet; they must type-check).

Run: `cd apps/web && npx eslint src/components/inbox && npx eslint . | tail -1`
Expected: no problems in `components/inbox`; total ≤ 55.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/inbox
git commit -m "feat(web): inbox message cards, filters, reply composer and side panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Inbox page, auto-reply modal and sidebar badge

**Files:**
- Create: `apps/web/src/components/inbox/AutoReplySettings.tsx`
- Modify: `apps/web/src/pages/InboxPage.tsx` (replace the whole file), `apps/web/src/services/inbox.ts` (rule bodies), `apps/web/src/components/shell/Sidebar.tsx`

**Interfaces:**
- Consumes:
  - Task 8: `utils/inbox.ts` (`toInboxItem`, `inboxStats`, `filterMessages`, `DEFAULT_FILTERS`, `quickActionFilters`, `REVIEW_REQUEST_PROMPT`, `draftFromSuggestions`, `apiPlatform`, types); `inboxService.pendingCount/generateReply/generatePostDraft/updateTag`, `leadService.create`.
  - Task 9: every `components/inbox/*` component.
  - Existing: `PageCard`, `PlanGatedNotice`, `Button`, `cn`, `ThemedSelect`, `Modal`, `useToast`, `useAuth`, `can`, `PERMISSIONS`, `ApiError`, `isPlanGated`.
- Produces:
  - `AutoReplyModal({ open, onClose })`.
  - `services/inbox.ts`: `interface RuleInput`; `createRule(data: RuleInput)` and `updateRule(id, data: Partial<RuleInput>)` send the camelCase fields the rules API reads; `generatePostDraft(id)` → `{ post: { id: string } }`.
  - The page dispatches `window` event `inbox:changed` after a message or all messages are marked read. `Sidebar` refreshes its badge from `GET /v1/inbox/pending-count` on that event.

- [ ] **Step 1: Rule bodies and the draft type in `apps/web/src/services/inbox.ts`.** The old page sent snake_case fields, which `POST/PUT /v1/inbox/rules` ignores (it reads `messageType`, `conditionType`, …), so rules saved empty. Above `export const inboxService`, add:

```ts
/** Editable fields of an auto-reply rule, as the page holds them (snake_case, like the rules the API returns). */
export interface RuleInput {
  platform: string;
  message_type: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  ai_tone: string | null;
  template_id: string | null;
  is_active: boolean;
}

// The rules API reads camelCase fields.
const ruleBody = (r: Partial<RuleInput>) => ({
  platform: r.platform,
  messageType: r.message_type,
  conditionType: r.condition_type,
  conditionValue: r.condition_value,
  actionType: r.action_type,
  aiTone: r.ai_tone ?? undefined,
  templateId: r.template_id ?? undefined,
  isActive: r.is_active,
});
```

and replace the `createRule`, `updateRule` and `generatePostDraft` entries with:

```ts
  createRule: (data: RuleInput) =>
    api.post<{ item: AutoReplyRule }>('/inbox/rules', ruleBody(data)),

  updateRule: (id: string, data: Partial<RuleInput>) =>
    api.put<{ item: AutoReplyRule }>(`/inbox/rules/${id}`, ruleBody(data)),

  // "Turn into post" only needs the new draft's id (it opens /create?edit=<id>).
  generatePostDraft: (id: string) =>
    api.post<{ post: { id: string } }>(`/inbox/${id}/generate-post-draft`),
```

- [ ] **Step 2: `apps/web/src/components/inbox/AutoReplySettings.tsx`** (the old page's toggle, rules and templates, same endpoints):

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import { inboxService, type AutoReplyRule, type AutoReplyTemplate, type RuleInput } from '../../services/inbox';

const EMPTY_RULE: RuleInput = {
  platform: 'all', message_type: 'all', condition_type: 'always', condition_value: '',
  action_type: 'ai', ai_tone: 'friendly', template_id: null, is_active: true,
};

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'gmb', label: 'Google Business' },
  { value: 'email', label: 'Email' },
];
const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'comment', label: 'Comments' },
  { value: 'dm', label: 'DMs' },
  { value: 'review', label: 'Reviews' },
  { value: 'email', label: 'Emails' },
];
const CONDITION_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'sentiment_is', label: 'Sentiment is…' },
  { value: 'rating_is', label: 'Rating is…' },
  { value: 'contains_keywords', label: 'Contains keywords…' },
];
const ACTION_OPTIONS = [
  { value: 'ai', label: 'AI reply' },
  { value: 'template', label: 'Saved template' },
  { value: 'manual', label: 'Manual review (no auto-reply)' },
];
const TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'apologetic', label: 'Apologetic' },
  { value: 'casual', label: 'Casual' },
];
const CONDITION_HINTS: Record<string, { label: string; placeholder: string }> = {
  sentiment_is: { label: 'Sentiment (positive, neutral or negative)', placeholder: 'negative' },
  rating_is: { label: 'Star ratings, comma separated', placeholder: '1,2' },
  contains_keywords: { label: 'Keywords, comma separated', placeholder: 'price, emi, test drive' },
};
const PLACEHOLDERS = [
  { value: '{{customer_name}}', label: 'Customer' },
  { value: '{{dealer_name}}', label: 'Dealer' },
  { value: '{{phone}}', label: 'Phone' },
  { value: '{{whatsapp}}', label: 'WhatsApp' },
  { value: '{{city}}', label: 'City' },
  { value: '{{email_subject}}', label: 'Email subject' },
];

const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1';
const INPUT = 'w-full h-9 text-sm px-3 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30';
const TEXTAREA = 'w-full text-sm p-3 border border-zinc-200 rounded-lg bg-white resize-none focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30';
const ICON_BUTTON = 'p-1.5 rounded-md text-zinc-400 transition-colors';

const optionLabel = (options: Array<{ value: string; label: string }>, value: string | null) =>
  options.find((o) => o.value === value)?.label ?? value ?? '';

function AutoReplySettings() {
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'rules' | 'templates'>('rules');
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [templates, setTemplates] = useState<AutoReplyTemplate[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleInput>(EMPTY_RULE);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', text: '' });
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Mounted when the modal opens (Modal renders nothing while closed), so this loads on every open.
  useEffect(() => {
    inboxService.getSettings().then((s) => setEnabled(s.autoReplyEnabled)).catch(() => setEnabled(false));
    inboxService.listRules().then((r) => setRules(r.items)).catch(() => {});
    inboxService.listTemplates().then((t) => setTemplates(t.items)).catch(() => {});
  }, []);

  const toggleEnabled = async () => {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    try {
      await inboxService.updateSettings(next);
      addToast({
        type: 'success',
        title: next ? 'Auto-reply is on' : 'Auto-reply is off',
        message: next ? 'Matching messages get a reply automatically.' : 'AI drafts wait for your approval in the inbox.',
      });
    } catch {
      setEnabled(!next);
      addToast({ type: 'error', title: 'Could not change auto-reply' });
    }
  };

  const resetRule = () => {
    setEditingRule(null);
    setRuleForm(EMPTY_RULE);
  };

  const saveRule = async (e: FormEvent) => {
    e.preventDefault();
    if (ruleForm.action_type === 'template' && !ruleForm.template_id) {
      addToast({ type: 'error', title: 'Choose a template' });
      return;
    }
    const body: RuleInput = { ...ruleForm, condition_value: ruleForm.condition_type === 'always' ? '' : ruleForm.condition_value.trim() };
    try {
      if (editingRule) await inboxService.updateRule(editingRule, body);
      else await inboxService.createRule(body);
      addToast({ type: 'success', title: editingRule ? 'Rule updated' : 'Rule added' });
      resetRule();
      setRules((await inboxService.listRules()).items);
    } catch {
      addToast({ type: 'error', title: 'Could not save the rule' });
    }
  };

  const editRule = (rule: AutoReplyRule) => {
    setEditingRule(rule.id);
    setRuleForm({
      platform: rule.platform, message_type: rule.message_type, condition_type: rule.condition_type,
      condition_value: rule.condition_value ?? '', action_type: rule.action_type, ai_tone: rule.ai_tone,
      template_id: rule.template_id, is_active: rule.is_active,
    });
  };

  const toggleRule = async (rule: AutoReplyRule) => {
    try {
      await inboxService.updateRule(rule.id, { is_active: !rule.is_active });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !rule.is_active } : r)));
    } catch {
      addToast({ type: 'error', title: 'Could not update the rule' });
    }
  };

  const deleteRule = async (rule: AutoReplyRule) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await inboxService.deleteRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch {
      addToast({ type: 'error', title: 'Could not delete the rule' });
    }
  };

  const resetTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', text: '' });
  };

  const saveTemplate = async (e: FormEvent) => {
    e.preventDefault();
    const data = { name: templateForm.name.trim(), text: templateForm.text.trim() };
    if (!data.name || !data.text) return;
    try {
      if (editingTemplate) await inboxService.updateTemplate(editingTemplate, data);
      else await inboxService.createTemplate(data);
      addToast({ type: 'success', title: editingTemplate ? 'Template updated' : 'Template added' });
      resetTemplate();
      setTemplates((await inboxService.listTemplates()).items);
    } catch {
      addToast({ type: 'error', title: 'Could not save the template' });
    }
  };

  const deleteTemplate = async (template: AutoReplyTemplate) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await inboxService.deleteTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch {
      addToast({ type: 'error', title: 'Could not delete the template' });
    }
  };

  // Inserts a placeholder at the cursor and puts the caret after it.
  const insertPlaceholder = (placeholder: string) => {
    const area = textRef.current;
    const start = area?.selectionStart ?? templateForm.text.length;
    const end = area?.selectionEnd ?? start;
    setTemplateForm((f) => ({ ...f, text: f.text.slice(0, start) + placeholder + f.text.slice(end) }));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  const hint = CONDITION_HINTS[ruleForm.condition_type];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Send replies automatically</p>
          <p className="text-xs text-zinc-500 mt-0.5">When off, AI drafts wait for your approval in the inbox.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!enabled}
          aria-label="Send replies automatically"
          disabled={enabled === null}
          onClick={() => void toggleEnabled()}
          className={cn('relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50', enabled ? 'bg-emerald-500' : 'bg-zinc-300')}
        >
          <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </div>

      <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1" role="tablist" aria-label="Auto-reply settings">
        {(['rules', 'templates'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn('px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all', tab === id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
          >
            {id === 'rules' ? 'Rules' : 'Templates'}
          </button>
        ))}
      </div>

      {tab === 'rules' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <form onSubmit={(e) => void saveRule(e)} className="space-y-3 rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-900">{editingRule ? 'Edit rule' : 'New rule'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={LABEL}>Platform</span>
                <ThemedSelect value={ruleForm.platform} onChange={(v) => setRuleForm((f) => ({ ...f, platform: v }))} options={PLATFORM_OPTIONS} ariaLabel="Platform" />
              </div>
              <div>
                <span className={LABEL}>Message type</span>
                <ThemedSelect value={ruleForm.message_type} onChange={(v) => setRuleForm((f) => ({ ...f, message_type: v }))} options={TYPE_OPTIONS} ariaLabel="Message type" />
              </div>
            </div>
            <div>
              <span className={LABEL}>When</span>
              <ThemedSelect value={ruleForm.condition_type} onChange={(v) => setRuleForm((f) => ({ ...f, condition_type: v }))} options={CONDITION_OPTIONS} ariaLabel="When" />
            </div>
            {hint && (
              <label className="block">
                <span className={LABEL}>{hint.label}</span>
                <input
                  required
                  value={ruleForm.condition_value}
                  placeholder={hint.placeholder}
                  onChange={(e) => setRuleForm((f) => ({ ...f, condition_value: e.target.value }))}
                  className={INPUT}
                />
              </label>
            )}
            <div>
              <span className={LABEL}>Reply with</span>
              <ThemedSelect value={ruleForm.action_type} onChange={(v) => setRuleForm((f) => ({ ...f, action_type: v }))} options={ACTION_OPTIONS} ariaLabel="Reply with" />
            </div>
            {ruleForm.action_type === 'ai' && (
              <div>
                <span className={LABEL}>AI tone</span>
                <ThemedSelect value={ruleForm.ai_tone ?? 'friendly'} onChange={(v) => setRuleForm((f) => ({ ...f, ai_tone: v }))} options={TONE_OPTIONS} ariaLabel="AI tone" />
              </div>
            )}
            {ruleForm.action_type === 'template' && (
              <div>
                <span className={LABEL}>Template</span>
                <ThemedSelect
                  value={ruleForm.template_id ?? ''}
                  onChange={(v) => setRuleForm((f) => ({ ...f, template_id: v }))}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Choose a template"
                  ariaLabel="Template"
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">{editingRule ? 'Save rule' : 'Add rule'}</Button>
              {editingRule && <Button type="button" variant="secondary" onClick={resetRule}>Cancel</Button>}
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">
              Rules <span className="text-xs font-normal text-zinc-400">· the first match decides</span>
            </p>
            {rules.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center rounded-xl border border-dashed border-zinc-200">No rules yet. New messages get an AI reply by default.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {rules.map((rule) => (
                  <div key={rule.id} className={cn('rounded-xl border border-zinc-200 p-3 flex items-start justify-between gap-3', !rule.is_active && 'opacity-60')}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-800">
                        {optionLabel(PLATFORM_OPTIONS, rule.platform)} · {optionLabel(TYPE_OPTIONS, rule.message_type)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {optionLabel(CONDITION_OPTIONS, rule.condition_type)}
                        {rule.condition_value ? ` “${rule.condition_value}”` : ''}
                        {' → '}
                        {rule.action_type === 'template'
                          ? `Template: ${rule.template?.name ?? 'deleted'}`
                          : rule.action_type === 'ai' ? `AI reply (${rule.ai_tone ?? 'friendly'})` : 'Manual review'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void toggleRule(rule)}
                        className={cn('text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors', rule.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200')}
                      >
                        {rule.is_active ? 'Active' : 'Paused'}
                      </button>
                      <button type="button" aria-label="Edit rule" onClick={() => editRule(rule)} className={cn(ICON_BUTTON, 'hover:text-zinc-700 hover:bg-zinc-100')}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" aria-label="Delete rule" onClick={() => void deleteRule(rule)} className={cn(ICON_BUTTON, 'hover:text-red-600 hover:bg-red-50')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5 items-start">
          <form onSubmit={(e) => void saveTemplate(e)} className="space-y-3 rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-900">{editingTemplate ? 'Edit template' : 'New template'}</p>
            <label className="block">
              <span className={LABEL}>Name</span>
              <input
                required
                value={templateForm.name}
                placeholder="e.g. Price enquiry"
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Reply</span>
              <textarea
                ref={textRef}
                required
                rows={6}
                value={templateForm.text}
                placeholder="Hi {{customer_name}}, thanks for writing to {{dealer_name}}…"
                onChange={(e) => setTemplateForm((f) => ({ ...f, text: e.target.value }))}
                className={TEXTAREA}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 mr-1">Insert</span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => insertPlaceholder(p.value)}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-300 hover:bg-orange-50 transition-colors"
                >
                  + {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">{editingTemplate ? 'Save template' : 'Add template'}</Button>
              {editingTemplate && <Button type="button" variant="secondary" onClick={resetTemplate}>Cancel</Button>}
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Templates</p>
            {templates.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center rounded-xl border border-dashed border-zinc-200">No templates yet. Add one to reply the same way every time.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {templates.map((t) => (
                  <div key={t.id} className="rounded-xl border border-zinc-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Edit template"
                          onClick={() => { setEditingTemplate(t.id); setTemplateForm({ name: t.name, text: t.text }); }}
                          className={cn(ICON_BUTTON, 'hover:text-zinc-700 hover:bg-zinc-100')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" aria-label="Delete template" onClick={() => void deleteTemplate(t)} className={cn(ICON_BUTTON, 'hover:text-red-600 hover:bg-red-50')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1.5 whitespace-pre-wrap leading-relaxed">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Our extra (not in the reference): the auto-reply toggle, rules and templates from the old Inbox page.
export function AutoReplyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={open} onClose={onClose} size="full" title="Auto-reply" description="Rules and saved replies for new messages.">
      <AutoReplySettings />
    </Modal>
  );
}
```

- [ ] **Step 3: `apps/web/src/pages/InboxPage.tsx`** — replace the whole file:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCheck, RefreshCw, Search } from 'lucide-react';
import { AutoReplyModal } from '../components/inbox/AutoReplySettings';
import { StatPill } from '../components/inbox/Badges';
import { FilterBar } from '../components/inbox/FilterBar';
import { PlatformBreakdownCard, QuickActionsCard, ResponseStatsCard } from '../components/inbox/InboxSidebar';
import { MarkAllReadModal } from '../components/inbox/MarkAllReadModal';
import { MessageCard } from '../components/inbox/MessageCard';
import { MessageSkeleton, NoMessages, NoResults } from '../components/inbox/MessageList';
import { Button, cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { PlanGatedNotice } from '../components/ui/PlanGatedNotice';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { can, PERMISSIONS } from '../lib/permissions';
import { ApiError, isPlanGated } from '../services/api';
import { inboxService, leadService } from '../services/inbox';
import {
  apiPlatform, DEFAULT_FILTERS, draftFromSuggestions, filterMessages, inboxStats, quickActionFilters, REVIEW_REQUEST_PROMPT,
  toInboxItem, type DraftState, type InboxFilters, type InboxItem,
} from '../utils/inbox';

const POLL_MS = 60_000;
const SEARCH = 'pl-9 pr-4 h-9 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-zinc-400 bg-white transition-colors';

const withId = (set: Set<string>, id: string) => new Set(set).add(id);
const withoutId = (set: Set<string>, id: string) => {
  const next = new Set(set);
  next.delete(id);
  return next;
};
// The sidebar's Inbox badge listens for this.
const inboxChanged = () => window.dispatchEvent(new Event('inbox:changed'));

export default function InboxPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const canReply = can(user, PERMISSIONS.REPLY_INBOX);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [planGated, setPlanGated] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [generating, setGenerating] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState<Set<string>>(() => new Set());
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [leadBusy, setLeadBusy] = useState<Set<string>>(() => new Set());
  const [leadCreated, setLeadCreated] = useState<Set<string>>(() => new Set());
  const [converting, setConverting] = useState<string | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [autoReplyOpen, setAutoReplyOpen] = useState(false);

  // List failures stay silent, as in the reference; a plan without the inbox gets the upgrade notice.
  const load = useCallback(() =>
    inboxService.list({ pageSize: 50 })
      .then((res) => {
        setItems(res.items.map(toInboxItem));
        setNow(Date.now());
        setPlanGated(null);
      })
      .catch((err: unknown) => {
        if (isPlanGated(err)) setPlanGated(err.message);
      })
      .finally(() => setLoading(false)), []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const planToast = (err: unknown, forReply: boolean): boolean => {
    if (!isPlanGated(err)) return false;
    addToast({
      type: 'error',
      title: 'Upgrade required',
      message: forReply
        ? 'Replying to reviews is a Growth/Pro feature. Upgrade in Settings → Billing.'
        : 'AI reply suggestions are a Growth/Pro feature. Upgrade in Settings → Billing.',
    });
    return true;
  };

  const toggle = (item: InboxItem) => {
    const opening = !expanded.has(item.id);
    setExpanded((prev) => (prev.has(item.id) ? withoutId(prev, item.id) : withId(prev, item.id)));
    // A suggestion saved earlier (an auto-reply rule awaiting approval) opens in the AI panel.
    if (opening && item.aiSuggestedReply && !drafts[item.id]) {
      setDrafts((prev) => ({ ...prev, [item.id]: draftFromSuggestions([item.aiSuggestedReply ?? '']) }));
    }
    if (opening && !item.isRead) {
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)));
      inboxService.markRead(item.id).then(inboxChanged).catch(() => {});
    }
  };

  const setDraft = (id: string, draft: DraftState) => setDrafts((prev) => ({ ...prev, [id]: draft }));

  const generate = async (item: InboxItem) => {
    setGenerating((s) => withId(s, item.id));
    try {
      const res = await inboxService.generateReply(item.id);
      setDraft(item.id, draftFromSuggestions(res.suggestions?.length ? res.suggestions : [res.suggestedReply]));
    } catch (err) {
      if (planToast(err, false)) return;
      if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') {
        addToast({ type: 'error', title: 'AI replies aren’t set up yet', message: 'Write your reply manually for now.' });
      } else {
        addToast({ type: 'error', title: 'Failed to generate reply', message: 'Please try again.' });
      }
    } finally {
      setGenerating((s) => withoutId(s, item.id));
    }
  };

  const send = async (item: InboxItem, text: string) => {
    setSending((s) => withId(s, item.id));
    try {
      const res = await inboxService.sendReply(item.id, text.trim());
      setItems((prev) => prev.map((m) => (m.id === item.id ? toInboxItem(res.item) : m)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      if (res.delivered === false) {
        addToast({ type: 'warning', title: 'Reply saved, not delivered', message: 'Check that this platform is connected in Accounts, then try again.' });
      } else {
        setSent((s) => withId(s, item.id));
        addToast({ type: 'success', title: 'Reply sent' });
      }
    } catch (err) {
      if (planToast(err, true)) return;
      addToast({ type: 'error', title: 'Reply failed', message: 'Could not post your reply. Please try again.' });
    } finally {
      setSending((s) => withoutId(s, item.id));
    }
  };

  const createLead = async (item: InboxItem) => {
    setLeadBusy((s) => withId(s, item.id));
    try {
      await leadService.create({ customerName: item.customerName, sourcePlatform: apiPlatform(item.platform), sourceMessageId: item.id });
      setLeadCreated((s) => withId(s, item.id));
      setItems((prev) => prev.map((m) => (m.id === item.id && m.tag === 'general' ? { ...m, tag: 'lead' } : m)));
      addToast({ type: 'success', title: 'Lead created', message: `${item.customerName} added to your leads.` });
    } catch {
      addToast({ type: 'error', title: 'Failed to create lead', message: 'Please try again.' });
    } finally {
      setLeadBusy((s) => withoutId(s, item.id));
    }
  };

  const markNotSpam = async (item: InboxItem) => {
    try {
      await inboxService.updateTag(item.id, 'general');
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, tag: 'general' } : m)));
    } catch {
      addToast({ type: 'error', title: 'Could not update message', message: 'Please try again.' });
    }
  };

  const turnIntoPost = async (item: InboxItem) => {
    setConverting(item.id);
    try {
      const { post } = await inboxService.generatePostDraft(item.id);
      navigate(`/create?edit=${encodeURIComponent(post.id)}`);
    } catch (err) {
      const notSetUp = err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED';
      addToast({
        type: 'error',
        title: notSetUp ? 'AI isn’t set up yet' : 'Could not create the post',
        message: notSetUp ? 'Create the post yourself in Create.' : 'Please try again.',
      });
      setConverting(null);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await inboxService.markAllRead();
      setItems((prev) => prev.map((m) => ({ ...m, isRead: true })));
      setMarkAllOpen(false);
      inboxChanged();
      addToast({ type: 'success', title: 'Marked all read' });
    } catch {
      addToast({ type: 'error', title: 'Failed', message: 'Please try again.' });
    } finally {
      setMarkingAll(false);
    }
  };

  if (planGated) return <PlanGatedNotice feature="Inbox" message={planGated} />;

  const stats = inboxStats(items);
  const visible = filterMessages(items, filters);
  const setSearch = (search: string) => setFilters((f) => ({ ...f, search }));

  return (
    <PageCard>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Inbox</h1>
          {items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatPill value={stats.unread} label="unread" dot="bg-orange-500" strong={stats.unread > 0} />
              <StatPill value={stats.replied} label="replied" dot="bg-teal-500" />
              <StatPill value={stats.avgRating.toFixed(1)} label="★ avg" dot="bg-yellow-400" />
              <StatPill value={`${stats.responseRate}%`} label="response rate" dot="bg-emerald-500" />
            </div>
          ) : (
            <p className="text-sm text-zinc-500 mt-0.5">All customer feedback across platforms — respond with AI assistance</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search messages" className={cn(SEARCH, 'w-44')} />
          </div>
          {canReply && (
            <Button variant="secondary" onClick={() => setAutoReplyOpen(true)} title="Auto-reply rules and templates">
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">Auto-reply</span>
            </Button>
          )}
          {stats.unread > 0 && (
            <Button variant="secondary" onClick={() => setMarkAllOpen(true)}>
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Mark All Read</span>
            </Button>
          )}
          <Button variant="ghost" className="w-9 px-0" onClick={refresh} title="Refresh" aria-label="Refresh">
            <RefreshCw className={cn('w-4 h-4', (refreshing || loading) && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="relative sm:hidden mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews…" aria-label="Search messages" className={cn(SEARCH, 'w-full')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-6">
        <div className="space-y-4 min-w-0">
          <FilterBar items={items} filters={filters} onChange={setFilters} />
          {loading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <MessageSkeleton key={i} />)}</div>
          ) : items.length === 0 ? (
            <NoMessages />
          ) : visible.length === 0 ? (
            <NoResults />
          ) : (
            <div className="space-y-3">
              {visible.map((item) => (
                <MessageCard
                  key={item.id}
                  item={item}
                  expanded={expanded.has(item.id)}
                  canReply={canReply}
                  draft={drafts[item.id]}
                  generating={generating.has(item.id)}
                  sending={sending.has(item.id)}
                  sent={sent.has(item.id)}
                  leadBusy={leadBusy.has(item.id)}
                  leadCreated={leadCreated.has(item.id)}
                  converting={converting === item.id}
                  onToggle={toggle}
                  onDraftChange={setDraft}
                  onGenerate={(m) => void generate(m)}
                  onSend={(m, text) => void send(m, text)}
                  onCreateLead={(m) => void createLead(m)}
                  onNotSpam={(m) => void markNotSpam(m)}
                  onTurnIntoPost={(m) => void turnIntoPost(m)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ResponseStatsCard stats={stats} />
          <PlatformBreakdownCard items={items} now={now} />
          <QuickActionsCard
            onReplyPositive={() => setFilters(quickActionFilters('reply-positive'))}
            onFlagComplaints={() => setFilters(quickActionFilters('flag-complaints'))}
            onRequestReviews={() => navigate(`/create?prompt=${encodeURIComponent(REVIEW_REQUEST_PROMPT)}`)}
          />
        </div>
      </div>

      <MarkAllReadModal open={markAllOpen} count={stats.unread} busy={markingAll} onClose={() => setMarkAllOpen(false)} onConfirm={() => void markAllRead()} />
      <AutoReplyModal open={autoReplyOpen} onClose={() => setAutoReplyOpen(false)} />
    </PageCard>
  );
}
```

- [ ] **Step 4: Sidebar badge — `apps/web/src/components/shell/Sidebar.tsx`.**
- Replace `import api from '../../services/api';` with `import { inboxService } from '../../services/inbox';`.
- Replace the comment above the effect and the `load` function inside it with:

```tsx
  // Inbox badge (unread count from GET /inbox/pending-count): refreshed on mount, every minute, on window
  // focus, and when the Inbox changes. The focus and interval refreshes skip while the tab is hidden and
  // while the last load was recent. A plan without the inbox answers 403, which leaves the badge at 0.
```

```tsx
    const load = () => {
      lastLoadAt = Date.now();
      inboxService.pendingCount()
        .then((res) => setInboxPending(res.pending))
        .catch(() => {});
    };
```

(The `inbox:changed`, focus and interval wiring stays as it is.)

- [ ] **Step 5: Verify**

Run: `npm test -w web && npm run build -w web`
Expected: pass; the build exits 0.

Run: `cd apps/web && npx eslint src/pages/InboxPage.tsx src/components/inbox src/components/shell/Sidebar.tsx src/services/inbox.ts && npx eslint . | tail -1`
Expected: no problems in these files; total ≤ 55 (the old page's `any` is gone).

Quick look (the full check is in Task 13): with `api-verify` + `web-local`, open `/inbox`. The skeletons show, then either the empty state ("No messages yet") or the list. The Auto-reply modal opens and lists rules.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/inbox/AutoReplySettings.tsx apps/web/src/pages/InboxPage.tsx apps/web/src/services/inbox.ts apps/web/src/components/shell/Sidebar.tsx
git commit -m "feat(web): Inbox page in the reference layout, with auto-reply settings and a light badge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Analytics page, and removal of the old page, service and `/v1/analytics`

**Files:**
- Create in `apps/web/src/components/analytics/`: `AnalyticsParts.tsx`, `KpiRow.tsx`, `PostPerformance.tsx`, `InsightCards.tsx`, `Recap.tsx`
- Create: `apps/web/src/pages/AnalyticsPage.tsx`
- Modify: `apps/web/src/App.tsx` (import path), `apps/api/src/index.ts` (unregister), `apps/api/test/security-routes.test.ts`
- Delete: `apps/web/src/pages/Analytics.tsx`, `apps/web/src/services/analytics.ts`, `apps/api/src/routes/analytics.ts`

**Interfaces:**
- Consumes:
  - Task 8: `utils/analytics.ts` (types, `PERIOD_OPTIONS`, `PLATFORM_PILLS`, `POST_SORTS`, `emptyPerformance`, `engagementRate`, `formatPercent`, `platformName`, `platformAbbrev`, `topPlatform`, `sortPosts`, `costPerLead`, `formatDuration`, `monthLabel`, `shortDate`, `relativeWidth`, `metricParts`, `formatINR`, `signed`); `dashboardService.get/analytics/postPerformance`; `DashboardStats.publishedThisMonth/publishedChange`.
  - Existing: `boostService.list` → `{ items, total, stats: { totalSpendThisMonth, … } }` (`GET /v1/boost`, plan-gated), `ThemedSelect`, `Button`, `PageCard`, `PlatformIcon`, `cn`.
- Produces:
  - `AnalyticsParts.tsx`: `SectionShell`, `StatTile`, `DeltaBadge`, `CardEmpty`, `PlatformIconRow`, `MetricRow`
  - `KpiRow.tsx`: `KpiRow({ stats, loading, costPerLead })`
  - `PostPerformance.tsx`: `PostPerformanceCard({ perf, platform, onPlatform })`
  - `InsightCards.tsx`: `EngagementByTypeCard({ rows, loading, className? })`, `FollowerGrowthCard({ rows, loading })`, `ReviewSummaryCard({ summary, trend, loading })`
  - `Recap.tsx`: `TopPostsCard({ posts })`, `MonthlyRecapCard({ month, stats, adSpend, costPerLead, onShare })`
  - `pages/AnalyticsPage.tsx` (default export) on `/analytics`.
  - `/v1/analytics/*` answers 404.

- [ ] **Step 1: Check for other callers first**

Run: `grep -rn "services/analytics\|analyticsService\|/v1/analytics\|routes/analytics" apps/web/src apps/api/src apps/api/test`
Expected: only `pages/Analytics.tsx`, `services/analytics.ts`, `src/index.ts` (import and register), `src/routes/analytics.ts` and `test/security-routes.test.ts`. If anything else appears, stop and report it instead of deleting.

- [ ] **Step 2: `AnalyticsParts.tsx`**

```tsx
import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { metricParts, platformAbbrev, type PerformanceBag } from '../../utils/analytics';

const ICONS: Record<string, 'facebook' | 'instagram' | 'gmb' | 'youtube'> = {
  facebook: 'facebook', instagram: 'instagram', gmb: 'gmb', google: 'gmb', youtube: 'youtube',
};

interface SectionShellProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function SectionShell({ title, subtitle, action, className, bodyClassName, children }: SectionShellProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300', className)}>
      <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export function StatTile({ label, value, sub, accent = false, title }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; title?: string }) {
  return (
    <div
      title={title}
      className={cn('rounded-xl border p-4 transition-colors', accent ? 'border-orange-200/70 bg-gradient-to-br from-orange-50/70 to-white' : 'border-zinc-100 bg-white')}
    >
      <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 mt-1 tracking-tight tabular-nums">{value}</p>
      {sub && <div className="text-[11px] text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

export function DeltaBadge({ value, up, sub }: { value: string; up: boolean; sub?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', up ? 'text-emerald-600' : 'text-red-500')}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value}
      {sub && <span className="font-normal text-zinc-400 ml-0.5">{sub}</span>}
    </span>
  );
}

export function CardEmpty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="text-center py-6">
      <div className="w-10 h-10 mx-auto rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-400 mb-2">{icon}</div>
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{text}</p>
    </div>
  );
}

export function PlatformIconRow({ platforms, max = 3 }: { platforms: string[]; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {platforms.slice(0, max).map((p) => {
        const icon = ICONS[p];
        return icon
          ? <PlatformIcon key={p} platform={icon} size="sm" />
          : <span key={p} className="text-[10px] font-bold text-zinc-400">{platformAbbrev(p)}</span>;
      })}
    </span>
  );
}

// "Reach 120 · Likes 4 · …": only the metrics above zero.
export function MetricRow({ metrics }: { metrics: PerformanceBag }) {
  const parts = metricParts(metrics);
  if (parts.length === 0) return <p className="text-[11px] text-zinc-400">No metrics yet</p>;
  return (
    <p className="text-[11px] text-zinc-500 flex flex-wrap gap-x-1.5">
      {parts.map((part, i) => (
        <span key={part.label}>
          {i > 0 && <span className="text-zinc-300 mr-1.5">·</span>}
          {part.label} <span className="font-semibold text-zinc-700">{part.value.toLocaleString('en-IN')}</span>
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 3: `KpiRow.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Eye, IndianRupee, Send, Users } from 'lucide-react';
import { cn } from '../ui/Button';
import type { DashboardStats } from '../../services/dashboard';
import { formatINR, signed } from '../../utils/analytics';
import { DeltaBadge } from './AnalyticsParts';

function KpiCard({ icon, accent, label, value, delta, sub }: { icon: ReactNode; accent: string; label: string; value: ReactNode; delta?: ReactNode; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:border-zinc-300">
      <div className={cn('w-8 h-8 rounded-lg ring-1 flex items-center justify-center mb-3', accent)}>{icon}</div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 mt-0.5 tracking-tight">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {delta}
        <span className="text-xs text-zinc-400">{sub}</span>
      </div>
    </div>
  );
}

export function KpiRow({ stats, loading, costPerLead }: { stats: DashboardStats | null; loading: boolean; costPerLead: number | null }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[132px] rounded-2xl bg-zinc-50 animate-pulse" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        icon={<Users className="w-4 h-4 text-orange-600" />}
        accent="bg-orange-50 ring-orange-100"
        label="Total Leads"
        value={stats ? stats.leadsGenerated.toLocaleString('en-IN') : '—'}
        delta={stats && stats.leadsThisWeek > 0 ? <DeltaBadge value={`+${stats.leadsThisWeek}`} up sub="this week" /> : undefined}
        sub="this month"
      />
      <KpiCard
        icon={<Send className="w-4 h-4 text-violet-600" />}
        accent="bg-violet-50 ring-violet-100"
        label="Posts Published"
        value={stats ? stats.publishedThisMonth.toLocaleString('en-IN') : '—'}
        delta={stats ? <DeltaBadge value={signed(stats.publishedChange)} up={stats.publishedChange >= 0} /> : undefined}
        sub="vs last month"
      />
      <KpiCard
        icon={<Eye className="w-4 h-4 text-sky-600" />}
        accent="bg-sky-50 ring-sky-100"
        label="Total Reach"
        value={stats ? stats.totalReach.toLocaleString('en-IN') : '—'}
        sub="across all platforms"
      />
      <KpiCard
        icon={<IndianRupee className="w-4 h-4 text-emerald-600" />}
        accent="bg-emerald-50 ring-emerald-100"
        label="Cost per Lead"
        value={costPerLead === null ? '—' : formatINR(costPerLead)}
        sub="from boosted campaigns"
      />
    </div>
  );
}
```

- [ ] **Step 4: `PostPerformance.tsx`**

```tsx
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '../ui/Button';
import {
  engagementRate, formatPercent, platformAbbrev, platformName, PLATFORM_PILLS, POST_SORTS, shortDate, sortPosts, topPlatform,
  type AnalyticsPlatform, type PerformanceBag, type PostMetric, type PostPerformance, type PostSort,
} from '../../utils/analytics';
import { MetricRow, PlatformIconRow, SectionShell, StatTile } from './AnalyticsParts';

const DOTS: Record<AnalyticsPlatform, string> = { facebook: 'bg-[#1877F2]', instagram: 'bg-pink-500', gmb: 'bg-[#4285F4]' };
const INBOX_TRACKED_TITLE = 'Counts the comments, DMs and reviews our inbox sync linked to these posts. It can differ from Meta’s own comment count.';

function PlatformBreakdownInline({ byPlatform, highlight }: { byPlatform: PostPerformance['byPlatform']; highlight: 'all' | AnalyticsPlatform }) {
  const rows = (Object.entries(byPlatform) as Array<[AnalyticsPlatform, PerformanceBag | undefined]>).filter(([, bag]) => (bag?.reach ?? 0) > 0);
  if (rows.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {rows.map(([p, bag]) => (
        <span key={p} className={cn('inline-flex items-center gap-1', highlight === p && 'font-semibold text-zinc-600')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', DOTS[p])} />
          {platformAbbrev(p)} {(bag?.reach ?? 0).toLocaleString('en-IN')}
        </span>
      ))}
    </span>
  );
}

function PostRow({ post }: { post: PostMetric }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50/40 transition-colors">
      <div className="w-12 h-12 rounded-md bg-zinc-100 flex-shrink-0 overflow-hidden ring-1 ring-zinc-200">
        {post.thumbnail && <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 truncate">{post.caption || 'Untitled post'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <PlatformIconRow platforms={post.platforms} />
          {post.publishedAt && <span className="text-[11px] text-zinc-400">{shortDate(post.publishedAt)}</span>}
        </div>
        <MetricRow metrics={post} />
      </div>
    </div>
  );
}

function TopPerformer({ post }: { post: PostMetric }) {
  return (
    <div className="relative flex items-center gap-3 p-3 rounded-lg border border-orange-200/70 bg-white shadow-sm mt-4 mb-4 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
      <div className="w-14 h-14 rounded-md bg-zinc-100 flex-shrink-0 overflow-hidden ring-1 ring-zinc-200 ml-1">
        {post.thumbnail
          ? <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-50" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-orange-600 flex items-center gap-1">
          <Trophy className="w-3 h-3" />
          Top performer
        </p>
        <p className="text-sm font-medium text-zinc-900 truncate">{post.caption || 'Untitled post'}</p>
        <MetricRow metrics={post} />
      </div>
    </div>
  );
}

function PerformanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] rounded-xl bg-zinc-50 animate-pulse" />)}
      </div>
      <div className="h-40 rounded-xl bg-zinc-50 animate-pulse" />
    </div>
  );
}

interface PerformanceBodyProps {
  perf: PostPerformance;
  platform: 'all' | AnalyticsPlatform;
  sort: PostSort;
  showAll: boolean;
  onSort: (sort: PostSort) => void;
  onShowAll: (showAll: boolean) => void;
}

function PerformanceBody({ perf, platform, sort, showAll, onSort, onShowAll }: PerformanceBodyProps) {
  const { totals, posts, byPlatform } = perf;
  const rate = engagementRate(totals.engagement, totals.reach);
  const top = topPlatform(byPlatform);
  const best = posts[0]; // the API sorts by reach
  const sorted = sortPosts(posts, sort);
  const shown = showAll ? sorted : sorted.slice(0, 6);
  const count = posts.length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile accent label="Total reach" value={totals.reach.toLocaleString('en-IN')} sub={<PlatformBreakdownInline byPlatform={byPlatform} highlight={platform} />} />
        <StatTile
          label="Engagement"
          value={totals.engagement.toLocaleString('en-IN')}
          sub={
            <span className="flex flex-wrap gap-x-2">
              <span>{totals.likes} likes</span>
              <span>{totals.comments} comments</span>
              <span>{totals.shares} shares</span>
            </span>
          }
        />
        <StatTile
          label="Engagement rate"
          value={formatPercent(rate)}
          sub={rate === null ? 'Needs reach to compute' : `across ${count} post${count === 1 ? '' : 's'}`}
        />
        <StatTile label="Inbox tracked" value={totals.inboxMessages.toLocaleString('en-IN')} sub="comments + DMs + reviews" title={INBOX_TRACKED_TITLE} />
        <StatTile label="Top platform" value={top ? platformName(top.platform) : '—'} sub={top ? `${top.reach.toLocaleString('en-IN')} reach` : 'No reach yet'} />
      </div>

      {best && best.reach > 0 && <TopPerformer post={best} />}

      <div className="flex flex-wrap items-center justify-between gap-2 mt-5 mb-2">
        <p className="text-xs font-semibold text-zinc-700">All posts</p>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-zinc-400 mr-1">Sort by</span>
          {POST_SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sort === s.id}
              onClick={() => onSort(s.id)}
              className={cn('px-2 py-0.5 rounded font-semibold transition-colors', sort === s.id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {count === 0 ? (
        <p className="text-sm text-zinc-400 py-6 text-center">No published-post metrics in this period yet.</p>
      ) : (
        <div className="space-y-2">{shown.map((p) => <PostRow key={p.id} post={p} />)}</div>
      )}

      {count > 6 && (
        <button type="button" onClick={() => onShowAll(!showAll)} className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">
          {showAll ? 'Show top 6 only' : `Show all ${count} posts`}
        </button>
      )}

      {platform === 'gmb' && (
        <p className="mt-3 text-[11px] text-zinc-400">
          Google Business Profile reports views ({totals.views.toLocaleString('en-IN')}) and clicks ({totals.clicks.toLocaleString('en-IN')}) rather than likes/shares.
        </p>
      )}
    </>
  );
}

interface PostPerformanceCardProps {
  perf: PostPerformance | null;
  platform: 'all' | AnalyticsPlatform;
  onPlatform: (platform: 'all' | AnalyticsPlatform) => void;
}

export function PostPerformanceCard({ perf, platform, onPlatform }: PostPerformanceCardProps) {
  const [sort, setSort] = useState<PostSort>('reach');
  const [showAll, setShowAll] = useState(false);
  return (
    <SectionShell
      title="Post Performance"
      subtitle="Reach & engagement for posts published in the selected period"
      action={
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              aria-pressed={platform === pill.id}
              onClick={() => onPlatform(pill.id)}
              className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors', platform === pill.id ? 'bg-zinc-900 text-white border-zinc-900' : 'text-zinc-600 border-zinc-200 hover:bg-zinc-50')}
            >
              {pill.label}
            </button>
          ))}
        </div>
      }
    >
      {perf === null
        ? <PerformanceSkeleton />
        : <PerformanceBody perf={perf} platform={platform} sort={sort} showAll={showAll} onSort={setSort} onShowAll={setShowAll} />}
    </SectionShell>
  );
}
```

- [ ] **Step 5: `InsightCards.tsx`**

```tsx
import type { ComponentType } from 'react';
import { ChartNoAxesColumn, Clock, Inbox, MessageSquare, Star, Users } from 'lucide-react';
import { cn } from '../ui/Button';
import { formatDuration, relativeWidth, type DealerAnalytics } from '../../utils/analytics';
import { CardEmpty, PlatformIconRow, SectionShell } from './AnalyticsParts';

function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 rounded-lg bg-zinc-50 animate-pulse" />)}
    </div>
  );
}

export function EngagementByTypeCard({ rows, loading, className }: { rows: DealerAnalytics['engagementByType']; loading: boolean; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.engagementRate));
  return (
    <SectionShell className={className} title="Engagement by Post Type" subtitle="Engagement rate relative to reach per content type">
      {loading ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <CardEmpty icon={<ChartNoAxesColumn className="w-5 h-5" />} title="No engagement data yet" text="Data appears here as your published posts gather reach." />
      ) : (
        <div className="space-y-3.5">
          {rows.map((r) => (
            <div key={r.type} className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-zinc-700 capitalize w-16 flex-shrink-0">{r.type}</span>
              <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${relativeWidth(r.engagementRate, max)}%` }} />
              </div>
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                <span className="font-semibold text-zinc-800">{r.engagementRate}%</span> · {r.reach.toLocaleString('en-IN')} reach
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

export function FollowerGrowthCard({ rows, loading }: { rows: DealerAnalytics['followerTrend']; loading: boolean }) {
  return (
    <SectionShell title="Follower Growth" subtitle="30-day delta per platform">
      {loading ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <CardEmpty icon={<Users className="w-5 h-5" />} title="No follower data" text="Growth shows after the first day of tracking." />
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <div key={f.platform} className="flex items-center gap-3">
              <PlatformIconRow platforms={[f.platform]} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 tabular-nums">{f.current.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-zinc-400">followers</p>
              </div>
              {f.delta !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
                    f.delta >= 0 ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-red-50 text-red-500 ring-1 ring-red-100',
                  )}
                >
                  {f.delta >= 0 ? `+${f.delta}` : f.delta}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

interface ReviewSummaryCardProps {
  summary: DealerAnalytics['reviewSummary'] | null;
  trend: DealerAnalytics['reviewTrend'];
  loading: boolean;
}

export function ReviewSummaryCard({ summary, trend, loading }: ReviewSummaryCardProps) {
  const tiles: Array<{ icon: ComponentType<{ className?: string }>; label: string; value: string; suffix?: string }> = [
    {
      icon: Star,
      label: 'Avg rating',
      value: summary?.avgRating == null ? '—' : summary.avgRating.toFixed(1),
      ...(summary?.avgRating == null ? {} : { suffix: '/ 5' }),
    },
    { icon: MessageSquare, label: 'Response rate', value: summary?.responseRate == null ? '—' : `${summary.responseRate}%` },
    { icon: Clock, label: 'Avg response time', value: formatDuration(summary?.avgResponseMinutes ?? null) },
    { icon: Inbox, label: 'Total reviews', value: summary ? String(summary.totalReviews) : '—' },
  ];
  return (
    <SectionShell title="Review Summary" subtitle="Aggregated review metrics across all connected platforms">
      {loading ? (
        <RowsSkeleton rows={2} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tiles.map(({ icon: Icon, label, value, suffix }) => (
              <div key={label}>
                <div className="w-8 h-8 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center mb-1">
                  <Icon className="w-4 h-4 text-zinc-500" />
                </div>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="text-xl font-bold text-zinc-900 tracking-tight">
                  {value}
                  {suffix && <span className="text-xs font-medium text-zinc-400 ml-1">{suffix}</span>}
                </p>
              </div>
            ))}
          </div>
          {trend.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">3-month trend</p>
              <div className="grid grid-cols-3 gap-3">
                {trend.map((m) => (
                  <div key={m.month} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 text-center">
                    <p className="text-xs font-semibold text-zinc-600">{m.label}</p>
                    <p className="text-lg font-bold text-zinc-900">{m.avgRating === null ? '—' : `${m.avgRating.toFixed(1)} ★`}</p>
                    <p className="text-[11px] text-zinc-400">{m.totalReviews} reviews · {m.responded} replied</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
}
```

- [ ] **Step 6: `Recap.tsx`**

```tsx
import { Download, FileText, Trophy } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DashboardStats } from '../../services/dashboard';
import { formatINR, type PostMetric } from '../../utils/analytics';
import { CardEmpty, DeltaBadge, PlatformIconRow, SectionShell, StatTile } from './AnalyticsParts';

// Always the first five of the fetched posts (the API orders them by reach).
export function TopPostsCard({ posts }: { posts: PostMetric[] | null }) {
  const top = (posts ?? []).slice(0, 5);
  return (
    <SectionShell title="Top Performing Posts" subtitle="Ranked by reach across all platforms" bodyClassName="p-0">
      {posts === null ? (
        <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-zinc-50 animate-pulse" />)}</div>
      ) : top.length === 0 ? (
        <div className="p-5">
          <CardEmpty icon={<Trophy className="w-5 h-5" />} title="No published posts yet" text="Your top posts will appear here once you start publishing." />
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {top.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50/60 group">
              <span className="text-sm font-bold text-zinc-300 w-4 flex-shrink-0">{i + 1}</span>
              <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 ring-1 ring-orange-100 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 truncate">{p.caption || 'Untitled post'}</p>
                <div className="mt-0.5"><PlatformIconRow platforms={p.platforms} /></div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-zinc-900 tabular-nums">{p.reach.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-zinc-400">reach · {p.likes} likes</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

interface MonthlyRecapCardProps {
  month: string;
  stats: DashboardStats | null;
  adSpend: number | null;
  costPerLead: number | null;
  onShare: () => void;
}

export function MonthlyRecapCard({ month, stats, adSpend, costPerLead, onShare }: MonthlyRecapCardProps) {
  const change = stats?.publishedChange ?? 0;
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:border-zinc-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-orange-600">Monthly performance</p>
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">{month}</h2>
          </div>
        </div>
        <Button variant="secondary" onClick={onShare}>
          <Download className="w-4 h-4" />
          Share report
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <StatTile
          label="Posts"
          value={stats ? stats.publishedThisMonth.toLocaleString('en-IN') : '—'}
          sub={stats && change !== 0 ? <DeltaBadge value={`${change > 0 ? '+' : ''}${change}`} up={change > 0} sub="vs last month" /> : 'vs last month'}
        />
        <StatTile label="Total reach" value={stats ? stats.totalReach.toLocaleString('en-IN') : '—'} sub="across all platforms" />
        <StatTile
          label="Leads"
          value={stats ? stats.leadsGenerated.toLocaleString('en-IN') : '—'}
          sub={stats && stats.leadsThisWeek > 0 ? `${stats.leadsThisWeek} this week` : 'No new leads this week'}
        />
        <StatTile
          label="Ad spend"
          value={adSpend !== null && adSpend > 0 ? formatINR(adSpend) : '—'}
          sub={costPerLead !== null ? `${formatINR(costPerLead)} per lead` : 'No active boosts'}
        />
      </div>
      <p className="text-[11px] text-zinc-400 mt-4">Auto-generated. Share with your OEM or management team.</p>
    </div>
  );
}
```

- [ ] **Step 7: `apps/web/src/pages/AnalyticsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { EngagementByTypeCard, FollowerGrowthCard, ReviewSummaryCard } from '../components/analytics/InsightCards';
import { KpiRow } from '../components/analytics/KpiRow';
import { PostPerformanceCard } from '../components/analytics/PostPerformance';
import { MonthlyRecapCard, TopPostsCard } from '../components/analytics/Recap';
import { Button } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { boostService } from '../services/boost';
import { dashboardService, type DashboardStats, type DealerAnalytics } from '../services/dashboard';
import { costPerLead, emptyPerformance, monthLabel, PERIOD_OPTIONS, type AnalyticsPlatform, type PostPerformance } from '../utils/analytics';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [days, setDays] = useState('30');
  const [platform, setPlatform] = useState<'all' | AnalyticsPlatform>('all');
  const [perf, setPerf] = useState<PostPerformance | null>(null);
  const [stats, setStats] = useState<DashboardStats | null | undefined>(undefined); // undefined: loading, null: failed
  const [insights, setInsights] = useState<DealerAnalytics | null | undefined>(undefined);
  const [adSpend, setAdSpend] = useState<number | null>(null);

  useEffect(() => {
    dashboardService.get().then((d) => setStats(d.stats)).catch(() => setStats(null));
    dashboardService.analytics().then(setInsights).catch(() => setInsights(null));
    // This month's boost spend; Boost is plan-gated, and without it there is no spend to show.
    boostService.list({ pageSize: 50 }).then((res) => setAdSpend(res.stats.totalSpendThisMonth)).catch(() => setAdSpend(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    dashboardService.postPerformance(Number(days), platform === 'all' ? undefined : platform)
      .then((res) => { if (!cancelled) setPerf(res); })
      // No view_reports (403) or a failed request: the sections show their empty states.
      .catch(() => { if (!cancelled) setPerf(emptyPerformance()); });
    return () => { cancelled = true; };
  }, [days, platform]);

  const changeDays = (value: string) => {
    setDays(value);
    setPerf(null);
  };
  const changePlatform = (value: 'all' | AnalyticsPlatform) => {
    setPlatform(value);
    setPerf(null);
  };

  const month = monthLabel(now);
  const cpl = costPerLead(adSpend, stats?.leadsGenerated ?? 0);
  const insightsLoading = insights === undefined;

  return (
    <PageCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{month} · All platforms</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemedSelect className="w-36" value={days} onChange={changeDays} options={PERIOD_OPTIONS} ariaLabel="Period" />
          <Button onClick={() => navigate('/report')}>
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      <KpiRow stats={stats ?? null} loading={stats === undefined && insights === undefined} costPerLead={cpl} />

      <PostPerformanceCard perf={perf} platform={platform} onPlatform={changePlatform} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EngagementByTypeCard className="md:col-span-2" rows={insights?.engagementByType ?? []} loading={insightsLoading} />
        <FollowerGrowthCard rows={insights?.followerTrend ?? []} loading={insightsLoading} />
      </div>

      <ReviewSummaryCard summary={insights?.reviewSummary ?? null} trend={insights?.reviewTrend ?? []} loading={insightsLoading} />

      <TopPostsCard posts={perf ? perf.posts : null} />

      <MonthlyRecapCard month={month} stats={stats ?? null} adSpend={adSpend} costPerLead={cpl} onShare={() => navigate('/report')} />
    </PageCard>
  );
}
```

- [ ] **Step 8: Wire it and delete the old code.**
- `apps/web/src/App.tsx`: change `import AnalyticsPage from './pages/Analytics';` to `import AnalyticsPage from './pages/AnalyticsPage';` (the route element stays `<AnalyticsPage />`).
- Delete `apps/web/src/pages/Analytics.tsx` and `apps/web/src/services/analytics.ts` (`git rm`).
- Delete `apps/api/src/routes/analytics.ts` (`git rm`). In `apps/api/src/index.ts` remove `import analyticsRoutes from './routes/analytics.js';` and `fastify.register(analyticsRoutes, { prefix: '/v1/analytics' });`.
- In `apps/api/test/security-routes.test.ts`, replace the `it('view_reports gates analytics', …)` case with:

```ts
  it('view_reports gates post analytics', async () => {
    const dealerId = await newDealer('reports-dealer');
    const denied = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts', headers: bearer(token(dealerId, 'user')) });
    assert.equal(denied.statusCode, 403);
    const allowed = await fastify.inject({
      method: 'GET', url: '/v1/dealer/analytics/posts', headers: bearer(token(dealerId, 'user', { view_reports: true })),
    });
    assert.equal(allowed.statusCode, 200);
    const gone = await fastify.inject({ method: 'GET', url: '/v1/analytics/overview', headers: bearer(token(dealerId)) });
    assert.equal(gone.statusCode, 404);
  });
```

- [ ] **Step 9: Verify**

Run: `npm test -w web && npm run build -w web`
Expected: pass; build exits 0.

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/security-routes.test.ts test/dealer-analytics.test.ts && npx tsc --noEmit`
Expected: pass; `tsc` clean.

Run: `grep -rn "getMockOverviewData\|getMockPostsData\|services/analytics\|useMockData" apps/web/src apps/api/src`
Expected: no output.

Run: `cd apps/web && npx eslint src/pages/AnalyticsPage.tsx src/components/analytics && npx eslint . | tail -1`
Expected: no problems in these files; total ≤ 55 (about 45 now that the old pages are gone).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/analytics apps/web/src/pages/AnalyticsPage.tsx apps/web/src/App.tsx apps/api/src/index.ts apps/api/test/security-routes.test.ts
git rm apps/web/src/pages/Analytics.tsx apps/web/src/services/analytics.ts apps/api/src/routes/analytics.ts
git commit -m "feat(web): Analytics page on collected metrics; remove the sample-data analytics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Report page, caption events and the Dashboard check

**Files:**
- Create: `apps/web/src/components/report/ReportParts.tsx`, `apps/web/src/pages/ReportPage.tsx`
- Modify: `apps/web/src/App.tsx` (`/report` route), `apps/web/src/pages/CreateStudio.tsx` (caption events)
- Check (no change expected): `apps/web/src/pages/Dashboard.tsx`, `apps/web/src/components/dashboard/Insights.tsx`

**Interfaces:**
- Consumes:
  - Task 8: `trackEvent` (`services/events.ts`); `captionEventFor`, `monthLabel`, `responseRateColor`, `platformName`, `platformAbbrev` (`utils/analytics.ts`); `dashboardService.get/analytics`, `DashboardStats.publishedThisMonth`, `DealerAnalytics`.
  - Task 7: `POST /v1/events` → 204.
  - Existing: `useDealerProfile()` → `profile: { name, city, logo_url? } | null` (`contexts/DealerProfileContext.tsx`, provided around all routes in `App.tsx`), `RequireAuth`, `Button`, `cn`, `PlatformIcon`.
- Produces:
  - `ReportParts.tsx`: `SectionHeading`, `ReportStatTile`, `ReportDelta`, `HalfStarRating`, `RateBar`, `PlatformCell`, `ReportEmpty`, `TableHead`, `SkeletonRows`
  - `pages/ReportPage.tsx` (default export), routed at `/report` inside `RequireAuth` and outside `AppLayout`, so it prints without the app shell.
  - Create Studio events:
    - `caption.rejected` `{ type }` when Generate runs while a result is on screen;
    - `caption.accepted` / `caption.edited` `{ type }` once per generated caption, on the first successful save.

- [ ] **Step 1: `apps/web/src/components/report/ReportParts.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Minus, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { platformAbbrev, platformName } from '../../utils/analytics';

const ICONS: Record<string, 'facebook' | 'instagram' | 'gmb' | 'youtube'> = { facebook: 'facebook', instagram: 'instagram', gmb: 'gmb', youtube: 'youtube' };
const TH = 'py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide';

export function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
    </div>
  );
}

export function ReportStatTile({ icon, accent, label, value, loading }: { icon: ReactNode; accent: string; label: string; value: string; loading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4 flex flex-col gap-3 print:shadow-none print:break-inside-avoid">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', accent)}>{icon}</div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-16 bg-zinc-100 rounded animate-pulse" />
          <div className="h-3.5 w-20 bg-zinc-100 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight text-zinc-900 leading-none">{value}</p>
          <p className="text-xs text-zinc-500 font-medium mt-1.5">{label}</p>
        </div>
      )}
    </div>
  );
}

export function ReportDelta({ value }: { value: number | null }) {
  const base = 'inline-flex items-center gap-0.5 text-[11px] font-semibold';
  if (value === null) {
    return <span className={cn(base, 'text-zinc-400')}><Minus className="w-3 h-3" />—</span>;
  }
  if (value >= 0) {
    return <span className={cn(base, 'text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ring-1 ring-emerald-100')}><TrendingUp className="w-3 h-3" />+{value}</span>;
  }
  return <span className={cn(base, 'text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-100')}><TrendingDown className="w-3 h-3" />{value}</span>;
}

export function HalfStarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('w-3.5 h-3.5', i <= full ? 'fill-amber-400 text-amber-400' : i === full + 1 && half ? 'fill-amber-200 text-amber-400' : 'fill-zinc-100 text-zinc-200')}
        />
      ))}
    </span>
  );
}

// Bar length is relative to the highest rate in the table, as in Analytics.
export function RateBar({ rate, max }: { rate: number; max: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="flex-1 max-w-[140px] h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${max > 0 ? Math.round((rate / max) * 100) : 0}%` }} />
      </div>
      <span className="text-xs font-semibold text-zinc-700 w-10 text-right">{rate}%</span>
    </div>
  );
}

export function PlatformCell({ platform }: { platform: string }) {
  const icon = ICONS[platform];
  return (
    <span className="inline-flex items-center gap-2">
      {icon && <PlatformIcon platform={icon} size="sm" />}
      <span className="text-sm font-medium text-zinc-800">{icon ? platformName(platform) : platformAbbrev(platform)}</span>
    </span>
  );
}

export function ReportEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{text}</p>
    </div>
  );
}

export function TableHead({ columns }: { columns: Array<{ label: string; align?: 'left' | 'right' }> }) {
  return (
    <thead>
      <tr className="bg-zinc-50 border-b border-zinc-100">
        {columns.map((c) => <th key={c.label} className={cn(TH, c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>)}
      </tr>
    </thead>
  );
}

export function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <tr key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <td key={col} className="py-3 px-4"><div className="h-3.5 w-20 bg-zinc-100 rounded animate-pulse" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
```

- [ ] **Step 2: `apps/web/src/pages/ReportPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, Eye, Printer, Send, Star, Users } from 'lucide-react';
import {
  HalfStarRating, PlatformCell, RateBar, ReportDelta, ReportEmpty, ReportStatTile, SectionHeading, SkeletonRows, TableHead,
} from '../components/report/ReportParts';
import { Button, cn } from '../components/ui/Button';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { dashboardService, type DashboardStats, type DealerAnalytics } from '../services/dashboard';
import { trackEvent } from '../services/events';
import { monthLabel, responseRateColor } from '../utils/analytics';

const TABLE = 'rounded-xl border border-zinc-200/80 overflow-hidden';
const TILE = 'bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4 print:shadow-none';

export default function ReportPage() {
  const navigate = useNavigate();
  const { profile } = useDealerProfile();
  const [now] = useState(() => new Date());
  const [stats, setStats] = useState<DashboardStats | null | undefined>(undefined); // undefined: loading, null: failed
  const [insights, setInsights] = useState<DealerAnalytics | null | undefined>(undefined);

  useEffect(() => {
    dashboardService.get().then((d) => setStats(d.stats)).catch(() => setStats(null));
    dashboardService.analytics().then(setInsights).catch(() => setInsights(null));
  }, []);

  // No PDF is generated here: "Save as PDF" is the browser's print destination.
  const print = () => {
    trackEvent('report.downloaded');
    window.print();
  };

  const statsLoading = stats === undefined;
  const sectionsLoading = insights === undefined;
  const summary = insights?.reviewSummary ?? null;
  const followers = insights?.followerTrend ?? [];
  const engagement = insights?.engagementByType ?? [];
  const maxRate = Math.max(0, ...engagement.map((r) => r.engagementRate));

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white py-8 print:py-0">
      <div className="max-w-3xl mx-auto mb-5 flex items-center justify-between print:hidden px-4 sm:px-0">
        <button type="button" onClick={() => navigate('/analytics')} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back to analytics
        </button>
        <Button onClick={print}>
          <Printer className="w-4 h-4" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="max-w-3xl mx-auto bg-white print:shadow-none shadow-sm rounded-2xl border border-zinc-200/80 print:rounded-none print:border-0 overflow-hidden">
        <div className="px-8 pt-8 pb-6 border-b border-zinc-100 print:px-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {profile?.logo_url ? (
              <img src={profile.logo_url} alt="" className="w-12 h-12 rounded-xl object-contain ring-1 ring-zinc-200 bg-zinc-50 flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-orange-600" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 truncate">{profile?.name || 'Dealership'}</h1>
              <p className="text-sm text-zinc-500">{profile?.city ? `${profile.city} · ` : ''}Social performance report</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-zinc-900">{monthLabel(now)}</p>
            <p className="text-[11px] text-zinc-400">Generated by Social AI</p>
          </div>
        </div>

        <div className="px-8 py-7 space-y-8 print:px-6">
          <section>
            <SectionHeading title="Key metrics" subtitle="Month-to-date performance overview" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
              <ReportStatTile loading={statsLoading} icon={<Send className="w-4 h-4 text-orange-600" />} accent="bg-orange-50" label="Posts published" value={stats ? String(stats.publishedThisMonth) : '—'} />
              <ReportStatTile loading={statsLoading} icon={<Eye className="w-4 h-4 text-blue-600" />} accent="bg-blue-50" label="Total reach" value={stats ? stats.totalReach.toLocaleString('en-IN') : '—'} />
              <ReportStatTile loading={statsLoading} icon={<Users className="w-4 h-4 text-violet-600" />} accent="bg-violet-50" label="Leads generated" value={stats ? String(stats.leadsGenerated) : '—'} />
              <ReportStatTile
                loading={sectionsLoading}
                icon={<Star className="w-4 h-4 text-amber-500" />}
                accent="bg-amber-50"
                label="Avg. rating"
                value={summary?.avgRating == null ? '—' : `${summary.avgRating}★`}
              />
            </div>
          </section>

          <section className="print:break-inside-avoid">
            <SectionHeading title="Follower growth" subtitle="Net change over the last 30 days" />
            {!sectionsLoading && followers.length === 0 ? (
              <ReportEmpty title="No follower data captured yet" text="Data will appear once platform connections are synced." />
            ) : (
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <TableHead columns={[{ label: 'Platform' }, { label: 'Followers', align: 'right' }, { label: '30-day change', align: 'right' }]} />
                  <tbody className="divide-y divide-zinc-100">
                    {sectionsLoading ? <SkeletonRows columns={3} /> : followers.map((f) => (
                      <tr key={f.platform} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="py-2.5 px-4"><PlatformCell platform={f.platform} /></td>
                        <td className="py-2.5 px-4 text-right font-semibold text-zinc-900 tabular-nums">{f.current.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-4 text-right"><ReportDelta value={f.delta} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="print:break-inside-avoid">
            <SectionHeading title="Engagement by post type" subtitle="Breakdown of published-post performance" />
            {!sectionsLoading && engagement.length === 0 ? (
              <ReportEmpty title="No published-post metrics yet" text="Metrics will populate after your first posts are published." />
            ) : (
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <TableHead columns={[{ label: 'Type' }, { label: 'Posts', align: 'right' }, { label: 'Reach', align: 'right' }, { label: 'Eng. rate', align: 'right' }]} />
                  <tbody className="divide-y divide-zinc-100">
                    {sectionsLoading ? <SkeletonRows columns={4} /> : engagement.map((r) => (
                      <tr key={r.type} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-zinc-800 capitalize">{r.type}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{r.posts}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{r.reach.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-4"><RateBar rate={r.engagementRate} max={maxRate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="print:break-inside-avoid">
            <SectionHeading title="Reviews" subtitle="Google Business Profile review metrics" />
            {sectionsLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={TILE}>
                    <div className="h-3 w-20 bg-zinc-100 rounded animate-pulse" />
                    <div className="h-6 w-16 bg-zinc-100 rounded animate-pulse mt-2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className={TILE}>
                  <p className="text-xs text-zinc-500 font-medium">Response rate</p>
                  <p className="text-2xl font-bold tracking-tight text-zinc-900 mt-1">{summary?.responseRate == null ? '—' : `${summary.responseRate}%`}</p>
                  {summary?.responseRate != null && (
                    <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', responseRateColor(summary.responseRate))} style={{ width: `${summary.responseRate}%` }} />
                    </div>
                  )}
                </div>
                <div className={TILE}>
                  <p className="text-xs text-zinc-500 font-medium">Total reviews</p>
                  <p className="text-2xl font-bold tracking-tight text-zinc-900 mt-1">{summary ? summary.totalReviews : '—'}</p>
                  {summary?.avgRating != null && <div className="mt-2"><HalfStarRating rating={summary.avgRating} /></div>}
                </div>
                <div className={TILE}>
                  <p className="text-xs text-zinc-500 font-medium">Avg. response time</p>
                  <p className="text-2xl font-bold tracking-tight text-zinc-900 mt-1">{summary?.avgResponseMinutes == null ? '—' : `${summary.avgResponseMinutes}m`}</p>
                  {summary?.avgResponseMinutes != null && <p className="text-[11px] text-zinc-400 mt-1">per review on average</p>}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="px-8 py-4 border-t border-zinc-100 bg-zinc-50/60 print:bg-white print:px-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400">Auto-generated by Social AI · Share with your OEM or management team.</p>
          <span className="text-xs font-semibold text-zinc-600">Social <span className="text-orange-600">AI</span></span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Route.** In `apps/web/src/App.tsx`:
- add `import ReportPage from './pages/ReportPage';` after the `AnalyticsPage` import;
- add after the `/analytics` route:

```tsx
      {/* Printable report: signed in, but outside AppLayout so it prints without the app shell. */}
      <Route path="/report" element={<RequireAuth><ReportPage /></RequireAuth>} />
```

- [ ] **Step 4: Caption events in `apps/web/src/pages/CreateStudio.tsx`.**

(a) Add imports: `import { trackEvent } from '../services/events';` and `import { captionEventFor } from '../utils/analytics';`.

(b) After `const aliveRef = useRef(true);` add:

```tsx
  // The caption the AI last produced for the chosen design or reel, compared with the saved caption for usage events.
  const generatedCaptionRef = useRef<string | null>(null);
```

(c) In `followReel`, in the ready branch, directly after `setCaption((current) => job.caption ?? current);` add:

```tsx
      generatedCaptionRef.current = job.caption ?? null;
```

(d) In `generate`, directly before `setGenerating(true);` add:

```tsx
    // Generating again while a result is on screen rejects the caption that came with it.
    if ((type === 'image' && result) || (type === 'reel' && reel)) trackEvent('caption.rejected', { type });
```

(e) In `generate`, directly after `setCaption(first?.caption ?? '');` add:

```tsx
      generatedCaptionRef.current = first?.caption ?? null;
```

(f) In `selectDesign`, inside `if (copy) {`, add as its first line:

```tsx
      generatedCaptionRef.current = copy.caption;
```

(g) Directly above `// Creates the post once, then updates the same draft on later attempts (or in edit mode).` add:

```tsx
  // Once per generated caption, on the first save: kept as the AI wrote it (accepted) or changed (edited).
  const reportCaption = () => {
    const event = captionEventFor(generatedCaptionRef.current, caption);
    if (event) trackEvent(event, { type });
    generatedCaptionRef.current = null;
  };
```

and in `savePost`, call `reportCaption();` right after `await postService.update(…);` (before `return savedId;`) and right after `setSavedId(item.id);` (before `return item.id;`).

- [ ] **Step 5: Dashboard check.** The Dashboard reads `/dealer/analytics` through `dashboardService.analytics()`.
- `components/dashboard/Insights.tsx` uses `engagementByType[].type/engagementRate`, `followerTrend[].platform/current/delta` and `reviewSummary.avgRating/responseRate`. All keep their names and types, so no change is needed.
- "Total reach" now includes Google Business Profile views (Task 6).
- If the build reports a type error in `Dashboard.tsx` or `Insights.tsx`, align it to `DealerAnalytics` from `utils/analytics.ts` rather than widening the type.

- [ ] **Step 6: Verify**

Run: `npm test -w web && npm run build -w web`
Expected: pass; build exits 0.

Run: `cd apps/web && npx eslint src/pages/ReportPage.tsx src/components/report src/pages/CreateStudio.tsx src/App.tsx && npx eslint . | tail -1`
Expected: no new problems; total ≤ 55.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/report apps/web/src/pages/ReportPage.tsx apps/web/src/App.tsx apps/web/src/pages/CreateStudio.tsx
git commit -m "feat(web): printable monthly report and caption usage events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Verify and ship (controller)

The controller runs this task, not a subagent.

- [ ] **Step 1: Full gate**

```bash
npm run build
cd apps/api && npx prisma generate && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'
npm test -w web
cd apps/web && npx eslint . | tail -1
grep -rn 'key=\${' apps/api/src
grep -rn "getMockOverviewData\|getMockPostsData\|services/analytics" apps/web/src apps/api/src
```

Expected:
- The build exits 0 (it type-checks `apps/api/test`).
- API: all tests pass, including the 8 new files (`post-metrics`, `inbox-routes`, `inbox-ingest`, `gmb-review-sync`, `metrics-sync`, `dealer-analytics`, `events`, `leads`).
- Web: all tests pass.
- Lint total ≤ 55 (expected about 45).
- Both greps print nothing.
- Collection names: `post-metrics.test.ts` asserts `prisma.event` → `events` and `prisma.followerSnapshot` → `follower_snapshots`. The TTL policies in Step 5 must use exactly these names.

- [ ] **Step 2: Local end-to-end** (the `api-verify` and `web-local` launch configs)

Setup:
- `api-verify` runs the in-memory store (`FIRESTORE_MEMORY=true`), a local-only `JWT_SECRET`, and `GEMINI_API_KEY=` (empty).
- If `apps/api/.env` has `GROQ_API_KEY` or `OPENAI_API_KEY`, suggest-reply uses them. Otherwise it answers 503 and the page shows "AI replies aren’t set up yet".
- Sign in through the local dev flow (as in the Stage C check), never with production secrets. The seeded demo dealer (`demo-dealer-001`) is on the enterprise plan, so the inbox is not gated. Take the session token from the browser's `localStorage.access_token` as `$TOKEN`.

Data:
1. Mock Meta connect:

```bash
REDIRECT=$(curl -s -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:3001/v1/platforms/connect/facebook?mock=true' | node -pe 'JSON.parse(require("fs").readFileSync(0)).redirect_url')
curl -s -o /dev/null "$REDIRECT"
```

   Expected: `/accounts` shows the Mock Dealership Page connected (page `mock_fb_page_id`, token `mock_fb_page_token`).

2. Seed the inbox:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3001/v1/inbox/mock/seed
```

   Expected: five sample emails (the call works without AI keys).

3. A comment through the webhook. Signatures are skipped outside production:

```bash
curl -s -X POST http://127.0.0.1:3001/v1/inbox/webhook/meta -H 'content-type: application/json' \
  -d '{"object":"page","entry":[{"id":"mock_fb_page_id","changes":[{"field":"feed","value":{"item":"comment","verb":"add","comment_id":"local-c-1","post_id":"mock_fb_page_id_1","message":"What is the on-road price and EMI for the Creta?","from":{"id":"cust-1","name":"Ravi Kumar"}}}]}]}'
```

   Expected: `{"success":true,"imported":1}`. The bell shows "New comment from Ravi Kumar".

4. Run the cron once. Without `CRON_SECRET`, it runs outside production:

```bash
curl -s -X POST http://127.0.0.1:3001/v1/cron/publish
```

   Expected: `maintenance.classified` ≥ 1. Ravi's comment is now Neutral · Lead (keywords, no key).

Checks at `/inbox`:
- Header: "Inbox" and the four pills (unread, replied, ★ avg, response rate).
- Type tabs show counts. The Platform, Sentiment and Status dropdowns filter. Search filters by name and text.
- Expanding an unread card marks it read, and the sidebar badge drops within a second (`inbox:changed` → `/inbox/pending-count`).
- Generate AI Reply: 503 → "AI replies aren’t set up yet", or three options with the "Option 1 of 3" picker when a provider exists.
- Write manually → Send reply:
  - the mock connection gives "Reply saved, not delivered";
  - the card shows the "You · dealer" thread item;
  - "replied" and "Response Rate" go up.
- Mark as lead → "Lead created successfully" and a Lead badge. Clicking again does not duplicate: `GET /v1/leads` has one row.
- Mark All Read → the modal → "Marked all read" → the badge clears.
- Quick Actions:
  - "Reply to all positive reviews" sets Reviews · Positive · Unresponded;
  - "Flag unresolved complaints" sets Negative · Unresponded;
  - "Request more Google reviews" opens `/create` with the prompt filled.
- Auto-reply: the toggle loads; add a rule and a template; the rule shows its platform, type and condition (it saves fully now).
- Platform Breakdown rows are Google Reviews, Facebook, Instagram and YouTube with "this week" counts.

Checks at `/analytics`:
- "September 2026 · All platforms", the period select, and the four KPI cards (Cost per Lead "—").
- Post Performance shows its empty or real states; the pills refetch.
- Engagement by Post Type, Follower Growth and Top Performing Posts show their empty states. Review Summary shows "—" values.
- Export Report and Share report open `/report`.

Checks at `/report`:
- Renders without the sidebar.
- "Print / Save as PDF" sends `POST /v1/events` (204 in the network panel), then opens the print dialog; cancel it.
- The print preview hides the toolbar.

General:
- The browser console has no errors.
- Check at 1280 px and 390 px widths, and once in dark mode.

- [ ] **Step 3: Final whole-branch review.** Run an independent review of `main..HEAD` focused on:
- the web ↔ API contract: field names in `utils/inbox.ts` / `utils/analytics.ts` against `lib/inboxView.ts` / `lib/dealerAnalytics.ts`;
- permission hooks on every inbox route;
- mock-id skips in every platform call;
- message-only logging.

Fix anything found before the PR.

- [ ] **Step 4: Pull request.** Push `feature/stage-d-inbox-analytics` and open a PR against `main`:
- A summary per area:
  - API: inbox routes and permissions, ingestion and notifications, classification, Google reviews, metrics and followers in the cron, analytics endpoints, events, leads.
  - Web: Inbox, Analytics, Report, caption events.
- The "Decisions and deviations" list, shortened.
- A test plan (Step 1 and Step 2).
- The owner decision from Step 5.
- Neutral wording, no credentials.
- End the body with the attribution line.

- [ ] **Step 5: Owner decision before deploy** (ask; do not run without a yes). Two new Firestore TTL policies, matching the collection names in `src/db/prisma.ts`:

```bash
gcloud firestore fields ttls update expires_at --collection-group=events --enable-ttl --project gen-lang-client-0078524499
gcloud firestore fields ttls update expires_at --collection-group=follower_snapshots --enable-ttl --project gen-lang-client-0078524499
```

Without them, events (365 days) and follower snapshots (400 days) are never deleted. Nothing breaks, but storage grows. No composite indexes are needed: every new query pushes only equality filters (see `pushable()` in `src/db/firestore.ts`).

- [ ] **Step 6: Merge and deploy** (only when the user says so)
- Merge the PR (the user may need to run `gh pr merge`; check `.merged` before deploying).
- Deploy the API from a clean `git archive` of the current `origin/main`, with the usual `gcloud run deploy cardekho-api --source .` flow. First check `gcloud builds list --region asia-south1 --project gen-lang-client-0078524499 --ongoing`.
- Hosting deploys the web.
- Smoke test on production:
  - `GET /v1/inbox/pending-count` answers 200 with auth.
  - `GET /v1/dealer/analytics` includes `reviewTrend`.
  - `GET /v1/analytics/overview` answers 404.
  - `POST /v1/events {"action":"report.downloaded"}` answers 204.
  - The Cloud Scheduler run's response (Cloud Run logs, `[cron]`) includes `maintenance`.
  - `/inbox`, `/analytics` and `/report` load.
- Meta credentials are still missing in production, so Facebook/Instagram metrics, followers and webhooks stay dormant. Google reviews start flowing for dealers with a live Google Business Profile connection.
- Update `memory/progress.md` and `memory/decisions.md`.
