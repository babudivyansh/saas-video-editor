# 10 — API improvements

## Problems being fixed

1. **No shared wrapper.** Eleven routes repeat the same preamble: `requireSubscriber`,
   402 if null, hand-validate params, ownership `findFirst`, try/catch, log.
2. **No validation** (H1). Zero zod, despite zod ^4 being a dependency. Hand-rolled
   `Set`s, a handle regex, and inline timezone arithmetic.
3. **Tenancy by copy-paste** (C1). Seven identical `findFirst({where:{id,userId}})`
   calls are the only barrier between tenants, with no RLS and no tests.
4. **Inconsistent responses.** Bare objects, `{success:true}`, `{error}` sometimes
   with a `code`. No envelope.
5. **Broken keyset pagination** (H2).
6. **No route tests at all.**

## Shared plumbing

### `lib/social/api.ts`

Mirrors the proven `lib/admin/api.ts`.

```ts
export function withSocial<P = {}>(
  handler: (req: NextRequest, ctx: { auth: TokenPayload; params: P }) => Promise<NextResponse>,
  opts?: {
    subscriber?: boolean;
    rateLimit?: { key: (auth: TokenPayload, p: P) => string; max: number; windowSec: number };
  },
): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse>;
```

Note the signature: **`params` arrives as a Promise** in Next 16 and the wrapper
awaits it, so handlers receive plain values. This is a breaking difference from
pre-16 and the wrapper is the right place to absorb it once.

Error mapping: 401 no auth · 402 `{error, code:"subscription_required"}` (the exact
shape `page.tsx` already checks, so client behaviour is preserved) · `ZodError` →
400 `{error, issues}` · `SyntaxError` → 400 · `ProviderApiError` → 502 · Prisma
P2025 → 404 · everything else → logged 500 plus `Sentry.captureException`.

```ts
export async function assertOwnedAccount(userId: string, accountId: string): Promise<SocialAccount>;
```

One tested implementation of the tenancy check, throwing a 404-mapping error on
miss. Given there is no RLS, this function is the security boundary.

### `lib/social/schemas.ts`

zod for every input, replacing the hand-rolled guards:

`accountIdSchema` (cuid) · `accountIdsSchema` (comma list, max 10) ·
`rangeSchema` = `z.union([z.enum(["7","14","30","90","180","365"]), z.object({from, to})])` ·
`granularitySchema` (`day|week|month`) · `metricKeysSchema` = `z.enum(METRIC_KEYS)` ·
`timezoneSchema` validated against `Intl.supportedValuesOf("timeZone")` ·
`cursorSchema` · `sortSchema` · `goalSchema` · `reportConfigSchema` ·
`competitorSchema` (absorbing the `/^[\w.\-]{2,60}$/` handle regex).

### `lib/social/cache.ts`

Every Redis key in one place — today they are split across `service.ts` and
`analytics/route.ts` with no owner.

```ts
export const keys = {
  overview:    (userId, range, tz, ver) => `social:overview:${userId}:v${ver}:${range}:${tz}`,
  series:      (accountIds, metrics, range, gran, ver) => …,  // arrays hashed
  analytics:   (accountId, range, tz, ver) => …,
  version:     (accountId) => `social:analytics-ver:${accountId}`,
  userVersion: (userId)    => `social:user-ver:${userId}`,
};
export async function invalidateAccount(accountId: string, userId: string): Promise<void>;
export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T>;
```

Two bugs fixed here (C4): `invalidateAccount` moves **inside** the
`refreshStaleAccounts` loop rather than running once after 50 accounts, and it
bumps a **user-level** version as well as the per-account one — without which any
cross-account view serves stale data after a single account syncs.

The version-stamp pattern itself is kept. Bumping one integer orphans every
range/tz variant at once, which is better than enumerating keys to delete.

## Route surface

