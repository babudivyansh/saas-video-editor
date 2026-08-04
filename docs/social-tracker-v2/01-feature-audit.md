# 01 — Complete feature audit

Every finding from the end-to-end audit. Each entry gives the problem, why it
matters, UX impact, technical impact, the recommended fix, and a priority.

Priority key: **Critical** = correctness, security or data-loss risk. **High** =
materially damages the product or blocks the redesign. **Medium** = real but
survivable. **Low** = polish.

## Inventory audited

**Frontend** — `app/dashboard/social-tracker/page.tsx` (474 lines),
`loading.tsx` (18), `components/AccountAnalytics.tsx` (462),
`components/CompetitorsSection.tsx` (187), `app/components/charts.tsx` (273),
`app/report/social/[token]/page.tsx` (139).

**API** — `app/api/social/{accounts, accounts/[id], connect/[provider],
callback/[provider], analytics, posts, insights, competitors, competitors/[id],
export, report-link}/route.ts`, `app/api/cron/social-refresh/route.ts`.

**Server** — `lib/social/{types, providers, oauth, google, meta, errors, service,
analytics, insights, competitor-source, competitors, refresh-queue}.ts`,
`lib/encryption.ts`.

**Data** — Prisma models `SocialAccount`, `SocialAccountSnapshot`,
`SocialAudienceSnapshot`, `SocialPost`, `CompetitorProfile`,
`CompetitorSnapshot`, `AiInsight`, `ClipPublish`.

---

## Critical

### C1 — No route tests anywhere under `app/api/social/**`, and no RLS

**Problem.** There are zero tests for the eleven social route handlers. Tenancy is
enforced entirely by a hand-copied `findFirst({ where: { id, userId } })` repeated
in seven files. Postgres row-level security is not in use.

**Why it matters.** The *only* thing preventing one customer from reading
another's analytics is that seven separate copies of one line are all correct, and
stay correct. Nothing in CI would catch a regression.

**UX impact.** None until it fails, at which point it is a data breach.

**Technical impact.** Every new route multiplies the surface. The plan adds ~10
routes, roughly tripling the exposure.

