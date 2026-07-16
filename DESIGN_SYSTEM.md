# Design system ownership

Four visual systems currently exist in this codebase. That's not being unified here — a visual-parity rewrite across all four is a real, multi-week undertaking with no user-facing benefit on its own. This doc exists so a fifth doesn't start by accident, and so it's clear which one new work should default to.

## Default for new consumer-facing work: main dashboard tokens

- Color/type/shadow/radius tokens: `app/globals.css` (`--brand`, `--ink`, `--ink-soft`, `--card-border`, `--surface`, `--tint-*`, `--shadow-card`, `--radius-card`, `grad-brand` utility).
- Components: `app/components/ui/*` — `Button`, `Card`, `Field` (`FieldLabel`/`Input`), `Switch`, `Tooltip`, `SectionHeader`, `StatTile`, `ToolCard`, `CreditsPill`, `CreditRing`, `UsageBarChart`, `EmptyState`.
- No dark mode support today — light-only by design, not an oversight.
- **Any new dashboard page, tool page, or marketing-adjacent authenticated page should use these tokens/components.** If a component you need doesn't exist here yet, add it here rather than one-off styling a new page — that's how this set became the most complete of the four.

## Deliberate, scoped exceptions

**Editor** (`app/dashboard/editor/**`) — its own dark chrome, `editor-*` tokens (`editor-bg`, `editor-border`, `editor-glass`, `editor-panel`, `rounded-editor-sm/md/full`, etc.) and its own component library at `app/dashboard/editor/components/ui/*` (Button, ColorField, EmptyState, Switch, Tooltip, Tabs, Slider, IconButton, NumberField, PillGroup, SelectField, TextField, PropertyCard). `app/globals.css` scopes custom scrollbar styling to `.clipiro-editor` specifically so the rest of the app keeps normal scrollbars — this exception is intentional and documented in that file. **Stay inside this token set for anything rendered within the editor shell; don't reach for the main dashboard's tokens there, and don't extend the editor's tokens to pages outside it.**

**Admin** (`app/admin/**`) — its own chart/animation set (`Donut`, `Gauge`, `GrowthLineChart`, `HBars`, `RevenueAreaChart`, `SparkArea`, `CountUp`, `Skeleton`, `HealthDot` in `app/admin/dashboard/charts.tsx`), built with Framer Motion + `lucide-react` icons, used nowhere else in the app. Internal-only, desktop-first by convention. **Stay inside this set for new admin surfaces.**

**Global error/404 pages** (`app/not-found.tsx`, `app/error.tsx`) — a fourth, minimal palette (`zinc-950`/`blue-600`) matching neither of the above. These are simple enough that unifying them onto the main dashboard tokens is low-risk whenever someone's next already touching one of these two files — not urgent enough to schedule on its own.

## When you're not sure which set applies

If the page/component renders inside `app/dashboard/editor/**`, use the editor set. If it renders inside `app/admin/**`, use the admin set. Everything else defaults to the main dashboard set. If you're adding a genuinely new visual context (not a page within an existing one), that's worth a conversation before writing code, not a fifth ad hoc token set.
