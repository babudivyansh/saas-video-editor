## Font sourcing

`src/styles.css` sets `--font-sans: "Geist Sans", ...` as a literal family name, but the DS package itself never shipped a `@font-face` for it — the family is only ever provided by the host Next.js app via `next/font/google`'s `Geist()` loader (self-hosted webfont, build-time, not a runtime font service). The converter correctly flagged `[FONT_MISSING]`.

Resolved by installing the public `geist` npm package (Vercel, SIL OFL 1.1 licensed — same font family), copying `Geist-Variable.woff2` into `design-system/src/fonts/geist-sans/`, and adding `design-system/src/fonts/geist-sans.css` with a variable-weight `@font-face` rule (`100 900`). Wired via `cfg.extraFonts`. This is a real, licensed asset addition to the design-system package, not a substitute — recorded here per the FONT_MISSING resolution flow.

## Grouping

No `docsDir`/per-component docs exist in this repo (only a single top-level README.md), so all 31 exports landed in one `general` group. Consider authoring per-component `.md` stubs with `category:` frontmatter (via `cfg.docsMap`) on a future sync to split into Foundation / Composites / Page shells / Icons groups matching the README's own headings, if finer-grained grouping in the DS pane becomes valuable.

## Preview scope (this sync)

User chose to author previews for all 21 real components AND all 10 icons (full authoring, no components deferred to floor cards).

## Known render warns (post-authoring, still benign)

7 icon components (`AlertTriangleIcon`, `CheckIcon`, `ChevronDownIcon`, `InfoIcon`, `SparklesIcon`, `StarIcon`, `XIcon`) still trip `[RENDER_THIN]` ("mounts have no text and paint nothing") even after authoring — confirmed benign by reading the contact sheets: these are pure SVG icons with no text by design, correctly colored/sized per their real semantic use. Not a regression to chase on future re-syncs unless a real text-bearing composition starts tripping this.

`FAQAccordionItem` and `ProgressBar`'s pre-authoring warns (`[RENDER_THIN]` literal placeholder text; `[RENDER_BLANK]` default `value=0`) are both resolved — authored previews use realistic content/values.

## Preview-authoring patterns worth reusing

