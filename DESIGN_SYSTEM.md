# Design system ownership

**The full reference is [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).** This
file only says which system a given surface belongs to, so a new one doesn't
start by accident.

The four parallel systems this file used to describe are now two and a half. The
2026-09 emerald migration unified the marketing site, the dashboard, the tool
pages, auth, billing, settings and the error pages onto one dark token set, and
re-accented the editor to match.

## Default for new work: the emerald tokens

- Tokens: `app/globals.css` — `--bg`, `--surface-1/2/3`, `--panel`, `--fg`,
  `--fg-muted`, `--fg-subtle`, `--line`, `--primary`, `--on-primary`,
  `--emerald-brand`, `--emerald-bright`, `--success/warning/error/info`,
  `--tint-*` and their `--tint-*-border` pairs, `--elev-*`, the radius scale.
- Components: `app/components/ui/*` — 24 primitives. **If a component you need
  doesn't exist there yet, add it there** rather than one-off styling a page.
- A surface opts into the dark theme with `theme-emerald` on its shell root.
  See `docs/DESIGN_SYSTEM.md` §1 for why that is per-subtree rather than at
  `:root`, and what has to be true before the class can go away.
- **Dark-first. There is no light mode**, and the light values still in `:root`
  are scaffolding for the un-migrated admin panel, not a supported theme.

## Deliberate, scoped exceptions

**Editor** (`app/dashboard/editor/**`) — its own `--editor-*` tokens and its own
component library at `app/dashboard/editor/components/ui/*`. Now emerald-accented
and on the same surface ramp as the rest of the app, but still a separate token
namespace. **Stay inside that set for anything rendered in the editor shell, and
don't extend it outward.** Its timeline video track is lime rather than emerald
on purpose — the accent is emerald and the audio track is already mint.

**Admin** (`app/admin/**`) — **not migrated.** Still the light system plus its
own chart set in `app/admin/dashboard/charts.tsx`. Internal-only, desktop-first.
Stay inside that set for new admin surfaces. Two things to know before migrating
it: the chart palette in `app/admin/dashboard/ui.tsx` is documented as validated
against a *light* background, so it has to be re-validated rather than remapped;
and its Recharts `<Tooltip contentStyle>` defaults to a white inline background
in eight places.

**Email, PDF reports, OG images** (`lib/email/**`, `lib/social/reports/**`,
`app/**/opengraph-image.tsx`) — **permanently light.** These render into email
clients, onto paper, and into third-party feeds. They carry their own brand
colour deliberately and are denylisted in the codemod.

**Product output** (`app/dashboard/create/text-video`, `create/reddit-video`) —
these render WhatsApp/Telegram/iMessage and Reddit themes, and caption presets,
whose colours ffmpeg burns into the exported video. Their *chrome* is migrated;
their mockup regions must not be. They are on the codemod's `CONTENT_DENY` and
need `--allow-content` with explicit `--protect` ranges.

## Guardrails

`npm run lint` runs `scripts/check-theme-debt.mjs`, an exact-count ratchet over
the remaining light-theme styling. It fails if the counts grow **and** if they
shrink without the budget being updated, so wins get locked in. `legacy-light`
is budgeted at 0 and gates removing the migration scaffolding.

## When you're not sure

Editor shell → editor tokens. `app/admin/**` → admin set. Everything else →
emerald. A genuinely new visual context is worth a conversation, not a fifth set.
