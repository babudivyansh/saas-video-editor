# 04 — Feature gap analysis

What the shipped Social Tracker has, what a modern social analytics product has,
and the honest reason for each gap. Head-to-head against named competitors is in
[05](05-competitor-comparison.md).

Status key: **Have** · **Partial** · **Missing** · **Blocked** (cannot be built —
the data does not exist).

## Advanced analytics

| Capability | Status | Notes |
|---|---|---|
| Follower time series | Have | `SocialAccountSnapshot` + `LineChart` |
| Total views time series | Have | Cumulative lifetime views |
| Engagement rate with delta | Have | Plus an ER benchmark band per platform — a genuinely good touch |
| Reach / impressions series | Missing | Columns exist on the snapshot table and are mostly null; the APIs do expose these (IG `reach`, FB `page_impressions`) |
| Profile visits, website clicks | Missing | Native on IG and FB, unavailable on YouTube |
| Watch time, avg view duration, avg view % | Partial | `fetchWatchTime` gets one aggregate number; per-video duration data is not fetched |
| Click-through rate | Blocked on YouTube | Impression CTR is YouTube Studio–only. Derivable on IG/FB from clicks ÷ impressions |
| Daily / weekly / monthly granularity | Missing | Only raw snapshot points; no bucketing |
| Custom date range | Missing | Fixed 7/30/90 presets |
| Period-over-period comparison overlay | Partial | Deltas are computed; there is no overlay on the chart |
| Year-over-year | Missing | Needs 400-day retention to guarantee a full prior year |
| Platform comparison | Missing | The single most-requested cross-account view; today you scroll |
| Posting frequency / consistency | Partial | `postsPerWeek` exists; no consistency measure, no chart |
| Activity timeline / annotations | Missing | No way to see a publish event on a growth chart |
| Traffic sources | Missing | YouTube `insightTrafficSourceType` is available and unrequested |
| Device breakdown | Missing | YouTube `deviceType` available; IG does not expose it |

## AI insights

| Capability | Status | Notes |
|---|---|---|
| Weekly AI summary | Have | Gemini 2.5 Flash over a deterministic factsheet, credit-costed, 6-day freshness gate. The discipline here is the best thing in the feature |
| Monthly / quarterly / annual summaries | Missing | Same machinery, different period bounds |
| Per-KPI "why did this change?" | Missing | Should be template-first and free; only call the model for unexplained anomalies |
| Best / worst performing content narration | Partial | Top posts are listed; nothing explains *why* |
| Content recommendations | Missing | |
| Caption improvement / hashtag suggestions | Missing | |
| Posting schedule suggestion | Partial | A best-time heatmap exists; no schedule is produced from it |
| Growth opportunities | Missing | |
| Account health score | Missing | |
| Viral opportunity detection | Missing | |
| AI performance score per post | Missing | Must be **computed** deterministically and only *narrated* by the model |

## Audience analysis

| Capability | Status | Notes |
|---|---|---|
| Age distribution | Have | IG `follower_demographics`, YouTube `ageGroup` |
| Gender distribution | Have | Same sources |
| Top countries | Have | |
| Top cities | Missing | IG supports `breakdown=city`; not requested |
| Language | Missing | IG supports it |
| Active hours / active days | Missing | IG `online_followers` exists — **but returns absolute counts, not percentages**, which breaks the current `value Float // 0-100` contract. Needs a `unit` column |
| Device usage | Partial-Blocked | YouTube yes; IG/FB no |
| Returning vs new audience | Blocked | Neither platform exposes it for organic content. YouTube's `subscribedStatus` split is the nearest honest proxy |
| Audience interests | Blocked | Removed from Meta's API; never existed for YouTube |
| Reached vs engaged vs follower audience | Missing | IG exposes all **three** as separate populations. Merging them would be wrong; they need an `audience` discriminator |
| Audience growth series | Partial | Follower count only; no gained/lost split |
| Retention | Partial | `avgViewPercentage` is the honest proxy on YouTube; not fetched |

Two of these are worth flagging as product-honesty decisions rather than backlog
items. "Audience interests" and "returning vs new audience" appear on competitor
marketing pages, but for organic accounts on these three platforms the data is not
obtainable. They ship as greyed tiles with an explanation.

## Engagement intelligence

