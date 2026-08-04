# 08 — Analytics roadmap

Metric coverage, sequenced. The organising artefact is the **provider capability
matrix** in `lib/social/capabilities.ts` — a typed map of
`provider → metric → {support, scope, unit, reason?, derivedFrom?}` where
`support` is `native | derived | unavailable`.

It is the single source of truth for four consumers: the sync (adapters fetch what
is `native`), the derivation engine (computes what is `derived`), every
account-scoped API response (ships a resolved capability map), and the UI (renders
the greyed state with a reason).

**Two layers.** The static matrix answers *"can this platform's API ever supply
this?"* A per-account overlay on `SocialAccount.capabilitiesJson`, written by the
sync when a call errors or omits a metric, answers *"can this account supply it
right now?"* — an IG account under 100 followers, a channel connected before
`yt-analytics.readonly` was requested, a Page without `read_insights`. Without the
overlay, those tiles would read `—` forever with no explanation.

## Coverage by metric

`●` native · `◐` derived · `○` unavailable

| Metric | YT | IG | FB | Notes |
|---|:--:|:--:|:--:|---|
| followers | ● | ● | ● | |
| followersGained / Lost | ● | ● | ● | YT `subscribersGained/Lost`; IG `follower_count`; FB `page_fan_adds/removes` |
| followerGrowthRate | ◐ | ◐ | ◐ | Derived from the follower series |
| views | ● | ● | ● | |
| plays | ● | ● | ● | |
| reach | ○ | ● | ● | YouTube has no reach concept; unique viewers ≠ reach |
| **impressions** | **○** | ◐ | ● | **YouTube: Studio-only.** IG: derived from `views` (Meta removed `impressions` in Graph v22). FB: `page_impressions` |
| **ctr** | **○** | ◐ | ◐ | **YouTube impression CTR: Studio-only.** IG/FB derived from clicks ÷ impressions |
| profileViews | ○ | ● | ● | IG `profile_views`; FB `page_views_total` |
| websiteClicks | ○ | ● | ● | |
| likes / comments | ● | ● | ● | |
| shares | ● | ● | ● | YT `shares` via the Analytics API — available and currently unrequested |
| **saves** | ◐ | ● | **○** | YT derived from `videosAddedToPlaylists`; **FB has no equivalent** |
| totalInteractions | ◐ | ● | ◐ | |
| accountsEngaged | ○ | ● | ○ | IG only |
| engagementRate | ◐ | ◐ | ◐ | Always derived; denominator differs per platform and must be documented |
| watchTimeSec | ● | ● | ● | YT `estimatedMinutesWatched`; IG `ig_reels_video_view_total_time`; FB video only |
| avgViewDurationSec | ● | ● | ◐ | |
| avgViewPercentage | ● | ○ | ◐ | YT native; FB derived from `post_video_avg_time_watched ÷ length` |
| postsPublished | ● | ● | ● | Counted from our own post rows |
| postingFrequency | ◐ | ◐ | ◐ | |
| viralScore / healthScore | ◐ | ◐ | ◐ | Computed by us, never fetched |

### The three honest zeros

These ship as permanently greyed tiles with an explanation. They are real API
limits, and estimating them would be worse than admitting them.

1. **YouTube impressions and impression CTR.** Exposed by neither the YouTube
   Analytics API v2 nor the bulk Reporting API — Studio only. This is the largest
   "requested KPI that cannot be real".
2. **Facebook saves.** No equivalent metric.
3. **YouTube reach.** No such concept; unique viewers is a different measure and
   presenting it as reach would mislead.

