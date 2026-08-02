# 11 — Performance optimisation plan

## Where the time goes today

### Client-side waterfall on first paint

`app/dashboard/social-tracker/page.tsx` is a client component. Nothing renders
until JavaScript hydrates, and then:

```
HTML  →  hydrate  →  read token from localStorage  →  GET /api/social/accounts
                                                   →  GET /api/social/analytics × N accounts
                                                   →  GET /api/social/posts (on tab switch)
```

Four sequential round trips before a single number appears, the first two of which
exist only because auth state lives in `localStorage` and therefore cannot be read
on the server. Meanwhile the sibling `loading.tsx` skeleton never renders — the
route segment resolves instantly since the page does no server work — so the user
sees the string `Loading…` (M1).

**Fix.** Add `getServerAuthUser()` / `requireServerSubscriber()` to `lib/auth.ts`,
reading the httpOnly `session` cookie that already exists (`setSessionCookie`,
consumed by `proxy.ts`) with the same `readSessions`/`tokenHash` verification.
Roughly 20 lines. `cookies()` is a Promise in Next 16 and must be awaited.

Then the shell and KPI grid render on the server, and `<Suspense>` boundaries
around `TrendSection`, `AiInsightsPanel` and `TopContentPreview` stream the slower
sections in.

**Risk to verify before committing to this:** if the `session` cookie can go stale
relative to the localStorage token, server-rendered pages will 402 while client
fetches succeed. Check the refresh cadence of both before Stage 7 lands.

### No request deduplication or caching on the client

Five hand-rolled `loading`/`error`/`data` triplets across three components, each
with its own `useCallback` + `useEffect`. Consequences: a range change fires one
`/analytics` request per expanded account with no coalescing; every range change
blanks the charts because there is no `keepPreviousData`; collapsing and
re-expanding an account refetches everything.

`@tanstack/react-query` is already a dependency and `QueryProvider` is already
mounted in `app/layout.tsx` — it is simply unused here.

**Fix.** react-query for the interactive islands, keyed
`["social","series",{accountIds,metrics,range,granularity,tz}]`. Deduping,
`keepPreviousData`, and background refetch come free.

### Meta sync: one HTTP call per post

The dominant server-side cost, and the one that can cause an app-wide outage
(C3). A 100-post backfill fires 100 concurrent Graph calls, which is what trips
Meta's Business Use Case rate limit — and that limit applies to the whole app, so
one user's backfill degrades everyone.

**Fix.** `graphBatch` via `POST /?batch=[…]` in chunks of 50. 100 posts → 2 HTTP
calls. This is the single highest-value performance change in the project.

### YouTube: one metric per report call

`fetchWatchTime` requests a single metric where one Analytics API call returns
ten. More data for the same latency.

### Backfill blocks the connect flow

Connecting synchronously fetches 100 posts inside a 300s lock (H9), on the single
most important moment in the funnel. Also risks exceeding the lock TTL on slow
provider responses, which would allow a concurrent second sync.

**Fix.** Return immediately with profile plus the first page of posts; enqueue
deep history as `social:backfill:{accountId}`.

### Sequential refresh loop

`refreshStaleAccounts` processes up to 50 accounts one at a time — minutes per
run, and it does not scale past a few hundred active accounts on a 12-hour
cadence.

**Fix.** Bounded concurrency (start at 5) with the per-account Redis lock already
providing safety.

### Cache invalidated after the loop, not inside it

C4. An account synced at iteration 3 of 50 serves stale overview data for the rest
of the run. Also, only a per-account version key exists, so a cross-account view
would serve stale data after any single sync.

**Fix.** `invalidateAccount` inside the loop, bumping both the account and user
versions.

## Frontend budget

| Concern | Decision |
|---|---|
| Chart library | **Keep the hand-rolled SVG kit.** recharts 3 pulls a d3 subtree — realistically +90–110 kB gzipped on the heaviest customer route, on a product with a Mobile Safari e2e project. It also ships no `sr-only` table equivalent, so we would pay the bundle *and* still write the accessible layer. recharts stays admin-only, where the audience is small and desktop |
| Posts table | Virtualize with `@tanstack/react-virtual` (already a dependency) above 100 rows, inside a real `<table>` with `aria-rowcount` and a sticky header |
| KPI count-up | `requestAnimationFrame`, returning the final value immediately under `useReducedMotion()` — skipped, not shortened |
| Motion | framer-motion limited to `layout`, opacity and transform, so nothing triggers layout thrash |
| Images | Keep `<img>` unless `scontent*.cdninstagram.com`, `*.fbcdn.net` and `i.ytimg.com` are added to `next.config.ts` `remotePatterns` — which also changes the CSP `img-src`. Worth doing; not on the critical path |
| Server/client split | Static shell, KPI grid and platform overview are server components. Only the filter bar, charts and tables are client islands |

## Server budget

| Concern | Target |
|---|---|
| `/api/social/overview` cache hit | < 50 ms |
| `/api/social/overview` cold | < 400 ms (one `findMany` over `SocialDailyMetric` + pure compute) |
| `/api/social/series` | < 300 ms, capped at `accountIds × metrics ≤ 40` |
| `/api/social/content` | < 200 ms, keyset paginated, 25/page |
| Steady sync per account | < 5 s |
| Backfill per account | < 60 s, off the request path |
| Report generation | 5–20 s — **queued, never in a route handler** |

`SocialDailyMetric` is what makes the overview cheap: one indexed range scan over
`(accountId, date)` returning at most 365 narrow rows per account, versus
reconstructing deltas from cumulative snapshots. Narrow columns rather than EAV
keep the scan index-only.

## Reports must be queued

An annual, multi-account PDF with 12 rasterized charts is a 5–20 s job. Running
that in a route handler on the standalone Node server either times out or blocks
the event loop for every other request on the instance.

`lib/social/reports/queue.ts` mirrors the optional-BullMQ pattern already proven
in `lib/social/refresh-queue.ts` — try/catch `require`, off unless
`SOCIAL_REFRESH_DRIVER=bullmq`, with an in-process `setImmediate` fallback plus a
`SocialReportRun` status row so single-server deployments still work. Charts
rasterize with `@napi-rs/canvas`, already a dependency and already in
`serverExternalPackages`. pdfkit streams, so a 40-page report never buffers in
memory.

## Measurement

Nothing is instrumented today. Sentry is installed and the social feature does not
use it (M12), so provider latency — the slowest part of the system — is entirely
unmeasured.

Add: `Sentry.startSpan({op:"http.client", name:"youtube.analytics.report"})` around
each provider call; a `social.sync.duration` measurement;
`Sentry.captureException` with `tags:{provider, accountId, job}` in
`service.syncAccount`'s catch and in `withSocial`'s 500 path; and
`social:quota:{provider}:{day}` Redis counters alongside the existing
`social:stats:{day}:{ok|fail}` so quota exhaustion is visible before it bites.

`/api/health` already reports `syncsToday`, `activeAccounts` and `staleOver24h`
— keep it informational rather than letting it flip the endpoint to 503.

## Ordered by value

1. `graphBatch` for Meta — prevents an app-wide rate-limit outage
2. Server-render the shell and KPI grid — removes the four-hop waterfall
3. Fix cache invalidation and add the user-level version — stops serving stale data
4. `SocialDailyMetric` — makes every aggregate query one indexed scan
5. Move backfill off the connect path
6. Bounded concurrency in the refresh loop
7. react-query for the client islands
8. Sentry spans and quota counters
9. Virtualize the posts table
10. `next/image` for avatars and thumbnails
