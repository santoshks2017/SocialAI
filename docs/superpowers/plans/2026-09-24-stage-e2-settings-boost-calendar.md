# Stage E2: Settings, Boost and Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Port the reference Settings page to our data: Business Profile, Platforms, Preferences, Billing, Inspiration and Team, plus our Model Library tab.
- Port Boost and Calendar to the reference layout, wired to real data only.
- Add what those pages need:
  - logo upload and a brand-theme switch;
  - per-user theme and notification preferences;
  - team account edit;
  - a server-side plan catalogue with a payments gate;
  - festivals by date range.
- Switch the theme default to System and use one role vocabulary everywhere.

**Architecture:**
- **API** (Fastify, Firestore adapter):
  - Pure logic lives in new `lib/*.ts` modules with node:test coverage: `dealerLogo`, `userPreferences`, `teamAccounts`, `billingPlans` and `boostView`.
  - Routes stay thin.
  - Schema changes are two targeted edits:
    - `Dealer.use_brand_theme`;
    - `DealerUser.theme_mode` and `DealerUser.notification_prefs`.
  - `notify()` skips people who turned a type off. This covers dealer-wide and targeted notices alike, because both go through it.
- **Web:**
  - `SettingsPage.tsx` (1809 lines) is split mechanically into `components/settings/*Tab.tsx`, so reviewers can check that nothing changed.
  - Each tab is then ported.
  - Pure logic lives in `utils/*.ts` with tests: `settings`, `brandPalette`, `settingsPlatforms`, `billing`, `preferences`, `team`, `inspiration`, `boost` and `calendar`.
  - A tiny `AppearanceSync` component, rendered by `DealerProfileProvider`, does two things:
    - applies the dealer's brand palette;
    - after sign-in, loads the person's saved theme.
- **Stacking:** this branch (`feature/stage-e2-settings`) sits on top of Stage E1 (accounts and YouTube). It consumes only E1's list contract and its connect helper (below).

**Tech Stack:**
- API: Fastify 5, Prisma 5 schema with the Firestore adapter (in memory under `NODE_ENV=test`), `@fastify/multipart` 9, node:test via tsx.
- Web: React 19, react-router-dom 7, Tailwind v4, lucide-react.

**Spec and design:**
- Spec: `docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md`: §3, §4 (dark mode, dealer brand colours), §6 (Calendar, Boost, Settings), §7 (`POST /dealer/logo`, `PATCH /users/:id/account`) and §8 Stage E.
- Stage E design, sections "Contracts shared by E1 and E2" and E2-1 to E2-10. They are restated in "Decisions" below, so this plan stands alone.
- Reference extraction: the Settings tabs, Boost (§3) and Calendar (§4) from the reference bundle snapshot. It lives outside the repo. The copy below comes from it. Never copy the bundle into this repo.

**Consumed from Stage E1 (do not implement here):**
- `GET /v1/platform-accounts` → `{ accounts: [{ id, platform, accountName, accountId, tokenExpiry, createdAt }] }`.
  - `platform` is `facebook | instagram | google | youtube`.
  - There is one row per connected account, so several rows can share a platform.
- `DELETE /v1/platform-accounts/:id` soft-disconnects one account.
- `apps/web/src/utils/connectPlatform.ts` exports:
  - `type OAuthReturnPath = '/accounts' | '/onboarding' | '/settings?tab=platforms'`;
  - `async function startConnect(platform: 'facebook' | 'gmb' | 'youtube', returnTo: OAuthReturnPath): Promise<void>`. It does a full-page redirect, and throws on failure so the caller can show a toast.
- E1's `OAuthCallbackPage` shows the OAuth result toast and navigates to the stored return path. Settings no longer handles OAuth query parameters.
- `/accounts` is the full Accounts page, and `/accounts/create` redirects there.

## Global Constraints

- **Look:**
  - Keep the reference's `orange-*` / `amber-*` / `zinc-*` / `emerald-*` classes. `index.css` remaps orange (and the gradients' amber ends) to the coral brand, and zinc to warm greys.
  - `h1`–`h3` render in the serif display font.
  - Each dealer page sits in `PageCard` (`max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6`).
- **Dark mode (E2-10):**
  - Use only classes that `index.css` remaps: `bg-white`, `zinc-*`, `orange-*` and `emerald-*`, plus the amber, blue and violet tints added in Task 6.
  - No `dark:` variants: none exist in the files E2 touches (checked), and none may be added.
  - No hard-coded hex colours in class names.
- **Copy:**
  - Reference copy is verbatim, including — – … ’ → · ₹ × “ ” and emoji.
  - Tasks whose code contains these characters say so. After those tasks, byte-check the characters in the diff (`git diff | grep -nP '[^\x00-\x7F]'`).
  - If an editor flattens them, write them as escapes: — `—`, – `–`, … `…`, ’ `’`, → `→`, · `·`, ₹ `₹`, × `×`, “ `“`, ” `”`, ë `ë`, 🎉 `\u{1F389}`.
  - In JSX text, use `{'—'}`.
- **Nothing fabricated:**
  - Boost only records campaigns: there are no Meta Ads calls, and the copy says so.
  - Reach estimates come only from `POST /v1/boost/reach-estimate`.
  - Campaign metrics show "—" until something reports them.
  - Billing shows only real data:
    - no invoices, because no invoice data exists;
    - no trial button, because no trial API exists;
    - Subscribe is disabled unless the server reports `payments_enabled`.
- **Keys and logs:**
  - Never log raw error objects. Log `err instanceof Error ? err.message : String(err)`.
  - Google AI keys go only in the `x-goog-api-key` header. `test/no-key-in-url.test.ts` fails on `key=` in URLs.
  - Keys stay write-only: no GET returns a key.
  - The Razorpay key id, secret and webhook secret are read from the environment and never sent to the web.
- **Local runs:**
  - The API runs with the in-memory store (`FIRESTORE_MEMORY=true`, launch configs `api-local` / `api-verify`), never against production Firestore.
  - Tests run with `NODE_ENV=test`.
- **Permissions:** use `requirePermissionHook` / `can` from `lib/permissions.ts` (API) and `can` / `isAtLeast` from `apps/web/src/lib/permissions.ts` (web).
  - `PUT /dealer/profile` and `POST /dealer/logo`: any signed-in user of the dealership. The logo route has the same rule as the profile route.
  - `GET/PUT /users/me/preferences`: the signed-in person only.
  - `/users/*` team routes: `manage_users`.
    - A Manager (`admin`) can't edit an Owner's account or role.
    - Only the platform owner can grant the owner role.
  - `/billing/*` (except the webhook): `view_billing`. The Billing tab shows only to `view_billing` holders.
  - Boost: `checkPlanLimit('boost')` on every route, and `run_boost` for create and resume. Pause and stop are unchanged.
  - Reschedule on Calendar needs `publish_post`, as today.
- **Schema:**
  - Edit only `Dealer` and `DealerUser`, and only with targeted edits.
  - E1 owns `PlatformConnection`, `Post` and `InboxMessage`. Never rewrite the whole file.
  - After a schema change, run `cd apps/api && npx prisma generate`.
- **Files E1 owns:**
  - Do not edit `lib/googleToken.ts`, `lib/events.ts`, `utils/connectPlatform.ts`, `OAuthCallbackPage.tsx` or `AccountsPage.tsx`.
  - In `App.tsx`, touch only the `/billing` route line and its `BillingPage` import.
- **API conventions:**
  - Existing routes keep their response shapes and their string errors.
  - New errors use `{ error: { code, message } }`, with codes `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `PHONE_TAKEN`, `LOGO_TOO_LARGE`, `UNSUPPORTED_TYPE`, `BILLING_NOT_CONFIGURED`, `PAYMENT_GATEWAY_ERROR` and `POST_NOT_FOUND`.
- **Tests:**
  - First, in a fresh worktree: `cd apps/api && npx prisma generate`.
  - One API file: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`.
  - The whole API suite: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'`.
  - Web: `npm test -w web`. It runs only `src/utils/**/*.test.ts`, and tests import siblings with a `.js` suffix.
  - The API tsconfig is strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
  - Tests that store files delete `GCS_BUCKET`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `API_BASE_URL` first, and restore them afterwards, because `apps/api/.env` may hold real values.
  - Tests that touch billing delete every `RAZORPAY_*` variable first and restore them afterwards.
- **Build:** `npm run build` from the repo root type-checks `apps/api/test` too. Every task leaves it green.
- **Web lint:** `npm run lint -w web 2>/dev/null | tail -1` must stay at **45 problems or fewer**. It is 45 today. Task 5 brings it to about 40 and Task 9 to about 36.
  - Set React state only in handlers, promise callbacks, timers or `useState` initialisers, never synchronously in an effect body.
  - No `Date.now()` / `new Date()` with no arguments during render: take "now" from a `useState` initialiser, a timer or a handler.
  - Component files export only components. Types are fine. Constants and helpers go in `utils/*.ts`.
- **Commits:**
  - Every message ends with a blank line and then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model writes it.
  - Use neutral wording: the repo is public.
  - Never commit `AGENTS.md`, `CLAUDE.md`, `memory/`, `.superpowers/` or `apps/web/dist/`, and never commit credentials. Stage files by path, never with `git add -A`.

## Decisions and deviations from the reference (intended)

1. **Brand theme (E2-2).**
   - `Dealer.use_brand_theme` (default false) is set on Business Profile. When it is on, `utils/brandPalette.ts` rebuilds `--color-orange-50…950` and `--color-brand`, `--color-brand-hover` and `--color-brand-subtle` from `primary_color`:
     - hue and saturation are kept;
     - lightness steps are fixed;
     - there are separate light and dark ramps.
   - Contrast is enforced: at least 4.5:1 for white on 600, for 700 on 50, and in dark mode for the dark ink and the dark surface against 600.
   - **Refined:** amber is not recoloured.
     - In our app amber means warnings (expired tokens, payments off, the Boost notice).
     - The reference's amber gradient ends already follow `orange-600` through `index.css`.
     - A dealer's secondary colour must not repaint warnings.
2. **The Appearance control (Light / Dark / System) stays on Preferences**, where it is today and where the spec puts it. It is a per-person setting. The reference puts it on the Brand kit card.
3. **Theme sync (E2-4).**
   - `DealerUser.theme_mode` defaults to `system`, and so does the web (`utils/theme.ts` and the `index.html` pre-paint).
   - After sign-in, `AppearanceSync` loads `GET /users/me/preferences`, and the server value wins. `ThemeContext.setMode` caches it in `localStorage` for the pre-paint.
   - Choosing a theme applies at once and is saved at once. The login responses do not change.
4. **Notification toggles** cover our seven real `NotificationType`s, with plain labels. `notify()` skips people who turned a type off. A type missing from the stored map counts as on.
5. **Not ported:**
   - the reference's owner-only "Post approval workflow" toggle: our approvals are permission-based;
   - the unpersisted "Default boost radius" slider.
6. **Content languages** are the languages the caption API writes: en, hi, mr, ta, te, kn, gu, bn.
   - Malayalam leaves the picker because the API cannot write it. Gujarati and Bengali join.
   - English is always kept.
   - The first language is the default (the "Default" badge).
7. **Billing (E2-5).**
   - `GET /v1/billing/plans` serves the catalogue from `lib/billingPlans.ts`. That module also feeds `GET /billing/status` and the plan gate, so limits cannot drift.
   - `payments_enabled` needs all of these: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and a Razorpay plan id per tier and cycle (`RAZORPAY_PLAN_<TIER>_<CYCLE>`).
   - Subscribe:
     - sends `{ tier, cycle }`;
     - the server resolves the Razorpay plan id;
     - with payments off, the server answers 503 `BILLING_NOT_CONFIGURED` and no longer creates mock subscriptions;
     - the webhook maps configured plan ids to tiers.
   - Left out:
     - the trial button: there is no trial API;
     - payment history: there is no invoice data;
     - the "plan lapsed" banner: a lapsed plan already drops to Starter through the webhook;
     - the dev "simulate webhook" panel, which goes with `BillingPage`.
   - The annual badge shows the real discount, "–20%".
   - The Enterprise limit shows 30 connected accounts, which is Stage E1's cap. The old page's "99" was never enforced: the gate allowed 999.
   - Plan names, prices and highlight bullets move from `BillingPage.tsx` unchanged. The PR lists the Enterprise bullets for the owner to review.
8. **Team (E2-6).**
   - One label map: Owner / Manager / Creator (`utils/roleLabel.ts`). `lib/permissions.ts` re-exports it.
   - "Edit account" covers name, email and phone. We sign in by phone OTP, so there are no passwords.
   - A Manager can't edit or re-role an Owner. The API enforces this.
   - Only the platform owner can grant the owner role, as the existing security test requires.
     - Invite now answers 403 for anyone else.
     - Before, it silently created a Creator.
   - The "Role" action shows for everyone who manages the team, not only Owners: our dealership heads are Managers.
   - **Refined:** the Manager helper copy.
     - The reference's "…no billing or settings" is false here: our Managers hold every permission.
     - The Owner and Creator helper copy is verbatim.
9. **Platforms tab (E2-3).**
   - There are four rows. Each lists its connected accounts from E1's list.
   - Each account has a disconnect button, which opens the Accounts page's confirm modal (same copy).
   - Connect goes through `startConnect(…, '/settings?tab=platforms')`, and a "Manage all accounts" link goes to `/accounts`.
   - Copy changes:
     - the header drops "and run boosts": boosts do not run on Meta;
     - the footer drops YouTube from its stale "coming soon" list.
10. **Business Profile.**
    - Brands are free-text chips, as in the reference, with our known brands as suggestions.
    - Our extras (showroom type, showroom address, brand font) stay inside the reference cards.
    - The logo uploads at once (`POST /dealer/logo`: PNG, JPEG or WebP, 2 MB or less, magic bytes checked).
    - The helper copy says "PNG, JPG or WebP" (no SVG).
    - The old "remove logo" button is dropped: the reference only replaces.
11. **Boost (E2-8).**
    - A standing notice says boosts are recorded, not run on Meta.
    - The launch banner, stop dialog and step-5 disclaimer are honest. The reference's "live on Meta" and "charged from your Meta Ad Account" copy is not true here.
    - Both wizard steps show the one API estimate, per day.
    - Metrics show "—" until reported.
    - Drafts show under Active & Paused.
    - Titles and thumbnails come from the boosted post (API).
    - Create validates:
      - a budget of at least ₹200/day;
      - a duration of 1–90 days;
      - that the post belongs to the dealership (404 otherwise).
    - Failure toasts on create, pause, resume and stop.
    - The gender selector sends `gender`.
12. **Calendar (E2-9).**
    - The reference grid:
      - 56 px hour rows and Monday-first weeks;
      - month cells with two chips and "+N more";
      - drag-to-reschedule for scheduled and draft posts (needs `publish_post`);
      - a legend.
    - Festivals come from `GET /dealer/festivals?from&to`, which is region-aware. The hard-coded list is retired.
    - Festival chips open Create with the festival's marketing idea: our "festival suggestions" extra.
    - "Cancel Post" returns a scheduled post to drafts (our semantics); the reference deleted the post. It is offered only for scheduled posts.
13. **Inspiration (E2-7):** the reference layout over our existing handles API. Adding and removing go through modals.

## File Map

**API** (paths under `apps/api/`)
- Create:
  - `src/lib/dealerLogo.ts`: logo type sniffing, limits and the storage key.
  - `src/lib/userPreferences.ts`: theme mode and parsing preference updates.
  - `src/lib/teamAccounts.ts`: parsing account edits, the owner guard and the invite role.
  - `src/lib/billingPlans.ts`: plan limits, the catalogue, Razorpay plan ids and the payments gate.
  - `src/lib/boostView.ts`: the campaign view, post summary, reach estimate and create validation.
- Modify:
  - `prisma/schema.prisma`: `Dealer.use_brand_theme`; `DealerUser.theme_mode` and `DealerUser.notification_prefs`.
  - `src/routes/dealer.ts`: `use_brand_theme` on the profile PUT, `POST /logo`, and `from`/`to` on `/festivals`.
  - `src/routes/upload.ts`: `LOGOS_DIR`.
  - `src/lib/uploadPaths.ts`: logos read back from storage.
  - `src/lib/notifications.ts`: `NOTIFICATION_TYPES`, `notificationPrefsOf`, `wantsNotification`, and opt-outs in `notify()`.
  - `src/routes/users.ts`: `GET/PUT /me/preferences`, `PATCH /:id/account`, and owner guards on invite and role.
  - `src/routes/billing.ts`: `GET /plans`, status from the catalogue, the subscribe gate, and the webhook tier map.
  - `src/plugins/planGate.ts`: limits from `lib/billingPlans.ts`.
  - `src/routes/boost.ts`: post details, validation and `campaignsThisMonth`.
  - `src/services/festivalCalendar.ts`: `resolveState` and `festivalsBetween`.
  - `.env.example`: `RAZORPAY_PLAN_*`.
- Tests:
  - Create: `dealer-logo`, `user-preferences`, `users-account`, `billing-plans`, `boost` and `dealer-festivals`.
  - Modify: `notifications.test.ts`, `festivalCalendar.test.ts` and `security-routes.test.ts`.

**Web** (paths under `apps/web/`)
- Create:
  - Utils, each with a test: `src/utils/settings.ts`, `src/utils/brandPalette.ts`, `src/utils/settingsPlatforms.ts`, `src/utils/billing.ts`, `src/utils/preferences.ts`, `src/utils/team.ts`, `src/utils/inspiration.ts`, `src/utils/boost.ts` and `src/utils/calendar.ts`.
  - Services: `src/services/dealer.ts` and `src/services/preferences.ts`.
  - In `src/components/settings/`: `useProfileForm.ts`, `SettingsParts.tsx`, `ProfileTab.tsx`, `PlatformsTab.tsx`, `PreferencesTab.tsx`, `BillingTab.tsx`, `InspirationTab.tsx`, `TeamTab.tsx`, `TeamModals.tsx` and `ModelLibraryTab.tsx`.
  - `src/components/shell/AppearanceSync.tsx`.
  - `src/components/boost/BoostParts.tsx` and `src/components/boost/BoostWizard.tsx`.
  - `src/components/calendar/CalendarGrids.tsx` and `src/components/calendar/PostDetailModal.tsx`.
- Modify:
  - Pages: `src/pages/SettingsPage.tsx`, `src/pages/Boost.tsx` and `src/pages/Calendar.tsx`.
  - `src/App.tsx`: the `/billing` line and its import only.
  - `src/contexts/DealerProfileContext.tsx`.
  - Services: `src/services/billing.ts`, `src/services/users.ts` and `src/services/boost.ts`.
  - Theme: `src/utils/theme.ts` (+ test) and `index.html`.
  - Roles: `src/utils/roleLabel.ts` (+ test) and `src/lib/permissions.ts`.
  - UI: `src/components/ui/Input.tsx`, `src/components/ui/PlanGatedNotice.tsx` and `src/index.css`.
- Delete: `src/pages/BillingPage.tsx`.

### Cross-task interface table (pre-flight)

| Produced name | Where | Task | Consumed by |
|---|---|---|---|
| `Dealer.use_brand_theme: boolean` (default false); `PUT /v1/dealer/profile` accepts `use_brand_theme` (400 `INVALID_INPUT` unless boolean) | schema / `routes/dealer.ts` | 1 | 7 |
| `LOGO_MAX_BYTES`, `type LogoType`, `sniffLogoType(buf)`, `logoTypeFor(mime, buf)`, `logoContentType(type)`, `logoStorageKey(dealerId, id, type)` | `lib/dealerLogo.ts` | 1 | 1 |
| `LOGOS_DIR` | `routes/upload.ts` | 1 | 1 |
| HTTP `POST /v1/dealer/logo` (multipart `logo`) → `{ logo_url }`; 400 `INVALID_INPUT` / `UNSUPPORTED_TYPE`, 413 `LOGO_TOO_LARGE` | `routes/dealer.ts` | 1 | 7 |
| `DealerUser.theme_mode: string` (default `"system"`), `DealerUser.notification_prefs: Json?` | schema | 2 | 2 |
| `NOTIFICATION_TYPES`, `type NotificationType`, `type NotificationPrefs`, `isNotificationType`, `notificationPrefsOf(raw)`, `wantsNotification(raw, type)` | `lib/notifications.ts` | 2 | 2 |
| `THEME_MODES`, `type ThemeMode`, `DEFAULT_THEME_MODE`, `isThemeMode`, `themeModeOf`, `type UserPreferences`, `preferencesView(user)`, `type PreferencesUpdate`, `parsePreferencesUpdate(body)`, `mergeNotificationPrefs(stored, change)` | `lib/userPreferences.ts` | 2 | 2 |
| HTTP `GET /v1/users/me/preferences` → `{ theme_mode, notification_prefs }`; `PUT` same body (partial) → same shape | `routes/users.ts` | 2 | 10 |
| `ACCOUNT_NAME_MAX`, `isValidEmail`, `type AccountEdit`, `parseAccountEdit(body)`, `canManageMember(actorRole, targetRole)`, `type InviteRole`, `inviteRole(value)` | `lib/teamAccounts.ts` | 3 | 3 |
| HTTP `PATCH /v1/users/:id/account { name?, email?, phone? }` → `{ user }`; 409 `PHONE_TAKEN`; invite `role: 'owner'` 403 unless platform owner; role change of an Owner 403 unless Owner | `routes/users.ts` | 3 | 11 |
| `PLAN_TIERS`, `type PlanTier`, `BILLING_CYCLES`, `type BillingCycle`, `type GatedFeature`, `UNLIMITED`, `type PlanLimits`, `PLAN_LIMITS`, `planLimits(plan)`, `isPlanTier`, `isBillingCycle`, `type PlanFeature`, `type BillingPlan`, `planFeatures(tier)`, `BILLING_PLANS`, `annualDiscountPercent()`, `PAYMENTS_OFF_MESSAGE`, `razorpayPlanEnvKey`, `razorpayPlanId(tier, cycle, env?)`, `paymentsEnabled(env?)`, `tierForRazorpayPlan(planId, env?)` | `lib/billingPlans.ts` | 4 | 4 |
| HTTP `GET /v1/billing/plans` → `{ plans: BillingPlan[], payments_enabled, annual_discount_percent }`; `POST /v1/billing/subscribe { tier, cycle }` → `{ success, subscriptionId, paymentLink }` or 503 `BILLING_NOT_CONFIGURED` / 502 `PAYMENT_GATEWAY_ERROR`; `GET /billing/status` shape unchanged | `routes/billing.ts` | 4 | 9 |
| `SettingsTabId`, `SettingsTabDef`, `SettingsAccess`, `SETTINGS_TABS`, `visibleSettingsTabs(access)`, `resolveSettingsTab(raw, tabs)`, `InspirationHandle`, `SyncedModel`, `SyncJobStatus`, `IDLE_SYNC`, `REGIONS`, `BRANDS`, `SHOWROOM_TYPES`, `FONT_OPTIONS`, `addBrand(brands, raw)`; until Task 10 also `PLAN_LABELS`, `LANGUAGES`, `NOTIFICATION_KEYS` | `utils/settings.ts` | 5, 6, 7, 8, 9, 10 | 5–12 |
| `useProfileForm()`, `type ProfileForm` | `components/settings/useProfileForm.ts` | 5 (7 and 10 replace) | 6, 7, 10 |
| `ProfileTab({ form })`, `PreferencesTab({ form, onOpenBilling? })`, `ModelLibraryTab({ brands })`, `InspirationTab()`, `TeamTab()`, `PlatformsTab()`, `BillingTab()` | `components/settings/*` | 5, 7, 8, 9, 10, 11, 12 | `pages/SettingsPage.tsx` |
| `SettingsCard`, `SettingsListCard`, `SectionHeader`, `FieldLabel`, `Toggle`, `StatPill`, `SaveBar` | `components/settings/SettingsParts.tsx` | 6 | 7–12 |
| `Input` restyled (reference classes) | `components/ui/Input.tsx` | 6 | 7, 11, 12 |
| `SHADES`, `Shade`, `Ramp`, `MIN_CONTRAST`, `DARK_INK`, `DARK_SURFACE`, `parseHex`, `hexToHsl`, `hslToHex`, `contrastRatio`, `BrandPalette`, `brandPalette(primary)`, `brandThemeCss(primary)`, `applyBrandTheme(css)` | `utils/brandPalette.ts` | 7 | 7, 10 |
| `AppearanceSync({ userId, brandColor })` (Task 7: `{ brandColor }`) | `components/shell/AppearanceSync.tsx` | 7, 10 | `contexts/DealerProfileContext.tsx` |
| `DealerProfile.font?`, `.address?`, `.use_brand_theme?` | `contexts/DealerProfileContext.tsx` | 7 | 7 |
| `dealerService.uploadLogo(file)` → `{ logo_url }`; `dealerService.festivals(from, to)` → `{ success, festivals: FestivalDate[] }` | `services/dealer.ts` | 7, 14 | 7, 14 |
| `AccountPlatform`, `ConnectTarget`, `RowStatus`, `PlatformAccount`, `PlatformRowDef`, `PLATFORM_ROWS`, `AccountHealth`, `accountHealth(account, now)`, `PlatformRow`, `platformRows(accounts, now)`, `connectedPlatformCount(rows)`, `accountLine(account)` | `utils/settingsPlatforms.ts` | 8 | 8 |
| `PlanTier`, `BillingCycle`, `BillingStatus` (unchanged), `PlanFeature`, `BillingPlan`, `BillingPlans`, `SubscribeResponse`, `billingService.getStatus/getPlans/subscribe(tier, cycle)` | `services/billing.ts` | 9 | 9 |
| `UNLIMITED_POSTS`, `PAYMENTS_OFF_MESSAGE`, `rupees(n)`, `planPrice(plan, cycle)`, `annualSaving(plan)`, `popularPlanId(plans, currentTier)`, `UsageMeter`, `usageMeter(limits)`, `StatusTone`, `statusTone(status)`, `renewalDate(status)` | `utils/billing.ts` | 9 | 9, 13 |
| `DEFAULT_THEME_MODE = 'system'` | `utils/theme.ts` | 10 | `ThemeContext`, `index.html` |
| `NOTIFICATION_TYPES`, `NotificationType`, `NotificationPrefs`, `UserPreferences`, `NOTIFICATION_OPTIONS`, `allNotificationsOn()`, `CONTENT_LANGUAGES`, `normaliseLanguages(stored)`, `toggleLanguage(selected, code)` | `utils/preferences.ts` | 10 | 10 |
| `preferencesService.get()`, `preferencesService.update(change)` | `services/preferences.ts` | 10 | 10 |
| `ROLE_LABELS: Record<Role, string>`, `roleLabel(role)` | `utils/roleLabel.ts` (re-exported by `lib/permissions.ts`) | 11 | 11, Sidebar |
| `ROLE_DESCRIPTIONS`, `Viewer`, `assignableRoles`, `roleOptions`, `canManageMember`, `isSelf`, `canChangeRole`, `canRemove`, `avatarGradient`, `initialOf`, `memberName`, `TeamStats`, `teamStats`, `AccountDraft`, `accountDraft`, `accountChanges` | `utils/team.ts` | 11 | 11 |
| `InviteRequest.role?: Role`, `userService.updateAccount(id, change)` | `services/users.ts` | 11 | 11 |
| `InviteModal`, `ChangeRoleModal`, `RemoveMemberModal`, `EditAccountModal` | `components/settings/TeamModals.tsx` | 11 | 11 |
| `InspirationPlatform`, `INSPIRATION_PLATFORMS`, `postsLearned`, `InspirationStats`, `inspirationStats`, `referencePlaceholder`, `handleTitle` | `utils/inspiration.ts` | 12 | 12 |
| `BOOST_MIN_DAILY_BUDGET`, `BOOST_MAX_DAILY_BUDGET`, `BOOST_MAX_DAYS`, `BoostPostSource`, `BoostPostSummary`, `boostPostSummary(post)`, `mapCampaign(c, post?)`, `reachEstimate(dailyBudget)`, `BoostCreate`, `parseBoostCreate(body)` | `lib/boostView.ts` | 13 | 13 |
| HTTP boost items gain `post?: { id, title, thumbnail? }`; `stats.campaignsThisMonth`; create 400 `INVALID_INPUT` / 404 `POST_NOT_FOUND`; reach-estimate 400 on a bad budget | `routes/boost.ts` | 13 | 13 |
| `BoostStats.campaignsThisMonth`, `boostService.getReachEstimate(dailyBudget)` | `services/boost.ts` | 13 | 13 |
| `CampaignStatus`, `BoostTab`, `Audience`, `BUDGET_PRESETS`, `DURATION_PRESETS`, `MIN_DAILY_BUDGET`, `WIZARD_STEPS`, `DEFAULT_AUDIENCE`, `inTab`, `daysLeft`, `scheduleLine`, `totalBudget`, `spendBar`, `campaignMetrics`, `avgCtr`, `campaignsLine`, `reachLine`, `audienceSummary`, `effectiveBudget`, `budgetValid`, `targetingFor` | `utils/boost.ts` | 13 | 13 |
| `BoostStatCards`, `CampaignCard`, `CampaignSkeleton`, `EmptyCampaigns`, `StopCampaignModal`; `BoostWizard`, `BoostLaunch` | `components/boost/*` | 13 | `pages/Boost.tsx` |
| `resolveState(city, state)`, `FestivalOnDate`, `festivalsBetween(city, state, from, to)`; HTTP `GET /v1/dealer/festivals?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ success, festivals: FestivalOnDate[] }` (400 on a bad or over-long range; no `from`/`to` = unchanged upcoming list) | `services/festivalCalendar.ts` / `routes/dealer.ts` | 14 | 14 |
| `CalendarView`, `HOUR_PX`, `HOURS`, `WEEKDAYS`, `STATUS_DOT`, `STATUS_STYLES`, `STATUS_LABELS`, `CalendarPost`, `toCalendarPosts`, `dayKey`, `sameDay`, `startOfWeek`, `weekDays`, `monthStart`, `monthCells`, `visibleRange`, `formatWeekRange`, `formatMonthTitle`, `hourLabel`, `postsAt`, `createLink`, `nowLineTop`, `initialScrollTop`, `isReschedulable`, `dropTime`, `tomorrowAt`, `LegendCounts`, `legendCounts`, `chipTitle`, `FestivalDate`, `FestivalMark`, `festivalEmoji`, `festivalsByDay`, `festivalCreateLink` | `utils/calendar.ts` | 14 | 14 |
| `CalendarLegend`, `WeekGrid`, `MonthGrid`; `PostDetailModal` | `components/calendar/*` | 14 | `pages/Calendar.tsx` |

---

### Task 1: Brand-theme flag and dealer logo upload (API)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Dealer` only), `apps/api/src/routes/dealer.ts`, `apps/api/src/routes/upload.ts`, `apps/api/src/lib/uploadPaths.ts`
- Create: `apps/api/src/lib/dealerLogo.ts`
- Test: `apps/api/test/dealer-logo.test.ts`

**Interfaces:**
- Consumes:
  - `uploadFile(buffer, key, contentType, localDir)` (`lib/storage.ts`) and `safeFileId` (`lib/uploadPaths.ts`).
  - `request.isMultipart()` / `request.file({ limits })` (`@fastify/multipart` 9). Over the limit, `toBuffer()` throws `code: 'FST_REQ_FILE_TOO_LARGE'`.
- Produces:
  - `Dealer.use_brand_theme: boolean` (default false). `PUT /v1/dealer/profile` accepts `use_brand_theme` and answers 400 `INVALID_INPUT` when it is not a boolean.
  - `lib/dealerLogo.ts`:
    - `LOGO_MAX_BYTES`, `type LogoType = 'png' | 'jpeg' | 'webp'`;
    - `sniffLogoType(buf: Buffer): LogoType | null` and `logoTypeFor(declaredMime: string, buf: Buffer): LogoType | null`;
    - `logoContentType(type: LogoType): string`;
    - `logoStorageKey(dealerId: string, id: string, type: LogoType): string`.
  - `LOGOS_DIR` (`routes/upload.ts`).
  - HTTP `POST /v1/dealer/logo`, multipart field `logo`:
    - 200 `{ logo_url }`, and it sets `dealer.logo_url`;
    - 400 `INVALID_INPUT` (not multipart, or a wrong field);
    - 400 `UNSUPPORTED_TYPE` (not PNG/JPEG/WebP, or bytes that don't match);
    - 413 `LOGO_TOO_LARGE` (over 2 MB);
    - 400 `BAD_REQUEST` when the account has no dealership.
  - `loadImageFromUrl('/uploads/logos/{dealer}/{file}')` reads the logo back from storage, so creatives can use a locally stored logo.

- [ ] **Step 1: Write the failing test** `apps/api/test/dealer-logo.test.ts`

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { LOGO_MAX_BYTES, logoStorageKey, logoTypeFor, sniffLogoType } from '../src/lib/dealerLogo.js';
import { loadImageFromUrl } from '../src/lib/uploadPaths.js';
import { LOGOS_DIR } from '../src/routes/upload.js';

// Local disk only: apps/api/.env may point uploads at a real bucket.
const STORAGE_ENV = ['GCS_BUCKET', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'API_BASE_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

before(async () => {
  for (const key of STORAGE_ENV) { savedEnv[key] = process.env[key]; delete process.env[key]; }
  await fastify.ready();
});
after(async () => {
  for (const key of STORAGE_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await fastify.close();
});

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Logo Motors', city: 'Pune', phone: `phone-${randomUUID()}` } })).id;
}

function headers(dealerId: string): Record<string, string> {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function multipart(field: string, filename: string, contentType: string, data: Buffer) {
  const boundary = `----e2logo${randomUUID()}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function upload(dealerId: string, field: string, filename: string, contentType: string, data: Buffer) {
  const body = multipart(field, filename, contentType, data);
  return fastify.inject({ method: 'POST', url: '/v1/dealer/logo', headers: { ...headers(dealerId), ...body.headers }, payload: body.payload });
}

describe('dealerLogo', () => {
  it('knows PNG, JPEG and WebP by their first bytes', () => {
    assert.equal(sniffLogoType(PNG), 'png');
    assert.equal(sniffLogoType(JPEG), 'jpeg');
    assert.equal(sniffLogoType(WEBP), 'webp');
    assert.equal(sniffLogoType(SVG), null);
    assert.equal(sniffLogoType(Buffer.alloc(2)), null);
  });

  it('needs the declared type and the bytes to agree', () => {
    assert.equal(logoTypeFor('image/png', PNG), 'png');
    assert.equal(logoTypeFor('image/jpg', JPEG), 'jpeg');
    assert.equal(logoTypeFor('image/png', JPEG), null);
    assert.equal(logoTypeFor('image/svg+xml', SVG), null);
    assert.equal(logoTypeFor('application/octet-stream', PNG), null);
  });

  it('stores logos per dealership', () => {
    assert.equal(logoStorageKey('d1', 'abc', 'jpeg'), 'logos/d1/abc.jpg');
    assert.equal(logoStorageKey('d1', 'abc', 'webp'), 'logos/d1/abc.webp');
    assert.equal(LOGO_MAX_BYTES, 2 * 1024 * 1024);
  });
});

describe('POST /v1/dealer/logo', () => {
  it('stores a PNG under logos/{dealer}/ and sets the dealer logo', async () => {
    const dealerId = await newDealer();
    try {
      const res = await upload(dealerId, 'logo', 'logo.png', 'image/png', PNG);

      assert.equal(res.statusCode, 200, res.body);
      const { logo_url } = res.json() as { logo_url: string };
      assert.match(logo_url, new RegExp(`^/uploads/logos/${dealerId}/[0-9a-f-]{36}\\.png$`));
      assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.logo_url, logo_url);
      assert.ok(existsSync(path.join(LOGOS_DIR, dealerId, path.basename(logo_url))));
      assert.deepEqual((await loadImageFromUrl(logo_url)).buffer, PNG);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
    }
  });

  it('refuses SVG, mismatched bytes, a wrong field and a plain JSON body', async () => {
    const dealerId = await newDealer();
    try {
      const svg = await upload(dealerId, 'logo', 'logo.svg', 'image/svg+xml', SVG);
      assert.equal(svg.statusCode, 400);
      assert.equal(svg.json().error.code, 'UNSUPPORTED_TYPE');
      assert.equal((await upload(dealerId, 'logo', 'logo.png', 'image/png', JPEG)).json().error.code, 'UNSUPPORTED_TYPE');

      const wrongField = await upload(dealerId, 'file', 'logo.png', 'image/png', PNG);
      assert.equal(wrongField.statusCode, 400);
      assert.equal(wrongField.json().error.code, 'INVALID_INPUT');

      const json = await fastify.inject({ method: 'POST', url: '/v1/dealer/logo', headers: headers(dealerId), payload: { logo: 'x' } });
      assert.equal(json.statusCode, 400);
      assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.logo_url ?? null, null);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
    }
  });

  it('refuses logos over 2 MB', async () => {
    const dealerId = await newDealer();
    try {
      const res = await upload(dealerId, 'logo', 'big.png', 'image/png', Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]));
      assert.equal(res.statusCode, 413);
      assert.equal(res.json().error.code, 'LOGO_TOO_LARGE');
      assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.logo_url ?? null, null);
    } finally {
      await rm(path.join(LOGOS_DIR, dealerId), { recursive: true, force: true });
    }
  });

  it('requires a signed-in user', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const body = multipart('logo', 'logo.png', 'image/png', PNG);
      const res = await fastify.inject({ method: 'POST', url: '/v1/dealer/logo', headers: body.headers, payload: body.payload });
      assert.equal(res.statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });
});

describe('PUT /v1/dealer/profile use_brand_theme', () => {
  it('defaults to off, saves a boolean and refuses anything else', async () => {
    const dealerId = await newDealer();
    const get = async () => (await fastify.inject({ method: 'GET', url: '/v1/dealer/profile', headers: headers(dealerId) })).json().profile;

    assert.equal((await get()).use_brand_theme, false);
    const on = await fastify.inject({ method: 'PUT', url: '/v1/dealer/profile', headers: headers(dealerId), payload: { use_brand_theme: true } });
    assert.equal(on.statusCode, 200);
    assert.equal((await get()).use_brand_theme, true);

    const bad = await fastify.inject({ method: 'PUT', url: '/v1/dealer/profile', headers: headers(dealerId), payload: { use_brand_theme: 'yes' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'INVALID_INPUT');
    assert.equal((await get()).use_brand_theme, true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/dealer-logo.test.ts`
Expected: FAIL. `../src/lib/dealerLogo.js` cannot be resolved, and `LOGOS_DIR` is not exported.

- [ ] **Step 3: Schema.** In `apps/api/prisma/schema.prisma`, model `Dealer`, add this line directly after `auto_reply_enabled   Boolean  @default(false)`. Make no other schema change.

```prisma
  use_brand_theme      Boolean  @default(false) // Settings → Business Profile: recolour the app from primary_color
```

Run: `cd apps/api && npx prisma generate`

- [ ] **Step 4: `apps/api/src/lib/dealerLogo.ts`**

```ts
/**
 * Dealer logo uploads (POST /v1/dealer/logo): PNG, JPEG or WebP, 2 MB at most.
 * SVG is refused: it can carry script. The file's own bytes decide the type, and the
 * declared MIME type must agree with them.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type LogoType = 'png' | 'jpeg' | 'webp';

const CONTENT_TYPES: Record<LogoType, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXTENSIONS: Record<LogoType, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const DECLARED: Record<string, LogoType> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/webp': 'webp' };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image type from the file's first bytes, whatever the upload claims. */
export function sniffLogoType(buf: Buffer): LogoType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** The logo's type when the declared MIME type is one we accept and matches the bytes; otherwise null. */
export function logoTypeFor(declaredMime: string, buf: Buffer): LogoType | null {
  const declared = DECLARED[declaredMime.trim().toLowerCase()];
  const actual = sniffLogoType(buf);
  return declared && actual === declared ? actual : null;
}

export function logoContentType(type: LogoType): string {
  return CONTENT_TYPES[type];
}

/** logos/{dealerId}/{id}.{ext} */
export function logoStorageKey(dealerId: string, id: string, type: LogoType): string {
  return `logos/${dealerId}/${id}.${EXTENSIONS[type]}`;
}
```

- [ ] **Step 5: `apps/api/src/routes/upload.ts`.** After `export const CREATIVES_DIR = path.join(UPLOADS_ROOT, 'creatives');` add:

```ts
export const LOGOS_DIR = path.join(UPLOADS_ROOT, 'logos');
```

- [ ] **Step 6: `apps/api/src/lib/uploadPaths.ts`.**

(a) Change the import from `../routes/upload.js` to:

```ts
import { ORIGINALS_DIR, CREATIVES_DIR, LOGOS_DIR } from '../routes/upload.js';
```

(b) Replace the whole `storedUploadRef` function with:

```ts
// Relative /uploads/... URLs and ones on API_BASE_URL point at files we stored ourselves.
function storedUploadRef(raw: string): { key: string; dir: string; name: string } | null {
  let url: URL;
  try {
    url = new URL(raw, 'http://relative.invalid');
  } catch {
    return null;
  }
  const apiBase = process.env['API_BASE_URL'];
  const ours = url.origin === 'http://relative.invalid'
    || (!!apiBase && URL.canParse(apiBase) && new URL(apiBase).origin === url.origin);
  if (!ours) return null;
  // Dealer logos: /uploads/logos/{dealerId}/{file} (POST /v1/dealer/logo).
  const logo = /^\/uploads\/logos\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (logo) {
    const dealer = safeFileId(decodeURIComponent(logo[1]!));
    const name = safeFileId(decodeURIComponent(logo[2]!));
    return { key: `logos/${dealer}/${name}`, dir: path.join(LOGOS_DIR, dealer), name };
  }
  const match = /^\/uploads\/(originals|creatives)\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;
  const name = safeFileId(decodeURIComponent(match[2]!));
  return { key: `${match[1]}/${name}`, dir: match[1] === 'originals' ? ORIGINALS_DIR : CREATIVES_DIR, name };
}
```

- [ ] **Step 7: `apps/api/src/routes/dealer.ts`.**

(a) Replace the import block at the top (lines 1–4 and the blank lines after them) with:

```ts
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { getUpcomingFestivals } from '../services/festivalCalendar.js';
import { totalReach as postReach } from '../lib/postMetrics.js';
import { uploadFile } from '../lib/storage.js';
import { safeFileId } from '../lib/uploadPaths.js';
import { LOGO_MAX_BYTES, logoContentType, logoStorageKey, logoTypeFor } from '../lib/dealerLogo.js';
import { LOGOS_DIR } from './upload.js';

const apiError = (code: string, message: string) => ({ error: { code, message } });
```

(b) Replace the whole `// PUT /v1/dealer/profile` route, from `fastify.put('/profile', {` to its closing `});`, with:

```ts
  // PUT /v1/dealer/profile
  fastify.put('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealer_id = request.user.dealer_id!;
    if (!dealer_id) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'No dealer associated with this user account.' } });
    }

    const body = (request.body ?? {}) as {
      name?: string;
      city?: string;
      state?: string;
      brands?: string[];
      contact_phone?: string;
      whatsapp_number?: string;
      primary_color?: string;
      secondary_color?: string;
      language_preferences?: string[];
      region?: string;
      logo_url?: string;
      font?: string;
      address?: string;
      showroom_type?: string[];
      use_brand_theme?: unknown;
    };
    if (body.use_brand_theme !== undefined && typeof body.use_brand_theme !== 'boolean') {
      return reply.code(400).send(apiError('INVALID_INPUT', 'use_brand_theme must be true or false'));
    }

    try {
      const updated = await prisma.dealer.update({
        where: { id: dealer_id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.state !== undefined ? { state: body.state } : {}),
          ...(body.brands !== undefined ? { brands: body.brands } : {}),
          ...(body.contact_phone !== undefined ? { contact_phone: body.contact_phone } : {}),
          ...(body.whatsapp_number !== undefined ? { whatsapp_number: body.whatsapp_number } : {}),
          ...(body.primary_color !== undefined ? { primary_color: body.primary_color } : {}),
          ...(body.secondary_color !== undefined ? { secondary_color: body.secondary_color } : {}),
          ...(body.language_preferences !== undefined ? { language_preferences: body.language_preferences } : {}),
          ...(body.region !== undefined ? { region: body.region } : {}),
          ...(body.logo_url !== undefined ? { logo_url: body.logo_url } : {}),
          ...(body.font !== undefined ? { font: body.font } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.showroom_type !== undefined ? { showroom_type: body.showroom_type } : {}),
          ...(typeof body.use_brand_theme === 'boolean' ? { use_brand_theme: body.use_brand_theme } : {}),
        },
      });

      if (body.brands !== undefined && body.brands.length > 0) {
        const { syncDealerModels } = await import('../services/modelSync.js');
        void syncDealerModels(dealer_id, body.brands).catch((err: unknown) => {
          fastify.log.error(`Failed to background sync models on profile update: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      return { success: true, profile: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Failed to update dealer profile: ${message}`);
      return reply.code(500).send(apiError('INTERNAL_ERROR', message || 'Could not update profile details.'));
    }
  });

  // POST /v1/dealer/logo: multipart field "logo" (PNG, JPEG or WebP, 2 MB at most). Stores it at
  // logos/{dealer_id}/{uuid}.{ext}, sets dealer.logo_url and returns { logo_url }. Same access as PUT /profile.
  fastify.post('/logo', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) return reply.code(400).send(apiError('BAD_REQUEST', 'No dealer associated with this user account.'));
    if (!request.isMultipart()) return reply.code(400).send(apiError('INVALID_INPUT', 'Send the logo as multipart form data in the "logo" field.'));

    const file = await request.file({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } });
    if (!file) return reply.code(400).send(apiError('INVALID_INPUT', 'Send the logo in the "logo" field.'));

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err) {
      if ((err as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send(apiError('LOGO_TOO_LARGE', 'The logo must be 2 MB or smaller.'));
      }
      throw err;
    }
    if (file.fieldname !== 'logo') return reply.code(400).send(apiError('INVALID_INPUT', 'Send the logo in the "logo" field.'));

    const type = logoTypeFor(file.mimetype, buffer);
    if (!type) return reply.code(400).send(apiError('UNSUPPORTED_TYPE', 'Upload a PNG, JPG or WebP image.'));

    const folder = safeFileId(dealerId);
    const logo_url = await uploadFile(buffer, logoStorageKey(folder, randomUUID(), type), logoContentType(type), path.join(LOGOS_DIR, folder));
    await prisma.dealer.update({ where: { id: dealerId }, data: { logo_url } });
    return { logo_url };
  });
```

- [ ] **Step 8: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/dealer-logo.test.ts test/security-safeUrl.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/lib/dealerLogo.ts apps/api/src/routes/dealer.ts apps/api/src/routes/upload.ts apps/api/src/lib/uploadPaths.ts apps/api/test/dealer-logo.test.ts
git commit -m "feat(api): dealer logo upload and brand-theme flag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Per-user preferences and notification opt-outs (API)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `DealerUser` only), `apps/api/src/lib/notifications.ts`, `apps/api/src/routes/users.ts`
- Create: `apps/api/src/lib/userPreferences.ts`
- Test: `apps/api/test/user-preferences.test.ts`; modify `apps/api/test/notifications.test.ts`

**Interfaces:**
- Consumes: `notify()` and its callers (`postNotifications`, `inboxNotifications`, `approvals`, `routes/approvals`, `videoJobRunner`). Callers pass `userIds`, or leave it out to reach every active user of the dealership. Both paths go through the same filter.
- Produces:
  - `DealerUser.theme_mode: string` (default `"system"`), `DealerUser.notification_prefs: Json?`.
  - `lib/notifications.ts`:
    - `NOTIFICATION_TYPES` (seven, the current union), `type NotificationType`, `type NotificationPrefs = Record<NotificationType, boolean>`;
    - `isNotificationType(v)`;
    - `notificationPrefsOf(raw: unknown): NotificationPrefs` (missing or non-`false` = on);
    - `wantsNotification(raw: unknown, type: NotificationType): boolean`.
  - `lib/userPreferences.ts`:
    - `THEME_MODES`, `type ThemeMode`, `DEFAULT_THEME_MODE = 'system'`, `isThemeMode`, `themeModeOf`;
    - `interface UserPreferences { theme_mode: ThemeMode; notification_prefs: NotificationPrefs }`;
    - `preferencesView(user: { theme_mode: unknown; notification_prefs: unknown }): UserPreferences`;
    - `interface PreferencesUpdate { theme_mode?: ThemeMode; notification_prefs?: Partial<NotificationPrefs> }`;
    - `parsePreferencesUpdate(body: unknown): { ok: true; update: PreferencesUpdate } | { ok: false; message: string }`;
    - `mergeNotificationPrefs(stored: unknown, change: Partial<NotificationPrefs>): NotificationPrefs`.
  - HTTP:
    - `GET /v1/users/me/preferences` → `UserPreferences`.
    - `PUT /v1/users/me/preferences { theme_mode?, notification_prefs? }` → `UserPreferences`. The update is partial, and `notification_prefs` merges into what is stored.
    - Errors: 400 `INVALID_INPUT`, 404 `NOT_FOUND`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/user-preferences.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { NOTIFICATION_TYPES, notificationPrefsOf, wantsNotification } from '../src/lib/notifications.js';
import { mergeNotificationPrefs, parsePreferencesUpdate, preferencesView, themeModeOf } from '../src/lib/userPreferences.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newUser() {
  const dealer = await prisma.dealer.create({ data: { name: 'Pref Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  return prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Asha', role: 'user', dealer_id: dealer.id, is_active: true } });
}

function headersFor(userId: string, dealerId: string | null) {
  const payload: JwtUser = {
    dealer_user_id: userId, dealer_id: dealerId, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const allOn = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true]));

describe('preference helpers', () => {
  it('treats a missing or unknown theme as system', () => {
    assert.equal(themeModeOf('dark'), 'dark');
    assert.equal(themeModeOf('DARK'), 'system');
    assert.equal(themeModeOf(undefined), 'system');
  });

  it('turns a type off only when it is stored as false', () => {
    assert.deepEqual(notificationPrefsOf(null), allOn);
    assert.deepEqual(notificationPrefsOf([false]), allOn);
    assert.equal(notificationPrefsOf({ post_failed: false, inbox_message: 'no' }).post_failed, false);
    assert.equal(notificationPrefsOf({ post_failed: false, inbox_message: 'no' }).inbox_message, true);
    assert.equal(wantsNotification({ reel_ready: false }, 'reel_ready'), false);
    assert.equal(wantsNotification({ reel_ready: false }, 'post_published'), true);
  });

  it('parses partial updates and refuses anything else', () => {
    assert.deepEqual(parsePreferencesUpdate({ theme_mode: 'light' }), { ok: true, update: { theme_mode: 'light' } });
    assert.deepEqual(parsePreferencesUpdate({ notification_prefs: { post_failed: false } }), { ok: true, update: { notification_prefs: { post_failed: false } } });
    for (const bad of [null, [], {}, { theme_mode: 'sepia' }, { notification_prefs: { weekly_digest: false } }, { notification_prefs: { post_failed: 'off' } }, { notification_prefs: [] }, { colour: 'red' }]) {
      assert.equal(parsePreferencesUpdate(bad).ok, false, JSON.stringify(bad));
    }
  });

  it('merges a change into the full stored map', () => {
    const merged = mergeNotificationPrefs({ post_failed: false }, { inbox_message: false });
    assert.equal(merged.post_failed, false);
    assert.equal(merged.inbox_message, false);
    assert.equal(merged.post_published, true);
    assert.deepEqual(Object.keys(merged).sort(), [...NOTIFICATION_TYPES].sort());
    assert.deepEqual(preferencesView({ theme_mode: 'weird', notification_prefs: null }), { theme_mode: 'system', notification_prefs: allOn });
  });
});

describe('/v1/users/me/preferences', () => {
  it('starts at system with every notification on', async () => {
    const user = await newUser();
    const res = await fastify.inject({ method: 'GET', url: '/v1/users/me/preferences', headers: headersFor(user.id, user.dealer_id) });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { theme_mode: 'system', notification_prefs: allOn });
  });

  it('saves the theme and merges notification choices', async () => {
    const user = await newUser();
    const h = headersFor(user.id, user.dealer_id);
    const put = (payload: object) => fastify.inject({ method: 'PUT', url: '/v1/users/me/preferences', headers: h, payload });

    assert.equal((await put({ theme_mode: 'dark' })).json().theme_mode, 'dark');
    await put({ notification_prefs: { post_published: false } });
    const res = await put({ notification_prefs: { inbox_message: false } });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { theme_mode: string; notification_prefs: Record<string, boolean> };
    assert.equal(body.theme_mode, 'dark');
    assert.equal(body.notification_prefs['post_published'], false);
    assert.equal(body.notification_prefs['inbox_message'], false);
    assert.equal(body.notification_prefs['post_failed'], true);
    const stored = await prisma.dealerUser.findUnique({ where: { id: user.id } });
    assert.equal(stored?.theme_mode, 'dark');
  });

  it('refuses bad input and unknown accounts', async () => {
    const user = await newUser();
    const bad = await fastify.inject({ method: 'PUT', url: '/v1/users/me/preferences', headers: headersFor(user.id, user.dealer_id), payload: { theme_mode: 'sepia' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'INVALID_INPUT');

    const ghost = headersFor(`ghost-${randomUUID()}`, user.dealer_id);
    assert.equal((await fastify.inject({ method: 'GET', url: '/v1/users/me/preferences', headers: ghost })).statusCode, 404);
    assert.equal((await fastify.inject({ method: 'PUT', url: '/v1/users/me/preferences', headers: ghost, payload: { theme_mode: 'dark' } })).statusCode, 404);
  });
});
```

In `apps/api/test/notifications.test.ts`, add this test at the end of `describe('notify()', () => {`, after `'notifies only the given users when userIds is set'`:

```ts
  it('skips people who turned that notification type off', async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    await prisma.dealerUser.update({ where: { id: users[0]!.id }, data: { notification_prefs: { post_published: false } } });

    assert.equal(await notify({ dealerId, type: 'post_published', title: 'Post published' }), 1);
    assert.equal(await notify({ dealerId, type: 'post_published', title: 'Post published', userIds: [users[0]!.id] }), 0);
    assert.equal(await notify({ dealerId, type: 'post_failed', title: 'Post failed to publish', userIds: [users[0]!.id] }), 1);

    const rows = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(
      rows.map((r) => `${r.user_id}:${r.type}`).sort(),
      [`${users[0]!.id}:post_failed`, `${users[1]!.id}:post_published`].sort(),
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/user-preferences.test.ts test/notifications.test.ts`
Expected: FAIL. `lib/userPreferences.js` cannot be resolved, and `notification_prefs` is not a `DealerUser` field.

- [ ] **Step 3: Schema.** In model `DealerUser`, add these lines directly after `is_active    Boolean   @default(true)`. Make no other schema change.

```prisma
  theme_mode         String   @default("system") // light | dark | system: Settings → Preferences, follows the person across devices
  notification_prefs Json?    // { [NotificationType]: false } turns a type off for this person; a missing type is on
```

Run: `cd apps/api && npx prisma generate`

- [ ] **Step 4: `apps/api/src/lib/notifications.ts`.**

(a) Replace the `export type NotificationType = …;` union (lines 3–10) with:

```ts
export const NOTIFICATION_TYPES = [
  'post_published',
  'post_failed',
  'approval_requested',
  'approval_decided',
  'reel_ready',
  'platform_disconnected',
  'inbox_message',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationPrefs = Record<NotificationType, boolean>;

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** A person's stored choices (Settings → Preferences) as a full map: only an explicit false turns a type off. */
export function notificationPrefsOf(raw: unknown): NotificationPrefs {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, stored[type] !== false])) as NotificationPrefs;
}

export function wantsNotification(raw: unknown, type: NotificationType): boolean {
  return notificationPrefsOf(raw)[type];
}
```

(b) In `NotifyInput`, change the `userIds` comment to:

```ts
  /** Recipients (DealerUser ids). Only active users of the dealership who haven't turned this type off are notified. Omit to notify all of them. */
```

(c) In `notify()`, replace these two lines:

```ts
  const active = await prisma.dealerUser.findMany({ where: { dealer_id: input.dealerId, is_active: true } });
  const activeIds = new Set(active.map((u) => u.id));
```

with:

```ts
  const active = await prisma.dealerUser.findMany({ where: { dealer_id: input.dealerId, is_active: true } });
  // Settings → Preferences: people who turned this type off are skipped, whether targeted or dealer-wide.
  const activeIds = new Set(active.filter((u) => wantsNotification(u.notification_prefs, input.type)).map((u) => u.id));
```

- [ ] **Step 5: `apps/api/src/lib/userPreferences.ts`**

```ts
import { isNotificationType, notificationPrefsOf, type NotificationPrefs } from './notifications.js';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
/** Matches the web default (apps/web/src/utils/theme.ts): follow the device. */
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

export function themeModeOf(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

/** GET/PUT /v1/users/me/preferences */
export interface UserPreferences {
  theme_mode: ThemeMode;
  notification_prefs: NotificationPrefs;
}

export function preferencesView(user: { theme_mode: unknown; notification_prefs: unknown }): UserPreferences {
  return { theme_mode: themeModeOf(user.theme_mode), notification_prefs: notificationPrefsOf(user.notification_prefs) };
}

export interface PreferencesUpdate {
  theme_mode?: ThemeMode;
  notification_prefs?: Partial<NotificationPrefs>;
}

export type PreferencesParse = { ok: true; update: PreferencesUpdate } | { ok: false; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** PUT body: theme_mode and/or notification_prefs ({ type: boolean }); nothing else. */
export function parsePreferencesUpdate(body: unknown): PreferencesParse {
  if (!isPlainObject(body)) return { ok: false, message: 'Send a JSON object' };
  const { theme_mode, notification_prefs, ...rest } = body;
  const unknownField = Object.keys(rest)[0];
  if (unknownField !== undefined) return { ok: false, message: `Unknown field: ${unknownField}` };

  const update: PreferencesUpdate = {};
  if (theme_mode !== undefined) {
    if (!isThemeMode(theme_mode)) return { ok: false, message: 'theme_mode must be light, dark or system' };
    update.theme_mode = theme_mode;
  }
  if (notification_prefs !== undefined) {
    if (!isPlainObject(notification_prefs)) return { ok: false, message: 'notification_prefs must be an object' };
    const prefs: Partial<NotificationPrefs> = {};
    for (const [key, value] of Object.entries(notification_prefs)) {
      if (!isNotificationType(key)) return { ok: false, message: `Unknown notification type: ${key}` };
      if (typeof value !== 'boolean') return { ok: false, message: `${key} must be true or false` };
      prefs[key] = value;
    }
    update.notification_prefs = prefs;
  }
  if (update.theme_mode === undefined && update.notification_prefs === undefined) {
    return { ok: false, message: 'Send theme_mode or notification_prefs' };
  }
  return { ok: true, update };
}

/** The full map after a change, so types added later still default to on. */
export function mergeNotificationPrefs(stored: unknown, change: Partial<NotificationPrefs>): NotificationPrefs {
  return { ...notificationPrefsOf(stored), ...change };
}
```

- [ ] **Step 6: `apps/api/src/routes/users.ts`.**

(a) Add these imports after the `DealerUser` type import:

```ts
import { Prisma } from '../generated/client/index.js';
import { mergeNotificationPrefs, parsePreferencesUpdate, preferencesView } from '../lib/userPreferences.js';
```

(b) Directly after the `// GET /v1/users/me — current user info` route, add:

```ts
  // GET /v1/users/me/preferences — the signed-in person's theme and notification choices
  fastify.get('/me/preferences', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const me = await prisma.dealerUser.findUnique({ where: { id: getUser(request).dealer_user_id } });
    if (!me) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    return preferencesView(me);
  });

  // PUT /v1/users/me/preferences { theme_mode?, notification_prefs? } — partial; notification_prefs merges
  fastify.put('/me/preferences', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = parsePreferencesUpdate(request.body);
    if (!parsed.ok) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: parsed.message } });

    const me = await prisma.dealerUser.findUnique({ where: { id: getUser(request).dealer_user_id } });
    if (!me) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });

    const { theme_mode, notification_prefs } = parsed.update;
    const updated = await prisma.dealerUser.update({
      where: { id: me.id },
      data: {
        ...(theme_mode !== undefined ? { theme_mode } : {}),
        ...(notification_prefs !== undefined
          ? { notification_prefs: mergeNotificationPrefs(me.notification_prefs, notification_prefs) as Prisma.InputJsonValue }
          : {}),
      },
    });
    return preferencesView(updated);
  });
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/user-preferences.test.ts test/notifications.test.ts test/publish-notifications.test.ts test/inbox-ingest.test.ts test/approvals.test.ts && npx tsc --noEmit`
Expected: PASS. The existing notification tests are unchanged, because nobody in them has opted out. `tsc` is clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/lib/notifications.ts apps/api/src/lib/userPreferences.ts apps/api/src/routes/users.ts apps/api/test/user-preferences.test.ts apps/api/test/notifications.test.ts
git commit -m "feat(api): per-user theme and notification preferences

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Team account edit and owner-role guards (API)

**Files:**
- Create: `apps/api/src/lib/teamAccounts.ts`
- Modify: `apps/api/src/routes/users.ts`
- Test: `apps/api/test/users-account.test.ts`

**Interfaces:**
- Consumes: `getUser`, `requirePermission` (`lib/routeHelpers.ts`); `isGlobalOwner`, `ROLES` (`lib/permissions.ts`); `mapUser` (`routes/users.ts`).
- Produces:
  - `lib/teamAccounts.ts`:
    - `ACCOUNT_NAME_MAX = 80`, `isValidEmail(value: string): boolean`;
    - `interface AccountEdit { name?: string; email?: string | null; phone?: string }`;
    - `parseAccountEdit(body: unknown): { ok: true; edit: AccountEdit } | { ok: false; message: string }`;
    - `canManageMember(actorRole: string, targetRole: string): boolean`;
    - `INVITE_ROLES`, `type InviteRole`, `inviteRole(value: unknown): InviteRole`.
  - HTTP `PATCH /v1/users/:id/account { name?, email?, phone? }` → `{ user }` (the `mapUser` shape).
    - Needs `manage_users`, and the target must be in the caller's dealership.
    - Errors: 400 `INVALID_INPUT`, 403 `FORBIDDEN` (a Manager editing an Owner), 404 `NOT_FOUND`, 409 `PHONE_TAKEN`.
    - An empty `email` clears it.
  - `POST /v1/users/invite` with `role: 'owner'` → 403 unless the caller is the platform owner. Unknown roles still become `user`.
  - `PATCH /v1/users/:id/role` on an Owner → 403 unless the caller is an Owner.

- [ ] **Step 1: Write the failing test** `apps/api/test/users-account.test.ts`

This task's code contains ’ (`’`) in API messages. Byte-check it after writing.

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';
import { canManageMember, inviteRole, isValidEmail, parseAccountEdit } from '../src/lib/teamAccounts.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Team Motors', city: 'Pune', phone: `phone-${randomUUID()}` } })).id;
}

function member(dealerId: string | null, role: Role, extra: { name?: string; email?: string } = {}) {
  return prisma.dealerUser.create({
    data: { phone: `ph-${randomUUID()}`, name: extra.name ?? 'Member', email: extra.email ?? null, role, dealer_id: dealerId, is_active: true },
  });
}

// Stored rows carry role as a plain string.
function headersFor(actor: { id: string; role: string; dealer_id: string | null }, overrides: Partial<JwtUser['permissions']> = {}) {
  const payload: JwtUser = {
    dealer_user_id: actor.id, dealer_id: actor.dealer_id, role: actor.role as Role, phone: '+910000000000',
    permissions: { ...resolvePermissions(actor.role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const editAccount = (h: Record<string, string>, id: string, payload: unknown) =>
  fastify.inject({ method: 'PATCH', url: `/v1/users/${id}/account`, headers: h, payload: payload as object });

describe('teamAccounts', () => {
  it('parses name, email and phone edits', () => {
    assert.deepEqual(parseAccountEdit({ name: '  Asha K ', email: ' Asha@Example.COM ', phone: ' +91 98765 43210 ' }), {
      ok: true, edit: { name: 'Asha K', email: 'asha@example.com', phone: '+91 98765 43210' },
    });
    assert.deepEqual(parseAccountEdit({ email: '' }), { ok: true, edit: { email: null } });
    for (const bad of [null, [], {}, { name: '   ' }, { name: 'x'.repeat(81) }, { email: 'not-an-email' }, { email: 5 }, { phone: '' }, { phone: 9876 }]) {
      assert.equal(parseAccountEdit(bad).ok, false, JSON.stringify(bad));
    }
    assert.equal(isValidEmail('a@b.co'), true);
    assert.equal(isValidEmail('a@b'), false);
  });

  it('lets only an Owner manage an Owner', () => {
    assert.equal(canManageMember('admin', 'owner'), false);
    assert.equal(canManageMember('owner', 'owner'), true);
    assert.equal(canManageMember('admin', 'admin'), true);
    assert.equal(canManageMember('admin', 'user'), true);
  });

  it('reads the invite role, defaulting to user', () => {
    assert.equal(inviteRole('owner'), 'owner');
    assert.equal(inviteRole('admin'), 'admin');
    assert.equal(inviteRole('superuser'), 'user');
    assert.equal(inviteRole(undefined), 'user');
  });
});

describe('PATCH /v1/users/:id/account', () => {
  it("edits a creator's name, email and phone", async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user', { name: 'Old', email: 'old@example.com' });

    const res = await editAccount(headersFor(manager), creator.id, { name: 'Ravi Kumar', email: 'ravi@example.com', phone: '+91 90000 00001' });

    assert.equal(res.statusCode, 200, res.body);
    const { user } = res.json() as { user: { name: string; email?: string; phone: string } };
    assert.deepEqual([user.name, user.email, user.phone], ['Ravi Kumar', 'ravi@example.com', '+91 90000 00001']);
    const stored = await prisma.dealerUser.findUnique({ where: { id: creator.id } });
    assert.equal(stored?.phone, '+91 90000 00001');
  });

  it('clears the email when it is sent empty', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user', { email: 'gone@example.com' });
    const res = await editAccount(headersFor(manager), creator.id, { email: '' });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { user: { email?: string } }).user.email, undefined);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: creator.id } }))?.email, null);
  });

  it('refuses a phone number someone else signs in with', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user');
    const other = await member(await newDealer(), 'user');

    const taken = await editAccount(headersFor(manager), creator.id, { phone: other.phone });
    assert.equal(taken.statusCode, 409);
    assert.equal(taken.json().error.code, 'PHONE_TAKEN');
    assert.equal((await editAccount(headersFor(manager), creator.id, { phone: creator.phone, name: 'Same Phone' })).statusCode, 200);
  });

  it('refuses bad input', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user');
    for (const payload of [{}, { email: 'nope' }, { name: '' }]) {
      const res = await editAccount(headersFor(manager), creator.id, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });

  it("keeps a Manager away from an Owner's account; an Owner may edit it", async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const owner = await member(dealerId, 'owner', { name: 'Owner' });

    const denied = await editAccount(headersFor(manager), owner.id, { name: 'Renamed' });
    assert.equal(denied.statusCode, 403);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: owner.id } }))?.name, 'Owner');

    const platformOwner = await member(null, 'owner');
    assert.equal((await editAccount(headersFor(platformOwner), owner.id, { name: 'Renamed' })).statusCode, 200);
  });

  it('stays inside the dealership and needs manage_users', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const outsider = await member(await newDealer(), 'user');
    assert.equal((await editAccount(headersFor(manager), outsider.id, { name: 'X' })).statusCode, 404);

    const creator = await member(dealerId, 'user');
    const colleague = await member(dealerId, 'user');
    assert.equal((await editAccount(headersFor(creator), colleague.id, { name: 'X' })).statusCode, 403);
  });
});

describe('owner role guards', () => {
  it('only the platform owner invites an Owner', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const phone = `ph-${randomUUID()}`;

    const denied = await fastify.inject({ method: 'POST', url: '/v1/users/invite', headers: headersFor(manager), payload: { phone, role: 'owner' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(await prisma.dealerUser.findUnique({ where: { phone } }), null);

    const platformOwner = await member(null, 'owner');
    const allowed = await fastify.inject({
      method: 'POST', url: '/v1/users/invite', headers: headersFor(platformOwner), payload: { phone, role: 'owner', dealerId },
    });
    assert.equal(allowed.statusCode, 201);
    assert.equal((allowed.json() as { user: { role: string } }).user.role, 'owner');

    const plain = await fastify.inject({ method: 'POST', url: '/v1/users/invite', headers: headersFor(manager), payload: { phone: `ph-${randomUUID()}` } });
    assert.equal((plain.json() as { user: { role: string } }).user.role, 'user');
  });

  it("a Manager can't change an Owner's role but can change a Creator's", async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const owner = await member(dealerId, 'owner');
    const creator = await member(dealerId, 'user');
    const setRole = (id: string, role: Role) => fastify.inject({ method: 'PATCH', url: `/v1/users/${id}/role`, headers: headersFor(manager), payload: { role } });

    assert.equal((await setRole(owner.id, 'user')).statusCode, 403);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: owner.id } }))?.role, 'owner');
    assert.equal((await setRole(creator.id, 'admin')).statusCode, 200);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/users-account.test.ts`
Expected: FAIL. `../src/lib/teamAccounts.js` cannot be resolved.

- [ ] **Step 3: `apps/api/src/lib/teamAccounts.ts`**

```ts
/** Team account rules shared by /v1/users routes. We sign in by phone OTP, so an account is name, email and phone. */

export const ACCOUNT_NAME_MAX = 80;
const EMAIL_MAX = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL.test(value);
}

export interface AccountEdit {
  name?: string;
  /** null clears the email. */
  email?: string | null;
  phone?: string;
}

export type AccountEditParse = { ok: true; edit: AccountEdit } | { ok: false; message: string };

export function parseAccountEdit(body: unknown): AccountEditParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Send a JSON object' };
  const { name, email, phone } = body as Record<string, unknown>;
  const edit: AccountEdit = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return { ok: false, message: 'Name can’t be empty' };
    if (name.trim().length > ACCOUNT_NAME_MAX) return { ok: false, message: `Name must be at most ${ACCOUNT_NAME_MAX} characters` };
    edit.name = name.trim();
  }
  if (email !== undefined) {
    if (email !== null && typeof email !== 'string') return { ok: false, message: 'Email must be text' };
    const clean = (email ?? '').trim().toLowerCase();
    if (clean && !isValidEmail(clean)) return { ok: false, message: 'Enter a valid email address' };
    edit.email = clean || null;
  }
  if (phone !== undefined) {
    // As on invite: required, stored as typed.
    if (typeof phone !== 'string' || !phone.trim()) return { ok: false, message: 'Phone number is required' };
    edit.phone = phone.trim();
  }
  if (edit.name === undefined && edit.email === undefined && edit.phone === undefined) {
    return { ok: false, message: 'Send name, email or phone' };
  }
  return { ok: true, edit };
}

/** A Manager (admin) can't edit or re-role an Owner; an Owner can manage anyone. */
export function canManageMember(actorRole: string, targetRole: string): boolean {
  return targetRole !== 'owner' || actorRole === 'owner';
}

export const INVITE_ROLES = ['owner', 'admin', 'user'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** The invite's role: owner or admin when asked for, otherwise user (as before). */
export function inviteRole(value: unknown): InviteRole {
  return value === 'owner' || value === 'admin' ? value : 'user';
}
```

- [ ] **Step 4: `apps/api/src/routes/users.ts`.**

(a) Add this import after the other `../lib/*` imports:

```ts
import { canManageMember, inviteRole, parseAccountEdit } from '../lib/teamAccounts.js';
```

(b) In `POST /invite`, replace

```ts
    const role = body.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER;
```

with

```ts
    const role = inviteRole(body.role);
    // Only the platform owner grants the owner role (the same rule as PATCH /:id/role).
    if (role === ROLES.OWNER && !isGlobalOwner(user)) {
      return reply.code(403).send({ error: 'Only the owner can assign the owner role' });
    }
```

(c) In `PATCH /:id/role`, directly after `if (!target) return reply.code(404).send({ error: 'User not found' });`, add:

```ts
    if (!canManageMember(user.role, target.role)) {
      return reply.code(403).send({ error: 'Only an Owner can change an Owner’s role' });
    }
```

(d) Directly after the `PATCH /:id/status` route, add:

```ts
  // PATCH /v1/users/:id/account { name?, email?, phone? } — edit a team member's account (manage_users).
  // A Manager can't edit an Owner. A phone number is a sign-in identity, so it must stay unique.
  fastify.patch('/:id/account', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    const parsed = parseAccountEdit(request.body);
    if (!parsed.ok) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: parsed.message } });

    const { id } = request.params as { id: string };
    const target = await prisma.dealerUser.findFirst({
      where: { id, ...(!isGlobalOwner(user) ? { dealer_id: user.dealer_id! } : {}) },
    });
    if (!target) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (!canManageMember(user.role, target.role)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Only an Owner can edit an Owner’s account' } });
    }

    const { name, email, phone } = parsed.edit;
    if (phone !== undefined && phone !== target.phone) {
      const taken = await prisma.dealerUser.findUnique({ where: { phone } });
      if (taken) return reply.code(409).send({ error: { code: 'PHONE_TAKEN', message: 'This phone number is already in use' } });
    }

    const updated = await prisma.dealerUser.update({
      where: { id: target.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
      },
    });
    return { user: mapUser(updated) };
  });
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/users-account.test.ts test/security-auth.test.ts test/security-routes.test.ts && npx tsc --noEmit`
Expected: PASS. `security-auth.test.ts` still shows that a dealer-scoped owner cannot grant the owner role. `tsc` is clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/teamAccounts.ts apps/api/src/routes/users.ts apps/api/test/users-account.test.ts
git commit -m "feat(api): edit a team member's account; owner role rules on invite and role change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Billing plan catalogue and the payments gate (API)

**Files:**
- Create: `apps/api/src/lib/billingPlans.ts`
- Modify: `apps/api/src/routes/billing.ts`, `apps/api/src/plugins/planGate.ts`, `apps/api/.env.example`
- Test: `apps/api/test/billing-plans.test.ts`; modify `apps/api/test/security-routes.test.ts`

**Interfaces:**
- Consumes: `requirePermissionHook(PERMISSIONS.VIEW_BILLING)`; `axios.post` (Razorpay), which the test stubs.
- Produces (`lib/billingPlans.ts`):
  - `PLAN_TIERS`, `type PlanTier`, `BILLING_CYCLES`, `type BillingCycle`, `type GatedFeature`;
  - `UNLIMITED = 999_999`, `PAYMENTS_OFF_MESSAGE`;
  - `interface PlanLimits { postsPerMonth: number | null; connectedAccounts: number; blockedFeatures: readonly GatedFeature[] }`, `PLAN_LIMITS`, `planLimits(plan)`, `isPlanTier`, `isBillingCycle`;
  - `interface PlanFeature { label: string; included: boolean }`;
  - `interface BillingPlan { id; name; description; monthlyPrice; annualPrice; trialDays; features }`;
  - `planFeatures(tier)`, `BILLING_PLANS`, `annualDiscountPercent(plans?)`;
  - `razorpayPlanEnvKey(tier, cycle)`, `razorpayPlanId(tier, cycle, env?)`, `paymentsEnabled(env?)`, `tierForRazorpayPlan(planId, env?)`.
- Produces (HTTP):
  - `GET /v1/billing/plans` → `{ plans: BillingPlan[], payments_enabled: boolean, annual_discount_percent: number }`.
  - `POST /v1/billing/subscribe { tier, cycle }` → `{ success: true, subscriptionId, paymentLink }`. Errors: 400 `INVALID_INPUT`, 503 `BILLING_NOT_CONFIGURED`, 502 `PAYMENT_GATEWAY_ERROR`.
  - `GET /v1/billing/status` keeps its shape, with limits taken from `PLAN_LIMITS`. Enterprise `platformsLimit` becomes 30 (it was 99).
  - The plan gate enforces the same `PLAN_LIMITS`. Enterprise accounts: 30, which was 999 and is now E1's cap.

- [ ] **Step 1: Write the failing test** `apps/api/test/billing-plans.test.ts`

```ts
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';
import {
  BILLING_CYCLES, BILLING_PLANS, PLAN_LIMITS, PLAN_TIERS, UNLIMITED, annualDiscountPercent, paymentsEnabled,
  planFeatures, planLimits, razorpayPlanEnvKey, razorpayPlanId, tierForRazorpayPlan,
} from '../src/lib/billingPlans.js';

// apps/api/.env may hold real Razorpay values: every test starts with none.
const savedEnv: Record<string, string | undefined> = {};
const razorpayKeys = () => Object.keys(process.env).filter((k) => k.startsWith('RAZORPAY_'));

// Plan ids that don't contain a tier name, so only the configured mapping can resolve them.
const PLAN_IDS: Record<string, string> = Object.fromEntries(
  PLAN_TIERS.flatMap((tier, t) => BILLING_CYCLES.map((cycle, c) => [razorpayPlanEnvKey(tier, cycle), `plan_Z${t}${c}`])),
);
const CONFIGURED: Record<string, string> = {
  RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'test_webhook', ...PLAN_IDS,
};

before(async () => {
  for (const key of razorpayKeys()) { savedEnv[key] = process.env[key]; delete process.env[key]; }
  await fastify.ready();
});
afterEach(() => { for (const key of razorpayKeys()) delete process.env[key]; });
after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) if (value !== undefined) process.env[key] = value;
  await fastify.close();
});

async function newDealer(plan = 'starter'): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Plan Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan } })).id;
}

function headers(dealerId: string, role: Role = 'admin') {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: resolvePermissions(role), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

describe('billingPlans', () => {
  it('holds the limits the gate enforces', () => {
    assert.deepEqual(PLAN_LIMITS.starter, { postsPerMonth: 30, connectedAccounts: 2, blockedFeatures: ['inbox', 'boost', 'inventory'] });
    assert.equal(PLAN_LIMITS.growth.postsPerMonth, null);
    assert.equal(PLAN_LIMITS.enterprise.connectedAccounts, 30);
    assert.equal(planLimits('mystery'), PLAN_LIMITS.starter);
    assert.equal(planLimits(null), PLAN_LIMITS.starter);
  });

  it('serves the prices and features the web page used to hard-code', () => {
    assert.deepEqual(BILLING_PLANS.map((p) => [p.id, p.monthlyPrice, p.annualPrice, p.trialDays]), [
      ['starter', 999, 9588, 0], ['growth', 2999, 28788, 0], ['enterprise', 9999, 95988, 0],
    ]);
    assert.equal(annualDiscountPercent(), 20);
    const starter = planFeatures('starter');
    assert.deepEqual(starter.slice(0, 2), [
      { label: 'Up to 30 posts / month', included: true },
      { label: 'Up to 2 connected accounts', included: true },
    ]);
    assert.deepEqual(starter.filter((f) => !f.included).map((f) => f.label), ['AI Auto-Reply Review Inbox', 'Boost campaigns', 'CSV Batch Inventory Mapper & grounding']);
    assert.equal(planFeatures('growth')[0]?.label, 'Unlimited posts');
    assert.ok(planFeatures('growth').every((f) => f.included));
  });

  it('turns payments on only with the keys, the webhook secret and every plan id', () => {
    assert.equal(paymentsEnabled({}), false);
    assert.equal(paymentsEnabled(CONFIGURED), true);
    const noWebhook = { ...CONFIGURED };
    delete noWebhook['RAZORPAY_WEBHOOK_SECRET'];
    assert.equal(paymentsEnabled(noWebhook), false);
    assert.equal(paymentsEnabled({ ...CONFIGURED, [razorpayPlanEnvKey('growth', 'annual')]: ' ' }), false);
    assert.equal(razorpayPlanId('growth', 'monthly', CONFIGURED), 'plan_Z10');
  });

  it('maps a webhook plan id to its tier', () => {
    assert.equal(tierForRazorpayPlan('plan_Z11', CONFIGURED), 'growth');
    assert.equal(tierForRazorpayPlan('plan_Z20', CONFIGURED), 'enterprise');
    assert.equal(tierForRazorpayPlan('plan_growth_monthly', {}), 'growth');
    assert.equal(tierForRazorpayPlan('plan_enterprise_annual', {}), 'enterprise');
    assert.equal(tierForRazorpayPlan('something-else', {}), 'starter');
    assert.equal(tierForRazorpayPlan(null, {}), 'starter');
  });
});

describe('GET /v1/billing/plans and /status', () => {
  it('lists the plans with payments off', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/billing/plans', headers: headers(await newDealer()) });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { plans: Array<{ id: string }>; payments_enabled: boolean; annual_discount_percent: number };
    assert.deepEqual(body.plans.map((p) => p.id), ['starter', 'growth', 'enterprise']);
    assert.equal(body.payments_enabled, false);
    assert.equal(body.annual_discount_percent, 20);
  });

  it('reports payments on when Razorpay is configured', async () => {
    Object.assign(process.env, CONFIGURED);
    const res = await fastify.inject({ method: 'GET', url: '/v1/billing/plans', headers: headers(await newDealer()) });
    assert.equal(res.json().payments_enabled, true);
  });

  it('reports limits from the same table', async () => {
    const status = async (plan: string) =>
      (await fastify.inject({ method: 'GET', url: '/v1/billing/status', headers: headers(await newDealer(plan)) })).json().limits;
    const starter = await status('starter');
    assert.deepEqual([starter.postsLimit, starter.platformsLimit, starter.featuresBlocked], [30, 2, ['inbox', 'boost', 'inventory']]);
    const enterprise = await status('enterprise');
    assert.deepEqual([enterprise.postsLimit, enterprise.platformsLimit, enterprise.featuresBlocked], [UNLIMITED, 30, []]);
  });
});

describe('POST /v1/billing/subscribe', () => {
  it('refuses while payments are off and creates nothing', async () => {
    const dealerId = await newDealer();
    const res = await fastify.inject({ method: 'POST', url: '/v1/billing/subscribe', headers: headers(dealerId), payload: { tier: 'growth', cycle: 'monthly' } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'BILLING_NOT_CONFIGURED');
    assert.equal(await prisma.subscription.findUnique({ where: { dealer_id: dealerId } }), null);
  });

  it('checks the tier and cycle', async () => {
    Object.assign(process.env, CONFIGURED);
    for (const payload of [{ tier: 'gold', cycle: 'monthly' }, { tier: 'growth', cycle: 'weekly' }, { planId: 'plan_growth_monthly' }]) {
      const res = await fastify.inject({ method: 'POST', url: '/v1/billing/subscribe', headers: headers(await newDealer()), payload });
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });

  it('subscribes to the configured Razorpay plan', async () => {
    Object.assign(process.env, CONFIGURED);
    const dealerId = await newDealer();
    const calls: Array<{ url: string; body: unknown }> = [];
    const original = axios.post;
    axios.post = (async (url: string, body: unknown) => {
      calls.push({ url, body });
      return { data: { id: 'sub_test_1', short_url: 'https://rzp.io/i/test' } };
    }) as unknown as typeof axios.post;
    try {
      const res = await fastify.inject({ method: 'POST', url: '/v1/billing/subscribe', headers: headers(dealerId), payload: { tier: 'growth', cycle: 'annual' } });
      assert.equal(res.statusCode, 200, res.body);
      assert.deepEqual(res.json(), { success: true, subscriptionId: 'sub_test_1', paymentLink: 'https://rzp.io/i/test' });
      assert.equal(calls[0]?.url, 'https://api.razorpay.com/v1/subscriptions');
      assert.equal((calls[0]?.body as { plan_id: string }).plan_id, 'plan_Z11');
      const sub = await prisma.subscription.findUnique({ where: { dealer_id: dealerId } });
      assert.deepEqual([sub?.planId, sub?.status, sub?.razorpaySubscriptionId], ['plan_Z11', 'created', 'sub_test_1']);
    } finally {
      axios.post = original;
    }
  });
});

describe('POST /v1/billing/webhook', () => {
  it('activates the tier the configured plan id pays for', async () => {
    Object.assign(process.env, CONFIGURED);
    const dealerId = await newDealer();
    const subId = `sub_${randomUUID()}`;
    await prisma.subscription.create({ data: { dealer_id: dealerId, razorpaySubscriptionId: subId, planId: 'plan_Z20', status: 'created' } });
    const now = Math.floor(Date.now() / 1000);

    const res = await fastify.inject({
      method: 'POST', url: '/v1/billing/webhook',
      payload: { event: 'subscription.activated', payload: { subscription: { entity: { id: subId, plan_id: 'plan_Z20', status: 'active', current_start: now, current_end: now + 30 * 86400 } } } },
    });

    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.plan, 'enterprise');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/billing-plans.test.ts`
Expected: FAIL. `../src/lib/billingPlans.js` cannot be resolved.

- [ ] **Step 3: `apps/api/src/lib/billingPlans.ts`**

```ts
/**
 * The plan catalogue in one place:
 * - limits, enforced by plugins/planGate.ts and reported by GET /billing/status;
 * - names, prices and features, served by GET /billing/plans;
 * - the Razorpay plan ids that decide whether online payment is available.
 */

export const PLAN_TIERS = ['starter', 'growth', 'enterprise'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
export const BILLING_CYCLES = ['monthly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export type GatedFeature = 'inbox' | 'boost' | 'inventory';

/** GET /billing/status reports unlimited posts as this number (the web shows it as "Unlimited posts"). */
export const UNLIMITED = 999_999;

export const PAYMENTS_OFF_MESSAGE = 'Online payments are being set up. Contact us to change your plan.';

export interface PlanLimits {
  /** Posts created per calendar month; null means no limit. */
  postsPerMonth: number | null;
  /** Live connected accounts. Enterprise matches the app-wide cap of 30 (Stage E1). */
  connectedAccounts: number;
  blockedFeatures: readonly GatedFeature[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: { postsPerMonth: 30, connectedAccounts: 2, blockedFeatures: ['inbox', 'boost', 'inventory'] },
  growth: { postsPerMonth: null, connectedAccounts: 5, blockedFeatures: [] },
  enterprise: { postsPerMonth: null, connectedAccounts: 30, blockedFeatures: [] },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && (PLAN_TIERS as readonly string[]).includes(value);
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === 'string' && (BILLING_CYCLES as readonly string[]).includes(value);
}

/** The dealer's limits; an empty or unknown plan counts as Starter, as the gate always did. */
export function planLimits(plan: string | null | undefined): PlanLimits {
  return isPlanTier(plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.starter;
}

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface BillingPlan {
  id: PlanTier;
  name: string;
  description: string;
  /** ₹ per month on the monthly cycle. */
  monthlyPrice: number;
  /** ₹ per year on the annual cycle. */
  annualPrice: number;
  /** There is no trial API, so every plan has 0 and the web shows no trial button. */
  trialDays: number;
  features: PlanFeature[];
}

// Names, prices and highlights as the web Billing page (BillingPage.tsx) had them.
const PLAN_COPY: Record<PlanTier, { name: string; description: string; monthlyPrice: number; annualPerMonth: number; highlights: string[] }> = {
  starter: {
    name: 'Starter',
    description: 'Ideal for small local dealerships looking to kickstart their social presence.',
    monthlyPrice: 999,
    annualPerMonth: 799,
    highlights: ['Basic AI Post Generation', 'Hindi & Hinglish language support'],
  },
  growth: {
    name: 'Growth',
    description: 'Best for active dealerships aiming to scale lead generation & review replies.',
    monthlyPrice: 2999,
    annualPerMonth: 2399,
    highlights: ['Advanced AI generation with custom brand style', 'Access to full regional Indian calendar'],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'Built for large dealer groups requiring multiple brands, multi-location dashboards.',
    monthlyPrice: 9999,
    annualPerMonth: 7999,
    highlights: [
      'Everything in Growth',
      'Dealer Impersonation & Admin control panel',
      'Priority API rate-limits',
      'Custom template compositor',
      '24/7 Dedicated account support manager',
    ],
  },
};

const GATED_FEATURES: readonly GatedFeature[] = ['inbox', 'boost', 'inventory'];
const FEATURE_LABELS: Record<GatedFeature, string> = {
  inbox: 'AI Auto-Reply Review Inbox',
  boost: 'Boost campaigns',
  inventory: 'CSV Batch Inventory Mapper & grounding',
};

/**
 * The feature bullets, in this order:
 * - the limits, taken from PLAN_LIMITS so they can't drift from the gate;
 * - the highlights;
 * - the gated features, marked not included where the plan blocks them.
 */
export function planFeatures(tier: PlanTier): PlanFeature[] {
  const limits = PLAN_LIMITS[tier];
  return [
    { label: limits.postsPerMonth === null ? 'Unlimited posts' : `Up to ${limits.postsPerMonth} posts / month`, included: true },
    { label: `Up to ${limits.connectedAccounts} connected accounts`, included: true },
    ...PLAN_COPY[tier].highlights.map((label) => ({ label, included: true })),
    ...GATED_FEATURES.map((feature) => ({ label: FEATURE_LABELS[feature], included: !limits.blockedFeatures.includes(feature) })),
  ];
}

export const BILLING_PLANS: readonly BillingPlan[] = PLAN_TIERS.map((id) => {
  const copy = PLAN_COPY[id];
  return {
    id,
    name: copy.name,
    description: copy.description,
    monthlyPrice: copy.monthlyPrice,
    annualPrice: copy.annualPerMonth * 12,
    trialDays: 0,
    features: planFeatures(id),
  };
});

/** The saving shown on the Annual toggle: the smallest across plans, so it never over-promises. */
export function annualDiscountPercent(plans: readonly BillingPlan[] = BILLING_PLANS): number {
  if (plans.length === 0) return 0;
  return Math.min(...plans.map((p) => Math.round((1 - p.annualPrice / (p.monthlyPrice * 12)) * 100)));
}

type Env = Record<string, string | undefined>;

/** RAZORPAY_PLAN_GROWTH_MONTHLY and so on: the Razorpay plan id for a tier and cycle. */
export function razorpayPlanEnvKey(tier: PlanTier, cycle: BillingCycle): string {
  return `RAZORPAY_PLAN_${tier.toUpperCase()}_${cycle.toUpperCase()}`;
}

export function razorpayPlanId(tier: PlanTier, cycle: BillingCycle, env: Env = process.env): string | null {
  return env[razorpayPlanEnvKey(tier, cycle)]?.trim() || null;
}

/**
 * Online payment needs all of:
 * - the Razorpay key id and secret;
 * - the webhook secret, which activates plans in production;
 * - a plan id for every tier and cycle.
 */
export function paymentsEnabled(env: Env = process.env): boolean {
  const keys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].every((key) => !!env[key]?.trim());
  return keys && PLAN_TIERS.every((tier) => BILLING_CYCLES.every((cycle) => razorpayPlanId(tier, cycle, env) !== null));
}

/** The tier a webhook's plan id pays for: the configured Razorpay ids first, then the old "plan_growth_monthly" style. */
export function tierForRazorpayPlan(planId: string | null | undefined, env: Env = process.env): PlanTier {
  const id = planId ?? '';
  if (id) {
    for (const tier of PLAN_TIERS) {
      if (BILLING_CYCLES.some((cycle) => razorpayPlanId(tier, cycle, env) === id)) return tier;
    }
  }
  if (id.includes('growth') || id.includes('premium')) return 'growth';
  if (id.includes('enterprise')) return 'enterprise';
  return 'starter';
}
```

This file contains ₹ (`₹`) in comments only.

- [ ] **Step 4: `apps/api/src/plugins/planGate.ts`.**

Add `import { planLimits } from '../lib/billingPlans.js';` after the prisma import. In the returned hook, replace everything from `const plan = dealer.plan ?? 'starter';` to the end of the platform check with:

```ts
      // The same table GET /billing/status reports (lib/billingPlans.ts).
      const limits = planLimits(dealer.plan);

      // 1. Features the plan doesn't include (Starter: inbox, boost, inventory)
      if ((limits.blockedFeatures as readonly string[]).includes(feature)) {
        return reply.code(403).send({
          error: {
            code: 'PLAN_GATED',
            message: `The ${feature} feature is not available on the Starter plan. Please upgrade to Growth or Enterprise.`,
          },
        });
      }

      // 2. Posts per calendar month (Starter: 30)
      if (feature === 'posts' && limits.postsPerMonth !== null) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const postsCount = await prisma.post.count({
          where: {
            dealer_id: dealerId,
            created_at: { gte: startOfMonth },
          },
        });

        if (postsCount >= limits.postsPerMonth) {
          return reply.code(403).send({
            error: {
              code: 'PLAN_LIMIT_REACHED',
              message: `You have reached the monthly limit of ${limits.postsPerMonth} posts for the Starter plan. Please upgrade to publish more.`,
            },
          });
        }
      }

      // 3. Connected accounts (Starter 2, Growth 5, Enterprise 30)
      if (feature === 'platforms') {
        const limit = limits.connectedAccounts;

        const connectionsCount = await prisma.platformConnection.count({
          where: {
            dealer_id: dealerId,
            is_connected: true,
          },
        });

        if (connectionsCount >= limit) {
          return reply.code(403).send({
            error: {
              code: 'PLAN_LIMIT_REACHED',
              message: `You have reached the limit of ${limit} platform connections for your current plan. Please upgrade to connect more.`,
            },
          });
        }
      }
```

- [ ] **Step 5: `apps/api/src/routes/billing.ts`.**

(a) Replace the imports with:

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import axios from 'axios';
import { validateRazorpaySignature } from '../lib/webhookSecurity.js';
import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';
import {
  BILLING_PLANS, PAYMENTS_OFF_MESSAGE, UNLIMITED, annualDiscountPercent, isBillingCycle, isPlanTier, paymentsEnabled,
  planLimits, razorpayPlanId, tierForRazorpayPlan,
} from '../lib/billingPlans.js';
```

`getFrontendUrl` is no longer used.

(b) In `GET /status`, replace the block from `// Define tier limits` through the closing `}` of the `else if (activePlan === 'enterprise')` branch with:

```ts
    // Limits come from lib/billingPlans.ts, the same table the plan gate enforces.
    const limits = planLimits(activePlan);
    const postsLimit = limits.postsPerMonth ?? UNLIMITED;
    const platformsLimit = limits.connectedAccounts;
    const featuresBlocked = [...limits.blockedFeatures];
```

(c) Directly after the `GET /status` route, add:

```ts
  // GET /v1/billing/plans — the plan catalogue, and whether online payment is available
  fastify.get('/plans', { preHandler: [fastify.authenticate, canViewBilling] }, async () => ({
    plans: BILLING_PLANS,
    payments_enabled: paymentsEnabled(),
    annual_discount_percent: annualDiscountPercent(),
  }));
```

(d) Replace the whole `// POST /v1/billing/subscribe` route with:

```ts
  // POST /v1/billing/subscribe { tier, cycle } — starts a Razorpay subscription on the configured plan id.
  // Until Razorpay is configured (paymentsEnabled) it answers 503 BILLING_NOT_CONFIGURED and creates nothing.
  fastify.post('/subscribe', { preHandler: [fastify.authenticate, canViewBilling] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Not authenticated with a dealer' } });
    }

    const { tier, cycle } = (request.body ?? {}) as { tier?: unknown; cycle?: unknown };
    if (!isPlanTier(tier) || !isBillingCycle(cycle)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'tier must be starter, growth or enterprise, and cycle monthly or annual' } });
    }
    const planId = razorpayPlanId(tier, cycle);
    if (!paymentsEnabled() || !planId) {
      return reply.code(503).send({ error: { code: 'BILLING_NOT_CONFIGURED', message: PAYMENTS_OFF_MESSAGE } });
    }

    let subscriptionId: string;
    let paymentLink: string;
    try {
      const response = await axios.post<{ id: string; short_url: string }>(
        'https://api.razorpay.com/v1/subscriptions',
        { plan_id: planId, total_count: 12, quantity: 1, customer_notify: 1 },
        { auth: { username: process.env['RAZORPAY_KEY_ID']!, password: process.env['RAZORPAY_KEY_SECRET']! }, timeout: 15_000 },
      );
      subscriptionId = response.data.id;
      paymentLink = response.data.short_url;
    } catch (err) {
      fastify.log.error(`[billing] Razorpay subscription failed: ${err instanceof Error ? err.message : String(err)}`);
      return reply.code(502).send({
        error: { code: 'PAYMENT_GATEWAY_ERROR', message: 'Could not start the subscription with the payment gateway. Please try again.' },
      });
    }

    const existing = await prisma.subscription.findUnique({ where: { dealer_id: dealerId } });
    const data = { razorpaySubscriptionId: subscriptionId, planId, status: 'created' };
    if (existing) await prisma.subscription.update({ where: { dealer_id: dealerId }, data });
    else await prisma.subscription.create({ data: { dealer_id: dealerId, ...data } });

    return { success: true, subscriptionId, paymentLink };
  });
```

(e) In `POST /webhook`, replace the block from `// Map plan ID to tier` through the closing `}` of the `else if (planId?.includes('starter'))` branch with:

```ts
    // Configured Razorpay plan ids first, then the old "plan_growth_monthly" style.
    const planTier = tierForRazorpayPlan(planId);
```

- [ ] **Step 6: `apps/api/.env.example`.** After `RAZORPAY_WEBHOOK_SECRET=""`, add:

```
# Razorpay plan id per tier and cycle. Online payment (Settings → Billing) turns on only when the three
# keys above and all six plan ids are set; until then Subscribe is disabled.
RAZORPAY_PLAN_STARTER_MONTHLY=""
RAZORPAY_PLAN_STARTER_ANNUAL=""
RAZORPAY_PLAN_GROWTH_MONTHLY=""
RAZORPAY_PLAN_GROWTH_ANNUAL=""
RAZORPAY_PLAN_ENTERPRISE_MONTHLY=""
RAZORPAY_PLAN_ENTERPRISE_ANNUAL=""
```

- [ ] **Step 7: `apps/api/test/security-routes.test.ts`.** Replace the `'view_billing gates billing'` test with:

```ts
  it('view_billing gates billing', async () => {
    const dealerId = await newDealer('billing-dealer');
    for (const [method, url] of [['GET', '/v1/billing/status'], ['GET', '/v1/billing/plans'], ['POST', '/v1/billing/subscribe']] as const) {
      const res = await fastify.inject({ method, url, headers: bearer(token(dealerId, 'user')), payload: { tier: 'growth', cycle: 'monthly' } });
      assert.equal(res.statusCode, 403, url);
    }
  });
```

- [ ] **Step 8: Run the tests, then the whole API suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/billing-plans.test.ts test/security-routes.test.ts test/inbox-routes.test.ts test/publish-lifecycle.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'`
Expected: all pass. The API tasks are done.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/lib/billingPlans.ts apps/api/src/routes/billing.ts apps/api/src/plugins/planGate.ts apps/api/.env.example apps/api/test/billing-plans.test.ts apps/api/test/security-routes.test.ts
git commit -m "feat(api): plan catalogue endpoint and a payments gate for subscribe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Split `SettingsPage.tsx` into tab components (web, no behaviour change)

A mechanical move. `SettingsPage.tsx` becomes a shell. Each tab's JSX moves byte-for-byte into its own component, and its state and handlers move with it. The only edits allowed are these, and each one keeps behaviour:
1. `catch (err)` becomes `catch` where `err` is unused (three places in the model library).
2. In Preferences, a ternary used as a statement becomes an `if`/`else`.
3. Each tab's load effect now sets state only in promise callbacks: a loading flag starts `true` instead of being set inside the effect. In the model library, `fetchModels` / `checkSyncStatus` become callbacks the effect can depend on.
4. Tabs load when they mount, which is when they are opened. Before, they loaded when `activeTab` changed.

**Files:**
- Create: `apps/web/src/utils/settings.ts`, `apps/web/src/components/settings/useProfileForm.ts`, `apps/web/src/components/settings/ProfileTab.tsx`, `apps/web/src/components/settings/PreferencesTab.tsx`, `apps/web/src/components/settings/ModelLibraryTab.tsx`, `apps/web/src/components/settings/InspirationTab.tsx`, `apps/web/src/components/settings/TeamTab.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx` (becomes the shell)

**Interfaces:**
- Consumes: the current `SettingsPage.tsx` at main 3aad6d7. E1 does not touch it. The JSX blocks are:
  - Profile: lines 616–779;
  - Preferences: 784–921;
  - Model Library: 925–1516;
  - Inspiration: 1521–1637;
  - Team: 1642–1805.
- Produces:
  - `utils/settings.ts`: `PLAN_LABELS`, `LANGUAGES`, `REGIONS`, `BRANDS`, `NOTIFICATION_KEYS`, `type SettingsTab`, `interface InspirationHandle`, `interface SyncedModel`, `interface SyncJobStatus`, `IDLE_SYNC`.
  - `useProfileForm()` returns `{ profileLoaded, billing, selectedLangs, setSelectedLangs, selectedRegion, setSelectedRegion, selectedBrands, setSelectedBrands, dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp, primaryColor, setPrimaryColor, defaultRadius, setDefaultRadius, notifications, setNotifications, saved, logoUrl, setLogoUrl, font, setFont, address, setAddress, uploadingLogo, setUploadingLogo, showroomType, setShowroomType, toggleLang, toggleBrand, handleSave }`, and `type ProfileForm`.
  - Components:
    - `ProfileTab({ form }: { form: ProfileForm })` and `PreferencesTab({ form }: { form: ProfileForm })`;
    - `ModelLibraryTab({ brands }: { brands: string[] })`;
    - `InspirationTab()` and `TeamTab()`.

This task moves `'Citroën'` (ë, `ë`), and the moved JSX keeps its existing · — ✓ characters. The move script copies bytes, so check `git diff` for them.

- [ ] **Step 1: `apps/web/src/utils/settings.ts`**

```ts
// Settings constants and shared types (moved from pages/SettingsPage.tsx).

export const PLAN_LABELS: Record<string, string> = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };

export const LANGUAGES = [
  { code: 'en', label: 'English', script: 'Latin' },
  { code: 'hi', label: 'Hindi', script: 'Devanagari' },
  { code: 'ta', label: 'Tamil', script: 'Tamil' },
  { code: 'te', label: 'Telugu', script: 'Telugu' },
  { code: 'kn', label: 'Kannada', script: 'Kannada' },
  { code: 'ml', label: 'Malayalam', script: 'Malayalam' },
  { code: 'mr', label: 'Marathi', script: 'Devanagari' },
];

export const REGIONS = ['North India', 'South India', 'East India', 'West India', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana', 'Gujarat', 'Punjab', 'Rajasthan'];

export const BRANDS = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra', 'Renault', 'Nissan', 'MG', 'Skoda', 'Volkswagen', 'Jeep', 'Ford', 'Citroën', 'BMW', 'Mercedes-Benz', 'Audi'];

export const NOTIFICATION_KEYS = [
  { key: 'post_published', label: 'Post published successfully', defaultOn: true },
  { key: 'post_failed', label: 'Post failed to publish', defaultOn: true },
  { key: 'inbox_message', label: 'New inbox message received', defaultOn: true },
  { key: 'boost_update', label: 'Boost campaign update (every 4h)', defaultOn: false },
  { key: 'festival_suggestion', label: 'Festival campaign suggestions', defaultOn: true },
  { key: 'monthly_report', label: 'Monthly performance report', defaultOn: true },
];

export type SettingsTab = 'profile' | 'preferences' | 'inspiration' | 'team' | 'model_library';

export interface InspirationHandle {
  id: string;
  platform: string;
  handle_url: string;
  handle_name: string | null;
  posts_cache: string[] | null;
  last_scraped_at: string | null;
  created_at: string;
}

export interface SyncedModel {
  id: string;
  brand: string;
  model_name: string;
  canonical_id: string;
  variants: string[];
  colours: Array<{ name: string; hex: string; images: Array<{ angle: string; url: string }> }>;
  images: Array<{ angle: string; url: string }>;
  synced_at: string;
  source: string;
}

export interface SyncJobStatus {
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  brands: Record<string, 'pending' | 'syncing' | 'completed' | 'failed'>;
  progress: number;
  currentBrand: string;
  isCompleted: boolean;
}

export const IDLE_SYNC: SyncJobStatus = { status: 'idle', brands: {}, progress: 0, currentBrand: '', isCompleted: false };
```

- [ ] **Step 2: `apps/web/src/components/settings/useProfileForm.ts`**

It holds the state, load and save that Profile and Preferences share (today's lines 90–112, 400–428 and 545–580).

```ts
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { billingService, type BillingStatus } from '../../services/billing';
import { NOTIFICATION_KEYS } from '../../utils/settings';

interface ProfileResponse {
  success: boolean;
  profile: {
    name: string; city: string; contact_phone?: string; whatsapp_number?: string;
    primary_color?: string; brands?: string[]; language_preferences?: string[]; region?: string;
    logo_url?: string; font?: string; address?: string;
    showroom_type?: string[];
  };
}

// Profile and Preferences share one form and one PUT /dealer/profile (moved from SettingsPage).
export function useProfileForm() {
  const { addToast } = useToast();
  // Empty until GET /dealer/profile answers; Save stays disabled so blanks never overwrite the dealer.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'hi']);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [dealerName, setDealerName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1877F2');
  const [defaultRadius, setDefaultRadius] = useState(25);
  const [notifications, setNotifications] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sg_notifications');
    if (saved) return new Set(JSON.parse(saved) as string[]);
    return new Set(NOTIFICATION_KEYS.filter((n) => n.defaultOn).map((n) => n.key));
  });
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [font, setFont] = useState('Arial');
  const [address, setAddress] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showroomType, setShowroomType] = useState('new');

  useEffect(() => {
    api.get<ProfileResponse>('/dealer/profile').then((res) => {
      const p = res.profile;
      if (!p) throw new Error('Dealer profile not found');
      setDealerName(p.name ?? '');
      setCity(p.city ?? '');
      if (p.contact_phone) setPhone(p.contact_phone);
      if (p.whatsapp_number) setWhatsapp(p.whatsapp_number);
      if (p.primary_color) setPrimaryColor(p.primary_color);
      if (p.brands?.length) setSelectedBrands(p.brands as string[]);
      if (p.language_preferences?.length) setSelectedLangs(p.language_preferences);
      if (p.region) setSelectedRegion(p.region);
      if (p.logo_url) setLogoUrl(p.logo_url);
      if (p.font) setFont(p.font);
      if (p.address) setAddress(p.address);
      if (p.showroom_type?.length) setShowroomType(p.showroom_type[0]);
      setProfileLoaded(true);
    }).catch(() => {
      addToast({ type: 'error', title: 'Could not load your profile', message: 'Refresh the page before saving changes.' });
    });
    billingService.getStatus()
      .then((res) => { if (res.success) setBilling(res); })
      .catch(() => setBilling(null));
  }, [addToast]);

  const toggleLang = (code: string) => {
    if (code === 'en') return; // English always required
    setSelectedLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]);
  };

  const handleSave = () => {
    if (!profileLoaded) return;
    api.put('/dealer/profile', {
      name: dealerName,
      city,
      contact_phone: phone,
      whatsapp_number: whatsapp,
      primary_color: primaryColor,
      brands: selectedBrands,
      language_preferences: selectedLangs,
      region: selectedRegion,
      logo_url: logoUrl,
      font,
      address,
      showroom_type: [showroomType],
    })
      .then(() => {
        addToast({ type: 'success', title: 'Settings Saved', message: 'Your dealership profile has been updated successfully.' });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      })
      .catch((err) => {
        addToast({ type: 'error', title: 'Error Saving Settings', message: 'Failed to update settings. Please try again.' });
        console.error(err);
      });
    localStorage.setItem('sg_notifications', JSON.stringify([...notifications]));
  };

  return {
    profileLoaded, billing, selectedLangs, setSelectedLangs, selectedRegion, setSelectedRegion, selectedBrands, setSelectedBrands,
    dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp, primaryColor, setPrimaryColor,
    defaultRadius, setDefaultRadius, notifications, setNotifications, saved, logoUrl, setLogoUrl, font, setFont,
    address, setAddress, uploadingLogo, setUploadingLogo, showroomType, setShowroomType, toggleLang, toggleBrand, handleSave,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
```

- [ ] **Step 3: Create the five tab files, each with a one-line `__JSX__` placeholder**

`apps/web/src/components/settings/ProfileTab.tsx`:

```tsx
import { Check, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { creativeService } from '../../services/creative';
import { BRANDS } from '../../utils/settings';
import type { ProfileForm } from './useProfileForm';

// Moved unchanged from SettingsPage.tsx; Task 7 ports it to the reference layout.
export function ProfileTab({ form }: { form: ProfileForm }) {
  const { addToast } = useToast();
  const {
    dealerName, setDealerName, showroomType, setShowroomType, city, setCity, phone, setPhone, whatsapp, setWhatsapp,
    selectedBrands, toggleBrand, logoUrl, setLogoUrl, uploadingLogo, setUploadingLogo, address, setAddress,
    font, setFont, primaryColor, setPrimaryColor, saved, handleSave, profileLoaded,
  } = form;

  return (
__JSX__
  );
}
```

`apps/web/src/components/settings/PreferencesTab.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeMode } from '../../utils/theme';
import { LANGUAGES, NOTIFICATION_KEYS, PLAN_LABELS, REGIONS } from '../../utils/settings';
import type { ProfileForm } from './useProfileForm';

// Moved unchanged from SettingsPage.tsx; Task 10 ports it to the reference layout.
export function PreferencesTab({ form }: { form: ProfileForm }) {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const {
    selectedLangs, toggleLang, selectedRegion, setSelectedRegion, defaultRadius, setDefaultRadius,
    notifications, setNotifications, billing, saved, handleSave, profileLoaded,
  } = form;

  return (
__JSX__
  );
}
```

`apps/web/src/components/settings/ModelLibraryTab.tsx`. The state and handlers are today's lines 134–398. The load and polling are restructured so state is set only in promise callbacks.

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Trash2, Plus, Search, Database, Car, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import { creativeService } from '../../services/creative';
import { BRANDS, IDLE_SYNC, type SyncJobStatus, type SyncedModel } from '../../utils/settings';

// Our extra: OEM model sync and the manual model repository (moved from SettingsPage.tsx).
export function ModelLibraryTab({ brands: selectedBrands }: { brands: string[] }) {
  const { addToast } = useToast();
  const [syncedModels, setSyncedModels] = useState<SyncedModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncJobStatus>(IDLE_SYNC);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedModelDetail, setSelectedModelDetail] = useState<SyncedModel | null>(null);
  const [activeColorPreview, setActiveColorPreview] = useState<string>('');
  const [activePreviewUrl, setActivePreviewUrl] = useState<string>('');

  // Manually Add/Edit Model form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualBrand, setManualBrand] = useState('Hyundai');
  const [manualBrandType, setManualBrandType] = useState<'known' | 'custom'>('known');
  const [customBrandName, setCustomBrandName] = useState('');
  const [manualModelName, setManualModelName] = useState('');
  const [manualVariants, setManualVariants] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  // Unified Images List
  const [manualImages, setManualImages] = useState<string[]>([]);
  const [isPasteActive, setIsPasteActive] = useState(false);
  const [uploadingImagesCount, setUploadingImagesCount] = useState(0);

  // Deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingModel, setDeletingModel] = useState<SyncedModel | null>(null);

  const resetManualForm = () => {
    setIsEditMode(false);
    setEditingModelId(null);
    setManualBrand('Hyundai');
    setManualBrandType('known');
    setCustomBrandName('');
    setManualModelName('');
    setManualVariants('');
    setManualImages([]);
    setIsPasteActive(false);
    setUploadingImagesCount(0);
  };

  const handleImagePaste = async (e: React.ClipboardEvent) => {
    if (!isPasteActive) return; // Only paste when the box is clicked/focused

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    setUploadingImagesCount(prev => prev + imageFiles.length);
    try {
      const promises = imageFiles.map(async (file) => {
        const res = await creativeService.uploadImage(file);
        return res.url;
      });
      const urls = await Promise.all(promises);
      setManualImages(prev => [...prev, ...urls]);
      addToast({
        type: 'success',
        title: 'Images Pasted',
        message: `Pasted and uploaded ${imageFiles.length} image(s) successfully.`
      });
    } catch {
      addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload some clipboard images.' });
    } finally {
      setUploadingImagesCount(prev => Math.max(0, prev - imageFiles.length));
    }
  };

  const handleMultipleImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    setUploadingImagesCount(prev => prev + fileList.length);
    try {
      const promises = fileList.map(async (file) => {
        const res = await creativeService.uploadImage(file);
        return res.url;
      });
      const urls = await Promise.all(promises);
      setManualImages(prev => [...prev, ...urls]);
      addToast({
        type: 'success',
        title: 'Images Uploaded',
        message: `Uploaded ${fileList.length} image(s) successfully.`
      });
    } catch {
      addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload some images.' });
    } finally {
      setUploadingImagesCount(prev => Math.max(0, prev - fileList.length));
    }
  };

  // Loads the repository. Callers that want the spinner set loadingModels first.
  const loadModels = useCallback(() => {
    api.get<{ success: boolean; models: SyncedModel[] }>('/model-library')
      .then((res) => {
        setSyncedModels(res.models || []);
      })
      .catch((err) => {
        console.error(err);
        addToast({ type: 'error', title: 'Error', message: 'Failed to load model library' });
      })
      .finally(() => setLoadingModels(false));
  }, [addToast]);

  const fetchModels = () => {
    setLoadingModels(true);
    loadModels();
  };

  // Polls a running OEM sync every 1.5 s and reloads the repository when it completes.
  const checkSyncStatus = useCallback(function poll(): void {
    api.get<{ success: boolean; syncJob: SyncJobStatus }>('/model-library/sync/status')
      .then((res) => {
        if (!res.success || !res.syncJob) return;
        setSyncStatus(res.syncJob);
        if (res.syncJob.status === 'in_progress') {
          setIsSyncing(true);
          setTimeout(poll, 1500);
        } else {
          setIsSyncing(false);
          if (res.syncJob.status === 'completed') loadModels();
        }
      })
      .catch((err) => console.error(err));
  }, [loadModels]);

  // Opening the tab loads the repository and resumes watching a sync that is still running.
  useEffect(() => {
    loadModels();
    checkSyncStatus();
  }, [loadModels, checkSyncStatus]);

  const handleStartSync = async () => {
    if (selectedBrands.length === 0) {
      addToast({ type: 'warning', title: 'Brands Required', message: 'Please select at least one brand to sync.' });
      return;
    }
    setIsSyncing(true);
    try {
      const res = await api.post<{ success: boolean }>('/model-library/sync', { brands: selectedBrands });
      if (res.success) {
        addToast({ type: 'success', title: 'Sync Started', message: 'OEM sync job started in the background.' });
        checkSyncStatus();
      }
    } catch {
      setIsSyncing(false);
      addToast({ type: 'error', title: 'Sync Failed', message: 'Could not start OEM model sync.' });
    }
  };

  const handleSaveManualModel = async () => {
    const finalBrand = manualBrandType === 'known' ? manualBrand : customBrandName.trim();
    if (!finalBrand) {
      addToast({ type: 'warning', title: 'Brand Required', message: 'Please specify a brand for the model.' });
      return;
    }
    if (!manualModelName.trim()) {
      addToast({ type: 'warning', title: 'Model Name Required', message: 'Please enter a model name.' });
      return;
    }
    if (manualImages.length === 0) {
      addToast({ type: 'warning', title: 'Images Required', message: 'Please upload or paste at least one photo.' });
      return;
    }

    const imagesArray = manualImages.map((url, idx) => ({
      angle: idx === 0 ? 'front_exterior' : 'other',
      url
    }));

    const coloursArray = [{
      name: 'Default',
      hex: '#888888',
      images: imagesArray
    }];

    try {
      let res;
      if (isEditMode && editingModelId) {
        res = await api.put<{ success: boolean; model: SyncedModel }>(`/model-library/${editingModelId}`, {
          brand: finalBrand,
          model_name: manualModelName.trim(),
          variants: manualVariants.split(',').map((v) => v.trim()).filter(Boolean),
          images: imagesArray,
          colours: coloursArray
        });
      } else {
        res = await api.post<{ success: boolean; model: SyncedModel }>('/model-library', {
          brand: finalBrand,
          model_name: manualModelName.trim(),
          variants: manualVariants.split(',').map((v) => v.trim()).filter(Boolean),
          images: imagesArray,
          colours: coloursArray
        });
      }

      if (res.success) {
        addToast({
          type: 'success',
          title: isEditMode ? 'Model Updated' : 'Model Added',
          message: isEditMode ? 'Custom model updated successfully.' : 'Custom model added to repository.'
        });
        setShowAddModal(false);
        resetManualForm();
        fetchModels();
        if (isEditMode) {
          setSelectedModelDetail(res.model);
        }
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: isEditMode ? 'Failed to update custom model.' : 'Failed to add custom model.' });
    }
  };

  const handleDeleteModel = async (model: SyncedModel) => {
    try {
      const res = await api.delete<{ success: boolean }>(`/model-library/${model.id}`);
      if (res.success) {
        addToast({ type: 'success', title: 'Model Deleted', message: 'Model has been removed from repository.' });
        setSelectedModelDetail(null);
        setShowDeleteConfirm(false);
        setDeletingModel(null);
        fetchModels();
      }
    } catch {
      addToast({ type: 'error', title: 'Deletion Failed', message: 'Failed to delete model.' });
    }
  };

  return (
__JSX__
  );
}
```

`apps/web/src/components/settings/InspirationTab.tsx`. The state is today's lines 125–132, the load is 440–447, and the handlers are 500–543. The icons at lines 4–14 move here.

```tsx
import { useEffect, useState } from 'react';
import { Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import type { InspirationHandle } from '../../utils/settings';

function FbSvg() {
  return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
}
function IgSvg() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="url(#ig-s-settings)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs><linearGradient id="ig-s-settings" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#e6683c"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}

// Moved from SettingsPage.tsx; Task 12 ports it to the reference layout.
export function InspirationTab() {
  const { addToast } = useToast();
  const [handles, setHandles] = useState<InspirationHandle[]>([]);
  const [loadingHandles, setLoadingHandles] = useState(true);
  const [handleUrl, setHandleUrl] = useState('');
  const [handlePlatform, setHandlePlatform] = useState<'facebook' | 'instagram'>('facebook');
  const [handleName, setHandleName] = useState('');
  const [addingHandle, setAddingHandle] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ success: boolean; handles: InspirationHandle[] }>('/dealer/inspiration-handles')
      .then((res) => setHandles(res.handles))
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load inspiration handles' }))
      .finally(() => setLoadingHandles(false));
  }, [addToast]);

  const handleAddHandle = async () => {
    if (!handleUrl.trim()) return;
    setAddingHandle(true);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle }>('/dealer/inspiration-handles', {
        handle_url: handleUrl.trim(),
        platform: handlePlatform,
        handle_name: handleName.trim() || undefined,
      });
      setHandles((prev) => [res.handle, ...prev]);
      setHandleUrl('');
      setHandleName('');
      addToast({ type: 'success', title: 'Success', message: 'Handle added — scraping posts in background' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add handle' });
    } finally {
      setAddingHandle(false);
    }
  };

  const handleDeleteHandle = async (id: string) => {
    try {
      await api.delete(`/dealer/inspiration-handles/${id}`);
      setHandles((prev) => prev.filter((h) => h.id !== id));
      addToast({ type: 'success', title: 'Success', message: 'Handle removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove handle' });
    }
  };

  const handleRefreshHandle = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle; posts_found: number }>(
        `/dealer/inspiration-handles/${id}/refresh`,
      );
      setHandles((prev) => prev.map((h) => h.id === id ? res.handle : h));
      addToast({ type: 'success', title: 'Success', message: `Scraped ${res.posts_found} posts` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to refresh handle' });
    } finally {
      setRefreshingId(null);
    }
  };

  return (
__JSX__
  );
}
```

`apps/web/src/components/settings/TeamTab.tsx`. The state is today's lines 114–123, the load is 430–438, and the handlers are 449–498.

```tsx
import { useEffect, useState } from 'react';
import { Trash2, UserPlus, Shield, ShieldOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { userService, type TeamMember } from '../../services/users';
import { CONFIGURABLE_PERMISSIONS, ROLE_LABELS, isAtLeast, type Permission } from '../../lib/permissions';

// Moved from SettingsPage.tsx; Task 11 ports it to the reference layout.
export function TeamTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canManage = isAtLeast(user, 'admin');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(canManage);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    if (!canManage) return;
    userService.list()
      .then((res) => setTeamMembers(res.users))
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load team members' }))
      .finally(() => setLoadingTeam(false));
  }, [canManage, addToast]);

  const handleInvite = async () => {
    if (!invitePhone) return;
    setSubmittingInvite(true);
    try {
      const res = await userService.invite({ phone: invitePhone, name: inviteName || undefined, role: inviteRole });
      setTeamMembers((prev) => [...prev, res.user]);
      setShowInviteForm(false);
      setInvitePhone('');
      setInviteName('');
      setInviteRole('user');
      addToast({ type: 'success', title: 'Success', message: 'User invited successfully' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to invite user' });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    try {
      const res = await userService.setActive(member.id, !member.isActive);
      setTeamMembers((prev) => prev.map((m) => m.id === member.id ? res.user : m));
      addToast({ type: 'success', title: 'Success', message: `User ${res.user.isActive ? 'activated' : 'deactivated'}` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user status' });
    }
  };

  const handleSavePermissions = async (member: TeamMember) => {
    const perms = editingPerms[member.id];
    if (!perms) return;
    try {
      const res = await userService.updatePermissions(member.id, perms);
      setTeamMembers((prev) => prev.map((m) => m.id === member.id ? res.user : m));
      setEditingPerms((prev) => { const next = { ...prev }; delete next[member.id]; return next; });
      addToast({ type: 'success', title: 'Success', message: 'Permissions updated' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update permissions' });
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    try {
      await userService.remove(member.id);
      setTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
      addToast({ type: 'success', title: 'Success', message: 'User removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove user' });
    }
  };

  return (
__JSX__
  );
}
```

- [ ] **Step 4: Move the JSX.** Run this from the repo root **before** Step 5, while `SettingsPage.tsx` still holds the old page. It checks every block boundary, copies each block byte-for-byte, and applies edit 2 in Preferences.

```bash
node <<'EOF'
const fs = require('fs');
const page = 'apps/web/src/pages/SettingsPage.tsx';
const dir = 'apps/web/src/components/settings/';
const src = fs.readFileSync(page, 'utf8').split('\n');
const at = (n) => src[n - 1] ?? '';
// [file, `{activeTab === … && (` line, first JSX line, last JSX line, marker] — 1-based, main 3aad6d7.
const blocks = [
  ['ProfileTab.tsx', 615, 616, 779, "activeTab === 'profile'"],
  ['PreferencesTab.tsx', 783, 784, 921, "activeTab === 'preferences'"],
  ['ModelLibraryTab.tsx', 924, 925, 1516, "activeTab === 'model_library'"],
  ['InspirationTab.tsx', 1520, 1521, 1637, "activeTab === 'inspiration'"],
  ['TeamTab.tsx', 1641, 1642, 1805, "activeTab === 'team'"],
];
for (const [file, open, first, last, marker] of blocks) {
  const ok = at(open).includes(marker) && at(first).trim().startsWith('<div className="space-y-')
    && at(last).trim() === '</div>' && at(last + 1).trim() === ')}';
  if (!ok) throw new Error(`${file}: SettingsPage.tsx lines moved; find the ${marker} block and update the numbers`);
  const target = dir + file;
  const body = fs.readFileSync(target, 'utf8');
  if (body.split('__JSX__').length !== 2) throw new Error(`${file}: expected exactly one __JSX__ placeholder`);
  let jsx = src.slice(first - 1, last).join('\n');
  if (file === 'PreferencesTab.tsx') {
    const from = 'next.has(n.key) ? next.delete(n.key) : next.add(n.key);';
    if (jsx.split(from).length !== 2) throw new Error('PreferencesTab: notification toggle expression not found');
    jsx = jsx.replace(from, 'if (next.has(n.key)) next.delete(n.key); else next.add(n.key);');
  }
  fs.writeFileSync(target, body.replace('__JSX__', () => jsx));
  console.log(`${file}: moved lines ${first}-${last}`);
}
EOF
```

Expected: five `moved lines …` lines, and no `__JSX__` left: `grep -rn __JSX__ apps/web/src/components/settings` prints nothing.

- [ ] **Step 5: Replace `apps/web/src/pages/SettingsPage.tsx` with the shell.** The header, tab bar and legacy redirect are today's lines 73–88 and 582–612, unchanged.

```tsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAtLeast } from '../lib/permissions';
import type { SettingsTab } from '../utils/settings';
import { useProfileForm } from '../components/settings/useProfileForm';
import { ProfileTab } from '../components/settings/ProfileTab';
import { PreferencesTab } from '../components/settings/PreferencesTab';
import { ModelLibraryTab } from '../components/settings/ModelLibraryTab';
import { InspirationTab } from '../components/settings/InspirationTab';
import { TeamTab } from '../components/settings/TeamTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const form = useProfileForm();

  // Read initial tab from URL and handle OAuth callbacks
  const rawTab = searchParams.get('tab');
  const initialTab = (rawTab && rawTab !== 'platforms' ? rawTab : 'profile') as SettingsTab;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Redirect legacy ?tab=platforms or OAuth redirects to /accounts
  useEffect(() => {
    const tab = searchParams.get('tab');
    const success = searchParams.get('oauth_success') || searchParams.get('success');
    const error = searchParams.get('oauth_error') || searchParams.get('error');
    if (tab === 'platforms' || success || error) {
      const targetParams = new URLSearchParams(searchParams);
      targetParams.delete('tab');
      navigate(`/accounts?${targetParams.toString()}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: 'Dealer Profile' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'model_library', label: 'Model Library' },
    { id: 'inspiration', label: 'Inspiration' },
    ...(isAtLeast(user, 'admin') ? [{ id: 'team' as SettingsTab, label: 'Team' }] : []),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-0.5">Manage your dealership profile and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 -mb-px cursor-pointer ${
              activeTab === t.id 
                ? 'border-orange-500 text-orange-600 font-bold' 
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab form={form} />}
      {activeTab === 'preferences' && <PreferencesTab form={form} />}
      {activeTab === 'model_library' && <ModelLibraryTab brands={form.selectedBrands} />}
      {activeTab === 'inspiration' && <InspirationTab />}
      {activeTab === 'team' && <TeamTab />}
    </div>
  );
}
```

- [ ] **Step 6: Verify the move**

Run: `git diff -M --stat && git diff -M --color-moved=zebra --color-moved-ws=allow-indentation-change -- apps/web/src | less -R`
Expected:
- Removed JSX shows up as moved blocks (dimmed or zebra colours), not as new code.
- The only non-moved changes are the four listed edits, the component headers and the shell.

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1`
Expected:
- Tests pass and the build exits 0.
- Lint is at 45 or below. About 40: three unused `err` bindings, one unused-expression and one missing-deps warning are gone.

Manual check with the `web-local` and `api-verify` launch configs. Open `/settings` and click every tab. Each tab looks and behaves exactly as before:
- Save changes shows "Saved";
- the theme buttons switch;
- the model library loads;
- adding an inspiration handle works;
- the Team list loads for a Manager.

`/settings?tab=platforms` still redirects to `/accounts`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/settings.ts apps/web/src/components/settings apps/web/src/pages/SettingsPage.tsx
git commit -m "refactor(web): split the Settings page into tab components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings shell: reference header, pill tabs, the tab in the URL, shared parts

**Files:**
- Modify: `apps/web/src/utils/settings.ts`, `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/components/ui/Input.tsx`, `apps/web/src/index.css`
- Create: `apps/web/src/components/settings/SettingsParts.tsx`, `apps/web/src/utils/settings.test.ts`

**Interfaces:**
- Consumes: Task 5's tab components and `useProfileForm`; `PageCard` (`components/ui/PageCard.tsx`); `can`, `isAtLeast`, `PERMISSIONS` (`lib/permissions.ts`).
- Produces:
  - `utils/settings.ts` (this replaces `type SettingsTab`):
    - `type SettingsTabId = 'profile' | 'platforms' | 'preferences' | 'billing' | 'inspiration' | 'team' | 'model_library'`;
    - `interface SettingsAccess { manageTeam: boolean; viewBilling: boolean }`;
    - `interface SettingsTabDef { id: SettingsTabId; label: string; requires?: keyof SettingsAccess }`;
    - `SETTINGS_TABS`;
    - `visibleSettingsTabs(access: SettingsAccess): SettingsTabDef[]`;
    - `resolveSettingsTab(raw: string | null, tabs: readonly SettingsTabDef[]): SettingsTabId`.
  - `SettingsParts.tsx`:
    - `SettingsCard({ className?, children })` and `SettingsListCard({ className?, children })`;
    - `SectionHeader({ icon, title, description? })` and `FieldLabel({ children, htmlFor?, icon? })`;
    - `Toggle({ checked, onChange, label, disabled? })` and `StatPill({ value, label })`;
    - `SaveBar({ saved, label, onSave, disabled?, busy? })`.
  - `Input` takes the reference classes: `h-9 rounded-lg border-zinc-200`, and an orange focus ring.
  - Dark-mode variables for the amber, blue and violet tints (E2-10).
  - `/settings?tab=<id>` selects the tab, and clicking a tab updates the URL (with `replace`).

This task's copy has no non-ASCII characters.

- [ ] **Step 1: Write the failing test** `apps/web/src/utils/settings.test.ts`

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSettingsTab, visibleSettingsTabs } from './settings.js';

const everyone = { manageTeam: true, viewBilling: true };

describe('settings tabs', () => {
  it('follows the reference order with Model Library last', () => {
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.id), ['profile', 'preferences', 'inspiration', 'team', 'model_library']);
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.label), ['Business Profile', 'Preferences', 'Inspiration', 'Team', 'Model Library']);
  });

  it('shows Team only to people who manage the team', () => {
    assert.ok(!visibleSettingsTabs({ ...everyone, manageTeam: false }).some((t) => t.id === 'team'));
  });

  it('opens the tab named in the URL only when the viewer can see it', () => {
    const tabs = visibleSettingsTabs({ manageTeam: false, viewBilling: false });
    assert.equal(resolveSettingsTab('inspiration', tabs), 'inspiration');
    assert.equal(resolveSettingsTab('team', tabs), 'profile');
    assert.equal(resolveSettingsTab('nonsense', tabs), 'profile');
    assert.equal(resolveSettingsTab(null, tabs), 'profile');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web`
Expected: FAIL. `visibleSettingsTabs` is not exported.

- [ ] **Step 3: `apps/web/src/utils/settings.ts`.** Replace the line `export type SettingsTab = 'profile' | 'preferences' | 'inspiration' | 'team' | 'model_library';` with:

```ts
export type SettingsTabId = 'profile' | 'platforms' | 'preferences' | 'billing' | 'inspiration' | 'team' | 'model_library';

export interface SettingsAccess {
  /** manage_users: Managers and Owners (isAtLeast(user, 'admin')). */
  manageTeam: boolean;
  /** view_billing: the billing API answers 403 without it. */
  viewBilling: boolean;
}

export interface SettingsTabDef {
  id: SettingsTabId;
  label: string;
  /** Hidden unless the viewer has this access. */
  requires?: keyof SettingsAccess;
}

// Reference order, with our Model Library last.
export const SETTINGS_TABS: readonly SettingsTabDef[] = [
  { id: 'profile', label: 'Business Profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'inspiration', label: 'Inspiration' },
  { id: 'team', label: 'Team', requires: 'manageTeam' },
  { id: 'model_library', label: 'Model Library' },
];

export function visibleSettingsTabs(access: SettingsAccess): SettingsTabDef[] {
  return SETTINGS_TABS.filter((tab) => !tab.requires || access[tab.requires]);
}

/** The tab named in ?tab= when this viewer can see it; otherwise Business Profile. */
export function resolveSettingsTab(raw: string | null, tabs: readonly SettingsTabDef[]): SettingsTabId {
  return tabs.find((tab) => tab.id === raw)?.id ?? 'profile';
}
```

- [ ] **Step 4: `apps/web/src/components/settings/SettingsParts.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';

// The reference's Settings building blocks: cards, section header, label, toggle, stat pill and sticky save bar.

export function SettingsCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 sm:p-6', className)}>{children}</div>;
}

/** A card whose rows pad themselves, for lists. */
export function SettingsListCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden', className)}>
      {children}
    </div>
  );
}

export function SectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

export function FieldLabel({ children, htmlFor, icon }: { children: ReactNode; htmlFor?: string; icon?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-xs font-medium text-zinc-600 mb-1.5', icon ? 'flex items-center gap-1.5' : undefined)}>
      {icon}
      {children}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-orange-600' : 'bg-zinc-200',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function StatPill({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1">
      <span className="text-sm font-bold text-zinc-900">{value}</span>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </span>
  );
}

export function SaveBar({ saved, label, onSave, disabled, busy }: { saved: boolean; label: string; onSave: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-px flex items-center justify-end gap-3 bg-zinc-50/80 backdrop-blur-sm border-t border-zinc-100 py-3 mt-2">
      {saved && (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <Check className="w-4 h-4" /> Saved
        </span>
      )}
      <Button onClick={onSave} disabled={disabled || busy}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Replace `apps/web/src/components/ui/Input.tsx`.** It is unused outside `components/ui` today. It becomes the reference input:

```tsx
import React from 'react';
import { cn } from './Button';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// The reference's text input (Settings forms and modals).
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
```

- [ ] **Step 6: `apps/web/src/index.css`.** In the `.dark { … }` block (not `:root`), after the line `  --color-emerald-600: #6fbf92; --color-emerald-700: #8fd0aa;`, add:

```css
  /* Warning (amber), info (blue) and Owner (violet) tints that read on the dark surface. */
  --color-amber-50: #33291a;  --color-amber-100: #45361c; --color-amber-200: #5c4520;
  --color-amber-700: #f2c46d; --color-amber-800: #f6d38f;
  --color-blue-50: #1d2635;   --color-blue-100: #243049;  --color-blue-700: #9cc3f5;
  --color-violet-50: #2a2336; --color-violet-100: #352b47; --color-violet-700: #c9b6f5;
```

- [ ] **Step 7: Replace `apps/web/src/pages/SettingsPage.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, can, isAtLeast } from '../lib/permissions';
import { cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { resolveSettingsTab, visibleSettingsTabs, type SettingsTabId } from '../utils/settings';
import { useProfileForm } from '../components/settings/useProfileForm';
import { ProfileTab } from '../components/settings/ProfileTab';
import { PreferencesTab } from '../components/settings/PreferencesTab';
import { ModelLibraryTab } from '../components/settings/ModelLibraryTab';
import { InspirationTab } from '../components/settings/InspirationTab';
import { TeamTab } from '../components/settings/TeamTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const form = useProfileForm();

  const tabs = visibleSettingsTabs({ manageTeam: isAtLeast(user, 'admin'), viewBilling: can(user, PERMISSIONS.VIEW_BILLING) });
  // The tab lives in the URL (/settings?tab=billing), so links and refreshes land on it.
  const activeTab = resolveSettingsTab(searchParams.get('tab'), tabs);
  const selectTab = (id: SettingsTabId) => setSearchParams({ tab: id }, { replace: true });

  // Legacy links: ?tab=platforms and old OAuth returns still go to /accounts.
  useEffect(() => {
    const tab = searchParams.get('tab');
    const success = searchParams.get('oauth_success') || searchParams.get('success');
    const error = searchParams.get('oauth_error') || searchParams.get('error');
    if (tab === 'platforms' || success || error) {
      const targetParams = new URLSearchParams(searchParams);
      targetParams.delete('tab');
      navigate(`/accounts?${targetParams.toString()}`, { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <PageCard>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Settings</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Manage your dealership profile and connected platforms</p>
        </div>
      </div>

      <div className="flex mb-6 overflow-x-auto">
        <div role="tablist" aria-label="Settings sections" className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => selectTab(t.id)}
              className={cn(
                'inline-flex items-center px-3.5 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0',
                activeTab === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'profile' && <ProfileTab form={form} />}
      {activeTab === 'preferences' && <PreferencesTab form={form} />}
      {activeTab === 'inspiration' && <InspirationTab />}
      {activeTab === 'team' && <TeamTab />}
      {activeTab === 'model_library' && <ModelLibraryTab brands={form.selectedBrands} />}
    </PageCard>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1`
Expected: tests pass, the build exits 0, and lint is at 45 or below.

Manual check (`web-local` + `api-verify`):
- `/settings` shows the reference header and the pill tabs.
- `/settings?tab=inspiration` opens Inspiration.
- Clicking a tab changes `?tab=`.
- A Creator does not see Team, and `?tab=team` falls back to Business Profile.
- `?tab=platforms` still redirects to `/accounts`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/utils/settings.ts apps/web/src/utils/settings.test.ts apps/web/src/components/settings/SettingsParts.tsx apps/web/src/components/ui/Input.tsx apps/web/src/index.css apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): Settings shell with pill tabs and the tab in the URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Business Profile tab, logo upload and the brand theme (web)

**Files:**
- Create: `apps/web/src/utils/brandPalette.ts` + `apps/web/src/utils/brandPalette.test.ts`, `apps/web/src/services/dealer.ts`, `apps/web/src/components/shell/AppearanceSync.tsx`
- Modify: `apps/web/src/utils/settings.ts` (+ `settings.test.ts`), `apps/web/src/contexts/DealerProfileContext.tsx`, `apps/web/src/components/settings/useProfileForm.ts` (replaced), `apps/web/src/components/settings/ProfileTab.tsx` (replaced)

**Interfaces:**
- Consumes:
  - Task 1 `POST /v1/dealer/logo` → `{ logo_url }`, and `use_brand_theme` on the profile.
  - Task 6 `SettingsCard`, `SectionHeader`, `FieldLabel`, `Toggle`, `SaveBar` and `Input`.
  - `ThemedSelect`, `useDealerProfile().reload`.
- Produces:
  - `utils/brandPalette.ts`:
    - `SHADES`, `type Shade`, `type Ramp`, `MIN_CONTRAST = 4.5`, `DARK_INK`, `DARK_SURFACE`;
    - `parseHex(value): string | null`, `hexToHsl(hex): Hsl`, `hslToHex(hsl): string`, `contrastRatio(a, b): number`;
    - `interface BrandPalette { light: Ramp; dark: Ramp }`, `brandPalette(primary): BrandPalette | null`;
    - `brandThemeCss(primary): string | null`, `applyBrandTheme(css: string | null): void`.
  - `utils/settings.ts`: `SHOWROOM_TYPES`, `FONT_OPTIONS`, `addBrand(brands, raw): string[]`.
  - `services/dealer.ts`: `dealerService.uploadLogo(file: File): Promise<{ logo_url: string }>`.
  - `AppearanceSync({ brandColor }: { brandColor: string | null })`, rendered by `DealerProfileProvider`.
  - `DealerProfile` gains `font?`, `address?` and `use_brand_theme?`.
  - `useProfileForm()` now:
    - returns `secondaryColor`, `setSecondaryColor`, `useBrandTheme`, `setUseBrandTheme`, `addSelectedBrand`, `removeSelectedBrand` and `saving`;
    - has `handleSave(): Promise<boolean>`;
    - drops `toggleBrand`, `uploadingLogo` and `setUploadingLogo`;
    - keeps `billing`, `defaultRadius` and `notifications` until Task 10.

This task's code contains — · × (`— · ×`). Byte-check them.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/utils/brandPalette.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DARK_INK, DARK_SURFACE, MIN_CONTRAST, SHADES, brandPalette, brandThemeCss, contrastRatio, hexToHsl, hslToHex, parseHex } from './brandPalette.js';

function channels(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('brand palette', () => {
  it('parses 3- and 6-digit hex and nothing else', () => {
    assert.equal(parseHex('#1877F2'), '#1877f2');
    assert.equal(parseHex('abc'), '#aabbcc');
    assert.equal(parseHex('blue'), null);
    assert.equal(parseHex(''), null);
    assert.equal(parseHex(null), null);
  });

  it('round-trips through HSL', () => {
    for (const hex of ['#1877f2', '#c2564f', '#10b981', '#000000', '#ffffff']) {
      const back = channels(hslToHex(hexToHsl(hex)));
      channels(hex).forEach((c, i) => assert.ok(Math.abs(c - back[i]!) <= 1, `${hex} channel ${i}`));
    }
  });

  it("keeps the brand colour's hue on every shade", () => {
    const palette = brandPalette('#1877F2')!;
    const hue = hexToHsl('#1877f2').h;
    for (const shade of SHADES) {
      const { h, s } = hexToHsl(palette.light[shade]);
      if (s > 10) assert.ok(Math.abs(h - hue) < 4, `${shade}: ${h}`);
    }
  });

  it('keeps text readable on and beside the brand colour, light and dark', () => {
    for (const color of ['#1877F2', '#FFD700', '#00FF00', '#c2564f', '#111111', '#f5f5f5', '#7c3aed']) {
      const p = brandPalette(color)!;
      assert.ok(contrastRatio(p.light[600], '#ffffff') >= MIN_CONTRAST, `${color}: white on light 600`);
      assert.ok(contrastRatio(p.light[700], p.light[50]) >= MIN_CONTRAST, `${color}: light 700 on 50`);
      assert.ok(contrastRatio(p.dark[600], DARK_INK) >= MIN_CONTRAST, `${color}: dark ink on dark 600`);
      assert.ok(contrastRatio(p.dark[600], DARK_SURFACE) >= MIN_CONTRAST, `${color}: dark 600 on the dark surface`);
    }
  });

  it('builds light and dark rules that outrank index.css, and never touches amber', () => {
    const css = brandThemeCss('#1877F2')!;
    assert.match(css, /^:root:not\(\.dark\)\{--color-orange-50:#[0-9a-f]{6};/);
    assert.match(css, /:root\.dark\{--color-orange-50:#[0-9a-f]{6};/);
    assert.match(css, /--color-brand:#[0-9a-f]{6};--color-brand-hover:#[0-9a-f]{6};--color-brand-subtle:#[0-9a-f]{6}/);
    assert.ok(!css.includes('amber'));
    assert.equal(brandThemeCss('not a colour'), null);
    assert.equal(brandThemeCss(null), null);
  });
});
```

Add to `apps/web/src/utils/settings.test.ts`. Extend the import to `import { addBrand, resolveSettingsTab, visibleSettingsTabs } from './settings.js';`, then append:

```ts
describe('brands & categories', () => {
  it('adds trimmed names once, ignoring case and blanks', () => {
    assert.deepEqual(addBrand(['Hyundai'], '  Kia  '), ['Hyundai', 'Kia']);
    assert.deepEqual(addBrand(['Hyundai'], 'hyundai'), ['Hyundai']);
    assert.deepEqual(addBrand(['Hyundai'], '   '), ['Hyundai']);
    assert.deepEqual(addBrand([], 'Pre-owned   SUVs'), ['Pre-owned SUVs']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL. `./brandPalette.js` cannot be resolved, and `addBrand` is not exported.

- [ ] **Step 3: `apps/web/src/utils/brandPalette.ts`**

```ts
// Rebuilds the orange-* scale and the --color-brand* tokens from the dealer's primary colour
// (spec §4 "Dealer brand colours"). It keeps the colour's hue and saturation and uses fixed
// lightness steps, then nudges the shades that carry text until that text stays readable.
// Amber is left alone: it means "warning" in this app, and the gradient ends already follow orange-600.

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];
export type Ramp = Record<Shade, string>;

// HSL lightness per shade. Dark mode inverts: light tints become deep washes.
const LIGHT_L: Record<Shade, number> = { 50: 95, 100: 90, 200: 82, 300: 72, 400: 62, 500: 54, 600: 46, 700: 38, 800: 31, 900: 25, 950: 14 };
const DARK_L: Record<Shade, number> = { 50: 19, 100: 23, 200: 29, 300: 40, 400: 58, 500: 64, 600: 70, 700: 77, 800: 84, 900: 91, 950: 96 };

/** WCAG AA for normal text. */
export const MIN_CONTRAST = 4.5;
/** index.css: in dark mode, primary buttons write in this ink instead of white. */
export const DARK_INK = '#2a100d';
/** index.css: the dark-mode card surface (--color-white under .dark). */
export const DARK_SURFACE = '#221e1e';

export interface Hsl { h: number; s: number; l: number }

export function parseHex(value: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? '').trim());
  if (!match) return null;
  const hex = match[1]!.length === 3 ? match[1]!.split('').map((c) => c + c).join('') : match[1]!;
  return `#${hex.toLowerCase()}`;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Moves one shade's lightness by `step` until it reads against every colour in `against`.
function readable(base: Hsl, lightness: number, against: readonly string[], step: 1 | -1): number {
  let l = lightness;
  while (l > 2 && l < 98 && against.some((c) => contrastRatio(hslToHex({ ...base, l }), c) < MIN_CONTRAST)) l += step;
  return l;
}

// Keeps the scale ordered after the nudges: at least 4 points between neighbouring shades.
function ordered(ls: Record<Shade, number>, direction: 1 | -1): Record<Shade, number> {
  const out = { ...ls };
  for (let i = 1; i < SHADES.length; i++) {
    const prev = out[SHADES[i - 1]!];
    const shade = SHADES[i]!;
    const next = direction < 0 ? Math.min(out[shade], prev - 4) : Math.max(out[shade], prev + 4);
    out[shade] = Math.max(2, Math.min(98, next));
  }
  return out;
}

export interface BrandPalette { light: Ramp; dark: Ramp }

export function brandPalette(primary: string | null | undefined): BrandPalette | null {
  const hex = parseHex(primary);
  if (!hex) return null;
  const { h, s } = hexToHsl(hex);
  const base: Hsl = { h, s: Math.min(s, 90), l: 50 };

  // Light: white text on 600 (buttons), and 600/700 text on white and on the 50 wash.
  const light600 = readable(base, LIGHT_L[600], ['#ffffff'], -1);
  const light50 = hslToHex({ ...base, l: LIGHT_L[50] });
  const light700 = readable(base, Math.min(LIGHT_L[700], light600 - 8), ['#ffffff', light50], -1);
  // Dark: dark ink on 600 (buttons), and 600 text on the dark surface.
  const dark600 = readable(base, DARK_L[600], [DARK_INK, DARK_SURFACE], 1);

  const lightL = ordered({ ...LIGHT_L, 600: light600, 700: light700 }, -1);
  const darkL = ordered({ ...DARK_L, 600: dark600 }, 1);
  const ramp = (ls: Record<Shade, number>) => Object.fromEntries(SHADES.map((sh) => [sh, hslToHex({ ...base, l: ls[sh] })])) as Ramp;
  return { light: ramp(lightL), dark: ramp(darkL) };
}

function declarations(ramp: Ramp): string {
  const vars = SHADES.map((shade) => `--color-orange-${shade}:${ramp[shade]}`);
  vars.push(`--color-brand:${ramp[600]}`, `--color-brand-hover:${ramp[700]}`, `--color-brand-subtle:${ramp[50]}`);
  return vars.join(';');
}

/** The stylesheet that recolours the app, or null when the colour isn't a hex value. */
export function brandThemeCss(primary: string | null | undefined): string | null {
  const palette = brandPalette(primary);
  if (!palette) return null;
  // Two selectors' worth of specificity beats index.css's :root and .dark blocks, whatever the order.
  return `:root:not(.dark){${declarations(palette.light)}}:root.dark{${declarations(palette.dark)}}`;
}

const STYLE_ID = 'brand-theme';

/** Applies the brand stylesheet to this page, or removes it when css is null. */
export function applyBrandTheme(css: string | null): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}
```

- [ ] **Step 4: `apps/web/src/utils/settings.ts`.** Append:

```ts
export const SHOWROOM_TYPES: Array<{ value: string; label: string }> = [
  { value: 'new', label: 'New Cars Showroom' },
  { value: 'pre-owned', label: 'True Value / Certified Used Cars' },
  { value: 'multi-brand', label: 'Multi-brand Car Dealership' },
];

export const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Arial', label: 'Arial (Standard Clean)' },
  { value: 'Helvetica', label: 'Helvetica (Modern Neue)' },
  { value: 'Georgia', label: 'Georgia (Classic Serif)' },
  { value: 'Impact', label: 'Impact (Heavy Title / Bold)' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS (Friendly Sans)' },
  { value: 'Courier New', label: 'Courier New (Technical Monospace)' },
];

/** Brands & categories: trimmed, single-spaced, and a case-insensitive duplicate is ignored. */
export function addBrand(brands: readonly string[], raw: string): string[] {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || brands.some((b) => b.toLowerCase() === name.toLowerCase())) return [...brands];
  return [...brands, name];
}
```

- [ ] **Step 5: `apps/web/src/services/dealer.ts`**

```ts
import api from './api';

export const dealerService = {
  /** POST /dealer/logo (multipart "logo"): stores the logo and sets it on the dealer. */
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('logo', file, file.name || 'logo.png');
    return api.upload<{ logo_url: string }>('/dealer/logo', form);
  },
};
```

- [ ] **Step 6: `apps/web/src/components/shell/AppearanceSync.tsx`**

```tsx
import { useEffect } from 'react';
import { applyBrandTheme, brandThemeCss } from '../../utils/brandPalette';

/** Recolours the app with the dealer's brand colour when Business Profile turns it on. Renders nothing. */
export function AppearanceSync({ brandColor }: { brandColor: string | null }) {
  useEffect(() => {
    applyBrandTheme(brandThemeCss(brandColor));
  }, [brandColor]);
  return null;
}
```

- [ ] **Step 7: `apps/web/src/contexts/DealerProfileContext.tsx`.**

(a) Add `import { AppearanceSync } from '../components/shell/AppearanceSync';` after the `useAuth` import.

(b) In `interface DealerProfile`, add after `logo_url?: string;`:

```ts
  font?: string;
  address?: string;
  use_brand_theme?: boolean;
```

(c) Replace the provider's `return (…);` with:

```tsx
  // Business Profile → "Use my brand colours as the app theme" recolours the app for the whole dealership.
  const brandColor = user && profile?.use_brand_theme ? profile.primary_color ?? null : null;

  return (
    <DealerProfileContext.Provider value={{ profile, loading, reload: load }}>
      {children}
      <AppearanceSync brandColor={brandColor} />
    </DealerProfileContext.Provider>
  );
```

- [ ] **Step 8: Replace `apps/web/src/components/settings/useProfileForm.ts`**

```ts
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { useDealerProfile } from '../../contexts/DealerProfileContext';
import { billingService, type BillingStatus } from '../../services/billing';
import { NOTIFICATION_KEYS, addBrand } from '../../utils/settings';

interface ProfileResponse {
  success: boolean;
  profile: {
    name: string; city: string; contact_phone?: string; whatsapp_number?: string;
    primary_color?: string; secondary_color?: string; use_brand_theme?: boolean;
    brands?: string[]; language_preferences?: string[]; region?: string;
    logo_url?: string; font?: string; address?: string; showroom_type?: string[];
  };
}

// Business Profile and Preferences share one form and one PUT /dealer/profile, as in the reference.
export function useProfileForm() {
  const { addToast } = useToast();
  const { reload: reloadProfile } = useDealerProfile();
  // Empty until GET /dealer/profile answers; Save stays disabled so blanks never overwrite the dealer.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'hi']);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [dealerName, setDealerName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1877F2');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [useBrandTheme, setUseBrandTheme] = useState(false);
  const [defaultRadius, setDefaultRadius] = useState(25);
  const [notifications, setNotifications] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('sg_notifications');
    if (saved) return new Set(JSON.parse(saved) as string[]);
    return new Set(NOTIFICATION_KEYS.filter((n) => n.defaultOn).map((n) => n.key));
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [font, setFont] = useState('Arial');
  const [address, setAddress] = useState('');
  const [showroomType, setShowroomType] = useState('new');

  useEffect(() => {
    api.get<ProfileResponse>('/dealer/profile').then((res) => {
      const p = res.profile;
      if (!p) throw new Error('Dealer profile not found');
      setDealerName(p.name ?? '');
      setCity(p.city ?? '');
      if (p.contact_phone) setPhone(p.contact_phone);
      if (p.whatsapp_number) setWhatsapp(p.whatsapp_number);
      if (p.primary_color) setPrimaryColor(p.primary_color);
      if (p.secondary_color) setSecondaryColor(p.secondary_color);
      setUseBrandTheme(p.use_brand_theme === true);
      if (p.brands?.length) setSelectedBrands(p.brands);
      if (p.language_preferences?.length) setSelectedLangs(p.language_preferences);
      if (p.region) setSelectedRegion(p.region);
      if (p.logo_url) setLogoUrl(p.logo_url);
      if (p.font) setFont(p.font);
      if (p.address) setAddress(p.address);
      if (p.showroom_type?.length) setShowroomType(p.showroom_type[0]);
      setProfileLoaded(true);
    }).catch(() => {
      addToast({ type: 'error', title: 'Could not load your profile', message: 'Refresh the page before saving changes.' });
    });
    billingService.getStatus()
      .then((res) => { if (res.success) setBilling(res); })
      .catch(() => setBilling(null));
  }, [addToast]);

  const toggleLang = (code: string) => {
    if (code === 'en') return; // English always required
    setSelectedLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  };

  const addSelectedBrand = (raw: string) => setSelectedBrands((prev) => addBrand(prev, raw));
  const removeSelectedBrand = (brand: string) => setSelectedBrands((prev) => prev.filter((b) => b !== brand));

  const handleSave = async (): Promise<boolean> => {
    if (!profileLoaded) return false;
    setSaving(true);
    localStorage.setItem('sg_notifications', JSON.stringify([...notifications]));
    try {
      await api.put('/dealer/profile', {
        name: dealerName,
        city,
        contact_phone: phone,
        whatsapp_number: whatsapp,
        primary_color: primaryColor,
        ...(secondaryColor ? { secondary_color: secondaryColor } : {}),
        use_brand_theme: useBrandTheme,
        brands: selectedBrands,
        language_preferences: selectedLangs,
        region: selectedRegion,
        logo_url: logoUrl,
        font,
        address,
        showroom_type: [showroomType],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // The brand theme and every page that reads the profile pick up the change.
      reloadProfile();
      return true;
    } catch {
      addToast({ type: 'error', title: 'Error Saving Settings', message: 'Failed to update settings. Please try again.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    profileLoaded, billing, selectedLangs, setSelectedLangs, selectedRegion, setSelectedRegion, selectedBrands,
    addSelectedBrand, removeSelectedBrand, dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp,
    primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, useBrandTheme, setUseBrandTheme,
    defaultRadius, setDefaultRadius, notifications, setNotifications, saved, saving, logoUrl, setLogoUrl, font, setFont,
    address, setAddress, showroomType, setShowroomType, toggleLang, handleSave,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
```

- [ ] **Step 9: Replace `apps/web/src/components/settings/ProfileTab.tsx`**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Loader2, MapPin, MessageCircle, Palette, Phone, Tag, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import { useDealerProfile } from '../../contexts/DealerProfileContext';
import { ApiError } from '../../services/api';
import { dealerService } from '../../services/dealer';
import { applyBrandTheme, brandThemeCss, parseHex } from '../../utils/brandPalette';
import { BRANDS, FONT_OPTIONS, SHOWROOM_TYPES } from '../../utils/settings';
import { FieldLabel, SaveBar, SectionHeader, SettingsCard, Toggle } from './SettingsParts';
import type { ProfileForm } from './useProfileForm';

function ColourSwatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 cursor-pointer hover:border-zinc-300 transition-colors">
      <input
        type="color"
        value={parseHex(value) ?? '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour`}
        className="w-10 h-10 rounded-lg border border-zinc-200 cursor-pointer p-0.5 flex-shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-zinc-700">{label}</span>
        <span className="block text-[11px] text-zinc-400 font-mono truncate">{value || 'Not set'}</span>
      </span>
    </label>
  );
}

export function ProfileTab({ form }: { form: ProfileForm }) {
  const { addToast } = useToast();
  const { profile, reload } = useDealerProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [brandDraft, setBrandDraft] = useState('');
  const {
    dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp, showroomType, setShowroomType,
    address, setAddress, selectedBrands, addSelectedBrand, removeSelectedBrand, logoUrl, setLogoUrl, font, setFont,
    primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, useBrandTheme, setUseBrandTheme,
    saved, saving, handleSave, profileLoaded,
  } = form;

  // Live preview while choosing colours; leaving the tab puts the saved theme back.
  const savedBrandColor = profile?.use_brand_theme ? profile.primary_color ?? null : null;
  useEffect(() => {
    if (!profileLoaded) return;
    applyBrandTheme(brandThemeCss(useBrandTheme ? primaryColor : null));
    return () => applyBrandTheme(brandThemeCss(savedBrandColor));
  }, [profileLoaded, useBrandTheme, primaryColor, savedBrandColor]);

  const addDraftBrand = () => {
    addSelectedBrand(brandDraft);
    setBrandDraft('');
  };
  const onBrandKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDraftBrand();
    }
  };

  const onLogoChosen = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { logo_url } = await dealerService.uploadLogo(file);
      setLogoUrl(logo_url);
      reload();
      addToast({ type: 'success', title: 'Logo updated' });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Upload failed',
        message: err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : 'Could not upload the logo. Please try a PNG, JPG or WebP.',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SectionHeader icon={<Building2 className="w-4 h-4" />} title="Business details" description="Basic details shown across your social profiles and creatives." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="business-name">Business name</FieldLabel>
            <Input id="business-name" value={dealerName} onChange={(e) => setDealerName(e.target.value)} placeholder="Your business name" />
          </div>
          <div>
            <FieldLabel htmlFor="business-city" icon={<MapPin className="w-3.5 h-3.5" />}>City</FieldLabel>
            <Input id="business-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </div>
          <div>
            <FieldLabel htmlFor="contact-phone" icon={<Phone className="w-3.5 h-3.5" />}>Contact Phone</FieldLabel>
            <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <FieldLabel htmlFor="whatsapp-number" icon={<MessageCircle className="w-3.5 h-3.5" />}>WhatsApp Number</FieldLabel>
            <Input id="whatsapp-number" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <FieldLabel>Showroom type</FieldLabel>
            <ThemedSelect value={showroomType} onChange={setShowroomType} options={SHOWROOM_TYPES} ariaLabel="Showroom type" />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="showroom-address">Showroom address</FieldLabel>
            <textarea
              id="showroom-address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter detailed showroom address (e.g. Plot No 12, Outer Ring Road, Bangalore)"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors resize-none focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30"
            />
            <p className="text-[11px] text-zinc-400 mt-1">This address will be rendered at the bottom panel of generated creatives.</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader
          icon={<Tag className="w-4 h-4" />}
          title="Brands & categories"
          description="What you sell or represent — used to make AI captions and creatives relevant. Add your own."
        />
        {selectedBrands.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedBrands.map((brand) => (
              <span key={brand} className="inline-flex items-center gap-1 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-100 pl-3 pr-1.5 py-1 text-sm font-medium">
                {brand}
                <button
                  type="button"
                  onClick={() => removeSelectedBrand(brand)}
                  aria-label={`Remove ${brand}`}
                  className="grid place-items-center w-4 h-4 rounded-full hover:bg-orange-200/60 text-orange-500 hover:text-orange-800 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            className="flex-1"
            list="brand-suggestions"
            value={brandDraft}
            onChange={(e) => setBrandDraft(e.target.value)}
            onKeyDown={onBrandKey}
            placeholder="e.g. a brand, product line, or service you offer"
            aria-label="Add a brand or category"
          />
          <datalist id="brand-suggestions">
            {BRANDS.map((b) => <option key={b} value={b} />)}
          </datalist>
          <Button variant="secondary" onClick={addDraftBrand} disabled={!brandDraft.trim()}>Add</Button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader icon={<Palette className="w-4 h-4" />} title="Brand kit" description="Logo and colours applied to all generated creatives." />
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-zinc-600 mb-2">Logo</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onLogoChosen(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="group flex items-center gap-4 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/40 disabled:opacity-60"
            >
              <div className="w-16 h-16 rounded-xl bg-white ring-1 ring-zinc-200 flex items-center justify-center text-zinc-300 overflow-hidden flex-shrink-0">
                {logoUrl ? <img src={logoUrl} alt="Dealer logo" className="w-full h-full object-contain" /> : <Palette className="w-6 h-6" />}
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                  {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {logoUrl ? 'Replace logo' : 'Upload logo'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">PNG, JPG or WebP · at least 200 × 200 px · up to 2 MB</p>
              </div>
            </button>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-600 mb-2">Brand colours</p>
            <div className="grid grid-cols-2 gap-2.5">
              <ColourSwatch label="Primary" value={primaryColor} onChange={setPrimaryColor} />
              <ColourSwatch label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-800">Use my brand colours as the app theme</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Recolours buttons, highlights and accents across the app. Off uses the default theme.</p>
            </div>
            <Toggle checked={useBrandTheme} onChange={setUseBrandTheme} label="Use my brand colours as the app theme" />
          </div>

          <div>
            <FieldLabel>Brand font</FieldLabel>
            <ThemedSelect value={font} onChange={setFont} options={FONT_OPTIONS} className="sm:max-w-xs" ariaLabel="Brand font" />
            <p className="text-[11px] text-zinc-400 mt-1">Used for rendering headings and text overlays on your dealership creatives.</p>
          </div>
        </div>
      </SettingsCard>

      <SaveBar saved={saved} label="Save changes" onSave={() => void handleSave()} disabled={!profileLoaded} busy={saving} />
    </div>
  );
}
```

- [ ] **Step 10: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1`
Expected: pass; build 0; lint 45 or below.

Manual check (`web-local` + `api-verify`), on Business Profile:
- The three reference cards and the sticky "Save changes" button show.
- Brands: add one with Enter, a case-insensitive duplicate is ignored, and × removes a chip.
- Upload a PNG: "Logo updated", and the logo shows. An SVG is not offered by the picker. A 3 MB PNG gives "The logo must be 2 MB or smaller."
- Pick a primary colour and turn "Use my brand colours…" on: buttons and highlights recolour at once.
- Save, reload, and check other pages keep the brand colours. Turn it off, save, and the default coral returns.
- Dark mode: the brand colours still read.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/utils/brandPalette.ts apps/web/src/utils/brandPalette.test.ts apps/web/src/utils/settings.ts apps/web/src/utils/settings.test.ts apps/web/src/services/dealer.ts apps/web/src/components/shell/AppearanceSync.tsx apps/web/src/contexts/DealerProfileContext.tsx apps/web/src/components/settings/useProfileForm.ts apps/web/src/components/settings/ProfileTab.tsx
git commit -m "feat(web): Business Profile tab with logo upload and the brand-colour theme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Platforms tab (web)

**Files:**
- Create: `apps/web/src/utils/settingsPlatforms.ts` + `apps/web/src/utils/settingsPlatforms.test.ts`, `apps/web/src/components/settings/PlatformsTab.tsx`
- Modify: `apps/web/src/utils/settings.ts` (+ `settings.test.ts`), `apps/web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes:
  - E1's `GET /v1/platform-accounts` and `DELETE /v1/platform-accounts/:id`.
  - E1's `startConnect(platform: 'facebook' | 'gmb' | 'youtube', returnTo: OAuthReturnPath)` from `utils/connectPlatform.ts`.
  - Task 6's `SettingsCard` / `SettingsListCard`; `Modal`, `PlatformIcon`, `Button`.
- Produces:
  - `utils/settingsPlatforms.ts`:
    - `type AccountPlatform = 'facebook' | 'instagram' | 'google' | 'youtube'`;
    - `type ConnectTarget = 'facebook' | 'gmb' | 'youtube'`;
    - `type RowStatus = 'connected' | 'expired' | 'disconnected'`;
    - `interface PlatformAccount { id; platform: string; accountName: string; accountId: string; tokenExpiry: string | null; createdAt: string }`;
    - `interface PlatformRowDef { id: AccountPlatform; label; icon: 'facebook' | 'instagram' | 'gmb' | 'youtube'; connect: ConnectTarget }` and `PLATFORM_ROWS`;
    - `interface AccountHealth { expired: boolean; daysLeft: number | null }` and `accountHealth(account, now)`;
    - `interface PlatformRow extends PlatformRowDef { status: RowStatus; accounts: Array<PlatformAccount & AccountHealth> }` and `platformRows(accounts, now)`;
    - `connectedPlatformCount(rows)` and `accountLine(account)`.
  - `PlatformsTab()`.
  - `SETTINGS_TABS` gains `{ id: 'platforms', label: 'Platforms' }` after Business Profile. The legacy `?tab=platforms` → `/accounts` redirect is removed.

This task's copy contains — and · (`— ·`). Byte-check them.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/utils/settingsPlatforms.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountHealth, accountLine, connectedPlatformCount, platformRows, type PlatformAccount } from './settingsPlatforms.js';

const NOW = new Date('2026-09-24T10:00:00Z');
const DAY = 86_400_000;
const account = (over: Partial<PlatformAccount>): PlatformAccount => ({
  id: over.id ?? 'a1', platform: 'facebook', accountName: 'Sharma Motors', accountId: '123', tokenExpiry: null, createdAt: '2026-09-01T00:00:00Z', ...over,
});

describe('platform accounts on the Settings tab', () => {
  it('flags an expired Meta token and counts days left', () => {
    assert.deepEqual(accountHealth(account({ tokenExpiry: new Date(NOW.getTime() - DAY).toISOString() }), NOW), { expired: true, daysLeft: 0 });
    assert.deepEqual(accountHealth(account({ tokenExpiry: new Date(NOW.getTime() + 2.5 * DAY).toISOString() }), NOW), { expired: false, daysLeft: 3 });
    assert.deepEqual(accountHealth(account({ tokenExpiry: null }), NOW), { expired: false, daysLeft: null });
  });

  it('treats Google and YouTube tokens as always healthy (they refresh)', () => {
    const past = new Date(NOW.getTime() - DAY).toISOString();
    assert.deepEqual(accountHealth(account({ platform: 'google', tokenExpiry: past }), NOW), { expired: false, daysLeft: null });
    assert.deepEqual(accountHealth(account({ platform: 'youtube', tokenExpiry: past }), NOW), { expired: false, daysLeft: null });
  });

  it('groups accounts into the four rows, several per platform', () => {
    const rows = platformRows([
      account({ id: 'fb1' }),
      account({ id: 'fb2', accountName: 'Sharma Motors Pune', tokenExpiry: new Date(NOW.getTime() - DAY).toISOString() }),
      account({ id: 'g1', platform: 'gmb', accountName: 'Sharma Motors, MG Road' }),
      account({ id: 'x1', platform: 'twitter' }),
    ], NOW);
    assert.deepEqual(rows.map((r) => [r.id, r.label, r.status, r.accounts.map((a) => a.id)]), [
      ['facebook', 'Facebook Page', 'expired', ['fb1', 'fb2']],
      ['instagram', 'Instagram Business', 'disconnected', []],
      ['google', 'Google My Business', 'connected', ['g1']],
      ['youtube', 'YouTube Channel', 'disconnected', []],
    ]);
    assert.equal(connectedPlatformCount(rows), 2);
    assert.deepEqual(rows.map((r) => r.connect), ['facebook', 'facebook', 'gmb', 'youtube']);
  });

  it('adds the days left to the account line', () => {
    const [row] = platformRows([account({ tokenExpiry: new Date(NOW.getTime() + 5 * DAY).toISOString() })], NOW);
    assert.equal(accountLine(row!.accounts[0]!), 'Sharma Motors · token expires in 5 days');
    const [one] = platformRows([account({ tokenExpiry: new Date(NOW.getTime() + DAY / 2).toISOString() })], NOW);
    assert.equal(accountLine(one!.accounts[0]!), 'Sharma Motors · token expires in 1 day');
    const [none] = platformRows([account({})], NOW);
    assert.equal(accountLine(none!.accounts[0]!), 'Sharma Motors');
  });
});
```

In `apps/web/src/utils/settings.test.ts`, update the first test's expectations:

```ts
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.id), ['profile', 'platforms', 'preferences', 'inspiration', 'team', 'model_library']);
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.label), ['Business Profile', 'Platforms', 'Preferences', 'Inspiration', 'Team', 'Model Library']);
```

and add to the `'opens the tab named in the URL…'` test:

```ts
    assert.equal(resolveSettingsTab('platforms', tabs), 'platforms');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL. `./settingsPlatforms.js` cannot be resolved, and the tab list lacks `platforms`.

- [ ] **Step 3: `apps/web/src/utils/settingsPlatforms.ts`**

```ts
// Settings → Platforms: one row per platform, listing that platform's connected accounts
// (GET /v1/platform-accounts, several accounts per platform since Stage E1).

export type AccountPlatform = 'facebook' | 'instagram' | 'google' | 'youtube';
export type ConnectTarget = 'facebook' | 'gmb' | 'youtube';
export type RowStatus = 'connected' | 'expired' | 'disconnected';

/** A GET /v1/platform-accounts row. */
export interface PlatformAccount {
  id: string;
  platform: string;
  accountName: string;
  accountId: string;
  tokenExpiry: string | null;
  createdAt: string;
}

export interface PlatformRowDef {
  id: AccountPlatform;
  label: string;
  icon: 'facebook' | 'instagram' | 'gmb' | 'youtube';
  /** Instagram connects through Facebook: its Business account links from the Facebook Page. */
  connect: ConnectTarget;
}

export const PLATFORM_ROWS: readonly PlatformRowDef[] = [
  { id: 'facebook', label: 'Facebook Page', icon: 'facebook', connect: 'facebook' },
  { id: 'instagram', label: 'Instagram Business', icon: 'instagram', connect: 'facebook' },
  { id: 'google', label: 'Google My Business', icon: 'gmb', connect: 'gmb' },
  { id: 'youtube', label: 'YouTube Channel', icon: 'youtube', connect: 'youtube' },
];

const DAY_MS = 86_400_000;
// Google and YouTube tokens refresh by themselves, as on the Accounts page.
const REFRESHABLE = new Set(['google', 'gmb', 'youtube']);

export interface AccountHealth {
  expired: boolean;
  /** Whole days until a Meta token expires; null when unknown or refreshable. */
  daysLeft: number | null;
}

export function accountHealth(account: Pick<PlatformAccount, 'platform' | 'tokenExpiry'>, now: Date): AccountHealth {
  if (REFRESHABLE.has(account.platform) || !account.tokenExpiry) return { expired: false, daysLeft: null };
  const ms = new Date(account.tokenExpiry).getTime() - now.getTime();
  if (Number.isNaN(ms)) return { expired: false, daysLeft: null };
  return ms < 0 ? { expired: true, daysLeft: 0 } : { expired: false, daysLeft: Math.ceil(ms / DAY_MS) };
}

export interface PlatformRow extends PlatformRowDef {
  status: RowStatus;
  accounts: Array<PlatformAccount & AccountHealth>;
}

export function platformRows(accounts: readonly PlatformAccount[], now: Date): PlatformRow[] {
  return PLATFORM_ROWS.map((def) => {
    const mine = accounts
      .filter((a) => (a.platform === 'gmb' ? 'google' : a.platform) === def.id)
      .map((a) => ({ ...a, ...accountHealth(a, now) }));
    const status: RowStatus = mine.length === 0 ? 'disconnected' : mine.some((a) => a.expired) ? 'expired' : 'connected';
    return { ...def, status, accounts: mine };
  });
}

export function connectedPlatformCount(rows: readonly PlatformRow[]): number {
  return rows.filter((row) => row.status !== 'disconnected').length;
}

export function accountLine(account: PlatformAccount & AccountHealth): string {
  if (account.expired || account.daysLeft === null) return account.accountName;
  return `${account.accountName} · token expires in ${account.daysLeft} day${account.daysLeft === 1 ? '' : 's'}`;
}
```

- [ ] **Step 4: `apps/web/src/components/settings/PlatformsTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Plug, RefreshCw, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PlatformIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import { startConnect } from '../../utils/connectPlatform';
import { accountLine, connectedPlatformCount, platformRows, type PlatformAccount, type PlatformRow, type RowStatus } from '../../utils/settingsPlatforms';
import { SettingsCard, SettingsListCard } from './SettingsParts';

const STATUS: Record<RowStatus, { label: string; className: string; dot: string }> = {
  connected: { label: 'Connected', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  expired: { label: 'Token expired', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  disconnected: { label: 'Not connected', className: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
};

function StatusPill({ status }: { status: RowStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', s.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
      <div className="w-10 h-10 rounded-xl bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-24 rounded bg-zinc-100 animate-pulse" />
      </div>
    </div>
  );
}

export function PlatformsTab() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PlatformAccount | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<{ accounts: PlatformAccount[] }>('/platform-accounts')
      .then((res) => {
        if (cancelled) return;
        setAccounts(res.accounts ?? []);
        setNow(new Date());
      })
      .catch(() => { if (!cancelled) setAccounts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Coming back from Meta Business Suite or another tab: show what changed.
  useEffect(() => {
    const onFocus = () => setReloadKey((k) => k + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const rows = platformRows(accounts, now);

  const connect = async (row: PlatformRow) => {
    setConnecting(row.id);
    try {
      // A full-page redirect; OAuthCallbackPage brings the dealer back to this tab.
      await startConnect(row.connect, '/settings?tab=platforms');
    } catch (err) {
      setConnecting(null);
      addToast({ type: 'error', title: 'Connection failed', message: err instanceof Error && err.message ? err.message : 'Could not start connection' });
    }
  };

  const disconnect = async () => {
    if (!removing) return;
    setDisconnecting(true);
    try {
      await api.delete(`/platform-accounts/${removing.id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== removing.id));
      setRemoving(null);
      addToast({ type: 'success', title: 'Disconnected', message: 'Account removed successfully.' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not remove account. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
            <Plug className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Connected platforms</h2>
            <p className="text-xs text-zinc-500 mt-0.5 max-w-xl">Connect your accounts so the platform can publish posts and manage your inbox on your behalf.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1">
            <span className="text-sm font-bold text-zinc-900">{connectedPlatformCount(rows)}</span>
            <span className="text-[11px] text-zinc-500">of {rows.length} connected</span>
          </span>
          <Link to="/accounts" className="text-xs font-semibold text-orange-600 hover:text-orange-700">Manage all accounts</Link>
        </div>
      </SettingsCard>

      <SettingsListCard>
        {loading
          ? [0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)
          : rows.map((row) => (
            <div key={row.id} className="px-4 sm:px-5 py-3.5 transition-colors hover:bg-zinc-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center flex-shrink-0">
                  <PlatformIcon platform={row.icon} size="lg" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-zinc-900 text-sm">{row.label}</p>
                    <StatusPill status={row.status} />
                  </div>
                  {row.accounts.length === 0 ? (
                    <p className="text-xs text-zinc-500 mt-0.5">Not connected</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {row.accounts.map((a) => (
                        <li key={a.id} className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="truncate">{accountLine(a)}</span>
                          <button
                            type="button"
                            onClick={() => setRemoving(a)}
                            aria-label={`Disconnect ${a.accountName}`}
                            title="Disconnect account"
                            className="grid place-items-center w-6 h-6 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {row.status === 'connected' ? (
                    <button
                      type="button"
                      onClick={() => void connect(row)}
                      disabled={connecting !== null}
                      title="Refresh connection"
                      aria-label={`Refresh the ${row.label} connection`}
                      className="grid place-items-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={cn('w-4 h-4', connecting === row.id && 'animate-spin')} />
                    </button>
                  ) : (
                    <Button variant={row.status === 'expired' ? 'secondary' : 'primary'} onClick={() => void connect(row)} disabled={connecting !== null}>
                      {row.status === 'expired' && <CircleAlert className="w-4 h-4 text-amber-600" />}
                      {row.status === 'expired' ? 'Reconnect' : 'Connect'}
                    </Button>
                  )}
                </div>
              </div>
              {row.status === 'expired' && (
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2.5">
                  <CircleAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">Your access token has expired. Reconnect to continue publishing and managing your inbox for this platform.</p>
                </div>
              )}
            </div>
          ))}
      </SettingsListCard>

      <p className="text-center text-xs text-zinc-400">More integrations coming soon — WhatsApp Business, LinkedIn</p>

      <Modal
        isOpen={removing !== null}
        onClose={() => { if (!disconnecting) setRemoving(null); }}
        title="Disconnect this account?"
        variant="danger"
        size="sm"
        closeOnOverlayClick={!disconnecting}
        closeOnEscape={!disconnecting}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={disconnecting}>Keep connected</Button>
            <Button variant="danger" onClick={() => void disconnect()} disabled={disconnecting}>Disconnect</Button>
          </>
        )}
      >
        <p className="text-sm text-zinc-600">
          This will remove <strong className="text-zinc-900">{removing?.accountName}</strong> from Social AI. Any scheduled posts for this account will fail to publish.
        </p>
        <p className="text-xs text-zinc-400 mt-3">You can reconnect at any time from the Accounts page.</p>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: `apps/web/src/utils/settings.ts`.** In `SETTINGS_TABS`, insert after the Business Profile entry:

```ts
  { id: 'platforms', label: 'Platforms' },
```

- [ ] **Step 6: `apps/web/src/pages/SettingsPage.tsx`.**
- Add `import { PlatformsTab } from '../components/settings/PlatformsTab';`.
- Add `{activeTab === 'platforms' && <PlatformsTab />}` directly after the Profile line.
- Delete the legacy-redirect `useEffect` and its comment. The Platforms tab is the destination now, and E1's `OAuthCallbackPage` handles the OAuth query.
- Remove the now-unused `useEffect` and `useNavigate` imports and the `navigate` constant.

- [ ] **Step 7: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1`
Expected: pass; build 0; lint 45 or below.

Manual check (`web-local` + `api-verify`; mock Meta connect as in Stage D Task 13 Step 2):
- `/settings?tab=platforms` shows four rows and "{n} of 4 connected".
- After the mock connect, Facebook lists both mock Pages and Instagram lists its account.
- The trash icon opens "Disconnect this account?"; "Keep connected" closes it, and "Disconnect" removes the row.
- Connect on YouTube starts the redirect. After OAuth returns you land back on this tab (E1).
- "Manage all accounts" opens `/accounts`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/utils/settingsPlatforms.ts apps/web/src/utils/settingsPlatforms.test.ts apps/web/src/components/settings/PlatformsTab.tsx apps/web/src/utils/settings.ts apps/web/src/utils/settings.test.ts apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): Settings Platforms tab with every connected account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Billing tab and the `/billing` redirect (web)

**Files:**
- Create: `apps/web/src/utils/billing.ts` + `apps/web/src/utils/billing.test.ts`, `apps/web/src/components/settings/BillingTab.tsx`
- Modify: `apps/web/src/services/billing.ts` (replaced), `apps/web/src/utils/settings.ts` (+ `settings.test.ts`), `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/App.tsx` (the `/billing` route line and its `BillingPage` import only), `apps/web/src/components/ui/PlanGatedNotice.tsx`, `apps/web/src/pages/Boost.tsx` (one link)
- Delete: `apps/web/src/pages/BillingPage.tsx`

**Interfaces:**
- Consumes: Task 4's `GET /v1/billing/plans`, `POST /v1/billing/subscribe { tier, cycle }` and `GET /v1/billing/status` (shape unchanged).
- Produces:
  - `services/billing.ts`:
    - `type PlanTier`, `type BillingCycle`, `BillingStatus` (unchanged), `PlanFeature`, `BillingPlan`;
    - `BillingPlans { plans; payments_enabled; annual_discount_percent }`, `SubscribeResponse`;
    - `billingService.getStatus()`, `getPlans()` and `subscribe(tier, cycle)`. `simulateWebhook` is removed.
  - `utils/billing.ts`:
    - `UNLIMITED_POSTS = 999_999`, `PAYMENTS_OFF_MESSAGE`;
    - `rupees(amount)`, `planPrice(plan, cycle)`, `annualSaving(plan)`, `popularPlanId(plans, currentTier)`;
    - `interface UsageMeter { unlimited; cap; remaining; percent }` and `usageMeter(limits)`;
    - `type StatusTone` and `statusTone(status)`, `renewalDate(status)`.
  - `BillingTab()`.
  - `SETTINGS_TABS` gains `{ id: 'billing', label: 'Billing', requires: 'viewBilling' }` after Preferences.
  - `/billing` → `<Navigate to="/settings?tab=billing" replace />`.

This task's code contains ₹ – … — (`₹ – … —`). Byte-check them.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/utils/billing.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BillingPlan, BillingStatus } from '../services/billing';
import { annualSaving, planPrice, popularPlanId, renewalDate, rupees, statusTone, usageMeter } from './billing.js';

const plan = (id: BillingPlan['id'], monthlyPrice: number, annualPrice: number): BillingPlan => ({
  id, name: id, description: '', monthlyPrice, annualPrice, trialDays: 0, features: [],
});
const PLANS = [plan('starter', 999, 9588), plan('growth', 2999, 28788), plan('enterprise', 9999, 95988)];

const status = (over: Partial<BillingStatus>): BillingStatus => ({
  success: true, plan: 'starter', expiresAt: null, subscription: null,
  limits: { postsLimit: 30, postsUsed: 0, platformsLimit: 2, platformsConnected: 0, featuresBlocked: [] }, ...over,
});

describe('billing helpers', () => {
  it('formats rupees with Indian grouping', () => {
    assert.equal(rupees(999), '₹999');
    assert.equal(rupees(119988), '₹1,19,988');
  });

  it('prices by cycle and works out the annual saving', () => {
    assert.equal(planPrice(PLANS[1]!, 'monthly'), 2999);
    assert.equal(planPrice(PLANS[1]!, 'annual'), 28788);
    assert.equal(annualSaving(PLANS[1]!), 7200);
    assert.equal(annualSaving(plan('growth', 100, 1500)), 0);
  });

  it('marks the middle plan Popular unless it is the current one', () => {
    assert.equal(popularPlanId(PLANS, 'starter'), 'growth');
    assert.equal(popularPlanId(PLANS, 'growth'), null);
    assert.equal(popularPlanId([], 'starter'), null);
  });

  it('meters posts left this month', () => {
    assert.deepEqual(usageMeter({ postsLimit: 30, postsUsed: 12 }), { unlimited: false, cap: 30, remaining: 18, percent: 40 });
    assert.deepEqual(usageMeter({ postsLimit: 30, postsUsed: 0 }), { unlimited: false, cap: 30, remaining: 30, percent: 2 });
    assert.deepEqual(usageMeter({ postsLimit: 30, postsUsed: 45 }), { unlimited: false, cap: 30, remaining: 0, percent: 100 });
    assert.equal(usageMeter({ postsLimit: 999999, postsUsed: 5 }).unlimited, true);
  });

  it('colours subscription states', () => {
    assert.equal(statusTone('active'), 'emerald');
    assert.equal(statusTone('created'), 'amber');
    assert.equal(statusTone('halted'), 'red');
    assert.equal(statusTone('cancelled'), 'red');
    assert.equal(statusTone('completed'), 'zinc');
  });

  it('shows a renewal date only for an active subscription', () => {
    const end = '2026-10-24T00:00:00.000Z';
    assert.equal(renewalDate(status({ subscription: { id: 's', status: 'active', planId: 'p', currentPeriodEnd: end } })), new Date(end).toLocaleDateString('en-IN'));
    assert.equal(renewalDate(status({ subscription: { id: 's', status: 'created', planId: 'p', currentPeriodEnd: end } })), null);
    assert.equal(renewalDate(status({ expiresAt: end })), null);
  });
});
```

In `apps/web/src/utils/settings.test.ts`, update the first test's expectations:

```ts
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.id), ['profile', 'platforms', 'preferences', 'billing', 'inspiration', 'team', 'model_library']);
    assert.deepEqual(visibleSettingsTabs(everyone).map((t) => t.label), ['Business Profile', 'Platforms', 'Preferences', 'Billing', 'Inspiration', 'Team', 'Model Library']);
```

and add:

```ts
  it('shows Billing only to people who can view billing', () => {
    assert.ok(!visibleSettingsTabs({ ...everyone, viewBilling: false }).some((t) => t.id === 'billing'));
    assert.equal(resolveSettingsTab('billing', visibleSettingsTabs({ ...everyone, viewBilling: false })), 'profile');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL. `./billing.js` cannot be resolved, and the tab list lacks `billing`.

- [ ] **Step 3: Replace `apps/web/src/services/billing.ts`**

```ts
import api from './api';

export type PlanTier = 'starter' | 'growth' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';

export interface BillingStatus {
  success: boolean;
  plan: string;
  expiresAt: string | null;
  subscription: {
    id: string;
    status: string;
    planId: string;
    currentPeriodEnd: string | null;
  } | null;
  limits: {
    postsLimit: number;
    postsUsed: number;
    platformsLimit: number;
    platformsConnected: number;
    featuresBlocked: string[];
  };
}

export interface PlanFeature {
  label: string;
  included: boolean;
}

/** GET /billing/plans: prices in ₹; annualPrice is per year. */
export interface BillingPlan {
  id: PlanTier;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  features: PlanFeature[];
}

export interface BillingPlans {
  plans: BillingPlan[];
  payments_enabled: boolean;
  annual_discount_percent: number;
}

export interface SubscribeResponse {
  success: boolean;
  subscriptionId: string;
  paymentLink: string;
}

export const billingService = {
  getStatus: () => api.get<BillingStatus>('/billing/status'),
  getPlans: () => api.get<BillingPlans>('/billing/plans'),
  subscribe: (tier: PlanTier, cycle: BillingCycle) => api.post<SubscribeResponse>('/billing/subscribe', { tier, cycle }),
};
```

- [ ] **Step 4: `apps/web/src/utils/billing.ts`**

```ts
import type { BillingCycle, BillingPlan, BillingStatus } from '../services/billing';

/** GET /billing/status reports unlimited posts as this number (apps/api/src/lib/billingPlans.ts UNLIMITED). */
export const UNLIMITED_POSTS = 999_999;

/** Also the API's 503 BILLING_NOT_CONFIGURED message. */
export const PAYMENTS_OFF_MESSAGE = 'Online payments are being set up. Contact us to change your plan.';

export function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function planPrice(plan: BillingPlan, cycle: BillingCycle): number {
  return cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
}

export function annualSaving(plan: BillingPlan): number {
  return Math.max(0, plan.monthlyPrice * 12 - plan.annualPrice);
}

/** The middle plan wears the "Popular" ribbon, unless it is already the dealer's plan. */
export function popularPlanId(plans: readonly BillingPlan[], currentTier: string): string | null {
  const middle = plans[Math.floor(plans.length / 2)];
  return middle && middle.id !== currentTier ? middle.id : null;
}

export interface UsageMeter {
  unlimited: boolean;
  cap: number;
  remaining: number;
  /** Bar width: at least 2% so an empty bar still shows, at most 100%. */
  percent: number;
}

export function usageMeter(limits: Pick<BillingStatus['limits'], 'postsLimit' | 'postsUsed'>): UsageMeter {
  if (limits.postsLimit >= UNLIMITED_POSTS) return { unlimited: true, cap: 0, remaining: 0, percent: 0 };
  const cap = Math.max(0, limits.postsLimit);
  const remaining = Math.max(0, cap - limits.postsUsed);
  const percent = Math.min(100, Math.max(2, Math.round(((cap - remaining) / Math.max(1, cap)) * 100)));
  return { unlimited: false, cap, remaining, percent };
}

export type StatusTone = 'emerald' | 'amber' | 'red' | 'zinc';

/** Active is green, waiting for payment is amber, stopped is red; anything else is grey. */
export function statusTone(status: string): StatusTone {
  if (status === 'active') return 'emerald';
  if (status === 'trialing' || status === 'created' || status === 'authenticated') return 'amber';
  if (['past_due', 'halted', 'suspended', 'cancelled', 'expired'].includes(status)) return 'red';
  return 'zinc';
}

/** "Renews {date}" for an active subscription only. */
export function renewalDate(status: BillingStatus): string | null {
  const sub = status.subscription;
  const iso = sub?.status === 'active' ? sub.currentPeriodEnd ?? status.expiresAt : null;
  return iso ? new Date(iso).toLocaleDateString('en-IN') : null;
}
```

- [ ] **Step 5: `apps/web/src/components/settings/BillingTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Check, CircleAlert, Loader2, Sparkles } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { ApiError } from '../../services/api';
import { billingService, type BillingCycle, type BillingPlans, type BillingStatus, type PlanTier } from '../../services/billing';
import { PAYMENTS_OFF_MESSAGE, annualSaving, planPrice, popularPlanId, renewalDate, rupees, statusTone, usageMeter, type StatusTone } from '../../utils/billing';
import { SettingsCard } from './SettingsParts';

const TONES: Record<StatusTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  zinc: 'bg-zinc-100 text-zinc-600',
};

export function BillingTab() {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<BillingPlans | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [subscribing, setSubscribing] = useState<PlanTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([billingService.getPlans(), billingService.getStatus()])
      .then(([p, s]) => {
        if (cancelled) return;
        setPlans(p);
        setStatus(s);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const subscribe = async (tier: PlanTier) => {
    setSubscribing(tier);
    try {
      const res = await billingService.subscribe(tier, cycle);
      window.open(res.paymentLink, '_blank', 'noopener,noreferrer');
      addToast({ type: 'success', title: 'Subscription created', message: 'Complete payment to activate your plan.' });
    } catch (err) {
      const notConfigured = err instanceof ApiError && err.code === 'BILLING_NOT_CONFIGURED';
      addToast({
        type: 'error',
        title: 'Billing',
        message: notConfigured ? "Online payments aren't enabled yet — please check back soon." : err instanceof Error && err.message ? err.message : 'Could not start subscription',
      });
    } finally {
      setSubscribing(null);
    }
  };

  if (failed) {
    return (
      <SettingsCard>
        <p className="text-sm text-zinc-500">Could not load billing. Refresh the page to try again.</p>
      </SettingsCard>
    );
  }
  if (!plans || !status) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-8">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading plans…</span>
        </div>
      </div>
    );
  }

  const currentTier = status.success ? status.plan : 'starter';
  const current = plans.plans.find((p) => p.id === currentTier);
  const meter = status.success ? usageMeter(status.limits) : null;
  const subStatus = status.subscription?.status ?? null;
  const renews = renewalDate(status);
  const popular = popularPlanId(plans.plans, currentTier);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 shadow-sm bg-gradient-to-br from-orange-50 via-white to-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Current plan</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <h2 className="text-2xl font-bold text-zinc-900 capitalize">{current?.name ?? currentTier}</h2>
          {subStatus && (
            <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', TONES[statusTone(subStatus)])}>
              {subStatus.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        {renews && <p className="text-xs text-zinc-500 mt-1">Renews {renews}</p>}
        {meter && (meter.unlimited ? (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"><Check className="w-4 h-4" /> Unlimited posts</p>
        ) : (
          <div className="mt-4 max-w-md">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-zinc-800">{meter.remaining} of {meter.cap} posts left this month</span>
              <span className="text-xs text-zinc-400">resets monthly</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${meter.percent}%` }} />
            </div>
          </div>
        ))}
        {!plans.payments_enabled && (
          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2.5">
            <CircleAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{PAYMENTS_OFF_MESSAGE}</p>
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-zinc-900">Choose a plan</h3>
          <div role="group" aria-label="Billing cycle" className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1">
            {(['monthly', 'annual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all', cycle === c ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
              >
                {c === 'monthly' ? 'Monthly' : 'Annual'}
                {c === 'annual' && plans.annual_discount_percent > 0 && (
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5">–{plans.annual_discount_percent}%</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {plans.plans.map((plan) => {
            const isCurrent = plan.id === currentTier;
            const isPopular = plan.id === popular;
            const saving = annualSaving(plan);
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative bg-white rounded-2xl border p-5 flex flex-col transition-all duration-200',
                  isCurrent ? 'border-orange-300 ring-1 ring-orange-200 shadow-sm'
                    : isPopular ? 'border-orange-200 shadow-md md:-mt-1'
                      : 'border-zinc-200/80 shadow-sm hover:shadow-md hover:border-zinc-300',
                )}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    <Sparkles className="w-3 h-3" /> Popular
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-zinc-900">{plan.name}</p>
                  {isCurrent && <span className="text-[11px] font-semibold text-orange-700 bg-orange-50 ring-1 ring-orange-100 rounded-full px-2 py-0.5">Current</span>}
                </div>
                <p className="text-xs text-zinc-500 mt-1 min-h-8">{plan.description}</p>
                <p className="mt-3">
                  <span className="text-3xl font-extrabold text-zinc-900">{rupees(planPrice(plan, cycle))}</span>
                  <span className="text-sm text-zinc-500">{cycle === 'annual' ? '/yr' : '/mo'}</span>
                </p>
                {cycle === 'annual' && saving > 0
                  ? <p className="h-4 mt-1 text-xs font-medium text-emerald-600">Save {rupees(saving)} a year</p>
                  : <div className="h-4 mt-1" />}
                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.label} className={cn('flex items-start gap-2 text-sm', f.included ? 'text-zinc-700' : 'text-zinc-400 line-through')}>
                      <Check className={cn('w-4 h-4 flex-shrink-0 mt-0.5', f.included ? 'text-emerald-600' : 'text-zinc-300')} />
                      {f.label}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-5 w-full"
                  variant={isCurrent ? 'secondary' : 'primary'}
                  disabled={isCurrent || !plans.payments_enabled || subscribing !== null}
                  title={!isCurrent && !plans.payments_enabled ? PAYMENTS_OFF_MESSAGE : undefined}
                  onClick={() => void subscribe(plan.id)}
                >
                  {subscribing === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCurrent ? 'Current plan' : `Choose ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Tabs, routes and links.**

(a) In `apps/web/src/utils/settings.ts` `SETTINGS_TABS`, insert after the Preferences entry:

```ts
  { id: 'billing', label: 'Billing', requires: 'viewBilling' },
```

(b) In `apps/web/src/pages/SettingsPage.tsx`, add `import { BillingTab } from '../components/settings/BillingTab';` and, after the Preferences line:

```tsx
      {activeTab === 'billing' && <BillingTab />}
```

(c) In `apps/web/src/App.tsx`:
- Delete `import BillingPage from './pages/BillingPage';`.
- Replace the `/billing` route line with the line below. `Navigate` is already imported.

```tsx
      <Route path="/billing" element={<Navigate to="/settings?tab=billing" replace />} />
```

(d) Run `git rm apps/web/src/pages/BillingPage.tsx`.

(e) In `apps/web/src/components/ui/PlanGatedNotice.tsx`, change `to="/billing"` to `to="/settings?tab=billing"`.

(f) In `apps/web/src/pages/Boost.tsx`, change `navigate('/billing')` to `navigate('/settings?tab=billing')`.

- [ ] **Step 7: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1 && grep -rn "'/billing'\|\"/billing\"\|BillingPage\|simulateWebhook" apps/web/src`
Expected:
- Tests pass and the build exits 0.
- Lint is about 36: `BillingPage.tsx` took 4 problems with it.
- The grep prints only the `/billing` redirect route in `App.tsx`.

Manual check (`web-local` + `api-verify`, no Razorpay variables):
- `/billing` lands on Settings → Billing.
- Current plan: "Starter", "{n} of 30 posts left this month" with "resets monthly", and the amber "Online payments are being set up…" banner.
- Growth wears "Popular".
- The "Annual –20%" toggle switches prices to "/yr" with "Save ₹7,200 a year" on Growth.
- The Choose buttons are disabled, with the same message on hover.
- A Creator (without `view_billing`) has no Billing tab.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/utils/billing.ts apps/web/src/utils/billing.test.ts apps/web/src/components/settings/BillingTab.tsx apps/web/src/services/billing.ts apps/web/src/utils/settings.ts apps/web/src/utils/settings.test.ts apps/web/src/pages/SettingsPage.tsx apps/web/src/App.tsx apps/web/src/components/ui/PlanGatedNotice.tsx apps/web/src/pages/Boost.tsx
git commit -m "feat(web): Billing tab from the plan catalogue; /billing opens it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`git rm` has already staged the deletion of `BillingPage.tsx`.

---

### Task 10: Preferences tab, the System theme default and server-synced preferences (web)

**Files:**
- Create: `apps/web/src/utils/preferences.ts` + `apps/web/src/utils/preferences.test.ts`, `apps/web/src/services/preferences.ts`
- Modify:
  - Theme: `apps/web/src/utils/theme.ts` (+ `theme.test.ts`), `apps/web/index.html`.
  - Sync: `apps/web/src/components/shell/AppearanceSync.tsx`, `apps/web/src/contexts/DealerProfileContext.tsx`.
  - Settings: `apps/web/src/components/settings/useProfileForm.ts` (final version), `apps/web/src/components/settings/PreferencesTab.tsx` (replaced), `apps/web/src/utils/settings.ts`, `apps/web/src/pages/SettingsPage.tsx`.

**Interfaces:**
- Consumes: Task 2's `GET/PUT /v1/users/me/preferences`; `ThemeContext` (`mode`, `setMode`, which writes `localStorage.themeMode`); Task 6's parts; Task 9's Billing tab.
- Produces:
  - `utils/theme.ts`: `DEFAULT_THEME_MODE = 'system'`. The `index.html` pre-paint treats a missing or unknown value as `system`.
  - `utils/preferences.ts`:
    - `NOTIFICATION_TYPES`, `type NotificationType`, `type NotificationPrefs`, `interface UserPreferences { theme_mode: ThemeMode; notification_prefs: NotificationPrefs }`;
    - `NOTIFICATION_OPTIONS: ReadonlyArray<{ type; label }>`, `allNotificationsOn()`;
    - `CONTENT_LANGUAGES`, `normaliseLanguages(stored)`, `toggleLanguage(selected, code)`.
  - `services/preferences.ts`: `preferencesService.get()`, `preferencesService.update(change)`.
  - `AppearanceSync({ userId, brandColor })`: after sign-in (`userId` changes), it loads the saved theme and applies it.
  - `PreferencesTab({ form, onOpenBilling? })`.
  - `useProfileForm()` final version: without `billing`, `defaultRadius` and `notifications`; languages normalised.
  - `utils/settings.ts` drops `PLAN_LABELS`, `LANGUAGES` and `NOTIFICATION_KEYS`.

This task's copy contains “ ” — (`“ ” —`). Byte-check them.

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/src/utils/theme.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, isDarkMode, parseThemeMode } from './theme.js';

describe('theme mode', () => {
  it('uses the themeMode storage key and follows the device by default', () => {
    assert.equal(THEME_STORAGE_KEY, 'themeMode');
    assert.equal(DEFAULT_THEME_MODE, 'system');
  });

  it('accepts only known modes', () => {
    assert.equal(parseThemeMode('dark'), 'dark');
    assert.equal(parseThemeMode('system'), 'system');
    assert.equal(parseThemeMode('light'), 'light');
    assert.equal(parseThemeMode('DARK'), 'system');
    assert.equal(parseThemeMode(null), 'system');
    assert.equal(parseThemeMode(undefined), 'system');
  });

  it('resolves dark for dark, and for system only when the OS prefers dark', () => {
    assert.equal(isDarkMode('dark', false), true);
    assert.equal(isDarkMode('light', true), false);
    assert.equal(isDarkMode('system', true), true);
    assert.equal(isDarkMode('system', false), false);
  });

  it('keeps the index.html pre-paint script in step: no saved choice follows the device', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /localStorage\.getItem\('themeMode'\)/);
    assert.match(html, /if \(m !== 'light' && m !== 'dark'\) m = 'system';/);
    assert.match(html, /m === 'system' && window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/);
  });
});
```

`apps/web/src/utils/preferences.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_LANGUAGES, NOTIFICATION_OPTIONS, NOTIFICATION_TYPES, allNotificationsOn, normaliseLanguages, toggleLanguage } from './preferences.js';

describe('preferences', () => {
  it('labels every notification type the API sends', () => {
    assert.deepEqual(NOTIFICATION_OPTIONS.map((o) => o.type), [...NOTIFICATION_TYPES]);
    assert.equal(NOTIFICATION_TYPES.length, 7);
    assert.ok(Object.values(allNotificationsOn()).every((on) => on === true));
  });

  it('offers the languages captions can be written in', () => {
    assert.deepEqual(CONTENT_LANGUAGES.map((l) => l.code), ['en', 'hi', 'mr', 'ta', 'te', 'kn', 'gu', 'bn']);
  });

  it('keeps supported languages in order, English always included', () => {
    assert.deepEqual(normaliseLanguages(['hi', 'ml', 'en']), ['hi', 'en']);
    assert.deepEqual(normaliseLanguages(['ta']), ['ta', 'en']);
    assert.deepEqual(normaliseLanguages(['en', 'en', 'gu']), ['en', 'gu']);
    assert.deepEqual(normaliseLanguages(null), ['en']);
  });

  it('toggles a language but never removes English', () => {
    assert.deepEqual(toggleLanguage(['en'], 'bn'), ['en', 'bn']);
    assert.deepEqual(toggleLanguage(['en', 'bn'], 'bn'), ['en']);
    assert.deepEqual(toggleLanguage(['hi', 'en'], 'en'), ['hi', 'en']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL. `DEFAULT_THEME_MODE` is `'light'`, the pre-paint regex does not match, and `./preferences.js` cannot be resolved.

- [ ] **Step 3: Theme default.**

In `apps/web/src/utils/theme.ts`, replace the comment and the `DEFAULT_THEME_MODE` line with:

```ts
// A first visit (no saved choice) follows the device. index.html's pre-paint script mirrors this.
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
```

In `apps/web/index.html`, replace the whole `<script>…</script>` in `<head>` with:

```html
    <script>
      // Mirrors utils/theme.ts: apply the saved theme before first paint to avoid a white flash.
      // No saved choice (or an unknown one) follows the device, like DEFAULT_THEME_MODE.
      try {
        var m = localStorage.getItem('themeMode');
        if (m !== 'light' && m !== 'dark') m = 'system';
        if (m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    </script>
```

- [ ] **Step 4: `apps/web/src/utils/preferences.ts`**

```ts
import type { ThemeMode } from './theme.js';

// Keep in step with NOTIFICATION_TYPES in apps/api/src/lib/notifications.ts.
export const NOTIFICATION_TYPES = [
  'post_published',
  'post_failed',
  'approval_requested',
  'approval_decided',
  'reel_ready',
  'platform_disconnected',
  'inbox_message',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationPrefs = Record<NotificationType, boolean>;

/** GET/PUT /v1/users/me/preferences */
export interface UserPreferences {
  theme_mode: ThemeMode;
  notification_prefs: NotificationPrefs;
}

// Plain labels for the in-app notifications we actually send.
export const NOTIFICATION_OPTIONS: ReadonlyArray<{ type: NotificationType; label: string }> = [
  { type: 'post_published', label: 'A post is published' },
  { type: 'post_failed', label: 'A post fails to publish' },
  { type: 'approval_requested', label: 'A post needs your approval' },
  { type: 'approval_decided', label: 'Your post is approved or sent back' },
  { type: 'reel_ready', label: 'A reel is ready' },
  { type: 'platform_disconnected', label: 'An account gets disconnected' },
  { type: 'inbox_message', label: 'A new message or review arrives' },
];

export function allNotificationsOn(): NotificationPrefs {
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, true])) as NotificationPrefs;
}

// The languages the caption API writes (apps/api/src/lib/languages.ts), with their scripts.
export const CONTENT_LANGUAGES = [
  { code: 'en', label: 'English', script: 'Latin' },
  { code: 'hi', label: 'Hindi', script: 'Devanagari' },
  { code: 'mr', label: 'Marathi', script: 'Devanagari' },
  { code: 'ta', label: 'Tamil', script: 'Tamil' },
  { code: 'te', label: 'Telugu', script: 'Telugu' },
  { code: 'kn', label: 'Kannada', script: 'Kannada' },
  { code: 'gu', label: 'Gujarati', script: 'Gujarati' },
  { code: 'bn', label: 'Bengali', script: 'Bengali' },
] as const;

/** Stored preferences → supported codes, in order, once each; English is added if missing. The first is the default. */
export function normaliseLanguages(stored: readonly string[] | null | undefined): string[] {
  const supported = new Set<string>(CONTENT_LANGUAGES.map((l) => l.code));
  const kept = [...new Set((stored ?? []).filter((code) => supported.has(code)))];
  return kept.includes('en') ? kept : [...kept, 'en'];
}

/** Adds or removes a language; English stays. */
export function toggleLanguage(selected: readonly string[], code: string): string[] {
  if (code === 'en') return [...selected];
  return selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
}
```

- [ ] **Step 5: `apps/web/src/services/preferences.ts`**

```ts
import api from './api';
import type { NotificationPrefs, UserPreferences } from '../utils/preferences';
import type { ThemeMode } from '../utils/theme';

export const preferencesService = {
  get: () => api.get<UserPreferences>('/users/me/preferences'),
  update: (change: { theme_mode?: ThemeMode; notification_prefs?: Partial<NotificationPrefs> }) =>
    api.put<UserPreferences>('/users/me/preferences', change),
};
```

- [ ] **Step 6: Replace `apps/web/src/components/shell/AppearanceSync.tsx`**

```tsx
import { useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { preferencesService } from '../../services/preferences';
import { applyBrandTheme, brandThemeCss } from '../../utils/brandPalette';
import { parseThemeMode } from '../../utils/theme';

/**
 * Keeps the look in step with the account. Renders nothing.
 * - After sign-in, the theme saved on the account wins over this device's choice. ThemeContext
 *   caches it in localStorage, which the index.html pre-paint script reads on the next visit.
 * - The dealer's brand colour recolours the app when Business Profile turns it on.
 */
export function AppearanceSync({ userId, brandColor }: { userId: string | null; brandColor: string | null }) {
  const { setMode } = useTheme();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    preferencesService.get()
      .then((prefs) => { if (!cancelled) setMode(parseThemeMode(prefs.theme_mode)); })
      .catch(() => { /* keep this device's choice when the preferences can't be read */ });
    return () => { cancelled = true; };
  }, [userId, setMode]);

  useEffect(() => {
    applyBrandTheme(brandThemeCss(brandColor));
  }, [brandColor]);

  return null;
}
```

In `apps/web/src/contexts/DealerProfileContext.tsx`, change the render to `<AppearanceSync userId={user?.id ?? null} brandColor={brandColor} />`.

- [ ] **Step 7: Replace `apps/web/src/components/settings/useProfileForm.ts`** (final version)

```ts
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { useDealerProfile } from '../../contexts/DealerProfileContext';
import { addBrand } from '../../utils/settings';
import { normaliseLanguages, toggleLanguage } from '../../utils/preferences';

interface ProfileResponse {
  success: boolean;
  profile: {
    name: string; city: string; contact_phone?: string; whatsapp_number?: string;
    primary_color?: string; secondary_color?: string; use_brand_theme?: boolean;
    brands?: string[]; language_preferences?: string[]; region?: string;
    logo_url?: string; font?: string; address?: string; showroom_type?: string[];
  };
}

// Business Profile and Preferences share one form and one PUT /dealer/profile, as in the reference.
export function useProfileForm() {
  const { addToast } = useToast();
  const { reload: reloadProfile } = useDealerProfile();
  // Empty until GET /dealer/profile answers; Save stays disabled so blanks never overwrite the dealer.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en']);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [dealerName, setDealerName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1877F2');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [useBrandTheme, setUseBrandTheme] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [font, setFont] = useState('Arial');
  const [address, setAddress] = useState('');
  const [showroomType, setShowroomType] = useState('new');

  useEffect(() => {
    api.get<ProfileResponse>('/dealer/profile').then((res) => {
      const p = res.profile;
      if (!p) throw new Error('Dealer profile not found');
      setDealerName(p.name ?? '');
      setCity(p.city ?? '');
      if (p.contact_phone) setPhone(p.contact_phone);
      if (p.whatsapp_number) setWhatsapp(p.whatsapp_number);
      if (p.primary_color) setPrimaryColor(p.primary_color);
      if (p.secondary_color) setSecondaryColor(p.secondary_color);
      setUseBrandTheme(p.use_brand_theme === true);
      if (p.brands?.length) setSelectedBrands(p.brands);
      setSelectedLangs(normaliseLanguages(p.language_preferences));
      if (p.region) setSelectedRegion(p.region);
      if (p.logo_url) setLogoUrl(p.logo_url);
      if (p.font) setFont(p.font);
      if (p.address) setAddress(p.address);
      if (p.showroom_type?.length) setShowroomType(p.showroom_type[0]);
      setProfileLoaded(true);
    }).catch(() => {
      addToast({ type: 'error', title: 'Could not load your profile', message: 'Refresh the page before saving changes.' });
    });
  }, [addToast]);

  const toggleLang = (code: string) => setSelectedLangs((prev) => toggleLanguage(prev, code));
  const addSelectedBrand = (raw: string) => setSelectedBrands((prev) => addBrand(prev, raw));
  const removeSelectedBrand = (brand: string) => setSelectedBrands((prev) => prev.filter((b) => b !== brand));

  const handleSave = async (): Promise<boolean> => {
    if (!profileLoaded) return false;
    setSaving(true);
    try {
      await api.put('/dealer/profile', {
        name: dealerName,
        city,
        contact_phone: phone,
        whatsapp_number: whatsapp,
        primary_color: primaryColor,
        ...(secondaryColor ? { secondary_color: secondaryColor } : {}),
        use_brand_theme: useBrandTheme,
        brands: selectedBrands,
        language_preferences: normaliseLanguages(selectedLangs),
        region: selectedRegion,
        logo_url: logoUrl,
        font,
        address,
        showroom_type: [showroomType],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // The brand theme and every page that reads the profile pick up the change.
      reloadProfile();
      return true;
    } catch {
      addToast({ type: 'error', title: 'Error Saving Settings', message: 'Failed to update settings. Please try again.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    profileLoaded, selectedLangs, selectedRegion, setSelectedRegion, selectedBrands, addSelectedBrand, removeSelectedBrand,
    dealerName, setDealerName, city, setCity, phone, setPhone, whatsapp, setWhatsapp,
    primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, useBrandTheme, setUseBrandTheme,
    saved, saving, logoUrl, setLogoUrl, font, setFont, address, setAddress, showroomType, setShowroomType,
    toggleLang, handleSave,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
```

- [ ] **Step 8: Replace `apps/web/src/components/settings/PreferencesTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Bell, Check, ChevronDown, CreditCard, Languages, MapPin, SunMoon } from 'lucide-react';
import { cn } from '../ui/Button';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import { useTheme } from '../../contexts/ThemeContext';
import { preferencesService } from '../../services/preferences';
import { CONTENT_LANGUAGES, NOTIFICATION_OPTIONS, allNotificationsOn, type NotificationPrefs } from '../../utils/preferences';
import { REGIONS } from '../../utils/settings';
import type { ThemeMode } from '../../utils/theme';
import { SaveBar, SectionHeader, SettingsCard, Toggle } from './SettingsParts';
import type { ProfileForm } from './useProfileForm';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function PreferencesTab({ form, onOpenBilling }: { form: ProfileForm; onOpenBilling?: () => void }) {
  const { addToast } = useToast();
  const { mode, setMode } = useTheme();
  const { selectedLangs, toggleLang, selectedRegion, setSelectedRegion, saved, saving, handleSave, profileLoaded } = form;
  const [prefs, setPrefs] = useState<NotificationPrefs>(allNotificationsOn);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(allNotificationsOn);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    preferencesService.get()
      .then((p) => {
        if (cancelled) return;
        setPrefs(p.notification_prefs);
        setSavedPrefs(p.notification_prefs);
        setPrefsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', title: 'Could not load your notification settings', message: 'Refresh the page before saving changes.' });
      });
    return () => { cancelled = true; };
  }, [addToast]);

  // The theme is yours, not the dealership's: it applies at once and is saved to your account.
  const chooseTheme = (next: ThemeMode) => {
    const previous = mode;
    setMode(next);
    preferencesService.update({ theme_mode: next }).catch(() => {
      setMode(previous);
      addToast({ type: 'error', title: 'Could not save your theme', message: 'Please try again.' });
    });
  };

  const saveNotifications = async () => {
    const changed = NOTIFICATION_OPTIONS.map((o) => o.type).filter((type) => prefs[type] !== savedPrefs[type]);
    if (!prefsLoaded || changed.length === 0) return;
    try {
      const change = Object.fromEntries(changed.map((type) => [type, prefs[type]])) as Partial<NotificationPrefs>;
      const next = await preferencesService.update({ notification_prefs: change });
      setPrefs(next.notification_prefs);
      setSavedPrefs(next.notification_prefs);
    } catch {
      addToast({ type: 'error', title: 'Could not save notifications', message: 'Please try again.' });
    }
  };

  // Languages and region belong to the dealership (PUT /dealer/profile); notifications to you.
  const save = () => {
    void Promise.all([handleSave(), saveNotifications()]);
  };

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SectionHeader icon={<SunMoon className="w-4 h-4" />} title="Appearance" description="Saved to your account, so it follows you to every device you sign in on." />
        <div role="group" aria-label="Theme" className="inline-flex gap-1 bg-zinc-100 p-1 rounded-xl">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={mode === o.value}
              onClick={() => chooseTheme(o.value)}
              className={cn('px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all', mode === o.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">“System” follows your device's light/dark setting.</p>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader
          icon={<Languages className="w-4 h-4" />}
          title="Content languages"
          description="Used for AI captions, hashtags & on-image text. The first one is your account default; you can switch language per post."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {CONTENT_LANGUAGES.map((lang) => {
            const selected = selectedLangs.includes(lang.code);
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => toggleLang(lang.code)}
                disabled={lang.code === 'en'}
                aria-pressed={selected}
                className={cn(
                  'flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed',
                  selected ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
                )}
              >
                <span className="font-medium">{lang.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400">{lang.script}</span>
                  {selectedLangs[0] === lang.code && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-orange-600 bg-white/70 ring-1 ring-orange-200 rounded px-1 py-0.5">Default</span>
                  )}
                  {selected && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader icon={<MapPin className="w-4 h-4" />} title="Region" description="Controls which festival templates and regional campaigns are shown." />
        <ThemedSelect
          value={selectedRegion}
          onChange={setSelectedRegion}
          options={REGIONS.map((r) => ({ value: r, label: r }))}
          placeholder="Select a region"
          className="sm:max-w-xs"
          ariaLabel="Region"
        />
      </SettingsCard>

      <SettingsCard>
        <SectionHeader icon={<Bell className="w-4 h-4" />} title="Notifications" description="Choose which events trigger in-app notifications." />
        <div className="divide-y divide-zinc-100">
          {NOTIFICATION_OPTIONS.map((o) => (
            <div key={o.type} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-zinc-700">{o.label}</span>
              <Toggle checked={prefs[o.type]} onChange={(on) => setPrefs((prev) => ({ ...prev, [o.type]: on }))} label={o.label} disabled={!prefsLoaded} />
            </div>
          ))}
        </div>
      </SettingsCard>

      {onOpenBilling && (
        <button
          type="button"
          onClick={onOpenBilling}
          className="w-full bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md hover:border-zinc-300"
        >
          <span className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
              <CreditCard className="w-4 h-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Subscription & billing</span>
              <span className="block text-xs text-zinc-500 mt-0.5">Manage your plan and billing cycle.</span>
            </span>
          </span>
          <ChevronDown className="w-4 h-4 text-zinc-400 -rotate-90" />
        </button>
      )}

      <SaveBar saved={saved} label="Save preferences" onSave={save} disabled={!profileLoaded} busy={saving} />
    </div>
  );
}
```

- [ ] **Step 9: Tidy `utils/settings.ts` and the shell.**
- In `apps/web/src/utils/settings.ts`, delete `PLAN_LABELS`, `LANGUAGES` and `NOTIFICATION_KEYS`. Nothing imports them any more; `grep -rn "PLAN_LABELS\|NOTIFICATION_KEYS\|LANGUAGES\b" apps/web/src` must list only `CONTENT_LANGUAGES` and `createStudio`'s own `LANGUAGES`.
- In `apps/web/src/pages/SettingsPage.tsx`, change the Preferences line to:

```tsx
      {activeTab === 'preferences' && (
        <PreferencesTab form={form} onOpenBilling={tabs.some((t) => t.id === 'billing') ? () => selectTab('billing') : undefined} />
      )}
```

- [ ] **Step 10: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1 && grep -rn "sg_notifications\|defaultRadius" apps/web/src`
Expected: pass; build 0; lint 45 or below; the grep prints nothing.

Manual check (`web-local` + `api-verify`):
- Clear `localStorage.themeMode` and reload with the OS in dark mode: the app opens dark (System).
- Preferences → Light: the app turns light at once, and `PUT /v1/users/me/preferences` returns 200.
- Sign out and sign in again in another browser profile: Light is applied after sign-in.
- Content languages: English is disabled but selected, "Default" sits on the first language, and Gujarati and Bengali are offered.
- Turn off "A post is published", then Save preferences: "Saved" shows and a reload keeps the toggle off.
- The "Subscription & billing" row opens the Billing tab. A Creator doesn't see the row.
- There is no boost-radius slider and no approval-workflow card.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/utils/theme.ts apps/web/src/utils/theme.test.ts apps/web/index.html apps/web/src/utils/preferences.ts apps/web/src/utils/preferences.test.ts apps/web/src/services/preferences.ts apps/web/src/components/shell/AppearanceSync.tsx apps/web/src/contexts/DealerProfileContext.tsx apps/web/src/components/settings/useProfileForm.ts apps/web/src/components/settings/PreferencesTab.tsx apps/web/src/utils/settings.ts apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): Preferences tab with synced theme and notification choices; System theme by default

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Team tab, one role vocabulary, and account edit (web)

**Files:**
- Create: `apps/web/src/utils/team.ts` + `apps/web/src/utils/team.test.ts`, `apps/web/src/components/settings/TeamModals.tsx`
- Modify: `apps/web/src/utils/roleLabel.ts` (+ `roleLabel.test.ts`), `apps/web/src/lib/permissions.ts`, `apps/web/src/services/users.ts`, `apps/web/src/components/settings/TeamTab.tsx` (replaced)

**Interfaces:**
- Consumes:
  - Task 3's `PATCH /v1/users/:id/account` and the owner guards.
  - The existing `/users` list, invite, permissions, role, status and delete routes.
  - `Modal`, `ThemedSelect`, `Input`, and Task 6's `SettingsCard` / `StatPill` / `FieldLabel`.
- Produces:
  - `utils/roleLabel.ts`: `ROLE_LABELS: Record<Role, string>` (`owner` Owner, `admin` Manager, `user` Creator) and `roleLabel(role)`. `lib/permissions.ts` re-exports `ROLE_LABELS`.
  - `utils/team.ts`:
    - `ROLE_DESCRIPTIONS`, `type Viewer = { id: string; role: Role } | null`;
    - `assignableRoles(viewer)`, `roleOptions(viewer)`;
    - `canManageMember(viewer, member)`, `isSelf`, `canChangeRole`, `canRemove`;
    - `avatarGradient(seed)`, `initialOf(member)`, `memberName(member)`;
    - `TeamStats`, `teamStats(members)`;
    - `AccountDraft`, `accountDraft(member)`, `accountChanges(member, draft)`.
  - `services/users.ts`: `InviteRequest.role?: Role`, and `userService.updateAccount(id, change: { name?; email?; phone? })`.
  - `TeamModals.tsx`: `InviteModal`, `ChangeRoleModal`, `RemoveMemberModal`, `EditAccountModal`.
  - `TeamTab()`.

This task's copy contains — (`—`) and straight apostrophes in "They'll", "don't" and "…'s". Byte-check them.

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/src/utils/roleLabel.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_LABELS, roleLabel } from './roleLabel.js';

describe('roleLabel', () => {
  it('uses one vocabulary everywhere: Owner, Manager, Creator', () => {
    assert.deepEqual(ROLE_LABELS, { owner: 'Owner', admin: 'Manager', user: 'Creator' });
    assert.equal(roleLabel('user'), 'Creator');
    assert.equal(roleLabel('admin'), 'Manager');
    assert.equal(roleLabel('owner'), 'Owner');
  });

  it('shows unknown roles unchanged', () => {
    assert.equal(roleLabel('auditor'), 'auditor');
  });
});
```

`apps/web/src/utils/team.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TeamMember } from '../services/users';
import {
  accountChanges, accountDraft, assignableRoles, avatarGradient, canChangeRole, canManageMember, canRemove, initialOf, memberName, roleOptions, teamStats,
} from './team.js';

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: 'm1', dealerId: 'd1', phone: '+91 90000 00001', name: 'Asha', role: 'user', permissions: {} as TeamMember['permissions'],
  customPermissions: null, isActive: true, createdAt: '2026-09-01T00:00:00Z', ...over,
});
const manager = { id: 'me', role: 'admin' as const };
const owner = { id: 'boss', role: 'owner' as const };

describe('team helpers', () => {
  it('lets an Owner grant any role and a Manager only Manager or Creator', () => {
    assert.deepEqual(assignableRoles(owner), ['owner', 'admin', 'user']);
    assert.deepEqual(assignableRoles(manager), ['admin', 'user']);
    assert.deepEqual(roleOptions(manager), [{ value: 'admin', label: 'Manager' }, { value: 'user', label: 'Creator' }]);
  });

  it("keeps a Manager's hands off Owners, and nobody acts on themselves", () => {
    assert.equal(canManageMember(manager, member({ role: 'owner' })), false);
    assert.equal(canManageMember(owner, member({ role: 'owner' })), true);
    assert.equal(canChangeRole(manager, member({ id: 'me', role: 'admin' })), false);
    assert.equal(canChangeRole(manager, member({ role: 'user' })), true);
    assert.equal(canRemove(owner, member({ role: 'owner' })), false);
    assert.equal(canRemove(manager, member({ id: 'me' })), false);
    assert.equal(canRemove(manager, member({})), true);
  });

  it('builds avatars and names', () => {
    assert.match(avatarGradient('Asha'), /^from-[a-z]+-400 to-[a-z]+-600$/);
    assert.equal(avatarGradient('Asha'), avatarGradient('Asha'));
    assert.equal(initialOf(member({ name: '' })), '+');
    assert.equal(memberName(member({ name: '  ' })), 'Unnamed');
  });

  it('counts the team', () => {
    const stats = teamStats([member({ role: 'owner' }), member({ role: 'admin' }), member({ role: 'user', isActive: false }), member({ role: 'user' })]);
    assert.deepEqual(stats, { members: 4, owners: 1, managers: 1, creators: 2, active: 3 });
  });

  it('sends only the account fields that changed', () => {
    const m = member({ name: 'Asha', email: 'asha@example.com' });
    assert.equal(accountChanges(m, accountDraft(m)), null);
    assert.deepEqual(accountChanges(m, { name: ' Asha K ', email: 'asha@example.com', phone: m.phone }), { name: 'Asha K' });
    assert.deepEqual(accountChanges(m, { name: 'Asha', email: '', phone: '+91 90000 00009' }), { email: '', phone: '+91 90000 00009' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web`
Expected: FAIL. `ROLE_LABELS` is not exported from `roleLabel`, and `./team.js` cannot be resolved.

- [ ] **Step 3: Replace `apps/web/src/utils/roleLabel.ts`**

```ts
import type { Role } from '../lib/permissions';

/** The one role vocabulary: sidebar badge, Team tab and invites. */
export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Manager', user: 'Creator' };

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
```

In `apps/web/src/lib/permissions.ts`, replace the whole `export const ROLE_LABELS: Record<Role, string> = { … };` block with:

```ts
// One vocabulary for roles (Owner, Manager, Creator): utils/roleLabel.ts.
export { ROLE_LABELS } from '../utils/roleLabel';
```

- [ ] **Step 4: `apps/web/src/utils/team.ts`**

```ts
import type { Role } from '../lib/permissions';
import type { TeamMember } from '../services/users';
import { ROLE_LABELS } from './roleLabel.js';

/**
 * Role helper text in the invite and change-role dialogs. Owner and Creator are the reference's
 * words. Manager is rewritten because our Managers hold every permission.
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access — billing, settings, posting, analytics.',
  admin: 'Manager — full access to posting, approvals, inbox, analytics, billing and the team.',
  user: 'Creator — makes and schedules posts; submits for approval.',
};

export type Viewer = { id: string; role: Role } | null;

/** An Owner may grant owner, admin or user; a Manager admin or user. The API enforces the owner rule too. */
export function assignableRoles(viewer: Viewer): Role[] {
  return viewer?.role === 'owner' ? ['owner', 'admin', 'user'] : ['admin', 'user'];
}

export function roleOptions(viewer: Viewer): Array<{ value: Role; label: string }> {
  return assignableRoles(viewer).map((role) => ({ value: role, label: ROLE_LABELS[role] }));
}

/** A Manager can't edit or re-role an Owner (PATCH /users/:id/account and /role answer 403). */
export function canManageMember(viewer: Viewer, member: Pick<TeamMember, 'role'>): boolean {
  return !!viewer && (member.role !== 'owner' || viewer.role === 'owner');
}

export function isSelf(viewer: Viewer, member: Pick<TeamMember, 'id'>): boolean {
  return viewer?.id === member.id;
}

export function canChangeRole(viewer: Viewer, member: Pick<TeamMember, 'id' | 'role'>): boolean {
  return !isSelf(viewer, member) && canManageMember(viewer, member);
}

/** Owners are never removed from this screen, and nobody removes themselves (as in the reference). */
export function canRemove(viewer: Viewer, member: Pick<TeamMember, 'id' | 'role'>): boolean {
  return !isSelf(viewer, member) && member.role !== 'owner';
}

const GRADIENTS = [
  'from-orange-400 to-orange-600', 'from-blue-400 to-blue-600', 'from-emerald-400 to-emerald-600', 'from-violet-400 to-violet-600',
  'from-rose-400 to-rose-600', 'from-amber-400 to-amber-600', 'from-teal-400 to-teal-600', 'from-fuchsia-400 to-fuchsia-600',
] as const;

/** The same colour for the same person every time. */
export function avatarGradient(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length]!;
}

export function initialOf(member: Pick<TeamMember, 'name' | 'phone'>): string {
  return (member.name?.trim() || member.phone || '?').charAt(0).toUpperCase();
}

export function memberName(member: Pick<TeamMember, 'name'>): string {
  return member.name?.trim() || 'Unnamed';
}

export interface TeamStats { members: number; owners: number; managers: number; creators: number; active: number }

export function teamStats(members: ReadonlyArray<Pick<TeamMember, 'role' | 'isActive'>>): TeamStats {
  return {
    members: members.length,
    owners: members.filter((m) => m.role === 'owner').length,
    managers: members.filter((m) => m.role === 'admin').length,
    creators: members.filter((m) => m.role === 'user').length,
    active: members.filter((m) => m.isActive).length,
  };
}

export interface AccountDraft { name: string; email: string; phone: string }

export function accountDraft(member: Pick<TeamMember, 'name' | 'email' | 'phone'>): AccountDraft {
  return { name: member.name ?? '', email: member.email ?? '', phone: member.phone };
}

/** Only the fields that changed (trimmed); null when nothing did. An empty email clears it. */
export function accountChanges(member: Pick<TeamMember, 'name' | 'email' | 'phone'>, draft: AccountDraft): { name?: string; email?: string; phone?: string } | null {
  const out: { name?: string; email?: string; phone?: string } = {};
  const name = draft.name.trim();
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  if (name !== (member.name ?? '').trim()) out.name = name;
  if (email !== (member.email ?? '').trim()) out.email = email;
  if (phone !== member.phone.trim()) out.phone = phone;
  return Object.keys(out).length ? out : null;
}
```

- [ ] **Step 5: `apps/web/src/services/users.ts`.**
- Change `role?: 'admin' | 'user';` in `InviteRequest` to `role?: Role;`.
- Add to `userService`, after `setActive`:

```ts
  // PATCH /users/:id/account — name, email or phone (we sign in by phone OTP; there are no passwords).
  updateAccount: (id: string, change: { name?: string; email?: string; phone?: string }) =>
    api.patch<{ user: TeamMember }>(`/users/${id}/account`, change),
```

- [ ] **Step 6: `apps/web/src/components/settings/TeamModals.tsx`**

```tsx
import { useState, type ChangeEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { ThemedSelect } from '../ui/ThemedSelect';
import type { Role } from '../../lib/permissions';
import type { TeamMember } from '../../services/users';
import { ROLE_DESCRIPTIONS, accountDraft, memberName, type AccountDraft } from '../../utils/team';
import { FieldLabel } from './SettingsParts';

type RoleOption = { value: Role; label: string };

export function InviteModal({ busy, roles, onClose, onInvite }: {
  busy: boolean;
  roles: RoleOption[];
  onClose: () => void;
  onInvite: (input: { phone: string; name: string; role: Role }) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user');
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Invite a team member"
      description="They'll get access to your dealership with the role you choose."
      size="md"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onInvite({ phone: phone.trim(), name: name.trim(), role })} disabled={!phone.trim() || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Sending…' : 'Send invite'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="invite-phone">Phone number *</FieldLabel>
            <Input id="invite-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <FieldLabel htmlFor="invite-name">Name (optional)</FieldLabel>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
          </div>
        </div>
        <div>
          <FieldLabel>Role</FieldLabel>
          <ThemedSelect value={role} onChange={(v) => setRole(v as Role)} options={roles} ariaLabel="Role" />
          <p className="text-xs text-zinc-500 mt-1.5">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
      </div>
    </Modal>
  );
}

export function ChangeRoleModal({ member, roles, busy, onClose, onSave }: {
  member: TeamMember;
  roles: RoleOption[];
  busy: boolean;
  onClose: () => void;
  onSave: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Change role"
      description={`Update the role for ${member.name?.trim() || member.phone}.`}
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSave(role)} disabled={role === member.role || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save role
          </Button>
        </>
      )}
    >
      <FieldLabel>Role</FieldLabel>
      <ThemedSelect value={role} onChange={(v) => setRole(v as Role)} options={roles} ariaLabel="Role" />
      <p className="text-xs text-zinc-500 mt-1.5">{ROLE_DESCRIPTIONS[role]}</p>
    </Modal>
  );
}

export function RemoveMemberModal({ member, busy, onClose, onConfirm }: {
  member: TeamMember;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = memberName(member);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Remove team member?"
      description={`${name} will lose access to this dealership immediately.`}
      variant="danger"
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Remove user
          </Button>
        </>
      )}
    >
      <p className="text-sm text-zinc-600">
        This will revoke all permissions for <strong className="text-zinc-900">{name}</strong> ({member.phone}). This action cannot be undone.
      </p>
    </Modal>
  );
}

// The reference edited email and password; we sign in by phone OTP, so an account is name, email and phone.
export function EditAccountModal({ member, busy, onClose, onSave }: {
  member: TeamMember;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: AccountDraft) => void;
}) {
  const [draft, setDraft] = useState<AccountDraft>(() => accountDraft(member));
  const who = member.name?.trim() || member.phone;
  const field = (key: keyof AccountDraft) => (e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit member account"
      description={`Update ${who}'s name, email or phone number.`}
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400">Changing the phone number changes how {member.name?.trim() || 'the user'} signs in.</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => onSave(draft)} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-3">
        <div>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input id="account-name" value={draft.name} onChange={field('name')} placeholder="John Doe" />
        </div>
        <div>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <Input id="account-email" type="email" autoComplete="off" value={draft.email} onChange={field('email')} placeholder="name@company.com" />
        </div>
        <div>
          <FieldLabel htmlFor="account-phone">Phone number</FieldLabel>
          <Input id="account-phone" value={draft.phone} onChange={field('phone')} placeholder="+91 98765 43210" />
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 7: Replace `apps/web/src/components/settings/TeamTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, Power, Shield, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../services/api';
import { userService, type TeamMember } from '../../services/users';
import { CONFIGURABLE_PERMISSIONS, isAtLeast, type Role } from '../../lib/permissions';
import { roleLabel } from '../../utils/roleLabel';
import {
  accountChanges, avatarGradient, canChangeRole, canManageMember, canRemove, initialOf, isSelf, memberName, roleOptions, teamStats,
  type AccountDraft,
} from '../../utils/team';
import { SettingsCard, StatPill } from './SettingsParts';
import { ChangeRoleModal, EditAccountModal, InviteModal, RemoveMemberModal } from './TeamModals';

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  admin: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  user: 'bg-zinc-100 text-zinc-600',
};
const PILL = 'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';
const ACTION = 'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors';
const ICON = 'grid place-items-center w-8 h-8 rounded-lg transition-colors';

function MemberSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200/80 p-4">
      <div className="w-9 h-9 rounded-full bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-24 rounded bg-zinc-100 animate-pulse" />
      </div>
      <div className="w-8 h-8 rounded-lg bg-zinc-100 animate-pulse" />
      <div className="w-8 h-8 rounded-lg bg-zinc-100 animate-pulse" />
    </div>
  );
}

export function TeamTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canManage = isAtLeast(user, 'admin');
  const viewer = user ? { id: user.id, role: user.role } : null;
  const roles = roleOptions(viewer);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [roleTarget, setRoleTarget] = useState<TeamMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [accountTarget, setAccountTarget] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    userService.list()
      .then((res) => { if (!cancelled) setMembers(res.users); })
      .catch(() => { if (!cancelled) addToast({ type: 'error', title: 'Error', message: 'Failed to load team members' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [canManage, addToast]);

  const replace = (updated: TeamMember) => setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

  const invite = async (input: { phone: string; name: string; role: Role }) => {
    setInviting(true);
    try {
      const res = await userService.invite({ phone: input.phone, ...(input.name ? { name: input.name } : {}), role: input.role });
      setMembers((prev) => [...prev, res.user]);
      setShowInvite(false);
      addToast({ type: 'success', title: 'Success', message: 'User invited successfully' });
    } catch (err) {
      const known = err instanceof ApiError && (err.status === 409 || err.status === 403);
      addToast({ type: 'error', title: 'Error', message: known ? err.message : 'Failed to invite user' });
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (member: TeamMember) => {
    try {
      const res = await userService.setActive(member.id, !member.isActive);
      replace(res.user);
      addToast({ type: 'success', title: 'Success', message: `User ${res.user.isActive ? 'activated' : 'deactivated'}` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user status' });
    }
  };

  const savePermissions = async (member: TeamMember) => {
    const perms = pendingPerms[member.id];
    if (!perms) return;
    try {
      const res = await userService.updatePermissions(member.id, perms);
      replace(res.user);
      setPendingPerms((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      addToast({ type: 'success', title: 'Success', message: 'Permissions updated' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update permissions' });
    }
  };

  const changeRole = async (role: Role) => {
    if (!roleTarget) return;
    setBusy(true);
    try {
      const res = await userService.updateRole(roleTarget.id, role);
      replace(res.user);
      setRoleTarget(null);
      addToast({ type: 'success', title: 'Role updated', message: `${memberName(res.user)} is now ${roleLabel(res.user.role)}` });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Could not change role',
        message: err instanceof ApiError && err.status === 403 ? "You don't have permission for that role change." : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await userService.remove(removeTarget.id);
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      setRemoveTarget(null);
      addToast({ type: 'success', title: 'Success', message: 'User removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove user' });
    } finally {
      setBusy(false);
    }
  };

  const saveAccount = async (draft: AccountDraft) => {
    if (!accountTarget) return;
    const change = accountChanges(accountTarget, draft);
    if (!change) {
      addToast({ type: 'info', title: 'Nothing changed' });
      return;
    }
    setBusy(true);
    try {
      const res = await userService.updateAccount(accountTarget.id, change);
      replace(res.user);
      setAccountTarget(null);
      addToast({ type: 'success', title: 'Account updated' });
    } catch (err) {
      addToast({ type: 'error', title: 'Could not update', message: err instanceof Error && err.message ? err.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const stats = teamStats(members);

  return (
    <div className="space-y-4">
      <SettingsCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Team</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Manage who can access your dealership and what they can do.</p>
          </div>
          <Button onClick={() => setShowInvite(true)}><UserPlus className="w-4 h-4" /> Invite member</Button>
        </div>
        {members.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <StatPill value={stats.members} label="Members" />
            <StatPill value={stats.owners} label="Owners" />
            <StatPill value={stats.managers} label="Managers" />
            <StatPill value={stats.creators} label="Creators" />
            <StatPill value={stats.active} label="Active" />
          </div>
        )}
      </SettingsCard>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <MemberSkeleton key={i} />)}</div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 bg-white rounded-2xl border border-dashed border-zinc-200">
          <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3"><Users className="w-5 h-5" /></div>
          <p className="text-sm font-semibold text-zinc-800">No team members yet</p>
          <p className="text-xs text-zinc-500 mt-1">Invite someone to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden">
          {members.map((member) => {
            const self = isSelf(viewer, member);
            const open = expanded === member.id && member.role === 'user';
            return (
              <div key={member.id}>
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                  <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold flex-shrink-0', avatarGradient(member.name || member.phone), !member.isActive && 'grayscale opacity-60')}>
                    {initialOf(member)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{memberName(member)}</p>
                      {self && <span className={cn(PILL, 'bg-orange-50 text-orange-700 ring-1 ring-orange-100')}>You</span>}
                      <span className={cn(PILL, ROLE_BADGE[member.role] ?? ROLE_BADGE.user)}>{roleLabel(member.role)}</span>
                      {!member.isActive && <span className={cn(PILL, 'bg-red-50 text-red-600 ring-1 ring-red-100')}>Inactive</span>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{member.phone}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {member.role === 'user' && (
                      <button type="button" onClick={() => setExpanded(open ? null : member.id)} aria-expanded={open} className={ACTION}>
                        <SlidersHorizontal className="w-4 h-4" />
                        <span className="hidden sm:inline">Permissions</span>
                        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {canManageMember(viewer, member) && (
                      <button type="button" onClick={() => setAccountTarget(member)} className={ACTION}>
                        <KeyRound className="w-4 h-4" />
                        <span className="hidden sm:inline">Account</span>
                      </button>
                    )}
                    {canChangeRole(viewer, member) && (
                      <button type="button" onClick={() => setRoleTarget(member)} className={ACTION}>
                        <Shield className="w-4 h-4" />
                        <span className="hidden sm:inline">Role</span>
                      </button>
                    )}
                    {!self && (
                      <button
                        type="button"
                        onClick={() => void toggleActive(member)}
                        title={member.isActive ? 'Deactivate' : 'Activate'}
                        aria-label={`${member.isActive ? 'Deactivate' : 'Activate'} ${memberName(member)}`}
                        className={cn(ICON, member.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100')}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    )}
                    {canRemove(viewer, member) && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(member)}
                        title="Remove"
                        aria-label={`Remove ${memberName(member)}`}
                        className={cn(ICON, 'text-zinc-400 hover:text-red-600 hover:bg-red-50')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="px-4 sm:px-5 pb-4 pt-3 bg-zinc-50/60 border-t border-zinc-100">
                    <p className="text-[11px] font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Custom permissions</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {CONFIGURABLE_PERMISSIONS.map((perm) => {
                        const checked = pendingPerms[member.id]?.[perm.key] ?? member.permissions[perm.key] ?? false;
                        return (
                          <label key={perm.key} className={cn('flex items-start gap-3 cursor-pointer rounded-xl border p-3', checked ? 'border-orange-200 bg-orange-50/50' : 'border-zinc-200 bg-white hover:border-zinc-300')}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setPendingPerms((prev) => ({ ...prev, [member.id]: { ...(prev[member.id] ?? member.permissions), [perm.key]: e.target.checked } }))}
                              className="w-4 h-4 accent-orange-600 mt-0.5 flex-shrink-0"
                            />
                            <span>
                              <span className="block text-sm font-medium text-zinc-800">{perm.label}</span>
                              <span className="block text-xs text-zinc-400 mt-0.5">{perm.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <Button className="mt-3" disabled={!pendingPerms[member.id]} onClick={() => void savePermissions(member)}>Save permissions</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showInvite && <InviteModal busy={inviting} roles={roles} onClose={() => setShowInvite(false)} onInvite={(input) => void invite(input)} />}
      {roleTarget && <ChangeRoleModal member={roleTarget} roles={roles} busy={busy} onClose={() => setRoleTarget(null)} onSave={(role) => void changeRole(role)} />}
      {removeTarget && <RemoveMemberModal member={removeTarget} busy={busy} onClose={() => setRemoveTarget(null)} onConfirm={() => void remove()} />}
      {accountTarget && <EditAccountModal member={accountTarget} busy={busy} onClose={() => setAccountTarget(null)} onSave={(draft) => void saveAccount(draft)} />}
    </div>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1 && grep -rn "Product Owner\|ROLE_LABELS\[member" apps/web/src`
Expected:
- Tests pass, the build exits 0, and lint is at 45 or below.
- The grep prints nothing: the old "Product Owner"/"Admin"/"User" map is gone, and the Team tab labels roles through `roleLabel`.

Manual check (`web-local` + `api-verify`, signed in as the local Manager):
- Team shows the header, the stat pills, and badges (Manager in blue, Creator in zinc).
- Invite offers Manager and Creator with the helper text. "Send invite" becomes "Sending…" and the row appears.
- On a Creator row:
  - "Permissions" opens the checkbox cards, and "Save permissions" enables after a change.
  - "Account" edits the name, email and phone. With nothing changed you get "Nothing changed". A duplicate phone gives "This phone number is already in use".
  - "Role" changes a Creator to a Manager, with the toast "… is now Manager".
- The trash icon opens "Remove team member?".
- Your own row has no Role, Activate or Remove.
- The sidebar badge still reads "Manager".

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/utils/roleLabel.ts apps/web/src/utils/roleLabel.test.ts apps/web/src/lib/permissions.ts apps/web/src/utils/team.ts apps/web/src/utils/team.test.ts apps/web/src/services/users.ts apps/web/src/components/settings/TeamModals.tsx apps/web/src/components/settings/TeamTab.tsx
git commit -m "feat(web): Team tab with invite, roles, permissions and account edit; one role vocabulary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Inspiration tab (web)

**Files:**
- Create: `apps/web/src/utils/inspiration.ts` + `apps/web/src/utils/inspiration.test.ts`
- Modify: `apps/web/src/components/settings/InspirationTab.tsx` (replaced)

**Interfaces:**
- Consumes:
  - The existing handles API: `GET/POST /v1/dealer/inspiration-handles`, `POST /:id/refresh`, `DELETE /:id`. POST upserts by URL.
  - `InspirationHandle` (`utils/settings.ts`); Task 6's parts; `Modal`, `ThemedSelect`, `Input`, `PlatformIcon`.
- Produces:
  - `utils/inspiration.ts`: `type InspirationPlatform`, `INSPIRATION_PLATFORMS`, `postsLearned(handle)`, `interface InspirationStats { references; facebook; instagram; postsLearned }`, `inspirationStats(handles)`, `referencePlaceholder(platform)`, `handleTitle(handle)`.
  - `InspirationTab()`.

This task's copy contains — and … (`— …`). Byte-check them.

- [ ] **Step 1: Write the failing test** `apps/web/src/utils/inspiration.test.ts`

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InspirationHandle } from './settings.js';
import { handleTitle, inspirationStats, postsLearned, referencePlaceholder } from './inspiration.js';

const handle = (over: Partial<InspirationHandle>): InspirationHandle => ({
  id: 'h1', platform: 'facebook', handle_url: 'https://www.facebook.com/example', handle_name: null,
  posts_cache: null, last_scraped_at: null, created_at: '2026-09-01T00:00:00Z', ...over,
});

describe('inspiration references', () => {
  it('counts the posts learned from a page', () => {
    assert.equal(postsLearned(handle({ posts_cache: ['a', 'b'] })), 2);
    assert.equal(postsLearned(handle({ posts_cache: null })), 0);
  });

  it('rolls up the stat pills', () => {
    const stats = inspirationStats([
      handle({ id: 'a', posts_cache: ['1', '2', '3'] }),
      handle({ id: 'b' }),
      handle({ id: 'c', platform: 'instagram', posts_cache: ['1', '2'] }),
    ]);
    assert.deepEqual(stats, { references: 3, facebook: 2, instagram: 1, postsLearned: 5 });
  });

  it('names a reference by its display name, else its URL', () => {
    assert.equal(handleTitle(handle({ handle_name: '  Maruti Suzuki  ' })), 'Maruti Suzuki');
    assert.equal(handleTitle(handle({ handle_name: ' ' })), 'https://www.facebook.com/example');
  });

  it('suggests a URL for the chosen platform', () => {
    assert.equal(referencePlaceholder('facebook'), 'https://www.facebook.com/yourreference');
    assert.equal(referencePlaceholder('instagram'), 'https://www.instagram.com/yourreference');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web`
Expected: FAIL. `./inspiration.js` cannot be resolved.

- [ ] **Step 3: `apps/web/src/utils/inspiration.ts`**

```ts
import type { InspirationHandle } from './settings.js';

export type InspirationPlatform = 'facebook' | 'instagram';

export const INSPIRATION_PLATFORMS: Array<{ value: InspirationPlatform; label: string }> = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

export function postsLearned(handle: Pick<InspirationHandle, 'posts_cache'>): number {
  return Array.isArray(handle.posts_cache) ? handle.posts_cache.length : 0;
}

export interface InspirationStats { references: number; facebook: number; instagram: number; postsLearned: number }

export function inspirationStats(handles: ReadonlyArray<Pick<InspirationHandle, 'platform' | 'posts_cache'>>): InspirationStats {
  return {
    references: handles.length,
    facebook: handles.filter((h) => h.platform === 'facebook').length,
    instagram: handles.filter((h) => h.platform === 'instagram').length,
    postsLearned: handles.reduce((sum, h) => sum + postsLearned(h), 0),
  };
}

export function referencePlaceholder(platform: InspirationPlatform): string {
  return platform === 'instagram' ? 'https://www.instagram.com/yourreference' : 'https://www.facebook.com/yourreference';
}

export function handleTitle(handle: Pick<InspirationHandle, 'handle_name' | 'handle_url'>): string {
  return handle.handle_name?.trim() || handle.handle_url;
}
```

- [ ] **Step 4: Replace `apps/web/src/components/settings/InspirationTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link2, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PlatformIcon } from '../ui/PlatformIcon';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import type { InspirationHandle } from '../../utils/settings';
import { INSPIRATION_PLATFORMS, handleTitle, inspirationStats, postsLearned, referencePlaceholder, type InspirationPlatform } from '../../utils/inspiration';
import { FieldLabel, SettingsCard, StatPill } from './SettingsParts';

const PILL = 'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';
const ICON = 'grid place-items-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50';

function HandleSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
      <div className="w-10 h-10 rounded-lg bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-56 rounded bg-zinc-100 animate-pulse" />
      </div>
    </div>
  );
}

function AddReferenceModal({ busy, onClose, onAdd }: {
  busy: boolean;
  onClose: () => void;
  onAdd: (input: { url: string; platform: InspirationPlatform; name: string }) => void;
}) {
  const [platform, setPlatform] = useState<InspirationPlatform>('facebook');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add an inspiration reference"
      description="The AI learns this page's posting style to inspire your content."
      size="md"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onAdd({ url: url.trim(), platform, name: name.trim() })} disabled={!url.trim() || busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Adding…' : 'Add reference'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <FieldLabel>Platform</FieldLabel>
            <ThemedSelect value={platform} onChange={(v) => setPlatform(v as InspirationPlatform)} options={INSPIRATION_PLATFORMS} ariaLabel="Platform" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="reference-url">Page URL</FieldLabel>
            <Input id="reference-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={referencePlaceholder(platform)} />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="reference-name">Display name (optional)</FieldLabel>
          <Input id="reference-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brand or page name" />
        </div>
      </div>
    </Modal>
  );
}

export function InspirationTab() {
  const { addToast } = useToast();
  const [handles, setHandles] = useState<InspirationHandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<InspirationHandle | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<{ success: boolean; handles: InspirationHandle[] }>('/dealer/inspiration-handles')
      .then((res) => { if (!cancelled) setHandles(res.handles); })
      .catch(() => { if (!cancelled) addToast({ type: 'error', title: 'Error', message: 'Failed to load inspiration handles' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [addToast]);

  const add = async (input: { url: string; platform: InspirationPlatform; name: string }) => {
    setAdding(true);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle }>('/dealer/inspiration-handles', {
        handle_url: input.url,
        platform: input.platform,
        ...(input.name ? { handle_name: input.name } : {}),
      });
      // The API upserts by URL, so re-adding a page replaces its row.
      setHandles((prev) => [res.handle, ...prev.filter((h) => h.id !== res.handle.id)]);
      setShowAdd(false);
      addToast({ type: 'success', title: 'Success', message: 'Reference added — analysing posts in background' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add handle' });
    } finally {
      setAdding(false);
    }
  };

  const refresh = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await api.post<{ success: boolean; handle: InspirationHandle; posts_found: number }>(`/dealer/inspiration-handles/${id}/refresh`);
      setHandles((prev) => prev.map((h) => (h.id === id ? res.handle : h)));
      addToast({ type: 'success', title: 'Success', message: `Scraped ${res.posts_found} posts` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to refresh handle' });
    } finally {
      setRefreshingId(null);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/dealer/inspiration-handles/${removeTarget.id}`);
      setHandles((prev) => prev.filter((h) => h.id !== removeTarget.id));
      setRemoveTarget(null);
      addToast({ type: 'success', title: 'Success', message: 'Handle removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove handle' });
    } finally {
      setRemoving(false);
    }
  };

  const stats = inspirationStats(handles);

  return (
    <div className="space-y-4">
      <SettingsCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Inspiration references</h2>
              <p className="text-xs text-zinc-500 mt-0.5 max-w-xl">
                Add Facebook or Instagram pages you admire. The AI studies their posts and uses them as inspiration when writing your captions and designing creatives.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add reference</Button>
        </div>
        {handles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <StatPill value={stats.references} label="References" />
            <StatPill value={stats.facebook} label="Facebook" />
            <StatPill value={stats.instagram} label="Instagram" />
            <StatPill value={stats.postsLearned} label="Posts learned" />
          </div>
        )}
      </SettingsCard>

      {loading ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden">
          <HandleSkeleton />
          <HandleSkeleton />
        </div>
      ) : handles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 bg-white rounded-2xl border border-dashed border-zinc-200">
          <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3"><Link2 className="w-5 h-5" /></div>
          <p className="text-sm font-semibold text-zinc-800">No references yet</p>
          <p className="text-xs text-zinc-500 mt-1">Add a page you admire and the AI will learn from it.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add reference</Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden">
          {handles.map((h) => {
            const count = postsLearned(h);
            const instagram = h.platform === 'instagram';
            return (
              <div key={h.id} className="flex items-start gap-3 px-4 sm:px-5 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center flex-shrink-0">
                  <PlatformIcon platform={instagram ? 'instagram' : 'facebook'} size="md" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{handleTitle(h)}</p>
                    <span className={cn(PILL, instagram ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-100' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100')}>
                      {instagram ? 'Instagram' : 'Facebook'}
                    </span>
                    {count > 0
                      ? <span className={cn(PILL, 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100')}>{count} post{count === 1 ? '' : 's'} learned</span>
                      : <span className="text-[11px] text-zinc-400">Not analysed yet</span>}
                  </div>
                  <a href={h.handle_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-zinc-500 hover:text-orange-600 mt-0.5">
                    {h.handle_url}
                  </a>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => void refresh(h.id)}
                    disabled={refreshingId === h.id}
                    title="Re-analyse"
                    aria-label={`Re-analyse ${handleTitle(h)}`}
                    className={cn(ICON, 'text-zinc-400 hover:text-orange-600 hover:bg-zinc-100')}
                  >
                    <RefreshCw className={cn('w-4 h-4', refreshingId === h.id && 'animate-spin')} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(h)}
                    title="Remove"
                    aria-label={`Remove ${handleTitle(h)}`}
                    className={cn(ICON, 'text-zinc-400 hover:text-red-600 hover:bg-red-50')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddReferenceModal busy={adding} onClose={() => setShowAdd(false)} onAdd={(input) => void add(input)} />}
      {removeTarget && (
        <Modal
          isOpen
          onClose={() => { if (!removing) setRemoveTarget(null); }}
          title="Remove inspiration handle?"
          variant="danger"
          size="sm"
          closeOnOverlayClick={!removing}
          closeOnEscape={!removing}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</Button>
              <Button variant="danger" onClick={() => void remove()} disabled={removing}>
                {removing && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove handle
              </Button>
            </>
          )}
        >
          <p className="text-sm text-zinc-600">
            The handle <strong className="text-zinc-900">{handleTitle(removeTarget)}</strong> and its cached posts will be permanently removed.
          </p>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm test -w web && npm run build -w web && npm run lint -w web 2>/dev/null | tail -1`
Expected: pass; build 0; lint 45 or below.

Manual check (`web-local` + `api-verify`), on the Inspiration tab:
- An empty dealership shows "No references yet" with the button.
- "Add reference" opens the modal. The placeholder follows the platform, and the button reads "Adding…" while saving.
- The row appears with a "Facebook" pill and "Not analysed yet", and the stat pills show.
- The refresh icon spins and toasts "Scraped N posts".
- The trash icon opens "Remove inspiration handle?", and "Remove handle" removes the row.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/inspiration.ts apps/web/src/utils/inspiration.test.ts apps/web/src/components/settings/InspirationTab.tsx
git commit -m "feat(web): Inspiration tab in the reference layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Boost: post details on campaigns (API) and the reference page (web)

**Files:**
- Create: `apps/api/src/lib/boostView.ts`, `apps/api/test/boost.test.ts`, `apps/web/src/utils/boost.ts` + `apps/web/src/utils/boost.test.ts`, `apps/web/src/components/boost/BoostParts.tsx`, `apps/web/src/components/boost/BoostWizard.tsx`
- Modify: `apps/api/src/routes/boost.ts`, `apps/api/test/security-routes.test.ts`, `apps/web/src/services/boost.ts`, `apps/web/src/pages/Boost.tsx` (replaced)

**Interfaces:**
- Consumes:
  - `postLabel` (`lib/approvals.ts`) and `firstCreativeUrl` (`lib/inboxView.ts`).
  - `postService.list` (web); `rupees` (Task 9 `utils/billing.ts`).
  - `PageCard` / `PageHeader`, `Modal`, `PlanGatedNotice`, `can`, `useDealerProfile().profile.city`.
- Produces (API):
  - `lib/boostView.ts`:
    - `BOOST_MIN_DAILY_BUDGET = 200`, `BOOST_MAX_DAILY_BUDGET = 1_000_000`, `BOOST_MAX_DAYS = 90`;
    - `type BoostPostSource`, `interface BoostPostSummary { id; title; thumbnail? }`, `boostPostSummary(post)`;
    - `mapCampaign(c, post?)`;
    - `reachEstimate(dailyBudget) → { minReach, maxReach }` (per day);
    - `interface BoostCreate`, `parseBoostCreate(body)`.
  - HTTP:
    - `GET /v1/boost` items (and `GET /:id`, and the create response) gain `post?: { id, title, thumbnail? }`, only for the dealership's own posts.
    - `stats.campaignsThisMonth`.
    - `POST /v1/boost` → 400 `INVALID_INPUT` (budget under ₹200, not a whole number, days outside 1–90, bad targeting) or 404 `POST_NOT_FOUND`.
    - `POST /v1/boost/reach-estimate` → 400 `INVALID_INPUT` unless `dailyBudget` is a positive number.
- Produces (web):
  - `services/boost.ts`: `BoostStats.campaignsThisMonth`, `getReachEstimate(dailyBudget)`.
  - `utils/boost.ts`:
    - `type CampaignStatus`, `type BoostTab`, `interface Audience`;
    - `BUDGET_PRESETS`, `DURATION_PRESETS`, `MIN_DAILY_BUDGET`, `WIZARD_STEPS`, `DEFAULT_AUDIENCE`;
    - `inTab`, `daysLeft`, `scheduleLine`, `totalBudget`, `spendBar`, `campaignMetrics`, `avgCtr`, `campaignsLine`, `reachLine`, `audienceSummary`;
    - `effectiveBudget`, `budgetValid`, `targetingFor`.
  - `BoostParts.tsx`: `BoostStatCards`, `CampaignCard`, `CampaignSkeleton`, `EmptyCampaigns`, `StopCampaignModal`.
  - `BoostWizard.tsx`: `BoostWizard`, `interface BoostLaunch`.

This task's code contains ₹ — – · … ’ & (`₹ — – · … ’`). Byte-check them.

- [ ] **Step 1: Write the failing API test** `apps/api/test/boost.test.ts`

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { boostPostSummary, parseBoostCreate, reachEstimate } from '../src/lib/boostView.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

// Boost is gated for Starter: every dealer here is on Growth.
async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Boost Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const newPost = (dealerId: string, creative_urls?: Record<string, string>) => prisma.post.create({
  data: { dealer_id: dealerId, prompt_text: 'Creta festive offer', caption_hashtags: [], platforms: ['facebook'], ...(creative_urls ? { creative_urls } : {}) },
});

const create = (dealerId: string, payload: object) => fastify.inject({ method: 'POST', url: '/v1/boost', headers: headers(dealerId), payload });

describe('boostView', () => {
  it('summarises the boosted post', () => {
    assert.deepEqual(
      boostPostSummary({ id: 'p1', prompt_text: 'Creta festive offer', thumbnail_url: null, creative_urls: { facebook: 'https://cdn.example/creta.png' } }),
      { id: 'p1', title: 'Creta festive offer', thumbnail: 'https://cdn.example/creta.png' },
    );
    assert.deepEqual(boostPostSummary({ id: 'p2', prompt_text: '', thumbnail_url: null, creative_urls: null }), { id: 'p2', title: 'Untitled post' });
  });

  it('estimates reach per day from the budget', () => {
    assert.deepEqual(reachEstimate(1000), { minReach: 12000, maxReach: 20000 });
  });

  it('validates a new boost', () => {
    assert.deepEqual(parseBoostCreate({ postId: 'p1', dailyBudget: 500, durationDays: 7 }), {
      ok: true, value: { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: {} },
    });
    const bad: unknown[] = [
      null,
      { dailyBudget: 500, durationDays: 7 },
      { postId: 'p1', dailyBudget: 150, durationDays: 7 },
      { postId: 'p1', dailyBudget: 500.5, durationDays: 7 },
      { postId: 'p1', dailyBudget: 500, durationDays: 0 },
      { postId: 'p1', dailyBudget: 500, durationDays: 91 },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: [] },
    ];
    for (const body of bad) assert.equal(parseBoostCreate(body).ok, false, JSON.stringify(body));
  });
});

describe('GET /v1/boost', () => {
  it('lists campaigns with the boosted post, drafts included, and counts this month', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId, { facebook: 'https://cdn.example/creta.png' });
    await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: post.id, daily_budget: 500, duration_days: 3, status: 'draft' } });

    const res = await fastify.inject({ method: 'GET', url: '/v1/boost', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { items: Array<{ status: string; post?: unknown }>; stats: { campaignsThisMonth: number } };
    assert.equal(body.items[0]?.status, 'draft');
    assert.deepEqual(body.items[0]?.post, { id: post.id, title: 'Creta festive offer', thumbnail: 'https://cdn.example/creta.png' });
    assert.equal(body.stats.campaignsThisMonth, 1);
  });

  it("never shows another dealership's post", async () => {
    const dealerId = await newDealer();
    const foreign = await newPost(await newDealer());
    await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: foreign.id, daily_budget: 500, duration_days: 3, status: 'active' } });
    const body = (await fastify.inject({ method: 'GET', url: '/v1/boost', headers: headers(dealerId) })).json() as { items: Array<{ post?: unknown }> };
    assert.equal(body.items[0]?.post, undefined);
  });
});

describe('POST /v1/boost', () => {
  it("records a boost for the dealership's own post", async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    const res = await create(dealerId, { postId: post.id, dailyBudget: 1000, durationDays: 7, targeting: { gender: 'female' } });
    assert.equal(res.statusCode, 201, res.body);
    const { item } = res.json() as { item: { status: string; post: { title: string }; targeting: { gender: string } } };
    assert.equal(item.status, 'active');
    assert.equal(item.post.title, 'Creta festive offer');
    assert.equal(item.targeting.gender, 'female');
  });

  it('refuses bad budgets and durations, and posts that are not yours', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    for (const payload of [{ postId: post.id, dailyBudget: 150, durationDays: 7 }, { postId: post.id, dailyBudget: 500, durationDays: 0 }]) {
      const res = await create(dealerId, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
    const foreign = await newPost(await newDealer());
    for (const postId of [foreign.id, 'no-such-post']) {
      const res = await create(dealerId, { postId, dailyBudget: 500, durationDays: 3 });
      assert.equal(res.statusCode, 404);
      assert.equal(res.json().error.code, 'POST_NOT_FOUND');
    }
  });
});

describe('POST /v1/boost/reach-estimate', () => {
  it('is the one reach source for the wizard', async () => {
    const dealerId = await newDealer();
    const estimate = (payload: object) => fastify.inject({ method: 'POST', url: '/v1/boost/reach-estimate', headers: headers(dealerId), payload });
    assert.deepEqual((await estimate({ dailyBudget: 1000 })).json(), { minReach: 12000, maxReach: 20000 });
    assert.equal((await estimate({ dailyBudget: 0 })).statusCode, 400);
    assert.equal((await estimate({})).statusCode, 400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/boost.test.ts`
Expected: FAIL. `../src/lib/boostView.js` cannot be resolved.

- [ ] **Step 3: `apps/api/src/lib/boostView.ts`**

```ts
import type { BoostCampaign, Post } from '../generated/client/index.js';
import { postLabel } from './approvals.js';
import { firstCreativeUrl } from './inboxView.js';

// Boost records campaigns only: nothing here calls Meta Ads.
export const BOOST_MIN_DAILY_BUDGET = 200;
export const BOOST_MAX_DAILY_BUDGET = 1_000_000;
export const BOOST_MAX_DAYS = 90;

export type BoostPostSource = Pick<Post, 'id' | 'prompt_text' | 'thumbnail_url' | 'creative_urls'>;

export interface BoostPostSummary {
  id: string;
  title: string;
  thumbnail?: string;
}

export function boostPostSummary(post: BoostPostSource): BoostPostSummary {
  const thumbnail = post.thumbnail_url ?? firstCreativeUrl(post.creative_urls);
  return { id: post.id, title: postLabel(post), ...(thumbnail ? { thumbnail } : {}) };
}

export function mapCampaign(c: BoostCampaign, post?: BoostPostSummary) {
  return {
    id: c.id,
    dealerId: c.dealer_id,
    postId: c.post_id,
    ...(post ? { post } : {}),
    metaCampaignId: c.meta_campaign_id ?? undefined,
    dailyBudget: c.daily_budget,
    durationDays: c.duration_days,
    startDate: c.start_date?.toISOString() ?? undefined,
    endDate: c.end_date?.toISOString() ?? undefined,
    targeting: (c.targeting_spec as Record<string, unknown>) ?? {},
    status: c.status as 'draft' | 'active' | 'paused' | 'completed',
    totalSpent: c.total_spent,
    metrics: (c.metrics as Record<string, unknown>) ?? undefined,
    createdAt: c.created_at.toISOString(),
  };
}

/** People reached per day for a daily budget. The one estimate the web shows, on both wizard steps. */
export function reachEstimate(dailyBudget: number): { minReach: number; maxReach: number } {
  return { minReach: Math.round(dailyBudget * 12), maxReach: Math.round(dailyBudget * 20) };
}

export interface BoostCreate {
  postId: string;
  dailyBudget: number;
  durationDays: number;
  targeting: Record<string, unknown>;
}

export function parseBoostCreate(body: unknown): { ok: true; value: BoostCreate } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Send a JSON object' };
  const { postId, dailyBudget, durationDays, targeting } = body as Record<string, unknown>;
  if (typeof postId !== 'string' || !postId.trim()) return { ok: false, message: 'postId is required' };
  if (typeof dailyBudget !== 'number' || !Number.isInteger(dailyBudget) || dailyBudget < BOOST_MIN_DAILY_BUDGET || dailyBudget > BOOST_MAX_DAILY_BUDGET) {
    return { ok: false, message: `dailyBudget must be a whole number of rupees from ${BOOST_MIN_DAILY_BUDGET} to ${BOOST_MAX_DAILY_BUDGET}` };
  }
  if (typeof durationDays !== 'number' || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > BOOST_MAX_DAYS) {
    return { ok: false, message: `durationDays must be a whole number from 1 to ${BOOST_MAX_DAYS}` };
  }
  if (targeting !== undefined && (targeting === null || typeof targeting !== 'object' || Array.isArray(targeting))) {
    return { ok: false, message: 'targeting must be an object' };
  }
  return { ok: true, value: { postId: postId.trim(), dailyBudget, durationDays, targeting: (targeting as Record<string, unknown> | undefined) ?? {} } };
}
```

- [ ] **Step 4: `apps/api/src/routes/boost.ts`.**

(a) Replace the imports and the local `mapCampaign` function (lines 1–23) with:

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/client/index.js';
import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';
import { boostPostSummary, mapCampaign, parseBoostCreate, reachEstimate, type BoostPostSummary } from '../lib/boostView.js';

const invalid = (message: string) => ({ error: { code: 'INVALID_INPUT', message } });

// Titles and thumbnails of the boosted posts: the dealership's own posts only.
async function postSummaries(dealerId: string, postIds: string[]): Promise<Map<string, BoostPostSummary>> {
  const ids = [...new Set(postIds)];
  if (ids.length === 0) return new Map();
  const posts = await prisma.post.findMany({
    where: { dealer_id: dealerId, id: { in: ids } },
    select: { id: true, prompt_text: true, thumbnail_url: true, creative_urls: true },
  });
  return new Map(posts.map((p) => [p.id, boostPostSummary(p)]));
}
```

(b) In `GET /`, replace the final `return { items: campaigns.map(mapCampaign), total, stats: { … } };` with:

```ts
    const posts = await postSummaries(dealer_id, campaigns.map((c) => c.post_id));
    return {
      items: campaigns.map((c) => mapCampaign(c, posts.get(c.post_id))),
      total,
      stats: { totalSpendThisMonth, totalReachThisMonth, totalClicksThisMonth, avgCtr, campaignsThisMonth: monthCampaigns.length },
    };
```

(c) Replace the whole `// POST /v1/boost — create boost campaign` route with:

```ts
  // POST /v1/boost — record a boost campaign for one of the dealership's posts. Nothing runs on Meta.
  fastify.post('/', { preHandler: [fastify.authenticate, canRunBoost] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const parsed = parseBoostCreate(request.body);
    if (!parsed.ok) return reply.code(400).send(invalid(parsed.message));
    const { postId, dailyBudget, durationDays, targeting } = parsed.value;

    const post = await prisma.post.findFirst({ where: { id: postId, dealer_id } });
    if (!post) return reply.code(404).send({ error: { code: 'POST_NOT_FOUND', message: 'That post was not found' } });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const campaign = await prisma.boostCampaign.create({
      data: {
        dealer_id,
        post_id: post.id,
        daily_budget: dailyBudget,
        duration_days: durationDays,
        targeting_spec: targeting as Prisma.InputJsonValue,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
      },
    });

    return reply.code(201).send({ item: mapCampaign(campaign, boostPostSummary(post)) });
  });
```

(d) In `GET /:id`, replace `return { item: mapCampaign(campaign) };` with:

```ts
    const posts = await postSummaries(dealer_id, [campaign.post_id]);
    return { item: mapCampaign(campaign, posts.get(campaign.post_id)) };
```

(e) In the pause, resume and stop routes, `mapCampaign(updated!)` stays as it is: the web keeps the post it already has.

(f) Replace the `// POST /v1/boost/reach-estimate` route with:

```ts
  // POST /v1/boost/reach-estimate { dailyBudget } — people per day; the wizard's only reach figure
  fastify.post('/reach-estimate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { dailyBudget } = (request.body ?? {}) as { dailyBudget?: unknown };
    if (typeof dailyBudget !== 'number' || !Number.isFinite(dailyBudget) || dailyBudget <= 0) {
      return reply.code(400).send(invalid('dailyBudget must be a positive number'));
    }
    return reachEstimate(dailyBudget);
  });
```

- [ ] **Step 5: `apps/api/test/security-routes.test.ts`.** In `'run_boost gates creating and resuming campaigns'`:
- The allowed create now needs a real post of the dealership.
- Directly after `const dealerId = await newDealer('boost-dealer', 'growth');`, add:

```ts
    const post = await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'Creta festive offer', caption_hashtags: [], platforms: ['facebook'] } });
```

- In the `allowed` request, change `payload: { postId: 'p1', dailyBudget: 500, durationDays: 3 }` to `payload: { postId: post.id, dailyBudget: 500, durationDays: 3 }`.
- Leave the two 403 cases unchanged. The permission hook answers before the body is read.

- [ ] **Step 6: Run the API tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/boost.test.ts test/security-routes.test.ts test/dealer-analytics.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 7: Write the failing web test** `apps/web/src/utils/boost.test.ts`

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BoostCampaign, BoostStats } from '../services/boost';
import {
  DEFAULT_AUDIENCE, audienceSummary, avgCtr, budgetValid, campaignMetrics, campaignsLine, daysLeft, effectiveBudget, inTab, reachLine,
  scheduleLine, spendBar, targetingFor, totalBudget,
} from './boost.js';

const NOW = new Date('2026-09-24T10:00:00Z');
const DAY = 86_400_000;
const campaign = (over: Partial<BoostCampaign>): BoostCampaign => ({
  id: 'c1', dealerId: 'd1', postId: 'p1', dailyBudget: 1000, durationDays: 7,
  targeting: { location: { city: 'Pune', radius: 25 }, ageMin: 25, ageMax: 55 }, status: 'active', totalSpent: 0,
  createdAt: '2026-09-20T00:00:00Z', ...over,
});
const stats = (over: Partial<BoostStats>): BoostStats => ({
  totalSpendThisMonth: 0, totalReachThisMonth: 0, totalClicksThisMonth: 0, avgCtr: 0, campaignsThisMonth: 0, ...over,
});

describe('boost helpers', () => {
  it('lists drafts with active and paused campaigns', () => {
    assert.deepEqual((['draft', 'active', 'paused', 'completed'] as const).map((s) => inTab(s, 'active')), [true, true, true, false]);
    assert.equal(inTab('completed', 'completed'), true);
  });

  it('works out days left and the schedule line', () => {
    assert.equal(daysLeft(campaign({ endDate: new Date(NOW.getTime() + 2.2 * DAY).toISOString() }), NOW), 3);
    assert.equal(daysLeft(campaign({ endDate: new Date(NOW.getTime() - DAY).toISOString() }), NOW), 0);
    assert.equal(daysLeft(campaign({ endDate: undefined }), NOW), 7);
    assert.equal(scheduleLine(campaign({ endDate: new Date(NOW.getTime() + 0.5 * DAY).toISOString() }), NOW), '1 day left · ₹1,000/day');
    assert.equal(scheduleLine(campaign({ endDate: new Date(NOW.getTime() - DAY).toISOString() }), NOW), 'Campaign ended · ₹1,000/day');
    assert.equal(totalBudget(campaign({})), 7000);
  });

  it('colours the spend bar by how much budget is used', () => {
    assert.deepEqual(spendBar(0, 7000), { width: 0, tone: 'blue' });
    assert.equal(spendBar(6000, 7000).tone, 'yellow');
    assert.deepEqual(spendBar(8000, 7000), { width: 100, tone: 'red' });
  });

  it('shows metrics only once they are reported', () => {
    assert.deepEqual(campaignMetrics(campaign({})), { reach: '—', clicks: '—', ctr: '—', cpc: '—' });
    const reported = campaign({ totalSpent: 4800, metrics: { reach: 12000, impressions: 20000, clicks: 240, ctr: 2, cpc: 20, spend: 4800 } });
    assert.deepEqual(campaignMetrics(reported), { reach: '12,000', clicks: '240', ctr: '2.0%', cpc: '₹20' });
    assert.equal(campaignMetrics(campaign({ metrics: { reach: 10, impressions: 10, clicks: 0, ctr: 0, cpc: 0, spend: 0 } })).cpc, '—');
  });

  it('summarises the month', () => {
    assert.equal(avgCtr(stats({})), '—');
    assert.equal(avgCtr(stats({ totalReachThisMonth: 10000, totalClicksThisMonth: 200 })), '2.0%');
    assert.equal(campaignsLine(1), 'across 1 campaign');
    assert.equal(campaignsLine(3), 'across 3 campaigns');
  });

  it('describes reach and the audience', () => {
    assert.equal(reachLine({ minReach: 12000, maxReach: 20000 }), '~12,000–20,000 people/day');
    assert.equal(audienceSummary(DEFAULT_AUDIENCE), 'Smart (25–55, 25 km)');
    assert.equal(audienceSummary({ radius: 10, ageMin: 30, ageMax: 45, gender: 'female' }), '30–45, 10 km, Female');
  });

  it('reads the budget and builds the targeting the API stores', () => {
    assert.equal(effectiveBudget(1000, ''), 1000);
    assert.equal(effectiveBudget(1000, '750'), 750);
    assert.equal(effectiveBudget(1000, 'abc'), 0);
    assert.equal(budgetValid(200), true);
    assert.equal(budgetValid(199), false);
    assert.equal(budgetValid(250.5), false);
    assert.deepEqual(targetingFor('Pune', { radius: 10, ageMin: 30, ageMax: 45, gender: 'male' }), {
      location: { city: 'Pune', radius: 10 }, ageMin: 30, ageMax: 45, gender: 'male',
    });
    assert.equal(targetingFor(undefined, DEFAULT_AUDIENCE).location.city, 'India');
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npm test -w web`
Expected: FAIL. `./boost.js` cannot be resolved.

- [ ] **Step 9: `apps/web/src/services/boost.ts`.**
- Add `campaignsThisMonth: number;` to `BoostStats`.
- Replace `getReachEstimate` with:

```ts
  // POST /boost/reach-estimate — people per day; the wizard's only reach figure.
  getReachEstimate: (dailyBudget: number) =>
    api.post<{ minReach: number; maxReach: number }>('/boost/reach-estimate', { dailyBudget }),
```

- [ ] **Step 10: `apps/web/src/utils/boost.ts`**

```ts
import type { BoostCampaign, BoostStats, TargetingSpec } from '../services/boost';
import { rupees } from './billing.js';

export type CampaignStatus = BoostCampaign['status'];
export type BoostTab = 'active' | 'completed';

export interface Audience {
  radius: number;
  ageMin: number;
  ageMax: number;
  gender: 'all' | 'male' | 'female';
}

export const BUDGET_PRESETS = [500, 1000, 2500, 5000] as const;
export const DURATION_PRESETS = [3, 7, 14, 30] as const;
export const MIN_DAILY_BUDGET = 200;
export const WIZARD_STEPS = ['Post', 'Budget', 'Duration', 'Audience', 'Confirm'] as const;
export const DEFAULT_AUDIENCE: Audience = { radius: 25, ageMin: 25, ageMax: 55, gender: 'all' };

const DAY_MS = 86_400_000;

/** "Active & Paused" includes drafts too; the reference dropped them from both tabs. */
export function inTab(status: CampaignStatus, tab: BoostTab): boolean {
  return tab === 'completed' ? status === 'completed' : status !== 'completed';
}

export function daysLeft(c: Pick<BoostCampaign, 'endDate' | 'durationDays'>, now: Date): number {
  if (!c.endDate) return c.durationDays;
  return Math.max(0, Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / DAY_MS));
}

export function scheduleLine(c: Pick<BoostCampaign, 'endDate' | 'durationDays' | 'dailyBudget'>, now: Date): string {
  const left = daysLeft(c, now);
  const when = left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'Campaign ended';
  return `${when} · ${rupees(c.dailyBudget)}/day`;
}

export function totalBudget(c: Pick<BoostCampaign, 'dailyBudget' | 'durationDays'>): number {
  return c.dailyBudget * c.durationDays;
}

export function spendBar(spent: number, budget: number): { width: number; tone: 'red' | 'yellow' | 'blue' } {
  const ratio = budget > 0 ? (spent / budget) * 100 : 0;
  return { width: Math.min(ratio, 100), tone: ratio > 100 ? 'red' : ratio > 80 ? 'yellow' : 'blue' };
}

/** Reach, clicks, CTR and CPC as shown, or "—" until metrics are reported (boosts are recorded, not run on Meta). */
export function campaignMetrics(c: Pick<BoostCampaign, 'metrics' | 'totalSpent'>): { reach: string; clicks: string; ctr: string; cpc: string } {
  const m = c.metrics;
  if (!m) return { reach: '—', clicks: '—', ctr: '—', cpc: '—' };
  const clicks = m.clicks ?? 0;
  return {
    reach: (m.reach ?? 0).toLocaleString('en-IN'),
    clicks: clicks.toLocaleString('en-IN'),
    ctr: `${(m.ctr ?? 0).toFixed(1)}%`,
    cpc: clicks > 0 ? rupees(Math.round(c.totalSpent / clicks)) : '—',
  };
}

export function avgCtr(stats: BoostStats): string {
  return stats.totalReachThisMonth > 0 ? `${((stats.totalClicksThisMonth / stats.totalReachThisMonth) * 100).toFixed(1)}%` : '—';
}

export function campaignsLine(count: number): string {
  return `across ${count} campaign${count === 1 ? '' : 's'}`;
}

export function reachLine(r: { minReach: number; maxReach: number }): string {
  return `~${r.minReach.toLocaleString('en-IN')}–${r.maxReach.toLocaleString('en-IN')} people/day`;
}

export function audienceSummary(a: Audience): string {
  if (a.ageMin === DEFAULT_AUDIENCE.ageMin && a.ageMax === DEFAULT_AUDIENCE.ageMax && a.gender === 'all') {
    return `Smart (25–55, ${a.radius} km)`;
  }
  const gender = a.gender === 'all' ? '' : `, ${a.gender === 'male' ? 'Male' : 'Female'}`;
  return `${a.ageMin}–${a.ageMax}, ${a.radius} km${gender}`;
}

/** The custom amount wins when typed; a non-number counts as 0 (invalid). */
export function effectiveBudget(preset: number, custom: string): number {
  if (!custom.trim()) return preset;
  const n = Number(custom);
  return Number.isFinite(n) ? n : 0;
}

export function budgetValid(amount: number): boolean {
  return Number.isInteger(amount) && amount >= MIN_DAILY_BUDGET;
}

export function targetingFor(city: string | undefined, a: Audience): TargetingSpec {
  return { location: { city: city || 'India', radius: a.radius }, ageMin: a.ageMin, ageMax: a.ageMax, gender: a.gender };
}
```

- [ ] **Step 11: `apps/web/src/components/boost/BoostParts.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Loader2, MousePointerClick, Pause, Percent, Play, Radio, Square, Wallet, Zap } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { BoostCampaign, BoostStats } from '../../services/boost';
import { rupees } from '../../utils/billing';
import { avgCtr, campaignMetrics, campaignsLine, scheduleLine, spendBar, totalBudget, type BoostTab, type CampaignStatus } from '../../utils/boost';

const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' },
  paused: { label: 'Paused', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' },
  completed: { label: 'Completed', className: 'bg-zinc-100 text-zinc-600' },
  draft: { label: 'Draft', className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' },
};
const BAR = { red: 'bg-red-500', yellow: 'bg-yellow-500', blue: 'bg-blue-500' } as const;

function StatTile({ icon, tint, label, value, sub }: { icon: ReactNode; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', tint)}>{icon}</div>
      <p className="text-xl font-bold text-zinc-900 leading-none">{value}</p>
      <p className="text-xs font-medium text-zinc-600 mt-2">{label}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>
    </div>
  );
}

export function BoostStatCards({ stats }: { stats: BoostStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatTile icon={<Wallet className="w-4 h-4" />} tint="bg-orange-50 text-orange-600" label="Total Spend This Month" value={rupees(stats.totalSpendThisMonth)} sub={campaignsLine(stats.campaignsThisMonth)} />
      <StatTile icon={<Radio className="w-4 h-4" />} tint="bg-blue-50 text-blue-600" label="Total Reach" value={stats.totalReachThisMonth.toLocaleString('en-IN')} sub="people reached" />
      <StatTile icon={<MousePointerClick className="w-4 h-4" />} tint="bg-violet-50 text-violet-600" label="Total Clicks" value={stats.totalClicksThisMonth.toLocaleString('en-IN')} sub="link clicks" />
      <StatTile icon={<Percent className="w-4 h-4" />} tint="bg-emerald-50 text-emerald-600" label="Avg CTR" value={avgCtr(stats)} sub="click-through rate" />
    </div>
  );
}

export function CampaignCard({ campaign, now, canResume, onTogglePause, onStop }: {
  campaign: BoostCampaign;
  now: Date;
  canResume: boolean;
  onTogglePause: (c: BoostCampaign) => void;
  onStop: (c: BoostCampaign) => void;
}) {
  const budget = totalBudget(campaign);
  const bar = spendBar(campaign.totalSpent, budget);
  const metrics = campaignMetrics(campaign);
  const status = STATUS[campaign.status] ?? STATUS.draft;
  const running = campaign.status === 'active';
  const tiles: Array<[string, string]> = [['Reach', metrics.reach], ['Clicks', metrics.clicks], ['CTR', metrics.ctr], ['CPC', metrics.cpc]];
  return (
    <div className="group bg-white rounded-2xl border border-zinc-200/80 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300 overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <div className="w-20 h-16 rounded-lg bg-zinc-100 flex-shrink-0 ring-1 ring-zinc-200/70 overflow-hidden flex items-center justify-center text-zinc-400">
          {campaign.post?.thumbnail ? <img src={campaign.post.thumbnail} alt="" className="w-full h-full object-cover" /> : <Zap className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{campaign.post?.title ?? 'Boosted post'}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{scheduleLine(campaign, now)}</p>
            </div>
            <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full', status.className)}>{status.label}</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
              <span>Spent: {rupees(campaign.totalSpent)}</span>
              <span>Budget: {rupees(budget)}</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all duration-500', BAR[bar.tone])} style={{ width: `${bar.width}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="text-center bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                <p className="text-sm font-bold text-zinc-900">{value}</p>
                <p className="text-[10px] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
        {campaign.status !== 'completed' && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            {(running || canResume) && (
              <button
                type="button"
                onClick={() => onTogglePause(campaign)}
                title={running ? 'Pause campaign' : 'Resume campaign'}
                aria-label={running ? 'Pause campaign' : 'Resume campaign'}
                className={cn('p-2 rounded-lg border border-zinc-200 transition-all duration-150', running ? 'hover:bg-amber-50 hover:border-amber-200' : 'hover:bg-emerald-50 hover:border-emerald-200')}
              >
                {running ? <Pause className="w-4 h-4 text-zinc-600" /> : <Play className="w-4 h-4 text-emerald-600" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onStop(campaign)}
              title="Stop campaign"
              aria-label="Stop campaign"
              className="p-2 rounded-lg border border-zinc-200 transition-all duration-150 hover:bg-red-50 hover:border-red-200"
            >
              <Square className="w-4 h-4 text-red-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CampaignSkeleton() {
  return (
    <div className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-zinc-200/80">
      <div className="w-20 h-16 rounded-lg bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2.5">
        <div className="h-3 w-48 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-32 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2 w-full rounded bg-zinc-100 animate-pulse" />
      </div>
    </div>
  );
}

export function EmptyCampaigns({ tab, onBoost }: { tab: BoostTab; onBoost?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3"><Zap className="w-5 h-5" /></div>
      <p className="text-sm font-semibold text-zinc-800">{tab === 'active' ? 'No active campaigns' : 'No completed campaigns'}</p>
      <p className="text-xs text-zinc-500 mt-1 max-w-sm">
        {tab === 'active'
          ? 'Boost a post to start reaching more customers across Facebook and Instagram.'
          : 'Completed campaigns will appear here once they finish running.'}
      </p>
      {tab === 'active' && onBoost && <Button className="mt-4" onClick={onBoost}>Launch Your First Boost</Button>}
    </div>
  );
}

// The reference said "Any remaining budget will not be charged"; nothing is charged here at all.
export function StopCampaignModal({ campaign, busy, onClose, onConfirm }: { campaign: BoostCampaign; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Stop this campaign?"
      variant="danger"
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep running</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Stop campaign
          </Button>
        </>
      )}
    >
      <p className="text-sm text-zinc-600">This marks the boost as completed and moves it to the Completed tab. Nothing was charged for it.</p>
      <p className="text-sm font-medium text-zinc-900 mt-3 truncate">{campaign.post?.title ?? 'Boosted post'}</p>
    </Modal>
  );
}
```

- [ ] **Step 12: `apps/web/src/components/boost/BoostWizard.tsx`**

```tsx
import { Fragment, useEffect, useState } from 'react';
import { ChevronRight, Loader2, Zap } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { boostService } from '../../services/boost';
import { postService, type Post } from '../../services/creative';
import { rupees } from '../../utils/billing';
import {
  BUDGET_PRESETS, DEFAULT_AUDIENCE, DURATION_PRESETS, MIN_DAILY_BUDGET, WIZARD_STEPS, audienceSummary, budgetValid, effectiveBudget, reachLine,
  type Audience,
} from '../../utils/boost';

export interface BoostLaunch {
  postId: string;
  dailyBudget: number;
  durationDays: number;
  audience: Audience;
}

const CHOICE = 'py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150';
const CHOICE_ON = 'border-orange-400 bg-orange-50 text-orange-700';
const CHOICE_OFF = 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50';
const GENDERS: Array<{ value: Audience['gender']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center mb-5">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors',
                  n < step ? 'bg-orange-600 text-white' : n === step ? 'bg-orange-600 text-white ring-2 ring-orange-200' : 'bg-zinc-100 text-zinc-400',
                )}
              >
                {n}
              </span>
              <span className={cn('text-[10px] font-medium', n === step ? 'text-zinc-900' : 'text-zinc-400')}>{label}</span>
            </div>
            {n < WIZARD_STEPS.length && <div className={cn('h-px flex-1 mx-1 mb-4 transition-colors', n < step ? 'bg-orange-300' : 'bg-zinc-200')} />}
          </Fragment>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={cn('text-right', strong ? 'font-bold text-orange-600' : 'font-medium text-zinc-900')}>{value}</span>
    </div>
  );
}

export function BoostWizard({ launching, onClose, onLaunch }: { launching: boolean; onClose: () => void; onLaunch: (data: BoostLaunch) => void }) {
  const [step, setStep] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [postId, setPostId] = useState('');
  const [preset, setPreset] = useState<number>(1000);
  const [custom, setCustom] = useState('');
  const [duration, setDuration] = useState<number>(7);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  const [estimate, setEstimate] = useState<{ budget: number; minReach: number; maxReach: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    postService.list({ pageSize: 20 })
      .then((res) => { if (!cancelled) setPosts(res.data); })
      .catch(() => { /* step 1 then says there are no posts */ })
      .finally(() => { if (!cancelled) setPostsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const budget = effectiveBudget(preset, custom);
  const total = budget * duration;

  // One reach figure for the budget and confirm steps: POST /v1/boost/reach-estimate.
  useEffect(() => {
    if (!budgetValid(budget)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      boostService.getReachEstimate(budget)
        .then((r) => { if (!cancelled) setEstimate({ budget, minReach: r.minReach, maxReach: r.maxReach }); })
        .catch(() => { if (!cancelled) setEstimate(null); });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [budget]);
  const reach = estimate && estimate.budget === budget ? estimate : null;

  const canContinue = step === 1 ? !!postId : step === 2 ? budgetValid(budget) : true;
  const setAud = (patch: Partial<Audience>) => setAudience((a) => ({ ...a, ...patch }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Boost Post"
      size="md"
      closeOnOverlayClick={!launching}
      closeOnEscape={!launching}
      footer={(
        <>
          {step > 1 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={launching}>Back</Button>}
          {step < WIZARD_STEPS.length ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>Continue</Button>
          ) : (
            <Button onClick={() => onLaunch({ postId, dailyBudget: budget, durationDays: duration, audience })} disabled={launching || !postId || !budgetValid(budget)}>
              {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Launch Boost
            </Button>
          )}
        </>
      )}
    >
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Select a post to boost</h4>
          {!postsLoaded ? (
            <p className="text-sm text-zinc-400 py-6 text-center">Loading posts…</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">No posts yet. Create a post first.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPostId(p.id)}
                  aria-pressed={postId === p.id}
                  className={cn('w-full text-left px-3 py-2.5 rounded-xl border-2 transition-colors', postId === p.id ? CHOICE_ON : CHOICE_OFF)}
                >
                  <p className="text-sm font-medium line-clamp-1">{p.prompt_text || 'Untitled post'}</p>
                  <span className="text-[11px] text-zinc-500 capitalize">{p.status.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Set daily budget</h4>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_PRESETS.map((b) => (
              <button key={b} type="button" onClick={() => { setPreset(b); setCustom(''); }} className={cn(CHOICE, !custom && preset === b ? CHOICE_ON : CHOICE_OFF)}>
                {rupees(b)}/day
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="boost-custom" className="block text-xs font-medium text-zinc-600 mb-1.5">
              Custom amount <span className="text-zinc-400">(min ₹200/day)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">₹</span>
              <input
                id="boost-custom"
                type="number"
                min={MIN_DAILY_BUDGET}
                step={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Enter amount"
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-7 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
          {reach && (
            <div className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-800">
              Estimated reach: <strong>{reachLine(reach)}</strong>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">How long to run?</h4>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_PRESETS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={cn(CHOICE, duration === d ? CHOICE_ON : CHOICE_OFF)}>
                {d} days
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-zinc-50 p-4 space-y-2">
            <SummaryRow label="Daily budget" value={rupees(budget)} />
            <SummaryRow label="Duration" value={`${duration} days`} />
            <div className="border-t border-zinc-200 pt-2">
              <SummaryRow label="Total spend" value={rupees(total)} strong />
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Target audience</h4>
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900">Smart Audience</p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-orange-700 bg-white/80 ring-1 ring-orange-200 rounded px-1.5 py-0.5">Recommended</span>
            </div>
            <p className="text-xs text-zinc-600 mt-1">People likely to be interested, aged 25–55, within 25 km of your location</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            <ChevronRight className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-90')} />
            Advanced targeting
          </button>
          {showAdvanced && (
            <div className="space-y-4 rounded-xl bg-zinc-50 p-4">
              <div>
                <label htmlFor="boost-radius" className="block text-xs font-medium text-zinc-600 mb-2">Location radius: {audience.radius} km</label>
                <input id="boost-radius" type="range" min={5} max={50} value={audience.radius} onChange={(e) => setAud({ radius: +e.target.value })} className="w-full accent-orange-600" />
                <div className="flex justify-between text-[11px] text-zinc-400 mt-1"><span>5 km</span><span>50 km</span></div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-600 mb-2">Age range: {audience.ageMin}–{audience.ageMax}</p>
                <div className="flex gap-3">
                  <input type="range" aria-label="Youngest age" min={18} max={audience.ageMax - 1} value={audience.ageMin} onChange={(e) => setAud({ ageMin: +e.target.value })} className="flex-1 accent-orange-600" />
                  <input type="range" aria-label="Oldest age" min={audience.ageMin + 1} max={65} value={audience.ageMax} onChange={(e) => setAud({ ageMax: +e.target.value })} className="flex-1 accent-orange-600" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-600 mb-1.5">Gender</p>
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      aria-pressed={audience.gender === g.value}
                      onClick={() => setAud({ gender: g.value })}
                      className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors', audience.gender === g.value ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300')}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Confirm & launch</h4>
          <div className="rounded-xl border border-zinc-200 p-4 space-y-2">
            <SummaryRow label="Daily budget" value={rupees(budget)} />
            <SummaryRow label="Duration" value={`${duration} days`} />
            <SummaryRow label="Total spend" value={rupees(total)} strong />
            <SummaryRow label="Est. reach" value={reach ? reachLine(reach) : '—'} />
            <SummaryRow label="Audience" value={audienceSummary(audience)} />
            <div className="border-t border-zinc-100 pt-2">
              <SummaryRow label="Platforms" value="Facebook & Instagram" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Launching records this boost in Social AI. Nothing is charged and no ad runs on Meta automatically.
          </p>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 13: Replace `apps/web/src/pages/Boost.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Info, Zap } from 'lucide-react';
import { Button, cn } from '../components/ui/Button';
import { PageCard, PageHeader } from '../components/ui/PageCard';
import { PlanGatedNotice } from '../components/ui/PlanGatedNotice';
import { useToast } from '../components/ui/Toast';
import { BoostStatCards, CampaignCard, CampaignSkeleton, EmptyCampaigns, StopCampaignModal } from '../components/boost/BoostParts';
import { BoostWizard, type BoostLaunch } from '../components/boost/BoostWizard';
import { useAuth } from '../contexts/AuthContext';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { PERMISSIONS, can } from '../lib/permissions';
import { isPlanGated } from '../services/api';
import { boostService, type BoostCampaign, type BoostStats } from '../services/boost';
import { inTab, targetingFor, type BoostTab } from '../utils/boost';

const EMPTY_STATS: BoostStats = { totalSpendThisMonth: 0, totalReachThisMonth: 0, totalClicksThisMonth: 0, avgCtr: 0, campaignsThisMonth: 0 };

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Please try again.');

export default function BoostPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const { profile } = useDealerProfile();
  const canRun = can(user, PERMISSIONS.RUN_BOOST);
  const [planGated, setPlanGated] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<BoostCampaign[]>([]);
  const [stats, setStats] = useState<BoostStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<BoostTab>('active');
  const [showWizard, setShowWizard] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [stopTarget, setStopTarget] = useState<BoostCampaign | null>(null);
  const [stopping, setStopping] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    boostService.list({ pageSize: 50 })
      .then((res) => {
        if (cancelled) return;
        setCampaigns(res.items);
        setStats({ ...EMPTY_STATS, ...res.stats });
      })
      .catch((err) => {
        if (cancelled) return;
        if (isPlanGated(err)) {
          setPlanGated(err.message);
          return;
        }
        addToast({ type: 'error', title: 'Could not load campaigns', message: errorText(err) });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [addToast, reloadKey]);

  const setStatus = (id: string, status: BoostCampaign['status']) =>
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));

  const togglePause = async (campaign: BoostCampaign) => {
    const pausing = campaign.status === 'active';
    setStatus(campaign.id, pausing ? 'paused' : 'active');
    try {
      await (pausing ? boostService.pause(campaign.id) : boostService.resume(campaign.id));
    } catch (err) {
      setStatus(campaign.id, campaign.status);
      addToast({ type: 'error', title: pausing ? 'Could not pause campaign' : 'Could not resume campaign', message: errorText(err) });
    }
  };

  const stop = async () => {
    if (!stopTarget) return;
    setStopping(true);
    try {
      await boostService.stop(stopTarget.id);
      setStatus(stopTarget.id, 'completed');
      setStopTarget(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Could not stop campaign', message: errorText(err) });
    } finally {
      setStopping(false);
    }
  };

  const launch = async (data: BoostLaunch) => {
    setLaunching(true);
    try {
      await boostService.create({
        postId: data.postId,
        dailyBudget: data.dailyBudget,
        durationDays: data.durationDays,
        targeting: targetingFor(profile?.city, data.audience),
      });
      setShowWizard(false);
      setLaunched(true);
      setTimeout(() => setLaunched(false), 4000);
      setReloadKey((k) => k + 1);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Boost not launched',
        message: errorText(err),
        ...(isPlanGated(err) ? { action: { label: 'View plans', onClick: () => navigate('/settings?tab=billing') } } : {}),
      });
    } finally {
      setLaunching(false);
    }
  };

  if (planGated) return <PlanGatedNotice feature="Boost" message={planGated} />;

  const visible = campaigns.filter((c) => inTab(c.status, tab));
  const counts: Record<BoostTab, number> = {
    active: campaigns.filter((c) => inTab(c.status, 'active')).length,
    completed: campaigns.filter((c) => inTab(c.status, 'completed')).length,
  };
  const openWizard = canRun ? () => setShowWizard(true) : undefined;

  return (
    <PageCard>
      <PageHeader
        title="Boost campaigns"
        subtitle="Promote your posts to reach more customers"
        actions={openWizard ? <Button onClick={openWizard}><Zap className="w-4 h-4" /> Boost a Post</Button> : undefined}
      />

      <div className="mb-5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">Boosts are recorded here to plan and track spend. They don’t run on Meta automatically yet, and nothing is charged.</p>
      </div>

      {launched && (
        <div className="mb-5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">Boost campaign recorded</p>
            <p className="text-xs text-emerald-700">Metrics will appear here once they are reported.</p>
          </div>
        </div>
      )}

      <BoostStatCards stats={stats} />

      <div role="tablist" aria-label="Campaigns" className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1 mb-4">
        {(['active', 'completed'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0', tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
          >
            {t === 'active' ? 'Active & Paused' : 'Completed'}
            <span className={cn('text-[11px] font-semibold rounded-full px-1.5', tab === t ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-200/70 text-zinc-500')}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <CampaignSkeleton key={i} />)}</div>
      ) : visible.length === 0 ? (
        <EmptyCampaigns tab={tab} onBoost={openWizard} />
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <CampaignCard key={c.id} campaign={c} now={now} canResume={canRun} onTogglePause={(x) => void togglePause(x)} onStop={setStopTarget} />
          ))}
        </div>
      )}

      {showWizard && <BoostWizard launching={launching} onClose={() => setShowWizard(false)} onLaunch={(d) => void launch(d)} />}
      {stopTarget && <StopCampaignModal campaign={stopTarget} busy={stopping} onClose={() => setStopTarget(null)} onConfirm={() => void stop()} />}
    </PageCard>
  );
}
```

- [ ] **Step 14: Verify**

Run: `npm test -w web && npm run build && npm run lint -w web 2>/dev/null | tail -1 && grep -n "live on Meta\|Meta Ad Account\|18\.4\|12\.5" apps/web/src/pages/Boost.tsx apps/web/src/components/boost/*.tsx`
Expected:
- Tests pass, and the root build exits 0 (API with its tests, then web).
- Lint is at 45 or below.
- The grep prints nothing: no fabricated copy and no client-side reach formulas.

Manual check (`web-local` + `api-verify`; the local demo dealer is on Enterprise):
- `/boost` shows "Boost campaigns", the amber notice and four stat cards ("Avg CTR —").
- Boost a Post → step 1 lists posts → step 2 shows "Estimated reach: ~12,000–20,000 people/day" for ₹1,000.
- A custom ₹150 disables Continue. Step 5 "Est. reach" shows the same figure as step 2.
- In Advanced targeting, Female is selected: the network panel shows `targeting.gender: "female"` on `POST /v1/boost`.
- The green "Boost campaign recorded" banner shows, and the card lists the post's title and thumbnail with metrics "—".
- Pause, then Resume. Stop → "Stop this campaign?" → Stop campaign → it moves to Completed.
- A Starter dealer sees the plan-gated notice, whose "View plans" opens Settings → Billing.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/lib/boostView.ts apps/api/src/routes/boost.ts apps/api/test/boost.test.ts apps/api/test/security-routes.test.ts apps/web/src/services/boost.ts apps/web/src/utils/boost.ts apps/web/src/utils/boost.test.ts apps/web/src/components/boost apps/web/src/pages/Boost.tsx
git commit -m "feat: Boost page in the reference layout with post details and one reach estimate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Calendar: festivals by date range (API) and the reference calendar (web)

**Files:**
- Modify: `apps/api/src/services/festivalCalendar.ts`, `apps/api/src/routes/dealer.ts`, `apps/api/test/festivalCalendar.test.ts`, `apps/web/src/services/dealer.ts`, `apps/web/src/pages/Calendar.tsx` (replaced)
- Create: `apps/api/test/dealer-festivals.test.ts`, `apps/web/src/utils/calendar.ts` + `apps/web/src/utils/calendar.test.ts`, `apps/web/src/components/calendar/CalendarGrids.tsx`, `apps/web/src/components/calendar/PostDetailModal.tsx`

**Interfaces:**
- Consumes:
  - `FESTIVALS` and `CITY_TO_STATE` (`services/festivalCalendar.ts`).
  - `postService.getCalendar`, `postService.reschedule` and `postService.cancelSchedule` (web).
  - `toLocalInput` (`utils/posts.ts`), `PostStatus`; `PageCard`, `Modal`, `PlatformIcon`; `can(user, PERMISSIONS.PUBLISH_POST)`.
- Produces (API):
  - `resolveState(city, state): string | null`;
  - `FESTIVAL_RANGE_MAX_DAYS = 1100`, `festivalRange(from, to): { from: string; to: string } | null`;
  - `interface FestivalOnDate { id; name; name_en; date: 'YYYY-MM-DD'; description; marketingIdea; isRegional }`;
  - `festivalsBetween(city, state, from, to): FestivalOnDate[]`;
  - HTTP `GET /v1/dealer/festivals?from=&to=` → `{ success, festivals: FestivalOnDate[] }`. It answers 400 `INVALID_INPUT` on a bad range; without `from`/`to` it is unchanged.
- Produces (web):
  - `dealerService.festivals(from, to)`.
  - `utils/calendar.ts`: every name listed in the File Map table.
  - `CalendarGrids.tsx`: `CalendarLegend`, `WeekGrid`, `MonthGrid`.
  - `PostDetailModal.tsx`: `PostDetailModal`.

This task's code contains – — · ’ and emoji, written as `\u{…}` escapes in `utils/calendar.ts`. Byte-check them.

- [ ] **Step 1: Write the failing API tests**

Append to `apps/api/test/festivalCalendar.test.ts`. Extend its import to `import { FESTIVALS, festivalRange, festivalsBetween, getUpcomingFestivals, resolveState } from '../src/services/festivalCalendar.js';`.

```ts
describe('festivals by date range (Calendar)', () => {
  it('includes the start date and excludes the end date, in date order', () => {
    const list = festivalsBetween(null, null, '2026-10-20', '2026-11-08');
    assert.ok(list.some((f) => f.id === 'dussehra' && f.date === '2026-10-20'));
    assert.ok(!list.some((f) => f.id === 'diwali'), 'Diwali 2026-11-08 is the exclusive end');
    assert.deepEqual(list.map((f) => f.date), [...list.map((f) => f.date)].sort());
  });

  it("keeps regional festivals to the dealer's state", () => {
    const pune = festivalsBetween('Pune', null, '2026-09-01', '2026-10-01').map((f) => f.id);
    const delhi = festivalsBetween('Delhi', null, '2026-09-01', '2026-10-01').map((f) => f.id);
    assert.ok(pune.includes('ganesh_chaturthi'));
    assert.ok(!delhi.includes('ganesh_chaturthi'));
  });

  it('covers every year in the table', () => {
    const christmas = festivalsBetween(null, null, '2026-01-01', '2028-01-01').filter((f) => f.id === 'christmas').map((f) => f.date);
    assert.deepEqual(christmas, ['2026-12-25', '2027-12-25']);
    assert.ok(FESTIVALS.length > 0);
  });

  it('finds the state from the city unless one is given', () => {
    assert.equal(resolveState('Mumbai', null), 'Maharashtra');
    assert.equal(resolveState('Mumbai', 'Goa'), 'Goa');
    assert.equal(resolveState('Atlantis', null), null);
    assert.equal(resolveState(null, null), null);
  });

  it('accepts only real, ordered ranges up to 1100 days', () => {
    assert.deepEqual(festivalRange('2025-01-01', '2028-01-01'), { from: '2025-01-01', to: '2028-01-01' });
    assert.equal(festivalRange('2026-10-01', '2026-09-01'), null);
    assert.equal(festivalRange('2026-9-1', '2026-10-01'), null);
    assert.equal(festivalRange('2026-02-31', '2026-03-10'), null);
    assert.equal(festivalRange('2020-01-01', '2026-01-01'), null);
    assert.equal(festivalRange(undefined, '2026-01-01'), null);
    assert.ok(getUpcomingFestivals(null, null, 1).length <= 1);
  });
});
```

`apps/api/test/dealer-festivals.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function headersForDealerIn(city: string) {
  const dealer = await prisma.dealer.create({ data: { name: 'Festival Motors', city, phone: `phone-${randomUUID()}` } });
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealer.id, role: 'user', phone: '+910000000000',
    permissions: resolvePermissions('user'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const get = (headers: Record<string, string>, query: string) => fastify.inject({ method: 'GET', url: `/v1/dealer/festivals${query}`, headers });

describe('GET /v1/dealer/festivals', () => {
  it("lists festival dates in a range for the dealer's region", async () => {
    const res = await get(await headersForDealerIn('Pune'), '?from=2026-09-01&to=2026-10-01');
    assert.equal(res.statusCode, 200);
    const festivals = (res.json() as { festivals: Array<{ id: string; date: string }> }).festivals;
    assert.equal(festivals.find((f) => f.id === 'ganesh_chaturthi')?.date, '2026-09-15');
  });

  it('refuses a bad or over-long range', async () => {
    const h = await headersForDealerIn('Pune');
    for (const query of ['?from=2026-09-01', '?from=2026-10-01&to=2026-09-01', '?from=2026-9-1&to=2026-10-01', '?from=2020-01-01&to=2026-01-01']) {
      const res = await get(h, query);
      assert.equal(res.statusCode, 400, query);
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });

  it('still lists upcoming festivals without a range', async () => {
    const res = await get(await headersForDealerIn('Pune'), '?limit=3');
    assert.equal(res.statusCode, 200);
    const festivals = (res.json() as { festivals: Array<{ daysRemaining: number }> }).festivals;
    assert.ok(festivals.length <= 3);
    assert.ok(festivals.every((f) => f.daysRemaining >= 0));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/festivalCalendar.test.ts test/dealer-festivals.test.ts`
Expected: FAIL. `festivalsBetween` is not exported, and the range query is ignored, so the 400 cases answer 200.

- [ ] **Step 3: `apps/api/src/services/festivalCalendar.ts`.**

(a) Directly above `export function getUpcomingFestivals(`, add:

```ts
/** The dealer's state: the one given, else the state their city is in; null when unknown. */
export function resolveState(city?: string | null, state?: string | null): string | null {
  const given = typeof state === 'string' ? state.trim() : '';
  if (given) return given;
  if (typeof city !== 'string') return null;
  return CITY_TO_STATE[city.trim().toLowerCase().replace(/\s+/g, '_')] || null;
}

function appliesTo(fest: Festival, state: string | null): boolean {
  return fest.regions.includes('Nationwide') || (!!state && fest.regions.some((r) => r.toLowerCase() === state.toLowerCase()));
}

export const FESTIVAL_RANGE_MAX_DAYS = 1100;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A Calendar range: two real YYYY-MM-DD dates, from before to, at most FESTIVAL_RANGE_MAX_DAYS apart. */
export function festivalRange(from: unknown, to: unknown): { from: string; to: string } | null {
  if (typeof from !== 'string' || typeof to !== 'string' || !ISO_DAY.test(from) || !ISO_DAY.test(to)) return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  // Refuse dates that roll over (2026-02-31): the parsed day must print back the same.
  if (new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to) return null;
  return (end - start) / 86_400_000 <= FESTIVAL_RANGE_MAX_DAYS ? { from, to } : null;
}

export interface FestivalOnDate {
  id: string;
  name: string;
  name_en: string;
  /** The festival's calendar date, YYYY-MM-DD. */
  date: string;
  description: string;
  marketingIdea: string;
  isRegional: boolean;
}

/** Every festival date in [from, to) that applies to the dealer's region, in date order (the Calendar overlay). */
export function festivalsBetween(city: string | null | undefined, state: string | null | undefined, from: string, to: string): FestivalOnDate[] {
  const resolved = resolveState(city, state);
  const out: FestivalOnDate[] = [];
  for (const fest of FESTIVALS) {
    if (!appliesTo(fest, resolved)) continue;
    for (const date of Object.values(fest.dates)) {
      if (date >= from && date < to) {
        out.push({
          id: fest.id, name: fest.name, name_en: fest.name, date,
          description: fest.description, marketingIdea: fest.marketingIdea, isRegional: !fest.regions.includes('Nationwide'),
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
```

(b) Inside `getUpcomingFestivals`, replace the `// Resolve target state` block (from `let resolvedState = …` through the closing `}` of its `if`) with:

```ts
  const resolvedState = resolveState(city, state);
```

and replace the two lines

```ts
      const isNationwide = fest.regions.includes('Nationwide');
      const matchesRegion = isNationwide || (resolvedState && fest.regions.some(r => r.toLowerCase() === resolvedState!.toLowerCase()));
```

with

```ts
      const isNationwide = fest.regions.includes('Nationwide');
      const matchesRegion = appliesTo(fest, resolvedState);
```

- [ ] **Step 4: `apps/api/src/routes/dealer.ts`.**

Change the festival import to:

```ts
import { festivalRange, festivalsBetween, getUpcomingFestivals } from '../services/festivalCalendar.js';
```

Then replace the whole `// GET /v1/dealer/festivals` route with:

```ts
  // GET /v1/dealer/festivals — upcoming festivals for the dealer's region (?limit=), or, for the Calendar,
  // every festival date in a range (?from=YYYY-MM-DD&to=YYYY-MM-DD, end exclusive, at most 1100 days).
  fastify.get('/festivals', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealer_id = request.user.dealer_id!;
    const { limit = '10', from, to } = request.query as { limit?: string; from?: string; to?: string };
    const ranged = from !== undefined || to !== undefined;
    const range = ranged ? festivalRange(from, to) : null;
    if (ranged && !range) {
      return reply.code(400).send(apiError('INVALID_INPUT', 'from and to must be YYYY-MM-DD dates, from before to, at most 1100 days apart'));
    }
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealer_id },
      select: { city: true, state: true },
    });
    if (range) return { success: true, festivals: festivalsBetween(dealer?.city, dealer?.state, range.from, range.to) };
    const upcoming = getUpcomingFestivals(
      dealer?.city,
      dealer?.state,
      parseInt(limit, 10) || 10
    );
    return { success: true, festivals: upcoming };
  });
```

- [ ] **Step 5: Run the API tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/festivalCalendar.test.ts test/dealer-festivals.test.ts test/dealer-analytics.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean.

- [ ] **Step 6: Write the failing web test** `apps/web/src/utils/calendar.test.ts`

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_PX, chipTitle, createLink, dayKey, dropTime, festivalCreateLink, festivalEmoji, festivalsByDay, formatMonthTitle, formatWeekRange,
  hourLabel, initialScrollTop, isReschedulable, legendCounts, monthCells, nowLineTop, postsAt, startOfWeek, toCalendarPosts, tomorrowAt,
  visibleRange, weekDays,
} from './calendar.js';

// Local-time dates: the calendar works in the browser's time zone.
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe('calendar dates', () => {
  it('starts weeks on Monday', () => {
    assert.equal(dayKey(startOfWeek(d(2026, 9, 24))), '2026-09-21');
    assert.equal(dayKey(startOfWeek(d(2026, 9, 27))), '2026-09-21');
    assert.equal(dayKey(startOfWeek(d(2026, 9, 24), 1)), '2026-09-28');
    assert.deepEqual(weekDays(d(2026, 9, 21)).map(dayKey), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  });

  it('titles weeks and months', () => {
    assert.equal(formatWeekRange(weekDays(d(2026, 9, 21))), '21 – 27 September 2026');
    assert.equal(formatWeekRange(weekDays(d(2026, 9, 28))), '28 September – 4 October 2026');
    assert.equal(formatWeekRange(weekDays(d(2026, 12, 28))), '28 December 2026 – 3 January 2027');
    assert.equal(formatMonthTitle(d(2026, 9, 1)), 'September 2026');
  });

  it('lays a month out Monday-first in whole weeks', () => {
    const cells = monthCells(d(2026, 9, 1));
    assert.equal(cells.length % 7, 0);
    assert.equal(cells[0], null);
    assert.equal(dayKey(cells[1]!), '2026-09-01');
    assert.equal(cells.filter(Boolean).length, 30);
  });

  it('fetches only the visible range', () => {
    const week = visibleRange('week', d(2026, 9, 21), d(2026, 9, 1));
    assert.deepEqual([dayKey(week.start), dayKey(week.end)], ['2026-09-21', '2026-09-28']);
    const month = visibleRange('month', d(2026, 9, 21), d(2026, 9, 1));
    assert.deepEqual([dayKey(month.start), dayKey(month.end)], ['2026-09-01', '2026-10-01']);
  });

  it('places the now line and the first scroll', () => {
    assert.equal(nowLineTop(d(2026, 9, 24, 9, 30)), 9.5 * HOUR_PX);
    assert.equal(initialScrollTop(d(2026, 9, 24, 9, 30)), 8 * HOUR_PX);
    assert.equal(initialScrollTop(d(2026, 9, 24, 0, 10)), 0);
    assert.deepEqual([hourLabel(0), hourLabel(9), hourLabel(12), hourLabel(18)], ['12 AM', '9 AM', '12 PM', '6 PM']);
  });
});

describe('calendar posts', () => {
  const posts = toCalendarPosts([
    { id: 'a', prompt_text: 'Diwali offer', platforms: ['facebook'], status: 'scheduled', scheduled_at: d(2026, 9, 24, 9, 30).toISOString(), created_at: '2026-09-01T00:00:00Z' },
    { id: 'b', prompt_text: '', platforms: [], status: 'draft', created_at: d(2026, 9, 24, 9, 5).toISOString() },
    { id: 'c', prompt_text: 'Published', platforms: ['instagram'], status: 'published', published_at: d(2026, 9, 25, 18).toISOString(), created_at: '2026-09-01T00:00:00Z' },
    { id: 'x', prompt_text: 'No date', platforms: [], status: 'draft', created_at: 'not a date' },
  ]);

  it('dates drafts by creation and skips posts with no usable date', () => {
    assert.deepEqual(posts.map((p) => p.id), ['a', 'b', 'c']);
    assert.equal(posts[1]!.title, 'Untitled Post');
  });

  it('finds posts by day and hour, earliest first', () => {
    assert.deepEqual(postsAt(posts, d(2026, 9, 24), 9).map((p) => p.id), ['b', 'a']);
    assert.deepEqual(postsAt(posts, d(2026, 9, 24)).map((p) => p.id), ['b', 'a']);
    assert.deepEqual(postsAt(posts, d(2026, 9, 25), 9), []);
  });

  it('counts the legend and titles chips like the reference', () => {
    assert.deepEqual(legendCounts(posts), { published: 1, scheduled: 1, drafts: 1 });
    assert.equal(chipTitle(posts[0]!, 'week', true), `${posts[0]!.time} · Diwali offer (drag to reschedule)`);
    assert.equal(chipTitle(posts[2]!, 'month', false), 'Published — Published');
  });

  it('moves a dropped post and keeps the right time', () => {
    const original = d(2026, 9, 24, 9, 30);
    assert.equal(dropTime(original, d(2026, 9, 26), 14).getTime(), d(2026, 9, 26, 14, 30).getTime());
    assert.equal(dropTime(original, d(2026, 9, 26), null).getTime(), d(2026, 9, 26, 9, 30).getTime());
    assert.equal(tomorrowAt(d(2026, 9, 30, 22), 9).getTime(), d(2026, 10, 1, 9).getTime());
    assert.deepEqual((['scheduled', 'draft', 'published', 'failed'] as const).map((s) => isReschedulable(s)), [true, true, false, false]);
  });

  it('links an empty slot to Create', () => {
    assert.equal(createLink(d(2026, 9, 24), 9), '/create?date=2026-09-24&time=09:00');
    assert.equal(createLink(d(2026, 9, 24)), '/create?date=2026-09-24');
  });
});

describe('calendar festivals', () => {
  it('picks an emoji from the English name', () => {
    assert.equal(festivalEmoji('Diwali (Deepavali)'), '\u{1FA94}');
    assert.equal(festivalEmoji('Dussehra (Vijayadashami)'), '\u{1F3AF}');
    assert.equal(festivalEmoji('Republic Day'), '\u{1F1EE}\u{1F1F3}');
    assert.equal(festivalEmoji('Onam'), '\u{1F33C}');
    assert.equal(festivalEmoji('Some new festival'), '\u{1F389}');
  });

  it('groups festivals by day, once per name', () => {
    const map = festivalsByDay([
      { name: 'Pongal', date: '2026-01-14', marketingIdea: 'Pongal exchange offers' },
      { name: 'Makar Sankranti', date: '2026-01-14' },
      { name: 'pongal', date: '2026-01-14T00:00:00.000Z' },
    ]);
    assert.deepEqual(map.get('2026-01-14')?.map((f) => f.name), ['Pongal', 'Makar Sankranti']);
    assert.equal(map.get('2026-01-14')?.[0]?.idea, 'Pongal exchange offers');
  });

  it("opens Create with the festival's idea", () => {
    const link = festivalCreateLink(d(2026, 11, 8), { name: 'Diwali', emoji: '', idea: 'Diwali Dhamaka offers' });
    assert.equal(link, `/create?date=2026-11-08&prompt=${encodeURIComponent('Diwali: Diwali Dhamaka offers')}`);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -w web`
Expected: FAIL. `./calendar.js` cannot be resolved.

- [ ] **Step 8: `apps/web/src/utils/calendar.ts`**

```ts
import type { Post } from '../services/creative';
import type { PostStatus } from './posts.js';

export type CalendarView = 'week' | 'month';

/** One hour row: the reference's h-14. */
export const HOUR_PX = 56;
export const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Reference colours for published/scheduled/draft/failed; ours for the approval and publishing states.
export const STATUS_DOT: Record<PostStatus, string> = {
  published: 'bg-emerald-500', scheduled: 'bg-amber-500', draft: 'bg-zinc-400', failed: 'bg-red-500',
  pending_approval: 'bg-violet-400', approved: 'bg-teal-500', publishing: 'bg-blue-400',
};
export const STATUS_STYLES: Record<PostStatus, string> = {
  published: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  scheduled: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  draft: 'bg-zinc-100 text-zinc-600',
  failed: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  pending_approval: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  approved: 'bg-teal-50 text-teal-700 ring-1 ring-teal-100',
  publishing: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
};
export const STATUS_LABELS: Record<PostStatus, string> = {
  published: 'Published', scheduled: 'Scheduled', draft: 'Draft', failed: 'Failed',
  pending_approval: 'Awaiting approval', approved: 'Ready to publish', publishing: 'Publishing',
};

export interface CalendarPost {
  id: string;
  title: string;
  platforms: string[];
  status: PostStatus;
  date: Date;
  time: string;
}

export function toCalendarPosts(posts: ReadonlyArray<Pick<Post, 'id' | 'prompt_text' | 'platforms' | 'status' | 'scheduled_at' | 'published_at' | 'created_at'>>): CalendarPost[] {
  return posts.flatMap((p) => {
    // Drafts have no scheduled_at: fall back to the publish or creation time; skip rows with no usable date.
    const raw = p.scheduled_at ?? p.published_at ?? p.created_at;
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return [];
    return [{
      id: p.id,
      title: p.prompt_text || 'Untitled Post',
      platforms: p.platforms ?? [],
      status: p.status,
      date,
      time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    }];
  });
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** Monday 00:00 of the week `offset` weeks from the one holding `today`. */
export function startOfWeek(today: Date, offset = 0): Date {
  const dow = today.getDay() || 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow + 1 + offset * 7);
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function monthStart(today: Date, offset = 0): Date {
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

/** Month cells, Monday first: blanks before the 1st and after the last day fill whole weeks. */
export function monthCells(month: Date): Array<Date | null> {
  const lead = (month.getDay() || 7) - 1;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const n = i - lead + 1;
    return n >= 1 && n <= days ? new Date(month.getFullYear(), month.getMonth(), n) : null;
  });
}

export function visibleRange(view: CalendarView, weekStart: Date, month: Date): { start: Date; end: Date } {
  if (view === 'week') return { start: weekStart, end: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7) };
  return { start: month, end: new Date(month.getFullYear(), month.getMonth() + 1, 1) };
}

/** "21 – 27 September 2026", "28 September – 4 October 2026", or across years with both years. */
export function formatWeekRange(days: readonly Date[]): string {
  const start = days[0];
  const end = days[days.length - 1];
  if (!start || !end) return '';
  const m = (d: Date) => MONTHS[d.getMonth()];
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${m(start)} ${start.getFullYear()} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) return `${start.getDate()} ${m(start)} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
  return `${start.getDate()} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
}

export function formatMonthTitle(month: Date): string {
  return `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

/** Posts on a day (and, for the week grid, in one hour), earliest first. */
export function postsAt(posts: readonly CalendarPost[], day: Date, hour?: number): CalendarPost[] {
  return posts
    .filter((p) => sameDay(p.date, day) && (hour === undefined || p.date.getHours() === hour))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function createLink(day: Date, hour?: number): string {
  const date = `/create?date=${dayKey(day)}`;
  return hour === undefined ? date : `${date}&time=${String(hour).padStart(2, '0')}:00`;
}

export function nowLineTop(now: Date): number {
  return (now.getHours() + now.getMinutes() / 60) * HOUR_PX;
}

/** The week grid opens an hour before now. */
export function initialScrollTop(now: Date): number {
  return Math.max(0, now.getHours() - 1) * HOUR_PX;
}

export function isReschedulable(status: PostStatus): boolean {
  return status === 'scheduled' || status === 'draft';
}

/** A week-grid drop keeps the minutes and takes the slot's day and hour; a month-cell drop keeps the time of day. */
export function dropTime(original: Date, day: Date, hour: number | null): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? original.getHours(), original.getMinutes());
}

export function tomorrowAt(now: Date, hour: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0, 0);
}

export interface LegendCounts { published: number; scheduled: number; drafts: number }

export function legendCounts(posts: ReadonlyArray<Pick<CalendarPost, 'status'>>): LegendCounts {
  return {
    published: posts.filter((p) => p.status === 'published').length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    drafts: posts.filter((p) => p.status === 'draft').length,
  };
}

export function chipTitle(post: CalendarPost, view: CalendarView, draggable: boolean): string {
  const base = view === 'week' ? `${post.time} · ${post.title}` : `${post.title} — ${STATUS_LABELS[post.status]}`;
  return draggable ? `${base} (drag to reschedule)` : base;
}

/** A GET /dealer/festivals row. `date` is YYYY-MM-DD, or an ISO timestamp from the upcoming list. */
export interface FestivalDate {
  name: string;
  name_en?: string;
  date: string;
  marketingIdea?: string;
}

export interface FestivalMark {
  name: string;
  emoji: string;
  idea?: string;
}

// The reference's emoji table, matched on the English name; 🎉 for anything else.
const FESTIVAL_EMOJI: Array<[RegExp, string]> = [
  [/diwali|deepavali/i, '\u{1FA94}'], [/dhanteras/i, '\u{1FA99}'], [/holi/i, '\u{1F3A8}'], [/eid/i, '\u{1F319}'],
  [/raksha|rakhi/i, '\u{1F9E1}'], [/janmashtami|krishna/i, '\u{1FA88}'], [/ganesh/i, '\u{1F418}'], [/navratri|durga/i, '\u{1F483}'],
  [/dussehra|vijayadashami/i, '\u{1F3AF}'], [/karwa/i, '\u{1F315}'], [/bhai dooj/i, '\u{1F46B}'], [/chhath/i, '\u{1F305}'],
  [/guru nanak|gurpurab/i, '\u{1F64F}'], [/ugadi|gudi/i, '\u{1F338}'], [/onam/i, '\u{1F33C}'], [/shivratri|shivaratri/i, '\u{1F531}'],
  [/ram navami/i, '\u{1F64F}'], [/akshaya/i, '✨'], [/buddha/i, '☮️'], [/christmas/i, '\u{1F384}'],
  [/republic|independence/i, '\u{1F1EE}\u{1F1F3}'], [/pongal|sankranti/i, '\u{1FA81}'], [/baisakhi/i, '\u{1F33E}'], [/lohri/i, '\u{1F525}'],
];

export function festivalEmoji(name: string): string {
  return FESTIVAL_EMOJI.find(([re]) => re.test(name))?.[1] ?? '\u{1F389}';
}

/** Festivals by local day key, once per name per day. */
export function festivalsByDay(list: readonly FestivalDate[]): Map<string, FestivalMark[]> {
  const map = new Map<string, FestivalMark[]>();
  for (const f of list) {
    const key = f.date.slice(0, 10);
    const name = f.name_en || f.name;
    const marks = map.get(key) ?? [];
    if (!marks.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      marks.push({ name, emoji: festivalEmoji(name), ...(f.marketingIdea ? { idea: f.marketingIdea } : {}) });
    }
    map.set(key, marks);
  }
  return map;
}

/** Our "festival suggestions" extra: a festival chip opens Create on that day, prefilled with the festival's idea. */
export function festivalCreateLink(day: Date, festival: FestivalMark): string {
  const prompt = `${festival.name}: ${festival.idea ?? `${festival.name} offer post`}`.slice(0, 500);
  return `${createLink(day)}&prompt=${encodeURIComponent(prompt)}`;
}
```

- [ ] **Step 9: `apps/web/src/services/dealer.ts`.** Add `import type { FestivalDate } from '../utils/calendar';` and, in `dealerService`:

```ts
  /** GET /dealer/festivals?from&to: festival dates for the dealer's region (YYYY-MM-DD, end exclusive). */
  festivals: (from: string, to: string) =>
    api.get<{ success: boolean; festivals: Array<FestivalDate & { id: string; isRegional: boolean }> }>('/dealer/festivals', { from, to }),
```

- [ ] **Step 10: `apps/web/src/components/calendar/CalendarGrids.tsx`**

```tsx
import { Fragment, type DragEvent, type RefObject } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../ui/Button';
import {
  HOURS, STATUS_DOT, WEEKDAYS, chipTitle, dayKey, hourLabel, monthCells, nowLineTop, postsAt, sameDay,
  type CalendarPost, type FestivalMark, type LegendCounts,
} from '../../utils/calendar';

const GRID_COLUMNS = '3.5rem repeat(7, minmax(0, 1fr))';

interface GridProps {
  now: Date;
  posts: CalendarPost[];
  festivals: Map<string, FestivalMark[]>;
  dragging: boolean;
  canDragPost: (post: CalendarPost) => boolean;
  onOpen: (post: CalendarPost) => void;
  onDropPost: (postId: string, day: Date, hour: number | null) => void;
  onDragState: (dragging: boolean) => void;
  onFestival: (day: Date, festival: FestivalMark) => void;
}

function dropHandler(onDropPost: GridProps['onDropPost'], day: Date, hour: number | null) {
  return (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) onDropPost(id, day, hour);
  };
}

export function CalendarLegend({ counts }: { counts: LegendCounts }) {
  const items = [
    { label: 'Published', dot: 'bg-emerald-500', n: counts.published },
    { label: 'Scheduled', dot: 'bg-amber-500', n: counts.scheduled },
    { label: 'Drafts', dot: 'bg-zinc-400', n: counts.drafts },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs text-zinc-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', i.dot)} />
          {i.label}
          <span className="font-semibold text-zinc-800">{i.n}</span>
        </span>
      ))}
      <span>{'\u{1F389}'} Festivals shown</span>
    </div>
  );
}

function FestivalChip({ day, festival, onFestival }: { day: Date; festival: FestivalMark; onFestival: GridProps['onFestival'] }) {
  return (
    <button
      type="button"
      onClick={() => onFestival(day, festival)}
      title={festival.idea ?? festival.name}
      className="mt-0.5 block w-full truncate rounded bg-orange-50 px-1 text-left text-[9px] font-semibold leading-4 text-orange-700 hover:bg-orange-100 transition-colors"
    >
      {festival.emoji} {festival.name}
    </button>
  );
}

function PostChip({ post, view, draggable, onOpen, onDragState }: {
  post: CalendarPost;
  view: 'week' | 'month';
  draggable: boolean;
  onOpen: GridProps['onOpen'];
  onDragState: GridProps['onDragState'];
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', post.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragState(true);
      }}
      onDragEnd={() => onDragState(false)}
      onClick={() => onOpen(post)}
      title={chipTitle(post, view, draggable)}
      className={cn(
        'w-full flex items-center gap-1 px-1 py-0.5 rounded text-left',
        view === 'week' ? 'bg-white border border-zinc-200 shadow-sm hover:bg-zinc-50' : 'bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 transition-colors',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT[post.status])} />
      <span className="text-[10px] font-medium text-zinc-700 truncate">{post.title}</span>
    </button>
  );
}

export function WeekGrid({ days, now, posts, festivals, dragging, canDragPost, onOpen, onDropPost, onDragState, onFestival, onSlot, scrollRef }: GridProps & {
  days: Date[];
  onSlot: (day: Date, hour: number) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const todayIndex = days.findIndex((d) => sameDay(d, now));
  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="grid border-b border-zinc-200" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        <div />
        {days.map((day, i) => (
          <div key={dayKey(day)} className={cn('px-1 py-2 text-center min-w-0 border-l border-zinc-100', i === todayIndex && 'bg-orange-50/50')}>
            <p className="text-[11px] font-medium text-zinc-400">{WEEKDAYS[i]}</p>
            <p className={cn('text-lg font-semibold leading-tight', i === todayIndex ? 'text-orange-600' : 'text-zinc-800')}>{day.getDate()}</p>
            {(festivals.get(dayKey(day)) ?? []).map((f) => <FestivalChip key={f.name} day={day} festival={f} onFestival={onFestival} />)}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: GRID_COLUMNS }}>
          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="h-14 pr-1.5 pt-0.5 text-right text-[10px] text-zinc-400 border-t border-r border-zinc-100 select-none">{hourLabel(hour)}</div>
              {days.map((day, i) => (
                <div
                  key={`${dayKey(day)}-${hour}`}
                  title="Click to schedule a post at this time"
                  onClick={(e) => { if (e.target === e.currentTarget) onSlot(day, hour); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={dropHandler(onDropPost, day, hour)}
                  className={cn(
                    'h-14 border-t border-r border-zinc-100 p-0.5 space-y-0.5 overflow-hidden cursor-pointer transition-colors',
                    i === 6 && 'border-r-0',
                    i === todayIndex ? 'bg-orange-50/30' : 'hover:bg-orange-50/40',
                    dragging && 'hover:bg-orange-100/60',
                  )}
                >
                  {postsAt(posts, day, hour).map((p) => (
                    <PostChip key={p.id} post={p} view="week" draggable={canDragPost(p)} onOpen={onOpen} onDragState={onDragState} />
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
          {todayIndex >= 0 && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{ top: nowLineTop(now), left: `calc(3.5rem + ${todayIndex} * (100% - 3.5rem) / 7)`, width: 'calc((100% - 3.5rem) / 7)' }}
            >
              <div className="relative border-t-2 border-red-500">
                <span className="absolute -left-[3px] -top-[5px] w-2 h-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MonthGrid({ month, now, posts, festivals, dragging, canDragPost, onOpen, onDropPost, onDragState, onFestival, onAdd }: GridProps & {
  month: Date;
  onAdd: (day: Date) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/60">
        {WEEKDAYS.map((d) => <div key={d} className="py-2 text-center text-[11px] font-semibold text-zinc-500">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {monthCells(month).map((day, i) => {
          if (!day) return <div key={`blank-${i}`} className={cn('min-h-[88px] border-r border-b border-zinc-100 bg-zinc-50/40', i % 7 === 6 && 'border-r-0')} />;
          const isToday = sameDay(day, now);
          const dayPosts = postsAt(posts, day);
          return (
            <div
              key={dayKey(day)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropHandler(onDropPost, day, null)}
              className={cn(
                'min-h-[88px] p-1.5 border-r border-b border-zinc-100 transition-colors',
                i % 7 === 6 && 'border-r-0',
                isToday ? 'bg-orange-50/40' : 'hover:bg-zinc-50/60',
                dragging && 'hover:bg-orange-100/60',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-[11px] font-semibold', isToday ? 'w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center' : 'text-zinc-700')}>
                  {day.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(day)}
                  aria-label={`Add post on ${day.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}
                  className="w-5 h-5 grid place-items-center rounded text-zinc-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {(festivals.get(dayKey(day)) ?? []).map((f) => <FestivalChip key={f.name} day={day} festival={f} onFestival={onFestival} />)}
              <div className="space-y-0.5 mt-0.5">
                {dayPosts.slice(0, 2).map((p) => (
                  <PostChip key={p.id} post={p} view="month" draggable={canDragPost(p)} onOpen={onOpen} onDragState={onDragState} />
                ))}
                {dayPosts.length > 2 && <p className="px-1 text-[10px] font-medium text-zinc-400">+{dayPosts.length - 2} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 11: `apps/web/src/components/calendar/PostDetailModal.tsx`**

```tsx
import { useState } from 'react';
import { CalendarDays, Clock, Loader2, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PlatformIcon, type PlatformIconProps } from '../ui/PlatformIcon';
import { toLocalInput } from '../../utils/posts';
import { STATUS_LABELS, STATUS_STYLES, hourLabel, isReschedulable, tomorrowAt, type CalendarPost } from '../../utils/calendar';

const ICON_PLATFORMS = new Set(['facebook', 'instagram', 'gmb', 'youtube']);

function PlatformMark({ platform }: { platform: string }) {
  if (ICON_PLATFORMS.has(platform)) return <PlatformIcon platform={platform as PlatformIconProps['platform']} size="md" />;
  return <span className="text-[10px] font-bold uppercase text-zinc-500">{platform}</span>;
}

export function PostDetailModal({ post, canPublish, onClose, onCancel, onReschedule }: {
  post: CalendarPost;
  canPublish: boolean;
  onClose: () => void;
  onCancel: (id: string) => Promise<boolean>;
  onReschedule: (id: string, iso: string) => Promise<boolean>;
}) {
  const [now] = useState(() => new Date());
  const [view, setView] = useState<'details' | 'cancel'>('details');
  const [newTime, setNewTime] = useState(() => toLocalInput(post.date));
  const [busy, setBusy] = useState(false);
  // Rescheduling makes the post go live, which needs publish_post (the API answers 403 otherwise).
  const canReschedule = canPublish && isReschedulable(post.status);
  // Cancelling returns a scheduled post to drafts; a draft has no schedule to cancel.
  const canCancel = post.status === 'scheduled';
  const quickPicks = [9, 12, 18].map((hour) => ({ label: `Tomorrow ${hourLabel(hour)}`, value: toLocalInput(tomorrowAt(now, hour)) }));

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await action()) onClose();
    } finally {
      setBusy(false);
    }
  };

  if (view === 'cancel') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title="Cancel this scheduled post?"
        variant="danger"
        size="sm"
        closeOnOverlayClick={!busy}
        closeOnEscape={!busy}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setView('details')} disabled={busy}>Keep post</Button>
            <Button variant="danger" onClick={() => void run(() => onCancel(post.id))} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Cancel post
            </Button>
          </>
        )}
      >
        <p className="text-sm text-zinc-600">This post will not be published and will be removed from your schedule. It moves back to your drafts.</p>
        <p className="text-sm font-medium text-zinc-900 mt-3 line-clamp-2">{post.title}</p>
      </Modal>
    );
  }

  const footer = canCancel || canReschedule ? (
    <>
      {canCancel && (
        <Button variant="secondary" className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300" onClick={() => setView('cancel')} disabled={busy}>
          <Trash2 className="w-4 h-4" /> Cancel Post
        </Button>
      )}
      {canReschedule && (
        <Button onClick={() => void run(() => onReschedule(post.id, new Date(newTime).toISOString()))} disabled={busy || !newTime}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
          Confirm Reschedule
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <Modal isOpen onClose={onClose} title={post.title} size="sm" footer={footer} closeOnOverlayClick={!busy} closeOnEscape={!busy}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full', STATUS_STYLES[post.status])}>{STATUS_LABELS[post.status]}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <CalendarDays className="w-3.5 h-3.5" />
            {post.date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        {post.platforms.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {post.platforms.map((p) => <PlatformMark key={p} platform={p} />)}
          </div>
        )}
        {canReschedule && (
          <div className="space-y-2.5 pt-3 border-t border-zinc-100">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Reschedule</p>
            <div className="flex flex-wrap gap-1.5">
              {quickPicks.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={newTime === q.value}
                  onClick={() => setNewTime(q.value)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', newTime === q.value ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-zinc-700 border-zinc-200 hover:border-orange-300 hover:text-orange-700')}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              min={toLocalInput(now)}
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              aria-label="New date and time"
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30"
            />
          </div>
        )}
        {post.status === 'published' && <p className="text-center text-xs text-zinc-400">Published — no actions available.</p>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 12: Replace `apps/web/src/pages/Calendar.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { useToast } from '../components/ui/Toast';
import { CalendarLegend, MonthGrid, WeekGrid } from '../components/calendar/CalendarGrids';
import { PostDetailModal } from '../components/calendar/PostDetailModal';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, can } from '../lib/permissions';
import { ApiError } from '../services/api';
import { postService, type Post } from '../services/creative';
import { dealerService } from '../services/dealer';
import {
  createLink, dropTime, festivalCreateLink, festivalsByDay, formatMonthTitle, formatWeekRange, initialScrollTop, isReschedulable, legendCounts,
  monthStart, startOfWeek, toCalendarPosts, visibleRange, weekDays, type CalendarPost, type CalendarView, type FestivalDate, type FestivalMark,
} from '../utils/calendar';

export default function CalendarPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [festivalList, setFestivalList] = useState<FestivalDate[]>([]);
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The red now line moves every minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const weekStart = startOfWeek(now, weekOffset);
  const days = weekDays(weekStart);
  const month = monthStart(now, monthOffset);
  const range = visibleRange(view, weekStart, month);
  const fromIso = range.start.toISOString();
  const toIso = range.end.toISOString();

  useEffect(() => {
    let cancelled = false;
    postService.getCalendar(fromIso, toIso)
      .then((res) => { if (!cancelled) setApiPosts(res.data ?? []); })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', title: 'Could not load calendar', message: 'Please refresh to try again.' });
      });
    return () => { cancelled = true; };
  }, [fromIso, toIso, reloadKey, addToast]);

  // Festivals once, from last January to the end of next year: region-aware, from GET /dealer/festivals.
  const festivalYear = now.getFullYear();
  useEffect(() => {
    let cancelled = false;
    dealerService.festivals(`${festivalYear - 1}-01-01`, `${festivalYear + 2}-01-01`)
      .then((res) => { if (!cancelled) setFestivalList(res.festivals); })
      .catch(() => { /* the calendar still works without the festival overlay */ });
    return () => { cancelled = true; };
  }, [festivalYear]);

  // The week view opens around the current hour.
  useEffect(() => {
    if (view === 'week' && scrollRef.current) scrollRef.current.scrollTop = initialScrollTop(new Date());
  }, [view, weekOffset]);

  const posts = useMemo(() => toCalendarPosts(apiPosts), [apiPosts]);
  const festivals = useMemo(() => festivalsByDay(festivalList), [festivalList]);
  const canDragPost = (post: CalendarPost) => canPublish && isReschedulable(post.status);

  const reschedule = async (id: string, iso: string): Promise<boolean> => {
    try {
      await postService.reschedule(id, iso);
      addToast({ type: 'success', title: 'Rescheduled' });
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Couldn’t reschedule',
        message: err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : 'The post could not be moved. Please try again.',
      });
      return false;
    }
  };

  const cancelSchedule = async (id: string): Promise<boolean> => {
    try {
      await postService.cancelSchedule(id);
      addToast({ type: 'success', title: 'Schedule cancelled', message: 'The post is back in your drafts.' });
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      addToast({ type: 'error', title: 'Cancel failed', message: err instanceof Error && err.message ? err.message : 'Could not cancel. Try again.' });
      return false;
    }
  };

  const dropPost = (postId: string, day: Date, hour: number | null) => {
    setDragging(false);
    const post = posts.find((p) => p.id === postId);
    if (!post || !canDragPost(post)) return;
    const when = dropTime(post.date, day, hour);
    if (when.getTime() <= Date.now()) {
      addToast({ type: 'warning', title: 'Can’t schedule in the past', message: 'Drop the post on a future date or time slot.' });
      return;
    }
    if (when.getTime() !== post.date.getTime()) void reschedule(post.id, when.toISOString());
  };

  const openFestival = (day: Date, festival: FestivalMark) => navigate(festivalCreateLink(day, festival));
  const shift = (delta: number) => (view === 'week' ? setWeekOffset((o) => o + delta) : setMonthOffset((o) => o + delta));
  const goToday = () => (view === 'week' ? setWeekOffset(0) : setMonthOffset(0));
  const grid = { festivals, dragging, canDragPost, onOpen: setSelected, onDropPost: dropPost, onDragState: setDragging, onFestival: openFestival };

  return (
    <PageCard>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white overflow-hidden flex-shrink-0">
            <button type="button" aria-label="Previous" onClick={() => shift(-1)} className="h-9 w-9 grid place-items-center text-zinc-500 hover:bg-zinc-50 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={goToday} className="h-9 px-3 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 border-x border-zinc-200 transition-colors">
              Today
            </button>
            <button type="button" aria-label="Next" onClick={() => shift(1)} className="h-9 w-9 grid place-items-center text-zinc-500 hover:bg-zinc-50 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 truncate">{view === 'week' ? formatWeekRange(days) : formatMonthTitle(month)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Calendar view" className="inline-flex bg-zinc-100/80 rounded-xl p-1 gap-1">
            {(['week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn('px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all', view === v ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
              >
                {v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <Button onClick={() => navigate('/create')}><Plus className="w-4 h-4" /> New Post</Button>
        </div>
      </div>

      <CalendarLegend counts={legendCounts(posts)} />

      {view === 'week' ? (
        <WeekGrid {...grid} days={days} now={now} posts={posts} scrollRef={scrollRef} onSlot={(day, hour) => navigate(createLink(day, hour))} />
      ) : (
        <MonthGrid {...grid} month={month} now={now} posts={posts} onAdd={(day) => navigate(createLink(day))} />
      )}

      {selected && (
        <PostDetailModal post={selected} canPublish={canPublish} onClose={() => setSelected(null)} onCancel={cancelSchedule} onReschedule={reschedule} />
      )}
    </PageCard>
  );
}
```

- [ ] **Step 13: Verify**

Run: `npm test -w web && npm run build && npm run lint -w web 2>/dev/null | tail -1 && grep -n "FESTIVALS\|getFestivalsForDate" apps/web/src/pages/Calendar.tsx`
Expected: tests pass, the root build exits 0, lint is at 45 or below, and the grep prints nothing: the hard-coded list is gone.

Manual check (`web-local` + `api-verify`):
- `/calendar` shows "‹ Today ›", the week title ("21 – 27 September 2026"), Week|Month and New Post.
- The legend shows counts and "🎉 Festivals shown". Today's column is tinted, and the red line sits at the current time.
- The grid opens scrolled to the hour before now.
- Click an empty 3 PM slot → `/create?date=…&time=15:00`.
- Drag a scheduled post to tomorrow 10 AM → "Rescheduled", and it moves. Drag it to yesterday → "Can’t schedule in the past".
- Month view shows up to two chips and "+N more"; the "+" button opens `/create?date=…`.
- For a Pune dealer, Ganesh Chaturthi appears on 15 September 2026; for a Delhi dealer it does not. Clicking the chip opens Create with its idea in the prompt.
- Clicking a scheduled post opens its title, the reschedule quick picks, "Cancel Post" → "Cancel this scheduled post?" → "Cancel post" → "Schedule cancelled".
- A Creator (without `publish_post`) can't drag and sees no reschedule block.
- Dark mode reads.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/services/festivalCalendar.ts apps/api/src/routes/dealer.ts apps/api/test/festivalCalendar.test.ts apps/api/test/dealer-festivals.test.ts apps/web/src/services/dealer.ts apps/web/src/utils/calendar.ts apps/web/src/utils/calendar.test.ts apps/web/src/components/calendar apps/web/src/pages/Calendar.tsx
git commit -m "feat: Calendar in the reference layout with regional festivals by date range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Verify and ship (controller)

The controller runs this task, not a subagent.

- [ ] **Step 1: Full gate**

```bash
npm run build
cd apps/api && npx prisma generate && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'
npm test -w web
npm run lint -w web 2>/dev/null | tail -1
grep -rn 'key=\${' apps/api/src
git diff "$(git merge-base HEAD origin/main)" -- apps/api/prisma/schema.prisma
git diff "$(git merge-base HEAD origin/main)" -- apps | grep -n $'\xef\xbf\xbd'
grep -rn "BillingPage\|simulateWebhook\|sg_notifications\|getFestivalsForDate\|18\.4" apps/web/src
```

Expected:
- The build exits 0; it type-checks `apps/api/test`.
- API: all tests pass, including the six new files: `dealer-logo`, `user-preferences`, `users-account`, `billing-plans`, `boost` and `dealer-festivals`.
- Web: all tests pass, including `settings`, `brandPalette`, `settingsPlatforms`, `billing`, `preferences`, `team`, `inspiration`, `boost` and `calendar`.
- Lint is at 45 or below; expect about 36.
- The `key=` grep prints nothing.
- The schema diff shows E1's lines plus exactly three E2 lines: `Dealer.use_brand_theme`, `DealerUser.theme_mode` and `DealerUser.notification_prefs`.
- No U+FFFD replacement characters, and the last grep prints nothing.
- Eyeball the non-ASCII copy in the diff with `git diff "$(git merge-base HEAD origin/main)" -- apps/web/src | grep -nP '^\+.*[^\x00-\x7F]'`. Check each — – ’ … · ₹ × “ ” against the plan.

- [ ] **Step 2: Local end-to-end** (the `api-verify` and `web-local` launch configs: in-memory store, local-only secrets, no Razorpay variables)

Sign in through the local dev flow, never with production secrets, and take `$TOKEN` from `localStorage.access_token`. Then connect mock Meta:

```bash
REDIRECT=$(curl -s -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:3001/v1/platforms/connect/facebook?mock=true' | node -pe 'JSON.parse(require("fs").readFileSync(0)).redirect_url')
curl -s -o /dev/null "$REDIRECT"
```

Checks:
- `/billing` redirects to `/settings?tab=billing`, and `/settings?tab=platforms` opens Platforms.
- Every Settings tab: layout, copy, loading, empty and error states as in Tasks 6–12.
- Business Profile brand theme on and off; logo upload of PNG, SVG (refused) and over 2 MB (refused).
- Preferences: the theme follows you across two browser profiles; a notification opt-out is respected. Publish a post with "A post is published" off: no bell item for you.
- Team account edit, the invite owner option (hidden for a Manager), role change.
- Boost: wizard estimate parity (step 2 and step 5 show the same figure), the gender sent, drafts listed, stop.
- Calendar: drag, festivals, cancel, legend.
- Check each page at 1280 px and at 390 px (no horizontal scroll), once in dark mode and once with the brand theme on.
- The browser console has no errors.

- [ ] **Step 3: Final whole-branch review.** Run an independent review of `feature/stage-e1-accounts..HEAD` (this branch's own diff) focused on:
- **Web ↔ API contracts:**
  - `services/billing.ts` against `routes/billing.ts` + `lib/billingPlans.ts`;
  - `utils/preferences.ts` `NOTIFICATION_TYPES` against `lib/notifications.ts`;
  - `userService.updateAccount` against `PATCH /users/:id/account`;
  - `dealerService.uploadLogo` against `POST /dealer/logo` (`logo_url`);
  - `dealerService.festivals` against `festivalsBetween`;
  - boost `post` and `campaignsThisMonth`.
- Permissions on the new routes: `manage_users`, the owner guards, `view_billing`, `run_boost`.
- No fabricated copy: Boost, Billing and Platforms.
- Message-only logging in every touched route.
- Schema edits are targeted.
- `App.tsx` changed only on the `/billing` line and its import.

Fix anything found before the PR.

- [ ] **Step 4: Pull request.**
- Push `feature/stage-e2-settings` and open a PR against E1's branch while E1 is open. Once E1 merges, retarget it to `main`.
- The body has:
  - a summary per area: Settings tabs, the brand theme, preferences and notifications, billing catalogue and payments gate, team account edit, Boost, Calendar;
  - the "Decisions and deviations" list, shortened, listing for owner review:
    - the Enterprise highlight bullets moved unchanged from the old Billing page;
    - the reworded Manager helper copy;
  - a test plan (Steps 1 and 2);
  - the optional owner step below;
  - neutral wording and no credentials;
  - the attribution line at the end.

- [ ] **Step 5: Owner step (optional; ask, do not run).**
- To turn on online payments, set these on Cloud Run: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and the six `RAZORPAY_PLAN_<TIER>_<CYCLE>` plan ids from the Razorpay dashboard.
- Until then Billing shows the "payments are being set up" notice and Subscribe stays disabled.
- No Firestore index or TTL change is needed. Every new query filters by document id or by equality, and logos go to the existing public bucket under `logos/`.

- [ ] **Step 6: Merge and deploy** (only when the user says so, and only after E1 is merged and deployed).
- Merge the PR. The user may need to run `gh pr merge`; check `.merged` before deploying.
- Deploy the API from a clean `git archive` of the current `origin/main` with the usual `gcloud run deploy cardekho-api --source .` flow. First check `gcloud builds list --region asia-south1 --project gen-lang-client-0078524499 --ongoing`.
- Hosting deploys the web.
- Smoke test on production:
  - `GET /v1/billing/plans` answers 200 with `payments_enabled: false` (unless configured);
  - `GET /v1/users/me/preferences` answers 200;
  - `GET /v1/dealer/festivals?from=2026-01-01&to=2027-01-01` answers 200;
  - `POST /v1/boost/reach-estimate {"dailyBudget":1000}` answers `12000/20000`;
  - `/billing` redirects;
  - `/settings`, `/boost` and `/calendar` load.
- Update `memory/progress.md` and `memory/decisions.md`. They are not committed.
