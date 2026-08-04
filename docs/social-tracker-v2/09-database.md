# 09 — Database improvements

Prisma + PostgreSQL. Schema at `prisma/schema.prisma`, migrations in
`prisma/migrations/`. There is **no RLS** — tenancy is enforced in application
code, which is the context for several decisions below.

## Current social models

`SocialAccount` (:669) · `SocialAccountSnapshot` (:763) ·
`SocialAudienceSnapshot` (:750) · `SocialPost` (:778) · `CompetitorProfile` (:702)
· `CompetitorSnapshot` (:719) · `AiInsight` (:733) · `ClipPublish` (:467).

**What is already right, and should not be disturbed.** Cascade deletes from
`User` down through every child table — this is the GDPR erasure mechanism.
Composite uniques that make sync idempotent: `@@unique([userId, provider,
providerAccountId])` on accounts, `@@unique([accountId, providerPostId])` on
posts. Time-series indexes on `(accountId, capturedAt)`. Tokens stored only as
ciphertext in `accessTokenEnc`/`refreshTokenEnc`. `Float`/`DOUBLE PRECISION` for
`watchTimeSec` and audience percentages. `metricsJson` as a `Json` escape hatch.

## Change 1 — new table `SocialDailyMetric`

**Do not extend `SocialAccountSnapshot`.** That table stores *cumulative lifetime*
values captured at sync time, with de-duplication logic in `persistSync` and a
retention job keyed to that semantic. Provider daily insights are a different
thing: per-day deltas, restated by the provider for ~48 hours, keyed by calendar
date, idempotently upsertable. Overloading one table would break `windowDelta()`
in `lib/social/analytics.ts`, which assumes a monotonic cumulative series.

```prisma
model SocialDailyMetric {
  id        String        @id @default(cuid())
  accountId String
  account   SocialAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  date      DateTime      @db.Date   // provider's day, UTC-normalised

  impressions Int?
  reach       Int?
  views       Int?
  plays       Int?

  followers       Int?   // cumulative mirror, so charts need no join
  followersGained Int?
  followersLost   Int?
  profileViews    Int?
  websiteClicks   Int?

  likes             Int?
  comments          Int?
  shares            Int?
  saves             Int?
  totalInteractions Int?
  accountsEngaged   Int?

  watchTimeSec       Float?
  avgViewDurationSec Float?
  avgViewPercentage  Float?
  ctr                Float?

  postsPublished Int?

  extraJson Json?    // provider drift, keyed by MetricKey; never read
                     // without going through capabilities.ts
  source    String   @default("provider")   // provider | derived
  fetchedAt DateTime @default(now())

  @@unique([accountId, date])
  @@index([accountId, date])
}
```

**Narrow columns, not EAV.** The metric vocabulary is bounded by the capability
matrix, so an attribute table buys nothing: range scans stay index-only, and
`computeKpis` becomes a single `findMany` rather than a pivot. `extraJson`
absorbs provider drift without a migration.

`@db.Date` rather than `DateTime` because a provider day is a calendar day, not an
instant — this makes the unique constraint mean what it should and removes an
entire class of timezone bug.

**Volume:** ~365 rows/account/year, so ~1.1k per user at three accounts, ~11M
rows/year at 10k users. Fine with the composite index, given the retention policy
below.

## Change 2 — `SocialPost` additions

```prisma
impressions       Int?
plays             Int?
avgWatchTimeSec   Float?
avgViewPercentage Float?
ctr               Float?
profileVisits     Int?
follows           Int?
linkClicks        Int?
navigationTaps    Int?      // IG stories/reels
viralScore        Float?
viralScoreAt      DateTime?
aiScore           Float?
aiScoreReason     String?   // Gemini narration, nullable
scoredAt          DateTime?

@@index([accountId, viralScore(sort: Desc)])
```

Scores are persisted rather than computed per request because the viral-score
cohort is the trailing 90 days of the *same media type* — recomputing that on
every page load is expensive and, worse, non-reproducible as the cohort shifts. A
nightly `scores` cron recomputes them. `viralScoreAt`/`scoredAt` make staleness
visible.

The descending index on `viralScore` supports the new default sort on the Content
view.

## Change 3 — `SocialAudienceSnapshot`, two required columns

```prisma
unit     String @default("percent")     // percent | count
audience String @default("followers")   // followers | reached | engaged
```

**`unit` is not optional polish — it is a correctness fix.** The existing contract
is `value Float // percentage 0-100`. Instagram's `online_followers` (the source
for active-hours data) returns **absolute counts**. Writing those into the current
schema renders bars reading 4,200%.

**`audience`** exists because Instagram exposes `follower_demographics`,
`engaged_audience_demographics` and `reached_audience_demographics` as three
*different populations*. Merging them would silently average unrelated
distributions.

Widen the `dimension` comment to
`age | gender | country | city | language | device | activeHour | activeDay | followerType`,
and add `@@index([accountId, capturedAt, dimension])`.

## Change 4 — `SocialAccount` additions

```prisma
timezone            String?    // IANA
capabilitiesJson    Json?      // observed per-account capability overlay
healthScore         Float?
healthScoreAt       DateTime?
lastDailyMetricDate DateTime?  @db.Date   // incremental sync cursor
```

