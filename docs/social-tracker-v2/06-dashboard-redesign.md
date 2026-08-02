# 06 — Dashboard redesign

The new information architecture, layout, visual system and component inventory.

## Design principle

**Every element answers a question.** A tile that reports a number without context
— no benchmark, no baseline, no trend, no explanation — does not ship. This is the
line that separates the redesign from a reskin.

Concretely, that means: rates carry benchmarks, deltas compare against the user's
own trailing baseline as well as the previous period, the health score exposes its
components, forecasts state their confidence and refuse to draw below 14 points,
and unavailable metrics say *why* instead of showing an empty box.

## Visual direction

The app's shipped design system is the vibrant-gradient dashboard system:
`--brand` #335CFF → `--accent-violet` #7C3AED → `--accent-fuchsia` #D946EF, Plus
Jakarta Sans, pill buttons, soft pastel tints, `--radius-card` 24px, `--shadow-card`.
The redesign uses **that**, not a new language.

Applied restraint, given the reference points (Vercel, Linear, Stripe, Notion):

- **Gradient is an accent, not a surface.** `grad-brand` appears on the header
  icon, primary CTAs, the health gauge arc, and the AI panel's tint. Charts and
  KPI values are `--ink` on white. A dashboard whose data is rendered in gradients
  is unreadable.
- **Glassmorphism only where it earns its place** — the sticky filter bar
  (`bg-white/85 backdrop-blur border-b border-card-border`) so content scrolling
  underneath reads as depth rather than clutter. Nowhere else.
- **Density over decoration.** Stripe's dashboard is dense and quiet. KPI tiles are
  compact enough that 17 of them fit above the fold at 2xl.
- **One accent per surface.** `Card` tints (blue/violet/fuchsia/amber/emerald/rose)
  carry meaning — violet = AI, amber = warning, emerald = positive milestone — not
  variety.
- **Light only.** No dark mode; the rest of the app has none, and a tracker-only
  dark theme would read as broken.

## Information architecture

Six sibling routes under a shared shell, replacing one 4,000px page.

```
app/dashboard/social-tracker/
  layout.tsx            server: requireServerSubscriber, feature flag,
                        accounts fetched once, <SocialShell>, <Suspense>
  page.tsx              Overview      — "how am I doing?"
  content/page.tsx      Content       — "what worked?"
  audience/page.tsx     Audience      — "who is watching?"
  competitors/page.tsx  Competitors   — "how do I compare?"
  reports/page.tsx      Reports       — "give me something to send"
  settings/page.tsx     Settings      — connections, links, goals, sync health
  loading.tsx / error.tsx per route
  components/…
```

Why routes rather than tabs: deep links, working browser Back, per-view streaming
and error boundaries, and the removal of the broken ARIA tablist (H3). Tabs are
navigation here, so they are `next/link`.

`DashboardShell`'s `ROUTE_ACTIVE` already matches on the
`/dashboard/social-tracker` prefix, so the sidebar needs no change.

**Filters are global and live in the URL** — `?accounts=&range=&granularity=&compare=`
— so any view is shareable and survives reload.

## Component tree

```
SocialShell
├── SocialHeader        grad-brand icon · title · CreditsPill · "Sync all"
├── AccountSwitcher     multi-select chips, avatar + platform badge, "All accounts"
├── FilterBar           sticky top-0 z-20 bg-white/85 backdrop-blur
│   ├── RangePresets    7 / 30 / 90 / 365 / custom (Modal + two date inputs)
│   ├── PlatformFilter  Dropdown primitive
│   ├── CompareToggle   "vs previous period"
│   └── GranularitySelect  day / week / month
├── TabsNav             next/link — real routes
└── {children}

Overview (page.tsx)
├── AlertStrip          Card tint=amber|emerald, dismissible, i18n from alert codes
├── KpiGrid             grid-cols-2 sm:3 lg:4 2xl:6
│   └── KpiCard × 17
├── HealthGauge + GoalsStrip
├── AiInsightsPanel     Card tint=violet
├── TrendSection        TimeSeriesChart: brush · compare overlay · forecast band
├── PlatformOverview    ComparisonBars + per-platform cards (sync status, health,
│                       auth status, last sync — data we already store and never show)
└── TopContentPreview   top 5 → /content

QuickActions            fixed bottom-6 right-6 (sm+) · bottom bar on mobile
                        Sync all · Generate report · Add competitor · New goal
```

