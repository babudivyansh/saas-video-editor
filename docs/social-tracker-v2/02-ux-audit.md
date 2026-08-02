# 02 — UX audit

Covers interaction design, information architecture, states, responsive behaviour
and accessibility. Findings that overlap [01](01-feature-audit.md) are
cross-referenced rather than repeated.

## The core UX problem

The Social Tracker presents **data**, not **answers**. Every number on screen is a
raw measurement: followers, engagement rate, views gained, post count. Nothing
tells the user what to do differently on Monday.

Compare the first screen of the current feature against what a creator actually
needs to know:

| The dashboard says | The user is asking |
|---|---|
| Followers 12,481 (+2.3%) | Is that good? Better or worse than my normal? |
| Engagement rate 3.1% | Am I above or below where I should be? |
| Views gained (30d) 84,200 | Which posts drove that, and can I do it again? |
| Posts 12 · 1.4/week | Should I post more? When? |

The redesign's organising principle: **every tile, chart and panel must answer a
question, not report a measurement.** That means benchmarks next to rates, deltas
against the user's own baseline rather than only the previous period, an explicit
health score with visible components, and an AI layer whose job is explanation
rather than decoration.

## Information architecture

**Current.** Everything lives on one route. Connect cards, connected accounts, and
a four-tab analytics panel *per account* stacked vertically, plus a competitors
section at the bottom. With three accounts connected, the page is roughly 4,000px
of scroll and the user must expand each account separately to compare them.

**Problems.**

1. **No cross-account view exists.** The single most common question — "how am I
   doing overall?" — cannot be answered. Comparison means scrolling and
   remembering numbers.
2. **Analytics are nested inside account cards**, so depth of content is coupled
   to a list widget.
3. **Tabs are used for navigation**, which breaks deep linking, the back button,
   and per-view loading states.
4. **The range switcher is global but the tabs are per-account**, so the mental
   model of what a control affects is inconsistent.

**Redesign.** Six sibling routes — Overview, Content, Audience, Competitors,
Reports, Settings — under a shared shell holding the account switcher and filter
bar. Filters are global and live in the URL. Each route is independently
addressable, streamable, and gets its own loading and error boundary. Detail in
[06](06-dashboard-redesign.md).

## States

| State | Today | Should be |
|---|---|---|
| Initial load | Plain text `Loading…`; the `loading.tsx` skeleton never renders and doesn't match the page anyway (M1) | Shape-matched skeleton per surface, `role="status"`, no layout shift |
| Empty (no accounts) | `EmptyState` primitive — correct | Keep, with clearer platform-specific setup guidance |
| Empty (no posts in range) | Plain sentence | Sentence plus an actionable suggestion (widen range / posting cadence) |
| Load failure | Silently renders the empty state (M2) | Explicit error with a retry that doesn't reload the page |
| Partial sync | `lastSyncStatus: "partial"` is stored but never surfaced | Per-account badge explaining which metrics are missing and why |
| Metric unsupported by provider | Not represented at all | Greyed tile with a tooltip naming the platform limitation |
| Metric supported, no data yet | Renders as `0`, indistinguishable from a real zero | `—` plus "Collecting — check back after a few syncs" |
| Insufficient history for a chart | "Not enough history yet" — good | Keep; extend to forecasts ("need 14 days") |
| Action in flight | Button label changes to "Connecting…" | Keep, plus a spinner and `aria-busy` |
| Action succeeded | Unannounced toast (M3) | `useToast` with a live region |
| Action failed | Toast, or nothing at all for export (M4) | Always a toast with a retry affordance |

The distinction between the last four rows is the one that matters most. Today a
metric that the provider cannot supply, a metric that hasn't synced yet, and a
metric that is genuinely zero all render identically. That is actively misleading.

## Accessibility

Audited against WCAG 2.1 AA.

**Failures.**