Also blocked, at the audience level: **returning vs new audience** (YouTube's
`subscribedStatus` split is the nearest honest proxy) and **audience interests**
(removed from Meta's API; never existed for YouTube).

## Sequencing

### Phase A — foundations *(build Stage 1–2)*

Capability matrix. `SocialDailyMetric` table — per-day, provider-restated,
idempotently upsertable on `(accountId, date)`. **Not** an extension of
`SocialAccountSnapshot`, which stores cumulative lifetime values that
`windowDelta()` assumes are monotonic. `SocialPost` gains impressions, plays,
watch-duration and score columns. `SocialAudienceSnapshot` gains `unit` (required
— IG `online_followers` returns absolute counts and would otherwise render
4,200% bars) and `audience` (IG exposes follower / reached / engaged as three
distinct populations that must not be merged).

### Phase B — fetch what exists *(Stage 3)*

Gated on `scripts/social-probe.mjs` running against one real account per platform.
**`CAPABILITIES` is authored from observed responses, not documentation** — Meta
deprecates insight metrics aggressively and this is the largest schedule risk in
the project.

- **YouTube**, via a new `lib/social/google-analytics.ts`: daily channel report
  (`day` × views, estimatedMinutesWatched, averageViewDuration,
  averageViewPercentage, subscribersGained/Lost, likes, comments, shares,
  videosAddedToPlaylists); per-video report (50 ids per call); traffic source;
  device; country; age×gender; subscribed status. Replaces the single-metric
  `fetchWatchTime`.
- **Meta**, batched through `graphBatch`: IG account insights (reach, views,
  profile_views, website_clicks, follower_count, accounts_engaged,
  total_interactions, likes, comments, saves, shares) plus `online_followers` →
  24 `activeHour` rows with `unit: "count"`; IG media insights including
  `ig_reels_avg_watch_time`; the two additional demographic audiences with
  `breakdown=city`; FB Page and post insights.

Backfill: 365 days for YouTube, 90 days in 30-day windows for Meta (their
per-call max), capped at 12 windows, run as a **separate job** so the connect flow
returns immediately. Steady state re-fetches from `cursor − 2 days` because
providers restate the last 24–48h; the `(accountId, date)` unique makes it
idempotent.

### Phase C — derive *(Stage 4)*

All 17 KPIs with period-over-period deltas. Growth rates: daily, weekly, monthly,
compounded. Viral score. Account health with five visible components. Posting
frequency and consistency. Platform comparison. Benchmarking against both the
industry band and the user's own trailing baseline. Goal progress with a required
daily rate. Forecast.

Formulas worth pinning, because they are the ones that can quietly become
nonsense:

- **`viralScore`** → 0–100. `z = (log1p(views ?? reach) − median_log) / mad_log`
  against the account's trailing-90-day cohort *of the same mediaType* (falls back
  to all types below 5 samples). Blend `0.55·σ(z) + 0.25·shareRatePercentile +
  0.20·erPercentile`, logistic squash, ×100. **Returns `null` below 5 cohort
  samples** — never fake a score on a new account.
- **`accountHealth`** → 0–100 from five *separately returned* components so the UI
  can explain the number: growth momentum 25, engagement vs own trailing baseline
  25, posting consistency 20, retention 15, data completeness 15. Missing
  components redistribute proportionally and the response carries
  `confidence = availableWeight / 100`.
- **`forecast`** → Holt's linear trend, damping φ = 0.9, α/β fitted by coarse grid
  search minimising SSE (deterministic, no RNG); prediction interval from residual
  stddev. **Returns `null` below 14 points**; the UI says "need more history"
  rather than drawing a line through noise.

### Phase D — surface *(Stages 5–7)*

`/api/social/series` becomes the one endpoint behind every chart:
`?accountIds&metrics&range&granularity&tz` → `{series: [{accountId, metric, unit,
available, points}]}`, capped at `accountIds × metrics ≤ 40`. `/api/social/overview`
serves the executive view. Every account-scoped response ships its resolved
capability map so no client re-derives it.

### Phase E — explain and report *(Stages 8–9)*

AI narration over deterministic factsheets ([07](07-ai-features.md)); PDF, CSV and
XLSX reports for four periods ([10](10-api.md)).

## Retention

Volume is modest — roughly 1.1k daily-metric rows per user per year at three
accounts, so ~11M rows/year at 10k users, which the composite
`(accountId, date)` index handles comfortably.

`pruneOldSnapshots()` is renamed `pruneTimeSeries()` and extended:

| Table | Policy |
|---|---|
| `SocialAccountSnapshot` | Existing 90-day daily collapse, unchanged |
| `SocialDailyMetric` | Raw dailies for **400 days** (not 365, so year-over-year always has a full prior year), then a monthly rollup written back as `source: "derived"` and the dailies deleted |
| `SocialAudienceSnapshot` | 180 days, then one capture per month |

The existing `$executeRaw` `DISTINCT ON` style is kept — it is correct and
Postgres-specific, which is fine here.

## Quota

YouTube Data stays ~3 units per steady sync (5 for backfill) against a 10,000
unit/day **per-app** ceiling; the Analytics API is per-query, and seven report
calls per account per day is trivial. Meta gets *cheaper* — `graphBatch` turns a
100-post backfill from 100 HTTP calls into 2.

`social:quota:{provider}:{day}` Redis counters land alongside the existing
`social:stats:{day}:{ok|fail}` so the assumption is monitored rather than assumed.
