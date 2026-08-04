# 07 — AI feature recommendations

## The rule everything here follows

`lib/social/insights.ts` already establishes the right architecture, and it is
better than what most competitors ship:

1. Every number is computed by **pure deterministic code**.
2. Those numbers are rendered into a **factsheet** — a plain object.
3. The model receives the factsheet and is told: *"Use ONLY these numbers — never
   invent, extrapolate, or recompute."*
4. The reply is fence-stripped and shape-validated before it is persisted.

Every new generator extends this. Two additions make it enforceable rather than
aspirational:

- **Response schemas contain no numeric fields.** Where a recommendation must
  reference a metric it uses `z.enum(METRIC_KEYS)`. A hallucinated metric name
  fails validation, which triggers the refund path. Today's implementation only
  checks `typeof summary === "string"`, so a fabricated number would sail through.
- **Factsheet builders cannot reach the database.** `lib/social/ai/factsheets.ts`
  has no `prisma` import; the caller does the I/O. Signature is always
  `(facts: Factsheet) => Promise<T>`.

And the corollary that matters most: **scores are computed, not generated.** The
"AI performance score" for a post is calculated in `lib/social/metrics/scores.ts`
from real cohort statistics. The model writes one sentence explaining it. If the
model produced the score, the score would be worthless.

## Module layout

```
lib/social/ai/
  client.ts                 shared Gemini call — responseMimeType: application/json,
                            responseSchema, withRetry(lib/with-retry), zod validation
  factsheets.ts             PURE builders, one per generator, golden-string tested
  schemas.ts                zod response schemas (no numeric fields)
  kpi-explain.ts
  executive-summary.ts      weekly | monthly | quarterly | annual
  content-recommendations.ts
  caption-hashtags.ts
  schedule-suggestions.ts
  growth-opportunities.ts
  post-narration.ts
```

`lib/social/insights.ts` becomes a thin re-export of weekly `executive-summary`,
so `/api/social/insights` and its existing test keep working untouched.

Model stays **Gemini 2.5 Flash** (`@google/generative-ai`, `GEMINI_API_KEY`) —
already wired, already cost-verified, and adequate for factsheet narration. There
is no case for a larger model when the reasoning has already been done in code.

## The generators

### 1. KPI explanation — *"why did this change?"*

The highest-value AI feature, and it should mostly not call a model.

**Template first.** Most KPI movements have a derivable cause: reach fell and post
count fell; engagement rose and one post scored in the top decile; followers
spiked on the day a video crossed a threshold. `explainDeterministic(kpi, context)`
tries a ranked set of templates and returns a sentence with no model call.

**Model second.** Only when no template matches an anomaly. Cached in Redis for
24h under a key built from **rounded** metric values, so two users with similar
dashboards — or the same user reloading — never re-bill or re-call.

**Cost: 0 credits.** It must be free, or users will not click it, and an
unexplained dashboard is the problem we are solving.

### 2. Executive summaries — weekly, monthly, quarterly, annual

Extends the existing weekly generator to four period bounds via
`periodBounds(period, now, tz)` from `lib/social/metrics/dates.ts`.

Output shape stays `{summary, wins[], recommendations[]}` — already validated,
already rendered.

Weekly stays automatic behind the existing 6-day freshness gate (2 credits, as
today). Monthly / quarterly / annual are on-demand and credit-gated, and are also
generated as part of a report run.

*Fix while here:* the current idempotency key is
`social-insights:{accountId}:{week}` where `week` is
`toISOString().slice(0, 10)` — a date, not a week (M11). Use a real ISO week.

### 3. Content recommendations

Input factsheet: top and bottom deciles by viral score, content-type mix and
performance by type, posting cadence, best-time heatmap, trailing baselines.

Output: 3–5 recommendations, each `{action, rationale, metric: MetricKey,
expectedDirection: "up"|"down"}`. The `metric` enum is the hallucination guard.

Weekly idempotency: `social-content-recs:{accountId}:{isoWeek}`. **3 credits.**

### 4. Caption and hashtag suggestions

The one generator where the model is doing creative work rather than narration, so
the discipline differs: the factsheet supplies the account's historical
best-performing captions and the hashtags that correlate with above-baseline
reach, and the model writes variants.

Honest limitation to surface in the UI: **hashtag *analytics* are weak on these
platforms.** We can correlate hashtags in our own captions against our own reach.
We cannot see platform-wide hashtag volume without a vendor. Suggestions are
labelled as derived from the user's own history, not as trend data.

**1 credit.**

### 5. Posting-schedule suggestion

`computeBestTimes` already produces a 7×6 heatmap. Today it stops there. This
generator turns it into a schedule: *"Publish Tue/Thu 18:00–22:00 and Sun
10:00–14:00; your Wednesday posts underperform by 40%."*

Deterministic ranking plus one paragraph of narration. **1 credit**, or bundled
free into the weekly summary.

### 6. Growth opportunities

Input: goal progress, forecast output, platform comparison, competitor deltas,
capability gaps. Output: 3 opportunities with an estimated effort and the metric
each would move. **On-demand, credit-gated.**

### 7. Per-post narration

`postScoreComponents` computes the score. The model writes one sentence per post
explaining which component drove it.

**Batched — 10 posts per call, one credit** — otherwise this is the most expensive
feature in the product by an order of magnitude.
Key: `social-post-narration:{accountId}:{batchIdHash}`.

### 8. Account health narration

`accountHealth` returns five weighted components and a `confidence` value. The
model turns them into two sentences. Bundled into the weekly summary; no separate
charge.

## Cost model

New entries in `lib/tool-costs.ts` — **mandatory**, because
`scripts/check-unverified-costs.mjs` runs inside `npm run lint` and
`getToolConfig` reads from there:

| Slug | Credits | Cadence |
|---|---|---|
| `social-insights` (existing) | 2 | Weekly, auto |
| `social-kpi-explain` | 0 | On demand, template-first, cached 24h |
| `social-caption` | 1 | On demand |
| `social-post-narration` | 1 | Per batch of 10 |
| `social-content-recs` | 3 | Weekly, on demand |
| `social-exec-report` | 5 | Per report run |

`costUsd: null` with a stated basis, matching the existing `brainstormer` and
`social-insights` precedent — Gemini text over a ≤2 kB factsheet is genuinely
sub-cent. No `verify-before-ship` markers, so the script's ALLOWLIST is untouched.

Credit mechanics copy `app/api/social/insights/route.ts` verbatim, because it is
already correct: `chargeCredits` → try → `markGenerationStatus(id, "completed")` →
catch → `refundCredits` → 502 *"you were not charged"*.

## What we deliberately do not build

- **Sentiment analysis.** Requires ingesting comment text. We deliberately do not
  store user comments, and doing so would change the privacy posture documented in
  `docs/social-tracker-security.md`.
- **Trend prediction from platform-wide data.** We only see the user's own
  account. Claiming to know what's trending would be fabrication.
- **AI-generated numeric forecasts.** `metrics/forecast.ts` does this
  deterministically (Holt's linear trend, damped, grid-searched, no RNG) and
  returns `null` below 14 points. A model must never produce a number.
- **Auto-posting on AI recommendation.** Recommendations are advice. A human
  publishes.

## Testing

- `factsheets.test.ts` asserts **golden strings** for fixed inputs. The factsheet
  is the contract that must never lie, and it is the cheapest thing to test.
- Schema tests confirm a numeric field cannot pass validation.
- Route tests confirm the refund fires on a model failure.
- No test asserts on model *output text* — that would be flaky and meaningless.
