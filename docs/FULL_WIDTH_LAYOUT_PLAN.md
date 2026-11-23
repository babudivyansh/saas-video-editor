# Full-width layout audit + implementation plan

Date: 2026-11-23. Status: **approved 2026-11-23 and implemented on branch fix/full-width-layout.**

## 1. The complaint

On a 17" display (and anything bigger — 24", 27", 35" ultrawide) the site looks
"centered / cropped": empty dark bands on both sides, and the logo sits far in
from the left edge instead of near it.

## 2. Root causes (from the code)

### A. Every marketing section is capped at a fixed max width, then centered

| Cap | Pixel limit | Where |
|---|---|---|
| `max-w-screen-2xl mx-auto` | 1536px | `SiteNavbar.tsx:200`, `SiteFooter.tsx:106`, `landing/Hero.tsx:44`, `Features.tsx:127`, `HowItWorks.tsx:17`, `SocialProof.tsx:23`, `FounderSection.tsx:9`, `TestimonialWall.tsx:216`, `CTABanner.tsx:15`, `blog/page.tsx:43,57` … (14 files) |
| `CONTAINER` = `max-w-screen-xl mx-auto` | 1280px | `marketing/styles.ts:13` → every page built on `Section`/`PageHero` (about, contact, legal, tools, compare, help … 7 files) + `affiliate-program/page.tsx` |
| `max-w-6xl` / `max-w-3xl` | 1152 / 768px | `pricing/PricingClient.tsx:246,259,372,387`, `landing/FAQ.tsx:33` |
| `max-w-[1100px]` | 1100px | `tools/[slug]/page.tsx:133,138` |

Three different page widths (1536 / 1280 / 1152) also mean the edges jump as
you move between pages.

### B. A hard-coded left margin on the logo — the "margin on the left"

`SiteNavbar.tsx:204`: `ml-15 md:ml-25` → **60px on phones, 100px from tablet up**,
added *on top of* the container padding. `SiteFooter.tsx:111` and
`CTABanner.tsx:17` copy the same `md:ml-25` so their cards line up under the
logo — so the whole footer and CTA are pushed right too and look off-center.

### C. Huge side padding on landing sections

Landing sections use `lg:px-[120px]` (10 files) while the navbar uses
`lg:px-8` (32px). So the logo, the section text and the footer all start at
different x-positions.

### What that adds up to (CSS pixels, left edge → first content)

| Screen | Typical CSS width | Empty band each side | Logo starts at | Landing text starts at |
|---|---|---|---|---|
| 15.6" laptop, 125% scaling | 1536 | 0 | 132px | 120px |
| **17" laptop, 1920×1080 @100%** | 1920 | 192px | **324px** | 312px |
| 24" / 27" 1440p | 2560 | 512px | 644px | 632px |
| 34–35" ultrawide 3440×1440 | 3440 | 952px | 1084px | 1072px |

On your 17" screen, ~1/3 of the width is unused and the logo is a third of an
inch-plus away from where it should be. On an ultrawide the site is a narrow
strip in the middle.

### D. Dashboard / app (logged-in) — mostly fine, a few caps

The shell (`DashboardShell.tsx`) is already full-width (sidebar + `flex-1`).
Home (`dashboard/page.tsx:324`) is full-width by design. Individual pages cap
themselves:

| Page | Cap |
|---|---|
| Projects `projects/page.tsx:191`, Assets `assets/page.tsx:320` | 1600px |
| Social Tracker `social-tracker/layout.tsx:51` | 1400px |
| Tools hub `tools/page.tsx:230` | 1280px (`max-w-7xl`) |
| Admin (non-wide pages) `AdminLayoutClient.tsx:357` | 1152px (`max-w-6xl`) |

### E. Deliberately narrow — **will NOT change** (readability)

Text measure and focused flows stay capped, because 3000px-wide lines of text
or a 3000px upload box are worse, not better:
- Headlines / paragraphs: `max-w-2xl`, `max-w-[640px]`, `max-w-[720px]`, `max-w-[820px]` (PageHero, Section header, Hero lede).
- Legal/blog body copy `max-w-[760px]`.
- Home launch box (`AutoClipLaunchBox` 800px), auto-clip wizard steps (760px), referral hero.
- All modals, dropdowns, tooltips, settings overlay (Modal `maxWidth`), editor.
- OG images / emails (render outside the app).

The *page frame* goes full width; *reading columns and cards* keep sane widths
and grids gain more columns instead.

## 3. Target design

**Full screen on every device — small phone (320px) to big TV (4K/8K) — no
maximum width anywhere on the page frame.**

One fluid frame used everywhere:

```
width: 100%   (no max-width, no centered column, ever)
side padding: fluid, clamp(16px, 3.5vw, 160px)
  → 16px on a 320–460px phone, ~27px on a tablet, ~67px at 1920, ~90px at 2560,
    ~134px on a 4K TV, capped at 160px on 8K
```

Because padding is a % of the screen, there are no breakpoint "jumps" — every
width in between (foldables, odd laptop scalings, TVs) gets a proportional frame.