**Fix.** Centralise into `assertOwnedAccount(userId, accountId)` in a new
`lib/social/api.ts`; add a colocated `route.test.ts` to every social route whose
mandatory cases include a **cross-tenant 404** (another user's `accountId`). Treat
a route without that test as unmergeable.

**Priority: Critical.**

### C2 — Report links cannot be revoked

**Problem.** `app/api/social/report-link/route.ts` signs
`{ accountId, purpose: "social-report" }` with a 7-day expiry. There is no
revocation path, no record that a link was ever issued, and no view audit.

**Why it matters.** A link pasted into the wrong Slack channel exposes an
account's analytics for a week. The only kill switch is rotating `JWT_SECRET`,
which logs out every user in the product.

**UX impact.** A user who realises they mis-shared has no recourse and no way to
see whether it was opened.

**Technical impact.** Capability tokens with no server-side state cannot be
invalidated. This is a design flaw, not a bug.

**Fix.** Add a `SocialReportLink` row keyed by `jti`; move `accountIds` out of the
token into the row; verify the row on every view; add
`DELETE /api/social/report-link/[id]` setting `revokedAt` plus a Redis denylist
`social:revoked-jti:{jti}` so revocation is immediate; surface active links with
view counts and a Revoke button in Settings.

**Priority: Critical.**

### C3 — Meta sync issues one HTTP request per post

**Problem.** `syncInstagram` and `syncFacebook` in `lib/social/meta.ts` fetch
per-media insights inside a `Promise.all` over the post list. A 100-post backfill
fires 100 concurrent Graph API calls.

**Why it matters.** This is precisely the pattern Meta's Business Use Case rate
limiter exists to stop. Once tripped, the limit applies app-wide — one user's
backfill degrades every user's sync.

**UX impact.** Failed or partial syncs presenting as missing data, with no
explanation.

**Technical impact.** Unbounded concurrency scaling with post count; no batching;
the failure mode is app-level, not account-level.

**Fix.** `lib/social/meta-batch.ts` exposing `graphBatch(requests, token)` using
`POST /?batch=[…]` in chunks of 50. 100 posts becomes 2 HTTP calls.

**Priority: Critical.**

### C4 — Cache invalidation runs after the loop, not inside it

**Problem.** `service.refreshStaleAccounts()` collects affected user ids and calls
`invalidateOverview` once, after processing up to 50 accounts.

**Why it matters.** An account synced at iteration 3 of 50 serves stale overview
data for the remainder of the run — potentially minutes.

**UX impact.** A user who hits Refresh sees old numbers and concludes the sync is
broken.

**Technical impact.** Also, only a per-account analytics version key exists. A
cross-account overview (which v2 introduces) would serve stale data after any
single account syncs, because nothing bumps a user-level version.

**Fix.** Move `invalidateAccount` inside the loop, and have it bump both the
per-account version and a new `userVersion`. Consolidate every Redis key into
`lib/social/cache.ts`.

**Priority: Critical** (silent wrong data).

---

## High

### H1 — No input validation, despite zod being a dependency

**Problem.** Zero zod usage across the social feature. Validation is hand-rolled:
allow-list `Set`s, a `/^[\w.\-]{2,60}$/` handle regex, `Number.isFinite` checks,
and `Math.round(clamp(tz, ±840) / 15) * 15` arithmetic inline in the analytics
route.

**Why it matters.** Each route validates differently, several validate partially,
and none produce a machine-readable error. Bad input reaches Prisma.

**UX impact.** Opaque 500s instead of actionable 400s.

**Technical impact.** No shared contract between client and server; refactors
can't be type-checked against the wire format.

**Fix.** `lib/social/schemas.ts` with a zod schema per input, and a `withSocial`
wrapper mapping `ZodError → 400 {error, issues}`.

**Priority: High.**

### H2 — Keyset pagination is subtly wrong

**Problem.** `app/api/social/posts/route.ts` orders by
`[{ [sort]: "desc" }, { id: "desc" }]` but passes Prisma a cursor of `{ id }`
only.

**Why it matters.** When the sort field ties across a page boundary — very common
for `views` on low-traffic accounts, and universal for `shares`/`saves` which are
mostly zero — rows are skipped or repeated.

**UX impact.** Posts silently missing from "Load more", or duplicated.

**Technical impact.** The cursor doesn't encode the full sort key.

**Fix.** Encode `(sortValue, id)` into a base64 `nextCursor` and filter on the
compound comparison.

**Priority: High.**

### H3 — Broken ARIA tabs

**Problem.** `AccountAnalytics.tsx:119-133` renders `role="tablist"` and
`role="tab"` with `aria-selected`, but there are no `role="tabpanel"` elements, no
`aria-controls`/`id` wiring, no roving `tabIndex`, and no arrow-key handling.

**Why it matters.** A partial ARIA contract is worse than none. A screen reader
announces four tabs that control nothing, and keyboard users get no arrow
navigation the role promises.

**UX impact.** The analytics panel is effectively unusable with a screen reader.

**Technical impact.** None to runtime; it's an accessibility defect.

**Fix.** Top-level tabs become real `next/link` routes (they are navigation, not
tabs). Any remaining in-page tabs use a new `app/components/ui/Tabs.tsx` primitive
implementing the WAI-ARIA pattern correctly, with a component test.

**Priority: High.**

### H4 — Charts are mouse-only

**Problem.** `LineChart` in `app/components/charts.tsx` drives its crosshair and
tooltip from `onMouseMove` alone. `BestTimeHeatmap` relies on the `title`
attribute.

**Why it matters.** On touch there is no way to read a data point at all — the
chart is decoration. By keyboard, likewise.

**UX impact.** Every value on every chart is unreadable on mobile, on a product
whose e2e suite includes a Mobile Safari project.

**Technical impact.** Needs pointer events and a keyboard cursor model, not a
patch.

**Fix.** A shared `Cursor` component: `pointerdown`/`pointermove` with
`touch-action: pan-y`, tap-to-pin; `tabIndex={0}` on the SVG with `←/→/Home/End`
and an `aria-live` readout.

**Priority: High.**

### H5 — Contrast failures on real content

**Problem.** `text-gray-400` (#9ca3af) on white is ≈2.85:1, well under the 4.5:1
WCAG AA threshold, and it carries platform notes, timestamps, sub-labels, table
headers and empty-state copy. The `#9ca3af` axis labels inside the SVGs are the
same. `text-[10px]` and `text-[11px]` appear throughout.

**Why it matters.** This is content, not decoration, so the exemption doesn't
apply.

**UX impact.** Unreadable for low-vision users and in bright light for everyone.

**Technical impact.** Mechanical to fix.

**Fix.** `text-gray-400` → `text-ink-soft` (#475569, ≈7.5:1) wherever it carries
content; no font below 12px.

**Priority: High.**

### H6 — The feature ignores its own design system

**Problem.** It uses 2 of the app's 21 UI primitives (`EmptyState`, `Skeleton`)
and essentially none of the design tokens in `app/globals.css`. It hand-rolls a
toast, buttons, cards, tiles and a skeleton, and uses `blue-600` where the brand
is `--brand` #335cff, `bg-gray-50` where the shell is `bg-surface`, `rounded-2xl`
where `--radius-card` is 24px, and `shadow-sm` where `--shadow-card` exists.

**Why it matters.** The page visibly does not belong to the product. Because
`DashboardShell`'s `<main>` is `bg-surface` and the page is `bg-gray-50`, two
different greys meet at the boundary.

**UX impact.** Looks unfinished next to every other dashboard page.

**Technical impact.** Every fix to a primitive skips this feature. Five duplicate
implementations to maintain.

**Fix.** The token migration table in [06](06-dashboard-redesign.md); primitive
adoption from 2/21 to ~13/21.

**Priority: High.**

### H7 — Destructive disconnect with no confirmation

**Problem.** `page.tsx:239-248` — one click permanently deletes a `SocialAccount`
and, by cascade, all its posts, snapshots, audience rows and AI insights. No
confirmation, no undo. `ConfirmDialog` exists in the primitive set and is unused.

**UX impact.** Irreversible data loss from a mis-click.

**Technical impact.** The cascade is correct behaviour for GDPR erasure; the
missing gate is the defect.

**Fix.** `ConfirmDialog`, naming what will be deleted.

**Priority: High.**

### H8 — Metric coverage is a fraction of what the APIs expose

**Problem.** Only followers, views, likes and comments are reliably captured.
`SocialAccountSnapshot` has `impressions`, `reach` and `engagement` columns that
are mostly null. There is no daily-metrics table at all — snapshots hold
*cumulative lifetime* values captured at sync time.

**Why it matters.** Impressions, reach, profile visits, website clicks, watch
time, average view duration and percentage, saves and shares are all genuinely
available from the YouTube Analytics API and Meta Graph, and we don't ask for
them. `fetchWatchTime` requests one metric where a single report call could
return ten.

**UX impact.** The dashboard shows four numbers where competitors show forty.

**Technical impact.** Needs a new `SocialDailyMetric` table — overloading the
cumulative snapshot table would break `windowDelta()`, which assumes monotonicity.

**Fix.** Stages 2 and 3 of the plan. See [08](08-analytics-roadmap.md).

**Priority: High.**

### H9 — Backfill blocks the interactive connect flow

**Problem.** Connecting an account synchronously fetches 100 posts inside a 300s
`SYNC_LOCK_TTL`.

**UX impact.** A long, unexplained wait on the single most important moment in the
feature's funnel — first connect.

**Technical impact.** Also risks exceeding the lock TTL on slow provider responses,
which would let a second sync start concurrently.

**Fix.** Return immediately with profile plus the first page of posts; enqueue
deep history as a separate `social:backfill:{accountId}` job.

**Priority: High.**

---

## Medium

### M1 — Loading state is the string "Loading…"

`page.tsx:290`. The sibling `loading.tsx` skeleton never renders, because the page
is a client component that fetches after mount. Worse, the skeleton's `p-6` /
4-column layout doesn't match the real `p-8` / 3-column page, so if it did render
it would cause a jump. **Fix:** shape-matched skeletons per surface, each wrapped
in `role="status" aria-live="polite" aria-busy="true"`. **Medium.**

### M2 — Failed account load is indistinguishable from having no accounts

A non-402 failure of `GET /api/social/accounts` leaves `accounts === null` and
renders the empty state — the user is told to connect an account they already
have. **Fix:** an explicit error branch with retry. **Medium.**

### M3 — Toast is not announced

`page.tsx:356-363` is a plain `div`. OAuth success, refresh failure and "report
link copied" are all silent to assistive technology. `ToastProvider`/`useToast`
already exist. **Medium.**

### M4 — Export failures are silent

`AccountAnalytics.tsx` — `if (!res.ok) return;`. Clicking Export does nothing,
with no message. **Medium.**

### M5 — `StatTile` name collision

Two different components share the name: `app/components/ui/StatTile.tsx` (the
design-system tile) and one exported from `app/components/charts.tsx`. The feature
imports the latter. **Fix:** delete the chart-kit one; the KPI surface uses the new
`KpiCard`. **Medium.**

### M6 — The public report page duplicates formatting logic

`app/report/social/[token]/page.tsx` re-declares `fmt`, `fmtPct` and a private
`Tile` rather than importing the shared kit. Two implementations of delta
formatting will drift. **Medium.**

### M7 — Alerts are hardcoded English

`computeAlerts` builds message strings with `Intl.NumberFormat` inside what is
otherwise a pure module. The app ships 13 locales; alerts cannot be translated.
**Fix:** return `{kind, severity, code, params}` and render in the presentation
layer. **Medium.**

### M8 — Competitors section vanishes entirely when unconfigured

`CompetitorsSection.tsx:73` returns `null` if the vendor isn't configured, so the
feature is invisible rather than explained. **Fix:** render an explanatory state.
**Medium.**

### M9 — Competitor delete has no error handling and no confirmation

Neither a failure path nor a `ConfirmDialog`. **Medium.**

### M10 — `availableProviders()` lies

`lib/social/providers.ts` returns all registry keys regardless of whether the
provider's env credentials are configured, despite a doc comment claiming
otherwise. A user can click Connect on a provider that cannot work. **Medium.**

### M11 — Idempotency key labels a date as a week

`app/api/social/insights/route.ts` builds
`social-insights:{accountId}:{week}` where `week` is
`new Date().toISOString().slice(0, 10)` — a date. The 6-day freshness gate masks
the discrepancy, but the key doesn't mean what it says. **Fix:** a real ISO week.
**Medium.**

### M12 — Sync errors are logged, never reported

`service.syncAccount`'s catch calls the logger only. Sentry is installed and
configured. Provider breakage is invisible until a user complains. **Medium.**

### M13 — Heatmap cells are non-semantic divs

`charts.tsx:203-209` — a CSS grid of `div`s. Empty cells get no `aria-label` at
all, and there is no table or grid semantic, so the structure is unreadable.
**Fix:** a real `<table>`. **Medium.**

### M14 — `<a href="#">` no-op links

`AccountAnalytics.tsx:324, 433` for posts with no permalink — focusable links that
do nothing. **Fix:** render a `<span>`. **Medium.**

---

## Low

- **L1** — Avatars and thumbnails use `<img>` with `no-img-element` suppressed
  rather than `next/image`. Correct today, because the IG/FB CDN hosts and
  `i.ytimg.com` are not in `next.config.ts` `remotePatterns`; adding them also
  changes the CSP `img-src`. Worth doing, not urgent.
- **L2** — Competitor `@handle` input has an `aria-label` but no visible `<label>`.
- **L3** — The remove control is a literal `✕` text node rather than an SVG with
  `aria-hidden`; the label rescues it in most configurations.
- **L4** — `busy` state in `page.tsx` holds either a provider id or an account id
  in the same slot, so a connect and a refresh can appear to disable each other.
- **L5** — The tab strip neither wraps nor scrolls; four tabs at `px-5` is tight
  on small phones.
- **L6** — `weekDelta` in `CompetitorsSection` uses last-match-wins iteration over
  `snapshots`, assuming ascending order that the component does not guarantee.
- **L7** — Range switcher persists to the URL via `history.replaceState`, so the
  browser Back button does not undo a range change.

---

## What is already good — and must survive the rewrite

Recording these explicitly, because a redesign is the easiest place to lose them.

- **Token security.** AES-256-GCM with a fresh 96-bit IV per value, key separate
  from the database, hard failure in production if unset (`lib/encryption.ts`).
- **OAuth hardening.** PKCE S256, signed 600s-TTL state JWT, single-use Redis
  nonce, and a `provider_mismatch` re-check in the callback.
- **The `sr-only` data table** rendered under every `LineChart` — a genuinely good
  accessibility pattern that most chart libraries don't offer. Keep it; it is the
  main argument against adopting recharts on this surface.
- **`DeltaChip` never encodes direction by colour alone** — it uses ↑/↓/→ glyphs.
- **The deterministic factsheet discipline** in `lib/social/insights.ts`: numbers
  are computed in pure code and the model is told to use only those. Extend it,
  don't relax it.
- **Credit handling**: charge → try → mark completed → catch → refund, with an
  idempotency key. Copy this pattern verbatim for every new AI generator.
- **`withRetry` with full jitter** and a three-way `classifyError`
  (auth / retryable / permanent).
- **Snapshot de-duplication** — skips writing when the last capture is under 6h
  old and every metric is identical.
- **Deliberate auth asymmetry** — `DELETE` on accounts and competitors uses
  `getAuthUser`, not `requireSubscriber`, so a lapsed user can always remove their
  own data. That is a correct and considered decision.
