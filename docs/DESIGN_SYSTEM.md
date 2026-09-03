# Clipiro design system — emerald

The single reference for Clipiro's UI. Tokens live in `app/globals.css`;
primitives live in `app/components/ui/`.

If you are adding a page or component, you should not need to write a colour.

---

## 1. How theming works

Tailwind v4, CSS-first — **there is no `tailwind.config` file.** Everything is
`@theme inline` in `app/globals.css`.

Two themes coexist:

| | |
|---|---|
| `:root` | the original light system |
| `.theme-emerald` | the dark emerald system |

The class lives on `<body>` (`app/layout.tsx`) — **one place, not per-shell**.
That matters: `Modal`, `ContextMenu` and the language dropdown all
`createPortal` into `document.body`, so anything scoped to a shell root leaves
every modal and popover in the app rendering the light theme. Put it on body,
and portals are inside it.

**Why per-subtree theming works at all:** `@theme inline` resolves its `var()`
at the element's position in the cascade, not at `:root`. So
`--color-ink: var(--ink)` compiles to `.text-ink { color: var(--ink) }`, and any
scope that redefines `--ink` changes every `text-ink` inside it.

> **The one exception:** a *literal* inside `@theme inline` bakes into the
> utility and cannot be re-scoped. That is why elevation goes through
> `--elev-*` indirection rather than being declared as a literal `--shadow-card`.

### Retiring the light theme

When `npm run check:theme` reaches zero, the `.theme-emerald` values move up
into `:root` and the class disappears, along with the inverted `--color-gray-*`
ramp (see §9) that is bridging the remaining stock-gray usages.

---

## 2. Colour

### Surfaces — 80% of the screen

| Token | Utility | Emerald | Role |
|---|---|---|---|
| `--bg` | `bg-bg` | `#050908` | the page |
| `--bg-deep` | — | `#020504` | letterbox, deepest well |
| `--surface-1` | `bg-surface-1` | `#080d0b` | rail, sidebar |
| `--surface-2` | `bg-surface-2` | `#0b1210` | card / panel |
| `--surface-3` | `bg-surface-3` | `#101815` | raised chip, inset control |
| `--panel` | `bg-panel` | `#0b1210` | **"the surface a card paints itself with"** |
| `--canvas` | `bg-canvas` | `#050908` | behind `<body>`; dark in *both* themes |

`bg-panel` is the default for anything card-shaped. It is the migration target
for what used to be `bg-white`, and it is white on the light theme, so a
component using it is correct in either.

### Foreground

| Token | Utility | Emerald | Contrast on `--surface-2` |
|---|---|---|---|
| `--fg` | `text-fg` | `#f5f7f4` | 18.6:1 |
| `--fg-muted` | `text-fg-muted` | `#9aa49f` | 7.4:1 |
| `--fg-subtle` | `text-fg-subtle` | `#7e8a85` | 5.2:1 |

**There is no fourth step.** Anything darker than `#7e8a85` fails WCAG AA as
text on our surfaces — `#69736E` measures 3.5:1 — so it does not exist as a
token. If you want a dimmer label, use `--fg-subtle` at a smaller size, not a
darker colour.

### Lines

| Token | Utility | Emerald |
|---|---|---|
| `--line` | `border-line` | `rgba(255,255,255,.08)` |
| `--line-strong` | `border-line-strong` | `rgba(255,255,255,.14)` |

### Accent — 5% lime, 15% emerald

| Token | Utility | Emerald |
|---|---|---|
| `--primary` | `bg-primary` `text-primary` | `#c8ff55` (lime) |
| `--primary-hover` | | `#d6ff7a` |
| `--primary-press` | | `#b4ef3c` |
| `--on-primary` | `text-on-primary` | `#071006` |
| `--emerald-brand` | `bg-emerald-brand` | `#00a968` |
| `--emerald-bright` | `text-emerald-bright` | `#20d68a` |

> **Never put `text-white` on a lime fill.** White on `#c8ff55` is 1.6:1.
> `text-on-primary` is the pair — it is white on the light theme and near-black
> on lime, so it tracks the fill.