| Route | Verb | Change |
|---|---|---|
| `accounts/` | GET | Extend: `capabilities` + `healthScore` + surfaced sync status per account |
| `accounts/[id]` | POST/DELETE | zod on params. DELETE stays deliberately ungated so a lapsed user can remove their data |
| **`overview/`** | GET | **New** — cross-account executive: aggregated KPIs, per-platform split, alerts, goal progress, health |
| **`series/`** | GET | **New** — the one endpoint behind every chart. `?accountIds&metrics&range&granularity&tz` → `{series:[{accountId, metric, unit, available, points}]}`. Capped at `accountIds × metrics ≤ 40` |
| `analytics/` | GET | Keep as the per-account deep dive. Migrate to `withSocial` + zod, widen the range enum, read tz from the account rather than the query |
| **`content/`** | GET | **New**, supersedes `/posts` — adds `viralScore`/`aiScore` sorts, `minViews`, `dateFrom/To`, `mediaType[]`. `/posts` stays as a thin re-export for one release |
| **`content/[postId]`** | GET | **New** — post detail plus score components |
| **`audience/`** | GET | **New** — all dimensions, all three IG audiences, `unit`-aware |
| `competitors/` | GET/POST | zod; extended metrics |
| **`competitors/compare/`** | GET | **New** |
| **`recommendations/`** | GET/POST | **New** — AI, credit-gated |
| **`goals/`, `goals/[id]`** | CRUD | **New** |
| **`reports/`, `reports/[id]`** | GET/POST | **New** — enqueue, poll, download |
| `export/` | GET | `format=csv\|xlsx`; `kind=posts\|snapshots\|daily\|audience\|competitors`. `csvCell` moves to `lib/social/reports/csv.ts` |
| `report-link/` | POST | Persist a `SocialReportLink` row, sign `{jti}` |
| **`report-link/[id]`** | DELETE | **New** — revoke |
| `cron/social-refresh` | GET | New jobs `daily-metrics` (hourly, staggered), `scores` (nightly), `reports`, `goals`; zod on `?job=` |

### Why `/series` is one endpoint

Every chart on every view needs the same thing: some metrics, for some accounts,
over some range, at some granularity. Fifteen chart-specific endpoints would each
need their own cache key, rate limit, validation and test. One parameterised
endpoint gets one of each, and react-query dedupes overlapping requests on the
client. The `≤ 40` cap bounds the worst case.

## Conventions

**Response envelope.** `{data: T}` on success, `{error, code?, issues?}` on
failure, applied by `withSocial` to **new routes only**. Do not retrofit it onto
`/accounts` and `/analytics` in the same change that rewrites the UI — that means
debugging two things at once. Retrofit at cutover.

**Pagination.** Keyset, as `/posts` already does. Fix H2 by encoding both the sort
value and the id into a base64 `nextCursor` and filtering on the compound
comparison. The current id-only cursor skips or repeats rows whenever the sort
field ties across a page boundary — universal for `shares`/`saves`, which are
mostly zero.

**Rate limits**, via the existing `lib/rate-limit.ts`, keyed
`social:<route>:<userId>`:

| Route | Limit | Why |
|---|---|---|
| series | 120/min | Charts fan out |
| content, overview | 60/min | |
| export | 20/h | Heavy queries |
| recommendations | 5/h | Credit-costed |
| reports, report-link, competitors POST | 10/day | Vendor cost / generation cost |
| accounts/[id] POST | 1/600s | Existing, unchanged |

**Caching.** Redis only. `cacheComponents` is not enabled in `next.config.ts`, so
`"use cache"`, `cacheLife` and `cacheTag` are unavailable — and irrelevant anyway,
since every read is per-user and private. Follow
`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`.

**Capabilities in every response.** Every account-scoped payload carries
`capabilities: Record<MetricKey, Support>`, already resolved through
`effectiveCapability`, so no client ever re-derives it and the UI, the PDF builder
and the CSV exporter all agree on what is unavailable.

## Testing

Every `app/api/social/**` route gets a colocated `route.test.ts` — there are
currently zero. Follow the established pattern in `app/api/reviews/route.test.ts`:
`vi.mock("@/lib/prisma")`, `vi.mock("@/lib/auth")`, `vi.mock("@/lib/rate-limit")`,
then `const { GET, POST } = await import("./route")` after the mocks, driving
`new NextRequest("http://localhost/api/…")`.

Mandatory cases per route:

1. 401 — no auth
2. 402 — authenticated non-subscriber
3. 400 — invalid input
4. **404 — cross-tenant**: another user's `accountId`
5. 200 — happy path
6. 429 — where rate-limited

Case 4 is the one that matters. With no RLS, it is the regression test for the
only control standing between tenants. **A route without it does not merge.**
