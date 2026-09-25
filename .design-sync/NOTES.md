# Design sync — maintainer notes

Syncs `app/components/ui/` (22 files → 28 exported components) to the
claude.ai/design project **Clipiro Design System**
(`fa669734-decd-4017-9a4b-8a063f688203`). Run `/design-sync` to re-sync.

## How the package is built

The app isn't a publishable package, so `build-pkg.mjs` (the config's
`buildCmd`) assembles a sync-only one in `.ds-pkg/` (gitignored):

1. **Barrel** — `index.ts` re-exports every ui file. `export *` drops default
   exports, so `Breadcrumbs` and `FaqAccordion` get explicit
   `export { default as X }` lines. A new default-exported component needs the
   same.
2. **Types** — tsc with `tsconfig.dts.json` (emitDeclarationOnly).
3. **CSS** — Tailwind v4 compiled over `app/globals.css` with the repo as
   `base`, so it contains **only classes the app uses somewhere**. Then:
   - `.theme-emerald` is rewritten to `:is(:root, .theme-emerald)` so the dark
     theme applies with no wrapper. The script asserts that the light `:root`
     block comes first, otherwise the light tokens would win.
   - Editor `@font-face` rules pointing at `/fonts/…` are stripped (no server).
   - `--font-geist-*` vars are defined (next/font normally injects them).
   - `html body { background: var(--canvas) }` beats the preview harness's own
     `body { background: #fff }`. Without it, components sit on a white panel.

## Shims (`shims/`, wired via `tsconfig.sync.json` paths)

| Import | Shim | Why |
|---|---|---|
| `next/link` | plain `<a>` via forwardRef | no Next router |
| `next-intl` | `useTranslations` reading `messages/en.json` | no intl provider |
| `@/app/components/billing/BillingOverlayContext` | no-op hook | CreditsPill imports it |

Exact keys must stay above `@/*` in `paths`.

## Fonts

`fonts/` vendors Geist + Geist Mono (geist@1.7.2, OFL), loaded via
`extraFonts`. The app gets them from next/font/google, which doesn't exist
outside Next.

## preview-support.ts

`__dsSettleMotion()` sets `MotionGlobalConfig.skipAnimations`. Overlay
previews (Modal, ConfirmDialog, Dropdown*, ContextMenu*, Toast) call it because
the framer-motion entrance raced the screenshot, so cards were captured blank at
random. It must ship inside the bundle (via `extraEntries`), because a preview
that imports framer-motion itself gets a second copy.

## Gotchas when authoring previews

- **Only compiled classes exist.** `min-h-[272px]`, `pb-48`, `pb-20` all
  silently did nothing. Run `node .design-sync/check-preview-classes.mjs`
  after a bundle build; it flags preview classes missing from
  `ds-bundle/_ds_bundle.css`. Use inline `style` for one-offs.
- **Fixed-position overlays** (Toast) resolve against the card's transformed
  ancestor, not the viewport. Give the preview a `minHeight` so they have room.
- **Tooltip** clipped at the card edge. Its trigger is centered.
- Open-state previews: Dropdown/DropdownItem use an `OpenOnMount` helper,
  FaqAccordion clicks its first row, and Tooltip focuses its trigger.
- `cardMode` / viewport overrides for the overlays live in `config.json`.

## Known render warns (accepted)

- Text on floor cards can read dark-on-dark in the grader's contact sheet; the
  real render is fine.

## App-level findings surfaced by the sync (not fixed here)

- `Tabs`, `SectionHeader` and `Breadcrumbs` use `text-brand`, which is lime in
  the emerald theme. This is the same misuse fixed in the admin nav in #218.
- `CreditRing` hardcodes the SVG gradient id `ring-grad`, so two rings on a page
  get duplicate DOM ids.
- `UsageBarChart` / `CreditsPill` use legacy `--brand` / `--accent-violet` /
  `tint-violet` aliases (they resolve to emerald/lime today). `StatTile.accent`
  still exposes `blue`/`violet`/`fuchsia`.

## Re-sync risks

- A new ui file isn't picked up until it's added to the barrel in
  `build-pkg.mjs`, and to `componentSrcMap` if it exports several components.
- A new Next-only import in a ui file breaks the tsc/esbuild step until it has a
  shim.
- Restructuring `globals.css` (for example moving the emerald block, or
  renaming `.theme-emerald`) trips the `build-pkg.mjs` assertion by design.
- The conventions header (`conventions.md`) lists class names verified against
  the compiled CSS. If the app stops using one, it disappears from the bundle.
  Re-check with `.cache/vocab-check.mjs`.