## The KPI grid

All 17 requested KPIs render, always. Which ones are *live* depends on the
provider capability matrix.

Total Followers · Total Reach · Total Impressions · Profile Visits · Engagement
Rate · Watch Time · Total Views · Average Views · Shares · Saves · Comments ·
Likes · Click-through Rate · Growth Rate · Monthly Growth · Weekly Growth · Daily
Growth.

Each carries: value, percentage change, previous-period value, a trend indicator,
a sparkline, an optional benchmark band, and a "why?" affordance that returns an
AI (or template) explanation.

### `KpiCard` — three states

This component is what the "show all KPIs" decision rests on.

**1. Available.** `bg-white border-card-border rounded-[var(--radius-card)]
shadow-card`. Value `text-ink text-2xl font-extrabold` with a count-up animation.
`DeltaChip` (↑/↓/→ glyph plus colour — never colour alone). Sparkline. Benchmark
band where one exists.

**2. Available, no data yet.** Same chrome. Value `—`. Subtitle: *"Collecting —
check back after a few syncs."* Critically distinct from a real zero, which today
it isn't.

**3. Unavailable on this provider.** `bg-surface`, dashed border, dash glyph,
label in `text-ink-soft`, `aria-disabled` but **still focusable** so the
explanation is keyboard-reachable, and a `Tooltip` carrying
`unavailableLabel(provider, metric)` — e.g. *"Not available on YouTube —
impressions and click-through rate are only exposed in YouTube Studio."*

State 3 is driven by `effectiveCapability()`: the static per-provider matrix
intersected with a per-account overlay written by the sync. That second layer is
what distinguishes "YouTube never exposes this" from "your Page hasn't granted
`read_insights`" from "your IG account is under 100 followers so demographics are
withheld" — three different messages, three different user actions.

Count-up uses `useCountUp(value, {duration: 700})`, which returns the final value
**immediately** under `useReducedMotion()` — skipped, not shortened.

## Charts

Decision: **extend the hand-rolled kit**, promote `app/components/charts.tsx` to
`app/components/charts/`. recharts stays admin-only.

Reasoning, in order: recharts 3 pulls a d3 subtree — realistically +90–110 kB
gzipped on the heaviest customer route, on a product with a Mobile Safari e2e
project. It ships no `sr-only` table equivalent, so adopting it means building the
accessible layer anyway. Brush, zoom, PNG export and an arrow-key cursor all need
the coordinate math the kit already owns. And the kit takes `color` as a prop, so
retinting to design tokens is a prop change rather than a theme shim.

Counter-argument, stated honestly: a synchronised-cursor, stacked, brushed
multi-chart dashboard is ~3–4 days in the kit and ~1 in recharts.
`TimeSeriesChart`'s props are therefore deliberately library-agnostic — swapping
its internals later is contained and reversible.

```
app/components/charts/
  ChartFrame.tsx     title · legend · export menu · empty · skeleton ·
                     sr-only <table> · aria wiring   ← every chart wraps in this
  Cursor.tsx         crosshair · tooltip · aria-live readout · pointer + keyboard
  TimeSeriesChart.tsx  line | area | stacked-area, multi-series, compare overlay,
                       forecast band, annotations, brush
  Heatmap.tsx        a real <table>
  ComparisonBars.tsx StackedBarChart.tsx Sparkline.tsx DonutChart.tsx
  FunnelChart.tsx    impressions → reach → engaged → follows
  Gauge.tsx          health score
  export.ts          toPng · toCsv · toClipboard
  format.ts  useChartScale.ts  DeltaChip.tsx  index.ts
```

`StatTile` is **deleted** from the chart kit, resolving the collision with
`app/components/ui/StatTile.tsx` (M5).

**Interaction contract**, uniform across every chart via `ChartFrame` + `Cursor`:

- **Mouse** — crosshair and tooltip on move (current behaviour, kept).
- **Touch** — `pointerdown`/`pointermove` with `touch-action: pan-y` so the page
  still scrolls vertically; tooltip pins on tap, dismisses on outside tap. Fixes
  H4.
- **Keyboard** — SVG is `tabIndex={0}`, `role="application"`,
  `aria-roledescription="interactive chart"`, with an `aria-describedby`
  instruction node. `←/→` move, `Home`/`End` jump, `Esc` clears, `Enter` selects.
  The focused value is announced through a visually-hidden `aria-live="polite"`
  region.
