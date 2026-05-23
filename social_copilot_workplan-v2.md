# Comprehensive Workplan: AI Social Media Auto-Scheduler & Copilot
## System Target: Antigravity 2.0 (Agentic Execution Specification)

This specification document outlines the engineering architecture, structural implementation steps, data schemas, and dedicated **Multi-Agent Workflow Instructions** required to construct the AI Social Media Auto-Scheduler platform.

---

# 1. System Topology & Infrastructure Layout

```
                 +---------------------------------------------------+
                 |           Next.js 15+ Frontend Client             |
                 |      (App Router / Tailwind CSS / Shadcn UI)      |
                 +-----------------------------------+---------------+
                                                     |
                                   REST / Webhooks   |
                                                     v
                                 +-------------------+---------------+
                                 |          API Routing Layer        |
                                 |        (Next.js Route Handlers)   |
                                 +---------+---------------+---------+
                                           |               |
                    Drizzle ORM Queries    |               |   Event Ingestion / Triggers
                                           v               v
+-----------------------+        +---------+-------+   +---+---------------+
|       Neon DB         | <----+ |   PostgreSQL    |   |     Ingest Engine |
|  (Serverless Vector)  |        |  Database Layer |   | (Background Cron) |
+-----------------------+        +-----------------+   +---+---------------+
                                                           |
                                                           | Job Dispatch
                                                           v
                                                       +---+---------------+
                                                       |   Worker Lambda   |
                                                       | (Executes Post /  |
                                                       |  Auto-Reply Loop) |
                                                       +---+---------------+
```

### Technology Matrix Configuration
* **Core Framework:** Next.js 15.2+ (App Router, React 19, Strict TypeScript)
* **Component Library:** Shadcn UI (Base layer, Radix Primitives, Tailwind CSS integration)
* **Authentication & Subscription Access:** Clerk Core Engine with Clerk Billing (Premium Tier Guarding)
* **Database Infrastructure:** Neon DB (Serverless PostgreSQL Connection Pool)
* **Object Relational Mapper (ORM):** Drizzle ORM + Drizzle Kit Migrations Pipeline
* **Queue Management & Cron Scheduling:** Ingest Core Framework (`localhost:8288` for local orchestration)
* **Artificial Intelligence Tier:** Google Gemini Flash API (`gemini-1.5-flash-latest` via `@google/generative-ai`)
* **Media Assets & Optimization Layer:** Image Kit SDK with URL-based Real-Time Transformers

---

# 2. Schema Blueprint (`db/schema.ts`)

