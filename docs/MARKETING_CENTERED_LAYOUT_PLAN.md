# Marketing pages: full-width header, centered content (OpusClip-style)

Date: 2026-11-23. Status: **proposal — awaiting go-ahead.** Builds on
`fix/full-width-layout` (docs/FULL_WIDTH_LAYOUT_PLAN.md). Dashboard/app pages
are NOT affected — they stay full width.

## 1. What OpusClip does (measured live on opus.pro, 1920px window)

| Part | OpusClip | Where it sits at 1920px |
|---|---|---|
| Announcement bar | full width | 0 → 1905 |
| Header | **full width**, 24px side padding; logo hard-left, nav links centred, Sign in / Sign up hard-right | logo 24px from left; CTA ends 32px from right |
| Page side padding | `2.5rem` (40px) desktop, `1rem` (16px) under 768px (`.a_padding-global`) | — |
| Main content column | **`max-width: 75rem` (1200px), centred** (`.a_container-1200`, used 10×) | 353 → 1553 |
| Wide hero / carousel | `max-width: 87rem` (1392px), centred | 257 → 1649 |
| Headline + intro text | `max-width: 50rem` (800px), centred | 553 → 1353 |
| Footer | rounded card inside the 1200px column, link grid ~1040px | ≈ 350 → 1550 |
| H1 | 60px, Geist | — |

So: the **header (and announcement bar) spans the whole screen**; **everything
below it sits in a centred column with margin left and right**.

## 2. What changes on Clipiro

Scope: every public marketing page + the landing page — `/`, pricing, tools
(hub + every `/tools/[slug]`), blog (list, category, author, post), about,
contact, legal pages, help, compare, affiliate-program, reviews,
gta-6-clip-maker, docs/api. Not `/dashboard/**`, not `/admin/**`.

1. **Header stays full width** (`SiteNavbar` + launch ticker): logo hard-left,
   CTAs hard-right, like now — but side padding changes from the fluid gutter
   (67px at 1920) to OpusClip's **24px (16px on phones)**. No logo margin.
2. **New marketing content frame** in `app/components/marketing/styles.ts`:
   - `CONTENT` = `mx-auto w-full max-w-[75rem] px-4 md:px-10` → 1200px centred column, 40px side padding (16px on phones).
   - `CONTENT_WIDE` = `mx-auto w-full max-w-[87rem] px-4 md:px-10` → 1392px, for the hero showcase / carousel only.
   - `TEXT` = `mx-auto max-w-[50rem]` → 800px for headlines + intro copy.
3. Every landing section (Hero, SocialProof, Features, HowItWorks,
   TestimonialWall, Founder, FAQ, CTA banner) and every marketing page wrapper
   switches from the full-width frame to `CONTENT` (hero media to
   `CONTENT_WIDE`).
4. **Footer**: card moves inside the 1200px centred column (like OpusClip),
   background wordmark stays full width.
5. **Grids**: the extra 4th/5th columns I added at 1920/2560 on blog + help/
   legal/compare card grids come back out — inside 1200px, 3 columns is right.
6. **Big screens / TVs**: the column is in `rem`, and the root font already
   steps up on big screens, so the column grows with it:
   1200px at 1920 → 1350px at 2560 → 1800px on a 4K TV. (OpusClip stays a fixed
   1200px, which looks small on a TV.) Phones/tablets: full width with 16px /
   40px padding — no change in feel.
7. **Guardrail**: `check:full-width` is updated — marketing pages must use
   `CONTENT`/`CONTENT_WIDE`/`TEXT` (no ad-hoc `max-w-screen-*`); dashboard still
   banned from page-level caps.

## 3. Result at common sizes

| Screen (CSS px) | Header | Content column |
|---|---|---|
| 375 phone | 16px padding | full width, 16px padding |
| 768 tablet | 24px padding | full width, 40px padding |
| 1366 laptop | 24px padding | 1200px centred (83px margins) |
| **1920 (your 17")** | 24px padding | **1200px centred, 360px margins** |
| 2560 | 24px padding | 1350px centred |
| 3840 4K TV | 24px padding | 1800px centred |

## 4. Open choices

1. Column width: **1200px like OpusClip** (proposed) or a bit wider, e.g. 1280px.
2. Keep the TV scale-up (column grows on 2560+/4K) — proposed yes.