Lime is the **single primary action per screen**. It is not a status colour, not
a hover state, and not an atmosphere. The reference this system is drawn from
works because the green is surrounded by darkness.

### Status — never lime

| Token | Utility | Emerald |
|---|---|---|
| `--success` | `text-success` | `#20d68a` |
| `--warning` | `text-warning` | `#f5b544` |
| `--error` | `text-error` | `#ff6b6b` |
| `--info` | `text-info` | `#4ea8ff` |

### Tints — tinted dark surfaces

`bg-tint-{blue,violet,fuchsia,amber,emerald,rose}` with matching
`border-tint-*-border`. Built with `color-mix` so they are **opaque**: existing
opacity modifiers still composite predictably and stacked cards do not show
through each other.

`tint-blue` is deliberately **neutral** (`--surface-3`), not tinted. Its usages
are overwhelmingly "make this chip slightly different", not "signal blue", and
tinting it emerald would make it indistinguishable from `tint-emerald`.

---

## 3. Elevation

On near-black, a drop shadow does almost nothing — Tailwind's stock
`rgba(0,0,0,.05)` is mathematically invisible. Elevation is carried by a faint
**white hairline** plus depth.

| Utility | Use |
|---|---|
| `shadow-card` | resting card |
| `shadow-card-hover` | hover |
| `shadow-glow` / `shadow-glow-hover` | primary action only |
| `shadow-sm/md/lg/xl/2xl` | Tailwind's scale, re-tuned for dark |

---

## 4. Radius

| Token | Value | Use |
|---|---|---|
| `rounded-control` | 10px | small controls |
| `rounded-field` | 12px | inputs |
| `rounded-panel` | 18px | standard panel |
| `rounded-card` | 24px | card |
| `rounded-showcase` | 32px | product showcase |
| `rounded-hero` | 40px | hero panel |

Buttons are `rounded-full`. **Do not make every small element a pill** — pills
are for tags, filters, badges, segmented controls and CTAs.

---

## 5. Atmosphere

Inert outside `.theme-emerald` (the tokens they read are `none` on light).

| Utility | Use |
|---|---|
| `bg-ambient` | hero backdrop — emerald light low in the frame |
| `bg-panel-lit` | one feature panel, behind a product visual |
| `bg-grid` | very low-contrast grid behind an AI/product visual |
| `glow-primary` / `glow-emerald` | sparingly |

**Do not put a glow on every card.** Most pages should be 80–90% flat dark with
light placed deliberately.

---

## 6. Typography

**Geist** (`--font-sans`), Geist Mono for code. Loaded via `next/font/google` in
`app/layout.tsx`.

Headings are large, tightly tracked and **medium weight, not black**. Line
height 0.95–1.1 on display sizes; body stays at 1.6+.

```
hero h1     clamp(3.5rem, 6vw, 6.5rem)   tracking -0.035em   line-height 1.03
section h2  clamp(2.4rem, 4vw, 4.5rem)   tracking -0.032em
page h1     32–44px
body        15–17.5px, line-height 1.6
```

---

## 7. Motion

`--ease-emerald` = `cubic-bezier(0.22, 1, 0.36, 1)`. Buttons 150ms, cards
150–220ms, section reveals 300–500ms. Every animation must be disabled under
`prefers-reduced-motion` — the existing blocks in `globals.css` cover the shared
utilities; new keyframes need their own.

---

## 8. Components

Use `app/components/ui/`. If a primitive you need does not exist, add it there
rather than one-off styling a page.

**Button** — `primary` (lime + `text-on-primary`), `secondary` (panel +
hairline), `ghost` (translucent white, for gradient/hero surfaces **only**),
`inverse` (`bg-fg text-bg` — deliberately inverted against the page in both
themes), `danger` (outlined error), `link`. All carry a focus-visible ring.

**Card** — 7 tints, `interactive` for hover lift, `padding`, `shadow`.