```typescript
import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

// User Registry Sync via Clerk Webhook
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // Maps directly to Clerk User ID
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('fullName', { length: 255 }),
  tier: varchar('tier', { length: 50 }).default('free').notNull(), // 'free' | 'premium'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Connected Social Channels Oauth Credentials Matrix
export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'cascade' }).notNull(),
  platform: varchar('platform', { length: 50 }).notNull(), // 'x', 'youtube', 'linkedin', 'instagram'
  accountName: varchar('account_name', { length: 255 }).notNull(),
  profileImage: text('profile_image'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Editorial Pipeline Storage System
export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'cascade' }).notNull(),
  caption: text('caption').notNull(),
  mediaUrls: jsonb('media_urls').default([]).notNull(), // Array of structures: { url: string, fileId: string }
  platforms: jsonb('platforms').notNull(), // Selected array targets: ['x', 'youtube']
  status: varchar('status', { length: 50 }).default('draft').notNull(), // 'draft' | 'scheduled' | 'published' | 'failed'
  scheduledFor: timestamp('scheduled_for'),
  ingestJobId: varchar('ingest_job_id', { length: 255 }),
  errorMessage: text('error_message'),
  isVideoPost: boolean('is_video_post').default(false).notNull(), // Explicit YouTube/TikTok override Flag
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Automation Matrix for Inbound Comments Response Engine
export const autoReplyRules = pgTable('auto_reply_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'cascade' }).notNull(),
  accountId: uuid('account_id').references(() => socialAccounts.id, { onDelete: 'cascade' }).notNull(),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'keyword_match' | 'any_comment'
  keywords: jsonb('keywords').default([]).notNull(), // Array of match strings
  replyType: varchar('reply_type', { length: 50 }).default('static').notNull(), // 'static' | 'ai_contextual'
  staticResponse: text('static_response'),
  aiContextHint: text('ai_context_hint'), // Training directive override: 'Be professional and polite'
  isEnabled: boolean('is_enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

# 3. Microarchitectural Feature Breakdown

## Phase 1: Core Grounding & Multi-Account Hook Matrix
* **Identity Provisioning Wrapper:** Enforce Clerk custom session state routing protocols. Catch unregistered profiles downstream through runtime catch-all loops (`/app/(auth)/sign-in`) parsing session hashes securely.
* **Secure Webhook Signatures:** Build out highly secure transaction intercept structures using `svix` validation algorithms inside `/app/api/webhook/clerk/route.ts` transforming incoming `user.created` payloads directly into active structural entries matching the underlying `users` schema model.
* **Database Synchronicity:** Execute explicit deployment structural mappings via `drizzle-kit push` vectors to establish structural keys across our serverless Neon PostgreSQL cluster pools.

## Phase 2: Shell Layout Elements & Client Navigation System
* **Context Mode Engine:** Build standard viewport constraints leveraging state tokens directly to enable quick transitions across system components. Clean global parameters override dark mode UI schemas with explicit base styles.
* **Sidebar Command Navigation Panel:** Pin persistent interaction routes securely inside dashboard margins providing quick access parameters leading straight toward advanced sub-sections (`/dashboard/compose`).

## Phase 3: Secure External OAuth Protocol Management
* **OAuth Lifecycle Handlers:** Construct robust runtime handshake route layers managing incoming verification credentials safely inside `/app/api/oauth/[platform]/callback/route.ts`. Extract processing parameters safely, updating target token pools down to the database infrastructure seamlessly.
* **Token Expiry Monitors:** Inject clear visual parameters inside user interaction interfaces providing immediate notification badges whenever linked credentials slip underneath active validity tolerances.

## Phase 4: Creative Publisher Panel & AI Language Infrastructure
* **Cross-Channel Preview Pipeline:** Construct modular user interface tabs generating live mockups mimicking system constraints assigned to integrated targets (e.g. matching X character limit indicators or parsing vertical shorts presentation ratios).
* **Inference Caption Infrastructure:** Stand up highly reactive caption compilation processes inside `/app/api/ai/generate-caption/route.ts` calling structural payload generations using active `@google/generative-ai` development interfaces executing optimizations via `gemini-1.5-flash-latest`.
* **URL-Based Binary Transformation Canvas:** Build clean component abstractions calling targeted asset modifications using query properties on the target asset paths (such as calling specialized visual transformations directly inside Image Kit delivery infrastructures using inline modifiers like `tr=bg-remove`).

## Phase 5: Chronic Cron Pipeline & Queue Orchestration
* **Deferred Event Dispatch Loops:** Configure high-performance pipeline structures routing deferred processing events safely into underlying queue architectures using internal development loops (`/app/api/ingest/route.ts`).
* **Interlocking Structural Views:** Stand up clean chronological dashboard calendar frameworks mapping system entries across structured timelines (`/app/dashboard/calendar/page.tsx`), adding flexible action parameters allowing quick update requests to fire instant event recalculations downstream.

## Phase 6: Active Profile Surveillance Protocols
* **Periodic Channel Poll Systems:** Deploy regular operational loops through automated engine frameworks evaluating inbound profile alerts systematically (e.g. tracking channel events through recurring loops executed every fifteen minutes).
* **Dynamic Response Selection Routines:** Write strict evaluating state configurations tracking matching criteria efficiently: isolate incoming comments against specific parameters to determine whether to output static data logs or process inputs through configured generative intelligence templates.

## Phase 7: Subscription Enforcement Framework & Telemetry Insights
* **Analytical Metric Instrumentation Panel:** Wire up rich statistical telemetry dashboard screens inside `/app/dashboard/analytics/page.tsx` rendering system health details including execution patterns, deployment updates, and unexpected pipeline error structures.
* **Monetization Gate Shield Rules:** Embed strict validation filters checking active account parameters directly via functional component boundaries to enforce subscription tier restrictions efficiently.

---

# 4. Multi-Agent Workflow Instructions (Antigravity 2.0 Native)

To execute this workplan using an autonomous multi-agent developer network, configure the team roles, behavioral guardrails, and message sequence parameters detailed below.

```
+---------------------------------------------------------------------------------------------------------+
|                                           Agent Router / Coordinator                                    |
+-------------------+--------------------------------+----------------------------+-----------------------+
                    |                                |                            |
                    v                                v                            v