`timezone` kills the per-request `tz` query parameter that currently fragments the
analytics cache across client offsets (mitigated today by 15-minute rounding, but
eliminated entirely by storing it once).

`capabilitiesJson` is the per-account overlay described in
[08](08-analytics-roadmap.md) — the difference between "YouTube never exposes
this" and "your Page hasn't granted `read_insights`".

## Change 5 — competitor metrics

`CompetitorSnapshot` += `following Int?`, `postsCount Int?`, `avgLikes Float?`,
`avgComments Float?`, `engagementRate Float?`, `postsPerWeek Float?`.
`CompetitorProfile` += `category String?`, `bio String?`.

Today only `followers` is captured, which is why competitor tracking cannot answer
any question beyond "are they bigger than me".

## Change 6 — new models

```prisma
model SocialGoal {
  id, userId, accountId String?    // null = cross-account
  metric   String                  // MetricKey
  target   Float
  baseline Float?                  // captured at creation
  startAt, dueAt DateTime
  status   String @default("active")   // active | hit | missed | archived
  hitAt    DateTime?
  @@index([userId, status])
  @@index([accountId, status])
}

model SocialReportConfig {
  id, userId, name
  accountIds String[]
  period     String    // weekly | monthly | quarterly | annual | custom
  sections   String[]  // kpis | trends | content | audience | competitors | ai
  format     String    // pdf | csv | xlsx
  schedule   String    @default("none")   // none | weekly | monthly
  recipients String[]  @default([])
  lastRunAt  DateTime?
  @@index([userId])
  @@index([schedule, lastRunAt])
}

model SocialReportRun {
  id, userId, configId String?
  periodStart, periodEnd DateTime
  format     String
  status     String @default("queued")   // queued | running | done | failed
  storageKey String?    // S3
  sizeBytes  Int?
  error      String?
  createdAt, completedAt
  @@index([userId, createdAt])
}

model SocialReportLink {
  id, userId
  jti          String   @unique
  accountIds   String[]
  sections     String[] @default([])
  expiresAt    DateTime
  revokedAt    DateTime?
  viewCount    Int      @default(0)
  lastViewedAt DateTime?
  createdAt
  @@index([userId, createdAt])
}
```

`SocialReportLink` is the fix for **C2**. Moving `accountIds` out of the JWT and
into the row does three things: the token shrinks to a `jti`, the scope becomes
editable after issuance, and — the point — the link becomes revocable, because
there is now server-side state to revoke. `revokedAt` plus a Redis denylist
`social:revoked-jti:{jti}` (TTL = remaining lifetime) makes revocation immediate.
`viewCount`/`lastViewedAt` give the user an audit they currently do not have.

## Retention

Rename `service.ts:pruneOldSnapshots()` → `pruneTimeSeries()`:

| Table | Policy |
|---|---|
| `SocialAccountSnapshot` | Existing 90-day daily collapse — unchanged |
| `SocialDailyMetric` | Raw for **400 days**, then a monthly rollup written back as `source: "derived"` and the dailies deleted |
| `SocialAudienceSnapshot` | 180 days, then one capture per month |
| `CompetitorSnapshot` | 400 days, same rollup |

400 rather than 365 so a year-over-year comparison always has a complete prior
year available.

The existing raw-SQL `DISTINCT ON` implementation is kept — it is correct and
Postgres-specific, and rewriting it in Prisma would be slower and less clear.

## Indexes added

| Index | Serves |
|---|---|
| `SocialDailyMetric @@unique([accountId, date])` | Idempotent upsert; range scans |
| `SocialPost @@index([accountId, viralScore(sort: Desc)])` | Content view default sort |
| `SocialAudienceSnapshot @@index([accountId, capturedAt, dimension])` | Per-dimension audience queries |
| `SocialGoal @@index([userId, status])`, `([accountId, status])` | Goals strip; the nightly goals job |
| `SocialReportConfig @@index([schedule, lastRunAt])` | The scheduled-reports cron |
| `SocialReportLink @@unique([jti])` | Public report verification |

## On RLS

Postgres row-level security would be the structurally correct control for a
multi-tenant analytics schema, and it is **not** being added in this build —
retrofitting it means auditing every existing query path across the whole product,
not just this feature, and doing that inside a feature branch is how you ship an
outage.

The compensating control is explicit and testable: one
`assertOwnedAccount(userId, accountId)` in `lib/social/api.ts` replacing seven
copy-pasted `findFirst` calls, plus a **mandatory cross-tenant 404 test case on
every social route**. A route without that test does not merge.

RLS should be its own project. Recorded in [13](13-roadmap.md).

## Migration

One migration, `prisma/migrations/<ts>_social_tracker_v2/`, generated with
`npx prisma migrate dev --name social_tracker_v2`.

**It must land in the same commit as the schema edit.** CI runs
`npx prisma migrate diff --from-config-datasource --to-schema ./prisma/schema.prisma --exit-code`
immediately after `migrate deploy`, and a schema change without its migration
fails the build.

All additions are nullable or carry defaults, so the migration is additive and
requires no backfill. Existing rows get `unit: "percent"` and
`audience: "followers"`, which is exactly what they are.
