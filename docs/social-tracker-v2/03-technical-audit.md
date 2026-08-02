# 03 — Technical audit

Architecture, data flow, integrations, caching, background work, error handling,
scalability and maintainability. Security findings live in
[12](12-security-review.md); schema in [09](09-database.md); routes in
[10](10-api.md).

## Verdict up front

The backend is **better built than the frontend suggests**. Encrypted tokens with
per-value IVs, PKCE with a single-use nonce, a genuinely pure analytics engine,
retry with full jitter and three-way error classification, credit idempotency with
refunds, snapshot de-duplication, and an adapter registry that mostly holds. The
problems are not architectural rot — they are **coverage**, **validation**, and a
handful of concurrency and invalidation bugs.

The frontend is the weaker half: one 474-line client component fetching in
`useEffect`, a hand-rolled chart kit that ignores touch and keyboard, and a design
system that the feature does not use.

## Data flow, end to end

```
Connect:   page.tsx → GET /api/social/connect/:provider → oauth.createState (JWT, 600s)
                    → Redis social:pkce:{nonce} (single use)
                    → provider consent → GET /api/social/callback/:provider
                    → consumeState (verify + delete) → exchangeCode
                    → encrypt tokens → SocialAccount upsert → syncAccount (BLOCKS, 100 posts)
                    → 302 /dashboard/social-tracker?connected=…

Sync:      cron ?job=refresh → refreshStaleAccounts(12h, 50)
                    → Redis lock social:sync:{accountId} (300s, incrWithExpire)
                    → getValidAccessToken (refresh inside REFRESH_WINDOW_MS, re-encrypt)
                    → PROVIDERS[p].sync() → normalize → persistSync (upserts + snapshot dedupe)
                    → social:stats:{day}:{ok|fail} → invalidateOverview (AFTER the loop — bug C4)

Read:      AccountAnalytics → GET /api/social/analytics?accountId&range&tz
                    → requireSubscriber (fresh DB read of subscriptionEndsAt)
                    → findFirst({id, userId})           ← the only tenancy control
                    → Redis social:analytics:{id}:v{ver}:{range}:{tz} (EX 300)
                    → miss: load snapshots + posts → computeAnalytics (pure) → cache
```

Three things stand out. The connect path **blocks on a 100-post fetch** (H9). The
read path is a **client-side waterfall** — page load, then token from
localStorage, then `/accounts`, then `/analytics` per account. And the version
stamp is **per-account only**, which breaks the moment a cross-account view exists
(C4).

## API architecture

Eleven routes, all `app/api/social/**`, plus one cron route. Each is a bare
`export async function GET(req)` that repeats the same preamble: call
`requireSubscriber`, 402 if null, read and hand-validate query params, do the
ownership `findFirst`, try/catch, log, return.

**Problems.**

- **No shared wrapper.** `lib/admin/api.ts` exists and is the proven pattern; the
  social routes don't use anything equivalent. Auth, tenancy, error mapping and
  logging are copy-pasted eleven times.
- **No validation** (H1). Hand-rolled `Set`s and regexes, applied inconsistently.
- **Inconsistent response shapes.** Some return bare objects (`{accounts, providers}`),
  some `{success: true}`, errors are `{error}` sometimes with a `code`. There is
  no envelope.
- **Ownership is the copy-pasted line** (C1). Correct in all seven places today.
- **`/posts` keyset pagination is subtly wrong** (H2).

**Fix.** `lib/social/api.ts` exposing `withSocial(handler, opts)` and
`assertOwnedAccount`, plus `lib/social/schemas.ts`. New routes adopt a
`{data}`/`{error, code?, issues?}` envelope; existing routes are retrofitted at
cutover, deliberately *not* in the same change that rewrites the UI.

## Platform integrations

`lib/social/providers.ts` defines a `ProviderAdapter` interface and a `PROVIDERS`
registry — the right shape. Three adapters: `google` (YouTube), and `meta`
serving both Instagram and Facebook.

**What's good.** `ProviderApiError` carries status and body. `classifyError`
splits `auth` / `retryable` / `permanent`, correctly treating Meta code 190 and
`OAuthException` below 500 as auth failures. `withRetry` does exponential backoff
with **full jitter** (not the common half-jitter mistake) and only retries
`retryable`. `ProviderSync.partialError` lets a sync succeed partially rather than
all-or-nothing.