Also: Field/Input/Textarea, Modal, Dropdown, ContextMenu, Tabs, Toast, Skeleton,
EmptyState, StatTile, ToolCard, CreditRing, CreditsPill, UsageBarChart,
Checkbox, Switch, Tooltip, Breadcrumbs, FaqAccordion, SectionHeader,
ConfirmDialog.

---

## 9. Do / don't

**Don't** write a hex or a stock Tailwind colour in a component. The ratchet
(`npm run check:theme`, wired into `npm run lint`) fails the build if the counts
grow.

**Don't** use `bg-gray-*` in new code. The ramp is inverted inside the theme as
a **temporary bridge**, so `text-gray-900` currently renders near-white — the
class names lie. That is why it is on a ratchet.

**Don't** map a dark-first colour with a light-first rule. `bg-gray-900` used as
a video letterbox inverts to near-white. Decide by **role**:

| Role | Target |
|---|---|
| letterbox / media scrim | `bg-black` |
| inverted chip (dark on light page) | `bg-fg text-bg` |
| muted icon | `text-fg-subtle` |
| card surface | `bg-panel` |

**Don't** rewrite `bg-white/5`–`/25`. Those are translucent overlays already
correct on dark. `bg-white/70`–`/95` are near-opaque panels and **do** need
`bg-bg/NN`.

**Don't** touch the product-output files. `create/text-video` and
`create/reddit-video` render WhatsApp/Telegram/iMessage and Reddit themes whose
colours ffmpeg burns into the exported video. They are on the codemod's
`CONTENT_DENY`; migrating their chrome needs `--allow-content` with explicit
`--protect` ranges.

**Don't** use `bg-clip-text` by hand. Use `grad-text`, which declares a solid
fallback first — without it, any context that does not paint the background
renders invisible text.

**Do** keep emails, PDF reports and OG images light. `lib/email/**`,
`lib/social/reports/**` and `app/**/opengraph-image.tsx` are permanently
denylisted. A dark-mode email is a bad email.

---

## 10. Tooling

```bash
npm run check:theme                                  # debt ratchet (in `npm run lint`)
node scripts/theme-codemod.mjs --report              # what is left, by file
node scripts/theme-codemod.mjs --files <path> --dry-run
node scripts/theme-codemod.mjs --files <path> --apply
```

The codemod walks the TypeScript AST and rewrites **only string-literal
spans**, so it cannot touch prose comments or test fixtures — both of which
contain the class names and brand hexes it looks for. It is a starting point
per file, not the finish: read the diff.

---

## 11. Scope

| Surface | State |
|---|---|
| Marketing, dashboard, tools, auth, billing, settings, error pages | migrated |
| Admin (`app/admin/**`) | migrated — see §12 for its charts |
| Editor (`app/dashboard/editor/**`) | own `--editor-*` tokens, re-accented to emerald |
| Email / PDF / OG images | **stay light**, permanently |

---

## 12. Charts

`app/admin/dashboard/ui.tsx` owns the chart parameters.

- **`PALETTE`** — the categorical hues. Re-validated against the dark chart
  surface `#0b1210` with the dataviz validator; all five checks pass unchanged,
  so the hues were kept rather than remapped. **They are deliberately not brand
  colours** — a categorical palette wants hue spread for identity, and painting
  it emerald would collapse the series into each other.
- **`BRAND`** — the single-series colour, so this one *does* follow the brand.
  `#00a968`, not the UI emerald `#20d68a`: that is L 0.774, outside the
  0.48–0.67 mark band.
- **`TOOLTIP_STYLE` / `TOOLTIP_ITEM_STYLE` / `TOOLTIP_LABEL_STYLE`** — pass all
  three to every Recharts `<Tooltip>`. Recharts writes its tooltip background as
  a **white inline style**, and a stylesheet cannot reach an inline style, so a
  tooltip without these is a white card floating on the dark dashboard.
- Grid and axis ticks read `var(--line)` and `var(--fg-subtle)`. Never a literal.

Re-run the validator before changing any of these:

```bash
node <dataviz-skill>/scripts/validate_palette.js "#hex,#hex,…" --mode dark --surface "#0b1210"
```