+-------------------+------------+   +---------------+------------+   +-----------+-----------+
|      Database & Security       |   |       UI/UX Engineering    |   |     Async Integration |
|          Specialist            |   |          Specialist        |   |         Specialist    |
+-------------------+------------+   +---------------+------------+   +-----------+-----------+
                    |                                |                            |
                    +--------------------------------+----------------------------+
                                                     |
                                                     v
                                       +-------------+------------+
                                       |   Quality Assurance &    |
                                       |    Validation Tester     |
                                       +--------------------------+
```

### Team Composition Blueprint
1.  **Agent Coordinator (Router):** Parses system specifications, outlines task dependency priorities, routes atomic generation sub-tasks out to field specialists, and validates execution states.
2.  **Database & Security Specialist (Agent DB):** Generates schemas, configures API authorization boundaries, and designs serverless database queries.
3.  **UI/UX Engineering Specialist (Agent Frontend):** Builds layouts, custom components, responsive grids, and handles front-end state mutation loops.
4.  **Async Integration Specialist (Agent Solutions):** Develops background job infrastructure, Ingest steps, generative AI prompts, and OAuth state handshake code.
5.  **Quality Assurance & Validation Tester (Agent QA):** Analyzes terminal compilation outputs, detects package collision errors, runs mock integration assertions, and validates code output syntax.

---

## Prompt Matrix Sequences for Agent Orchestration

### Prompt Sequence 1: Data Architecture Set Up (Target: Agent DB)
```markdown
Context: Initial System Hydration Layer.
Directive: Construct the core database schema tracking operations for our serverless infrastructure.
Execution Steps:
1. Generate standard configurations mapping relational indexes safely inside 'db/schema.ts' strictly matching the provided PostgreSQL schema specification blocks.
2. Enforce strict cascade deletion rules on all user ID references.
3. Build out typed type definitions for post statuses tracking ('draft', 'scheduled', 'published', 'failed') natively via strict TypeScript string literals.
4. Output cleanly compiled migration code templates ready for deployment. No mock omissions allowed.
```

### Prompt Sequence 2: Shell Layout Layouts & Core Identity Hooks (Target: Agent Frontend)
```markdown
Context: Core Base Visual Environment Layer.
Dependencies: Successful completion of Data Architecture Steps.
Directive: Build out the base workspace layer using standard component design libraries.
Execution Steps:
1. Build base wrapper configurations within '/app/dashboard/layout.tsx' including a clean responsive navigation grid.
2. Embed highly accessible interaction buttons targeting '/dashboard/compose' explicitly on sidebar control blocks.
3. Configure theme state variables allowing fast styling transitions between Dark and Light color rendering schemas.
4. Hook up user identification checking components via 'useUser' variables to gracefully handle unauthorized interaction events.
```

### Prompt Sequence 3: Creative Publisher Framework & AI Model Injection (Target: Agent Frontend + Agent Solutions)
```markdown
Context: Content Composition Subsystems.
Directive: Connect layout components safely with underlying intelligence systems.
Execution Steps:
1. Generate the creative composition workspace at '/app/dashboard/compose/page.tsx' implementing multi-channel layout option tabs.
2. Construct serverless route handlers inside '/app/api/ai/generate-caption/route.ts' utilizing '@google/generative-ai' packages to request optimized data chunks from 'gemini-1.5-flash-latest'.
3. Inject defensive string mutation handling logic inside media upload elements parsing Image Kit parameter configuration filters (e.g. mapping background deletion variables cleanly over target properties).
```

### Prompt Sequence 4: Async Orchestration & Pipeline Delivery Rules (Target: Agent Solutions)
```markdown
Context: Background Queue Engineering Framework.
Directive: Build highly resilient asynchronous task pipelines routing through internal scheduling infrastructures.
Execution Steps:
1. Build the central endpoint controller path inside '/app/api/ingest/route.ts' deploying standard API configuration schemas.
2. Structure resilient background job handlers inside 'lib/ingest/functions.ts' wrapping target publication tasks safely inside step execution boundaries.
3. Design atomic post-handling loops checking parameters carefully before routing requests straight through target external social endpoints.
```

### Prompt Sequence 5: Active surveillance Modules & Auto-Responders (Target: Agent DB + Agent Solutions)
```markdown
Context: Dynamic Event Watchers Infrastructure.
Directive: Connect automated checking components evaluating inbound interaction data against dynamic context rules.
Execution Steps:
1. Build recurring background checking jobs triggering automated validation routines at specified standard interval margins.
2. Develop state-checking scripts matching system alerts carefully against registered keywords or parsing inputs safely through generative processing arrays when rule modes select contextual generation.
```

### Prompt Sequence 6: Monetary Access Controls & Optimization Telemetry (Target: Agent Frontend + Agent DB)
```markdown
Context: System Gating and Administrative Dashboards.
Directive: Build advanced reporting metrics screens and protect access pathways safely using plan tier boundaries.
Execution Steps:
1. Populate highly detailed visual layout charting layouts inside '/app/dashboard/analytics/page.tsx' showing real-time transaction statuses and process telemetry updates.
2. Embed secure checkout validation filters wrapping specific premium modules tightly inside component boundaries checking dynamic account records before rendering interface tools.
```

### Prompt Sequence 7: Build Validation & Pre-Flight Error Detection (Target: Agent QA)
```markdown
Context: Quality Enforcement and Verification Loop.
Directive: Intercept processing output streams, execute syntax audits, check type configurations, and validate compilation readiness.
Execution Steps:
1. Scan generated files for improper imports or unwhitelisted media endpoints.
2. Execute 'npm run build' syntax verification tasks inside isolated test structures.
3. Parse runtime exception warnings, and map detected errors into specific patching logs routing immediately back to responsible agent channels until build sequences resolve perfectly cleanly.
```

---

# 5. Pre-Flight Verification Assertion Protocols

Before moving components downstream into operational validation tasks, the Agent Coordinator along with Agent QA must explicitly assert the following checklist conditions:

| Verification Target            | Explicit Assertion Criteria                                                                                                                                                                                                              |
| :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Asset Domain Handling**      | NextJS image handling configurations (`next.config.ts`) must explicitly include whitelisting parameters for active storage systems (`ik.imagekit.io`) and connected profile source nodes (`lh3.googleusercontent.com`, `abs.twimg.com`). |
| **Hydration Exception Safety** | Client layout wrappers using state variables must wrap interactions safely to avoid hydration discrepancies during pre-rendering stages.                                                                                                 |
| **Asynchronous Core Testing**  | Local processing servers handling deferred actions must route communication loops cleanly via isolated background proxies (`localhost:8288`), ensuring zero dependency on persistent thread instances inside server components.          |
| **Database Schema Accuracy**   | Type definitions mapping dynamic data entries across systemic database updates must match active PostgreSQL schema models exactly, enforcing explicit runtime checks preventing empty data payloads.                                     |