**Big screens / TVs (≥2560px CSS width):** filling the width alone isn't
enough — at 3840px, 16px text and 300px cards look tiny from a sofa. So the base
scale grows too:
- Root font size steps up: 100% → 112.5% at ≥2560 → 125% at ≥3200 → 150% at ≥3840.
  Everything sized in `rem` (text, spacing, buttons, cards) scales with it, so
  the layout keeps the same proportions as on a 1920 screen.
- Card grids add columns as width grows (e.g. tool cards 1 → 2 → 3 → 4 → 5 → 6).
- Hero media is sized in % / `vw`, not fixed px, so it fills the screen.
- Reading columns (paragraphs, legal/blog body) keep a readable line length in
  `ch`/`rem`, so they also scale with the root font on TVs instead of becoming a
  thin strip.

TV specifics: check 10-foot readability, focus rings visible for TV remotes /
keyboard nav, and `100dvh` sections behave on TV browsers.

- Logo sits exactly at the frame's left padding (no extra `ml-*`). Nav links /
  buttons at the right padding. Footer card, CTA card, every section start on
  the same line as the logo.
- Grids scale up: e.g. features 3 → 4 cols ≥1920, testimonials/blog/tool cards
  add a column at ≥1920 and ≥2560, so wide screens fill with content, not gaps.
- No safety cap — decided 2026-11-23: full screen on everything, TVs included.

## 4. Implementation plan

Branch `fix/full-width-layout` off `main` (current branch `feat/sample-projects`
has uncommitted work — I'll use a separate worktree so it is not touched).

**Stage 1 — one source of truth for the frame**
- `app/globals.css`: add `--page-gutter: clamp(1rem, 3.5vw, 10rem)` and the big-screen root font steps (`html { font-size }` at 2560 / 3200 / 3840).
- `app/components/marketing/styles.ts`: `CONTAINER` → `w-full px-[var(--page-gutter)]` (no max-width, no `mx-auto`). Add a `FRAME` alias.
- Audit fixed-`px` sizes that should scale on TVs (hero media, card min-widths, nav heights) → `rem`/`%`.

**Stage 2 — navbar + logo margin**
- `SiteNavbar.tsx`: replace `max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8` with `CONTAINER`; delete `ml-15 md:ml-25` on the logo. Check mobile menu + mega-menu (`NavDropdown align="screen"`) still position correctly.
- `SiteLaunchTicker` aligned to the same frame.

**Stage 3 — footer + CTA**
- `SiteFooter.tsx`: `CONTAINER`, drop `md:ml-25`; widen inner column grid at ≥1920.
- `CTABanner.tsx`: same; drop `md:ml-25`.

**Stage 4 — landing page sections**
- `Hero.tsx`, `Features.tsx`, `HowItWorks.tsx`, `SocialProof.tsx`, `FounderSection.tsx`, `TestimonialWall.tsx`, `FAQ.tsx`: swap `max-w-screen-2xl … lg:px-[120px]` / `max-w-6xl` for `CONTAINER`. Hero showcase keeps its `md:w-[68%]` proportional sizing (scales naturally); raise its `max-w-[1000px]` cap to scale on big screens. Add grid columns at `min-[1920px]` where cards would otherwise get huge.

**Stage 5 — other public pages**
- Pricing (`PricingClient.tsx` + `_components`): plan cards row full frame (3→ wider cards / gaps), explainer text stays narrow.
- Tools `tools/[slug]`, blog list/category/author, compare, about, affiliate-program, gta-6-clip-maker, help, reviews, legal pages: frame via `CONTAINER`; body copy keeps its reading width.

**Stage 6 — dashboard pages**
- Projects, Assets: remove `max-w-[1600px]`; grids gain columns (`min-[1920px]`/`min-[2560px]`).
- Social Tracker 1400px, Tools hub `max-w-7xl`: remove cap, adjust grid columns.
- Admin: make non-`wide` pages full width too (or default `wide` on) — tables benefit most.

**Stage 7 — guardrail**
- Lint/test ratchet (like the theme codemod ratchet): fail CI if a page wrapper reintroduces `max-w-screen-*` or `lg:px-[120px]`, or an `ml-*` on the logo.
- Update `docs/DESIGN_SYSTEM.md` layout section.

**Stage 8 — verification (real browser, per your rule)**
Load every page above in Chrome at **320, 375, 414, 768, 1024, 1280, 1366, 1440, 1536, 1920, 2560, 3440, 3840 (4K TV), 5120** wide, plus phone/tablet landscape:
logo flush with the left gutter, no horizontal scroll, no empty side bands,
text columns still readable, mega-menu/mobile menu correct. Screenshots of
home / pricing / a tool page / dashboard Projects at 1920 + 3440 attached to the PR.
Full CI locally (lint, types, unit, e2e) before opening the PR.

## 5. Open choices for you

1. ~~Safety cap~~ — **decided: none.** Full screen on all devices, mobile to TV.
2. **Gutter**: fluid 3.5% of screen width (16px min) — proposed.
3. **Admin**: full width everywhere — proposed.

Estimated size: ~35 files, mostly class-string swaps; one PR (or two: public site, then dashboard).