| Ref | Issue | Criterion |
|---|---|---|
| H3 | `role="tab"` with no `tabpanel`, `aria-controls`, roving tabindex or arrow keys | 4.1.2 Name, Role, Value |
| H4 | Chart tooltips are `onMouseMove`-only — no keyboard, no touch | 2.1.1 Keyboard |
| H5 | `text-gray-400` on white ≈2.85:1, carrying content | 1.4.3 Contrast |
| M3 | Toast has no `role="status"` / `aria-live` | 4.1.3 Status Messages |
| M1 | Skeletons have no `role="status"` | 4.1.3 Status Messages |
| M13 | Heatmap is a `div` grid; empty cells have no label at all | 1.3.1 Info and Relationships |
| M14 | `<a href="#">` for posts without a permalink | 2.4.4 Link Purpose |
| L2 | Competitor input has `aria-label` but no visible label | 3.3.2 Labels or Instructions |

**Also below the bar, though not a numbered criterion:** `text-[10px]` and
`text-[11px]` on sub-labels, alert chips and heatmap block labels.

**Passing, and worth protecting.** The range switcher has `role="group"`,
`aria-label` and `aria-pressed`. Charts carry `role="img"` with a descriptive
`aria-label`. `LineChart` emits an `sr-only <table>` of every data point.
`DeltaChip` pairs colour with an ↑/↓/→ glyph. `AudienceBars`/`TypeBars` rows are
`role="img"` with labels. External links carry `rel="noopener noreferrer"`.
Selects and the competitor input have `aria-label`s. Thumbnails use `alt=""`
correctly, since the adjacent caption is the accessible name.

**Redesign a11y contract.**

- Charts: `tabIndex={0}`, `role="application"`,
  `aria-roledescription="interactive chart"`, an `aria-describedby` instructions
  node, `←/→/Home/End/Esc/Enter` handling, and a visually-hidden `aria-live`
  readout of the focused point. The `sr-only` table stays.
- Heatmap becomes a real `<table>` with row and column headers.
- All motion routes through `useReducedMotion()`; animations are **skipped, not
  shortened** — including the KPI count-up, which returns its final value
  immediately. `.chart-animate` and `.kpi-count` join the existing
  `prefers-reduced-motion` block in `app/globals.css`.
- Focus is visible on every interactive element, including chart surfaces.
- Every destructive action goes through `ConfirmDialog`.

## Responsive

**Current.** Content caps at `max-w-5xl`. The connect grid is
`grid-cols-1 sm:grid-cols-3`. KPI tiles are `grid-cols-2 sm:grid-cols-4`. Charts
pair at `lg:grid-cols-2`. The posts table sits in `overflow-x-auto`.

**Problems.** The sticky header is `px-8 py-5` with no smaller-screen step. The
three account-card action buttons are `flex-shrink-0` and overflow on narrow
viewports. The tab strip neither wraps nor scrolls (L5). And, decisively, **charts
are unreadable on touch** (H4) — the primary content of the page has no mobile
interaction at all.

**Redesign breakpoints.**

| Width | Layout |
|---|---|
| `< 640` | KPI grid 2-col; filter bar collapses to a "Filters" modal trigger plus range chips; charts full-width at 180px; posts table becomes a card list; quick actions become a bottom bar |
| `640–1024` | KPI 3-col; charts single column at 220px |
| `1024–1536` | KPI 4-col; charts 2-up |
| `≥ 1536` | KPI 6-col; charts 2-up wider; the AI panel becomes a right rail |

Verified in the Playwright Mobile Safari project, which already exists in
`playwright.config.ts`.

## Micro-interactions and motion

Currently there are none — no transitions, no hover states beyond the browser
default, no success feedback beyond a toast.

The redesign adds, all gated on `useReducedMotion()`: KPI count-up on first paint
(700ms), chart path draw-in on data change, card hover lift via
`--shadow-card-hover`, a filter-bar shadow that appears on scroll, an optimistic
row-removal animation on disconnect, and a brief success pulse on the sync button.
`framer-motion` is already a dependency; usage stays limited to `layout`, opacity
and transform so nothing triggers layout thrash.

## Copy

Two recurring problems. First, error strings are mapped through an `ERRORS` record
in `page.tsx` rather than i18n, so they are English-only in a 13-locale product —
as are the alert messages built inside `computeAlerts` (M7). Second, empty states
describe the absence rather than the next action ("No posts published in this
range." tells the user nothing they didn't know).

Every user-facing string in the redesign goes through `next-intl`, and empty
states name a next step.