- **Zoom / range** — a brush under the trend chart writes `from`/`to` to the URL,
  so zoom is shareable state.
- **Export** — `Dropdown` (existing primitive) with PNG / CSV / Copy. PNG via
  `XMLSerializer` → `Blob` → `Image` → `<canvas>` → `toBlob`, no new dependency.
  Note that CSS custom properties do not survive serialization, so `export.ts`
  flattens computed fill and stroke colours first.
- **Motion** — one `useChartMotion()` hook; animations skipped entirely under
  reduced motion. `.chart-animate` and `.kpi-count` join the existing
  `prefers-reduced-motion` block in `app/globals.css`.

Charts to build: follower growth, engagement trend, reach, impressions, views,
watch time, audience growth, posting frequency, viral-content timeline, platform
comparison, best-time heatmap, activity timeline, audience donuts, engagement
funnel, health gauge — plus sparklines inside every KPI card.

## Design-token migration

Mechanical, applied across the whole feature. This closes H5 and H6.

| Current | Replace with |
|---|---|
| `bg-gray-50` (page) | `bg-surface` — also removes the two-greys seam against `DashboardShell`'s `<main>` |
| `bg-blue-600` / `text-blue-600` | `bg-brand` / `text-brand`, hover `brand-dark` |
| `rounded-2xl` (16px) | `rounded-[var(--radius-card)]` (24px) |
| `shadow-sm` / `shadow-lg` | `shadow-card` / `shadow-card-hover` |
| `border-gray-100` / `-200` | `border-card-border` |
| `text-gray-900` / `text-gray-500` | `text-ink` / `text-ink-soft` |
| `text-gray-400` on white (2.85:1, **WCAG fail**) | `text-ink-soft` (#475569, ≈7.5:1) |
| `text-[10px]` / `text-[11px]` | `text-xs` + `tracking-wide` |
| hand-rolled toast | `ToastProvider` / `useToast` |
| hand-rolled buttons | `Button` |
| hand-rolled cards | `Card` with `tint` |
| bare disconnect | `ConfirmDialog` |
| section titles | `SectionHeader` |
| hand-rolled skeleton | `Skeleton` / `SkeletonCard` |

Platform brand hexes (`#ff0000`, `#e1306c`, `#1877f2`) **stay** — they identify
the platform and should not be brand-tinted. They move out of the inline
`PLATFORMS` map into a shared `lib/social/platform-meta.ts` so the public report
page and the PDF builder use the same values.

Primitive adoption goes from 2/21 to ~13/21: Button, Card, Dropdown, Modal,
ConfirmDialog, Toast, Skeleton, EmptyState, Tooltip, SectionHeader, StatTile,
Switch, Field — plus the new `Tabs`.

## Responsive

| Width | Layout |
|---|---|
| `< 640` | KPI 2-col · filter bar collapses to a "Filters" Modal + range chips · charts full-width 180px · posts table becomes a card list · quick actions become a bottom bar |
| `640–1024` | KPI 3-col · charts single column 220px |
| `1024–1536` | KPI 4-col · charts 2-up |
| `≥ 1536` | KPI 6-col · charts 2-up wider · AI panel becomes a right rail |

Verified in the existing Playwright Mobile Safari project.

## Loading, empty, error

- **Skeletons** are shape-matched per surface — the current `loading.tsx` uses
  `p-6`/4-col against a `p-8`/3-col page and would cause a jump (M1). Each is
  wrapped in `role="status" aria-live="polite" aria-busy="true"` with an `sr-only`
  label.
- **Streaming** — `<Suspense>` around `TrendSection`, `AiInsightsPanel` and
  `TopContentPreview` so the KPI grid paints first.
- **Empty states** name a next action, not just the absence.
- **Errors** — `error.tsx` per sub-route with a reset button; inline per-section
  retry via react-query `refetch`; transient failures through `useToast`. The
  OAuth error map moves from a hardcoded `ERRORS` record into i18n.

## i18n

Every user-facing string routes through `next-intl` across all 13 locales:
tab labels, KPI labels, capability tooltips, alert messages (now rendered from
`{code, params}` rather than baked English — M7), empty states, and OAuth errors.