- **Icons**: color per real semantic use (success/danger/warning/primary/accent/info), never bare default black strokes — an icon preview with no color context reads as unstyled even though the component itself carries no color (it comes from the caller's `className`). `ZapIcon`/`ArrowRightIcon`/`PlayIcon` compose a small realistic context (CTA chip, link-with-arrow, video-thumbnail overlay circle) rather than showing the bare glyph.
- **Spinner `tone="light"`**: only legible against a colored/dark background — wrap it in a small filled chip in previews. Worth a line in the conventions header so the design agent doesn't drop a light spinner on a bare white card.
- **Tooltip's internal-only visible state**: no prop forces it open. Trick that worked: wrap the trigger in a small local component, `useEffect(() => ref.current?.focus(), [])` on mount — fires the component's real `onFocus` handler (bubbles to the wrapping span) so the bubble renders in a static screenshot. Needs top padding on the container since the bubble pops upward and would otherwise clip the card edge. Reusable for any future DS component whose open state is internal/event-driven only.
- **Switch/Tabs (fully controlled, no internal state)**: preview stories use a tiny local `useState` wrapper per story — legitimate since preview `.tsx` files are real compiled React source, not reference-free templates.
- **NavBar/Footer `logo`**: the DS ships no logo image asset, so previews pass a plain text wordmark (`color:"#335CFF"`, bold) as the `logo` node. Real usage passes the actual image/SVG — this is a preview stand-in, not a DS gap.
- **Footer `socials`**: the DS only ships 10 generic icons (no LinkedIn/YouTube/GitHub/Discord, unlike the live app's SiteFooter). Preview uses `XIcon` for a single "X (Twitter)" entry rather than inventing icons that don't exist in the package. If full social parity matters, the DS's icon set needs those icons added upstream — not something this sync can fix.
- **Modal / NavBar / Footer / PricingCard `cfg.overrides`**: `Modal: {cardMode:"single", viewport:"640x520"}` and `NavBar`/`Footer`/`PricingCard: {cardMode:"column"}` all worked exactly as intended — confirmed via contact sheets. No further tuning needed.

## Documentation vs. source drift found during conventions authoring

- The DS README claims only `Card`, `Modal`, `Button`, `Input`, `Textarea`, `Select`, `NavBar`, `Footer` carry `dark:` variants. Grepping `src/components/*/*.tsx` for `dark:` found 17 of 21 actually do (adds `Badge`, `Checkbox`, `FAQAccordionItem`, `PricingCard`, `ProgressBar`, `Spinner`, `Switch`, `Tabs`, `ToolCard`) — only `Alert`, `Avatar`, `CreditBadge`, `Tooltip` are light-only. The conventions header uses the verified (source-grepped) list, not the README's. Worth fixing the README itself upstream since it undersells real dark-mode coverage.
- `src/styles.css`'s `@theme` block declares `--color-accent-hover` and `--color-success-subtle`, but no shipped component references either, so Tailwind v4's build tree-shakes them completely — they're absent from `dist/styles.css` (and therefore the DS bundle) even as bare CSS custom properties, not just missing utilities. Confirmed by grepping `--color-` entries in the compiled output. If a component starts using them, they'll reappear in a future rebuild automatically; until then, don't reference them anywhere (design agent guidance, docs, or the DS's own future components) — they resolve to nothing.

## Re-sync risks

- `extraFonts` points at a font file this sync added to the repo (`design-system/src/fonts/geist-sans/Geist-Variable.woff2`) — if the DS's own font strategy changes (e.g. adopts a different self-hosting approach), update or remove this override.
- No per-component docs exist, so `.prompt.md` is entirely synthesized from `.d.ts` + JSDoc + authored preview — if the team later adds real docs, set `cfg.docsDir` and previously-synthesized prompts will be replaced.
- All components/icons were authored in the first sync (no floor-card components remain deferred) — a future re-sync's diff should be small (source-driven only) unless the DS's component set grows.
- Several previews use realistic but invented content ports of real app copy (pricing tiers from `prisma/seed.ts`, nav/footer links from `SiteNavbar.tsx`/`SiteFooter.tsx`, FAQ copy in the spirit of `app/pricing/page.tsx`) — if that real copy changes, the previews will drift from the live app but will still render correctly (they're not wired to any shared data source).

## Windows re-sync gotchas (found 2026-07-02, fixed)

- **Spurious full-repo diff from CRLF checkout.** On a fresh Windows clone with `core.autocrlf=true` (the common default), git rewrites the committed LF bytes of `design-system/dist/**`, `.design-sync/previews/**`, `.design-sync/conventions.md`, `.design-sync/NOTES.md`, `.design-sync/config.json`, and `design-system/README.md` to CRLF on checkout. Since `styleShaFor`/`sourceKeyFor` (`.ds-sync/lib/sync-hashes.mjs`) hash raw file bytes, this made every one of the 31 components read as `changed` against the anchor even though nothing had actually changed — a false-positive re-grade storm. **Fixed** by committing a root `.gitattributes` that pins those paths to `eol=lf` (and marks `design-system/dist/**` `-text`, plus a repo-wide `*.woff2`/`.woff`/`.ttf`/`.otf` `-text` rule so the binary Geist font file doesn't get corrupted by the `eol=lf` glob on `design-system/src/**`). After adding it, re-checkout the affected paths (`git rm --cached -r <paths> && git checkout HEAD -- <paths>`) so the working tree actually gets the LF bytes back — `git add --renormalize` alone only fixes the index, not the working tree. **If a future re-sync on a clean checkout still shows everything as `changed`, check this first** (`file <path>` shows `CRLF` when it's biting) before assuming real source drift.
- **`--node-modules` must point at `design-system/node_modules`, not the repo root**, even though the repo root also has `react`/`react-dom` installed and would let the build succeed silently. esbuild embeds the resolved module path as a comment in `_vendor/react.js`/`_vendor/react-dom.js` (e.g. `// design-system/node_modules/react/cjs/react.development.js`), which feeds `styleShaFor`. Building from the repo-root `node_modules` instead produces a byte-different (but functionally identical) vendor bundle, which also reads as a spurious `upload.styling: true` diff. Fix: `cd design-system && npm ci` first (installs its own pinned `node_modules` from `package-lock.json`, ~85 packages), then pass `--node-modules ./design-system/node_modules` to `package-build.mjs`/`resync.mjs`. Confirmed this makes the rebuild match the uploaded anchor exactly (`styleSha`/`bundleSha12`/`auxSha` all equal, `upload.any: false`).
- Combined, both fixes took a from-scratch re-sync on a new Windows machine from "31 components flagged changed + styling diff" down to a true no-op (`upload.any: false`, all 31 `unchanged`) — confirming NOTES.md's earlier prediction that an unchanged DS source should produce a small/empty diff.