**What's wrong.**

1. **Per-post HTTP calls in Meta** (C3) — the highest-severity technical defect in
   the feature.
2. **Metric coverage** (H8). `fetchWatchTime` asks the YouTube Analytics API for
   one metric when a single report call returns ten. Meta account-level insights
   are barely touched — no `profile_views`, `website_clicks`, `accounts_engaged`,
   `total_interactions`, `online_followers`, `page_impressions`.
3. **Provider branches leak outside the registry.**
   `service.disconnect` has `if (account.provider === "youtube") google.revoke(...)`
   even though the adapter already exposes `revoke`. `handleCallback` branches on
   the OAuth app — defensible, but it should be an
   `ProviderAdapter.discoverAccounts?()` hook rather than an `if`.
4. **`availableProviders()` returns every registry key** regardless of whether
   credentials are configured (M10), contradicting its own doc comment.
5. **Failures are swallowed.** `fetchWatchTime` returns `{}` on error — reasonable
   as a posture, but nothing records *that* it failed, so the UI cannot distinguish
   "no watch time" from "watch time unavailable for this account".
6. **`graphPaged` is best-effort past page one**, silently truncating.
7. **No quota accounting.** YouTube Data has a 10,000 unit/day *per-app* ceiling.
   Nothing counts usage, so exhaustion arrives as a wall of failed syncs.

**Fix.** `graphBatch`; a dedicated `lib/social/google-analytics.ts` requesting
seven report shapes; `observedCapabilities` on `ProviderSync` so failures are
recorded rather than swallowed; `social:quota:{provider}:{day}` counters; remove
the last provider branches.

## State management (client)

`@tanstack/react-query` is a dependency, `QueryProvider` is mounted in
`app/layout.tsx`, and the Social Tracker does not use it. Instead:
`useState` triplets of `loading` / `error` / `data`, five of them across three
components, each with its own `useCallback` + `useEffect` refetch.

Consequences: sibling fetches are not deduped, so a range change fires one
`/analytics` request per expanded account with no coalescing; changing the range
blanks every chart because there is no `keepPreviousData`; and there is no cache,
so collapsing and re-expanding an account refetches everything.

**Fix.** Server components render the shell and KPI first paint; react-query owns
the interactive islands with keys like
`["social","series",{accountIds,metrics,range,granularity,tz}]`.

## Caching

All Redis, no Next.js data cache. Two keys:

- `social:overview:{userId}`, `EX 300`
- `social:analytics:{accountId}:v{version}:{range}:{tz}`, `EX 300`, where
  `version` lives at `social:analytics-ver:{accountId}` (TTL 30d) and is bumped
  after every sync

**The version-stamp pattern is the right call** — bumping one integer orphans
every range/tz variant at once instead of enumerating and deleting them. Both
reads parse defensively, falling through to a recompute on malformed JSON.

**Problems.** Keys are defined in two files (`service.ts` and
`analytics/route.ts`) with no single owner. Invalidation runs after the refresh
loop rather than inside it (C4). There is no user-level version, so any
cross-account view would serve stale data. And the `tz` query parameter fragments
the cache per client timezone offset — mitigated by rounding to 15-minute buckets,
but eliminated entirely by storing an IANA timezone on the account.

**On Next.js caching:** `cacheComponents` is not enabled in `next.config.ts`, so
`"use cache"`, `cacheLife` and `cacheTag` are unavailable. That is the correct
posture here regardless — every read is per-user and private, so Next's data cache
would buy nothing. Redis stays.

## Background sync

`app/api/cron/social-refresh/route.ts` with four jobs: `refresh`, `retention`,
`digest`, `recalibrate-virality`. Gated by a shared secret in a bearer header or a
`?secret=` param. Scheduling is **external** — there is no `vercel.json` and no
in-repo crontab; the schedule lives in a comment in the route header.

`lib/social/refresh-queue.ts` offers an optional BullMQ worker started from
`instrumentation.ts`, off unless `SOCIAL_REFRESH_DRIVER=bullmq`. The optional-import
pattern (try/catch `require`, in-process fallback) is good and should be copied for
report generation.