| Capability | Status |
|---|---|
| Likes / comments totals | Have |
| Shares | Partial — IG and FB yes; YouTube `shares` is available via the Analytics API and unrequested |
| Saves | Partial — IG native; YouTube derivable from `videosAddedToPlaylists`; **FB unavailable** |
| Total interactions / accounts engaged | Missing — IG exposes both |
| Engagement rate benchmarking | Have — `ER_BENCHMARKS` per platform |
| Benchmark vs *your own* trailing baseline | Missing — arguably more useful than an industry band |
| Sentiment / comment analysis | Missing — out of scope; needs comment ingestion we deliberately don't do |
| Response time / inbox | Out of scope — this is a publishing product, not a social inbox |

## Competitor tracking

| Capability | Status | Notes |
|---|---|---|
| Track public profiles | Have | Max 3, IG + YouTube, via ScrapeCreators with a monthly budget cap |
| Follower comparison + 7-day movement | Have | |
| Growth comparison chart | Missing | Snapshots exist; nothing charts them |
| Posting frequency comparison | Missing | Needs `postsCount` on the snapshot |
| Engagement comparison | Missing | Needs `avgLikes`/`avgComments`/`engagementRate` |
| Audience comparison | Blocked | Competitor demographics are not publicly available |
| Their top-performing posts | Missing | Vendor-dependent |
| Estimated reach | Blocked-ish | Only ever an estimate; if shown, must be labelled as modelled |
| Trending hashtags | Missing | Vendor-dependent |

The competitor feature is also **invisible when unconfigured** (M8) — it returns
`null` rather than explaining itself.

## Content performance

| Capability | Status |
|---|---|
| Per-post views / likes / comments | Have |
| Reach, shares, saves | Partial — schema columns exist, population is inconsistent |
| Impressions, plays | Missing |
| Watch time, avg watch duration, completion rate | Missing |
| CTR per post | Partial — IG/FB derivable; YouTube blocked |
| Viral score | Missing |
| AI performance score | Missing |
| Sorting | Have — 5 fields, with the pagination bug (H2) |
| Filtering | Partial — `type` and `q` exist server-side and are not exposed in the UI |
| Date-range filter on content | Missing |
| Post detail view | Missing |
| Content-type mix | Have — `TypeBars` |
| Viral content timeline | Missing |

## Growth prediction and goals

| Capability | Status |
|---|---|
| Forecasting | Missing |
| Goal setting | Missing |
| Goal progress / on-track indicator | Missing |
| Milestone alerts | Have — `computeAlerts` fires at 1k…1M, though the strings are untranslatable (M7) |
| Required-rate-to-hit-target | Missing |

Forecasting must degrade honestly: below 14 data points, `forecast()` returns
`null` and the UI says "need more history" rather than drawing a line through
noise.

## Reporting

| Capability | Status |
|---|---|
| CSV export | Have — posts and snapshots, hand-rolled and correct |
| Excel export | Missing |
| PDF export | Missing |
| Scheduled reports | Missing |
| Weekly / monthly / quarterly / annual periods | Missing |
| AI executive summary in a report | Missing |
| Shareable link | Have — but unrevocable (C2) |
| White-label / branded reports | Missing — an agency requirement; deferred |

## Platform coverage

Connected: YouTube, Instagram, Facebook. Not connected: TikTok (deliberately
removed in `a16e6e9`), X, LinkedIn, Pinterest, Threads.

Per the scope decision, no new integrations ship. The work that *does* happen is
making a new provider a genuine drop-in: implement `ProviderAdapter`, add a
`CAPABILITIES` row, register in `PROVIDERS`, and nothing else in the codebase
branches on provider id.

## Platform overview surface

Requested: connected accounts, sync status, last sync, account health, API status,
auth status. We store `lastSyncStatus` (`ok`/`partial`/`failed`), `lastSyncError`,
`lastSyncedAt`, and `status` (`active`/`needs_reauth`/`revoked`) — **and surface
almost none of it.** A partial sync looks identical to a healthy one. This is a
cheap, high-value gap: the data already exists.

## Summary — the five gaps that matter most

1. **No cross-account overview.** The most common question the product exists to
   answer cannot be answered.
2. **Metric coverage is ~15% of what the APIs give us.** Not a platform
   limitation; we simply don't ask.
3. **No decision support.** No health score, no goals, no forecasting, no
   benchmark against your own baseline. Numbers without judgement.
4. **No reports.** CSV only. Agencies and enterprise teams need PDF with an
   executive summary; that is table stakes, not a differentiator.
5. **AI is one weekly paragraph.** The factsheet architecture that makes AI safe
   here is already built and is used for a single feature.