**Idempotency and locking are handled well.** Sync lock via `incrWithExpire > 1`
with a `finally` delete; PKCE nonce single-use; manual refresh rate-limited 1 per
600s with a `Retry-After`; post upsert on `accountId_providerPostId`; account
upsert on the composite unique; snapshot de-duplication on a 6h/identical-values
check.

**Problems.** `refreshStaleAccounts` is a **sequential loop of up to 50 accounts**
— at a few seconds each that is minutes per run, and it does not scale past a few
hundred active accounts on a 12-hour cadence. The two secondary jobs
(`refreshClipPublishMetrics`, `refreshStaleCompetitors`) are `.catch()`-swallowed,
so their failures are invisible. Retention only prunes `SocialAccountSnapshot`;
audience snapshots grow unbounded.

**Fix.** Bounded concurrency in the refresh loop; new `daily-metrics` (hourly,
staggered), `scores` (nightly), `reports` and `goals` jobs; `pruneTimeSeries`
covering the new tables with a monthly rollup at 400 days.

## Error handling and observability

Sentry is installed (`@sentry/nextjs` ^10.64) and configured, and the social
feature does not use it. `service.syncAccount`'s catch calls the logger only
(M12), so provider breakage is invisible until a user complains. There are no
spans around provider HTTP calls, so there is no latency data on the slowest part
of the system.

`/api/health` does report `social: { syncsToday, activeAccounts, staleOver24h }`
from the Redis counters — useful, and deliberately informational rather than
flipping the endpoint to 503.

**Fix.** `Sentry.startSpan({op: "http.client", …})` around each provider call;
`captureException` with `tags: {provider, accountId, job}` in the sync catch and in
`withSocial`'s 500 path; a `social.sync.duration` measurement.

## Scalability

| Dimension | Today | Ceiling | After |
|---|---|---|---|
| Refresh throughput | Sequential, 50/run, 12h | ~few hundred accounts | Bounded concurrency + hourly staggered daily-metrics |
| Meta API calls | 1 per post | Trips the app-wide BUC limit on one backfill | 1 per 50 posts |
| YouTube quota | Unmeasured | 10k units/day per app | ~3 units/steady sync + counters |
| Time-series volume | Snapshots only, 90d retention | Fine | +`SocialDailyMetric` ≈1.1k rows/user/yr; 400d then monthly rollup |
| Analytics compute | Pure, per-request, cached 300s | Fine | Unchanged; more metrics, same shape |
| Report generation | N/A | — | Queued; an annual PDF is 5–20s and must not run in a route handler |

## Maintainability

**Good.** `lib/social/analytics.ts` is genuinely pure and unit-tested. Six test
files exist for the lib layer. The adapter interface is real. `lib/credits.ts` is
the single writer for credit columns, enforced by `scripts/check-unverified-costs.mjs`
running inside `npm run lint`.

**Bad.** `service.ts` is 544 lines mixing token lifecycle, sync orchestration,
persistence, caching and cron jobs. `google.ts` is 315 lines doing OAuth, Data API,
Analytics API and resumable upload. `meta.ts` is 370 lines serving two providers.
`page.tsx` is 474 lines of page, OAuth return handling, platform metadata and three
inline sub-components. Zero route tests. Two components named `StatTile` (M5).
Duplicate formatting logic in the public report page (M6). Purity is leaking —
`computeAlerts` builds English strings with `Intl` inside a pure module (M7), and
`now` defaults to `new Date()` so a test can silently become time-dependent.

**Fix.** Split `analytics.ts` into `lib/social/metrics/*` behind a re-export façade
so no consumer breaks mid-refactor; split the Analytics API out of `google.ts`;
make `now` a required parameter; move message formatting to the presentation layer.

## Recommended production-ready improvements, ranked

1. `graphBatch` for Meta (C3) — the one change that prevents an app-wide outage.
2. `assertOwnedAccount` + cross-tenant route tests (C1).
3. Fix cache invalidation and add a user-level version (C4).
4. zod across every route (H1).
5. Sentry spans and exception capture on the sync path (M12).
6. Bounded concurrency in `refreshStaleAccounts`, plus quota counters.
7. Split `service.ts`, `google.ts` and `analytics.ts`.
8. Move backfill off the interactive connect path (H9).
9. Retention for audience snapshots and the new daily-metrics table.
10. Report generation queued, never synchronous.
