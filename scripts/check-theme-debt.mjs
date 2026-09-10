#!/usr/bin/env node
// Dark-theme migration debt ratchet (2026-09 emerald design-system migration).
//
// Rule: the light-theme styling debt listed below may only ever shrink. Each
// migration stage lowers its own numbers and commits the new budget, so a
// half-migrated surface can't quietly come back and the bridge measures below
// (the inverted --color-gray-* ramp, the .legacy-light scope pin) can't become
// permanent through neglect.
//
// Same shape as scripts/check-unverified-costs.mjs: exact counts, not ceilings.
// Over budget = you added debt. Under budget = you removed debt, so shrink the
// budget in this file to lock the win in.
//
// Run: node scripts/check-theme-debt.mjs   (wired into `npm run lint`)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Surfaces excluded from the migration entirely. These are NOT debt:
//   - editor/**   already dark, owns the separate --editor-* token set
//   - *-image.tsx Satori-rendered social cards on their own background
const EXCLUDED = [
  "app/dashboard/editor",
  "app/opengraph-image.tsx",
  "app/twitter-image.tsx",
];

const PATTERNS = {
  // Stock Tailwind gray ramp used as a colour. Bridged by the inverted ramp in
  // globals.css until these reach zero, at which point the @theme gray block
  // and this budget line both get deleted.
  // ── 2026-09-10: reddit-video, text-video and ai-creator were deleted ─────
  // Every number below fell in one commit. Those three pages were the last
  // holders of raw-blue and raw-zinc entirely, and carried the chat-bubble
  // and Reddit-card mockup colours ffmpeg used to burn into exported video —
  // the deliberate light-theme exception DESIGN_SYSTEM.md documents. With the
  // products gone the exception goes with them, so these are locked in here.
  "raw-gray": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|decoration|fill|stroke|accent|caret)-gray-\d{2,3}\b/g,
  // Opaque white surfaces. `bg-white/40` is deliberately NOT counted — a
  // translucent white overlay is already correct on a dark ground.
  "bg-white": /\bbg-white(?![/\w-])/g,
  // Stock slate/stone/neutral ramps. Unlike gray these are NOT bridged by the
  // inverted ramp in globals.css, so each one has to be codemodded outright.
  // 2026-09-10, second pass: viral-split-screen, split-video and
  // streamer-video deleted. inline-hex 98 -> 63 is those three create pages'
  // background-catalogue tiles and title-style swatches; brand-hex 42 -> 37
  // their step-header accents. Nothing was restyled — the debt left with the
  // product.
  "raw-slate": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via)-(?:slate|stone|neutral)-\d{2,3}\b/g,
  // The fourth palette (error/404 pages, legacy editor wizard). The two that
  // remain are the Reddit card's own dark-mode swatch in create/reddit-video,
  // which is product output rather than chrome.
  "raw-zinc": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via)-zinc-\d{2,3}\b/g,
  // Stock blue/indigo. The retired brand was blue, so these are old-accent
  // leakage rather than a deliberate hue choice. The 42 that remain are all
  // inside the two protected content files, where blue is the Telegram /
  // iMessage / Reddit rendering rather than Clipiro chrome.
  "raw-blue": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via)-(?:blue|indigo)-\d{2,3}\b/g,
  // Stock red. text-red-700/800/900 read fine on a light error banner and are
  // ~2:1 on the dark one; bg-red-100/50 IS the light banner. The 15 that remain
  // are YouTube brand red in the downloader and its preview illustration —
  // a platform colour, like the Reddit orange, not an error state.
  "raw-red": /\b(?:bg|text|border|ring|divide|from|to|via)-red-\d{2,3}\b/g,
  // Stock violet/fuchsia/purple. The retired brand's accent was #7C3AED, so
  // these are the same old-accent leakage `raw-blue` covers — they were simply
  // never measured, which is how the review modal and report modal kept a
  // violet focus ring through the whole migration while this ratchet reported
  // "on budget". NOT counted: the `--accent-violet` token and its
  // `bg-tint-violet` / `text-accent-violet` utilities, which are a deliberate
  // part of the emerald system's categorical palette (badge hues, star
  // gradient) rather than retired-brand residue.
  "raw-violet": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|decoration|fill|stroke|accent|caret)-(?:violet|fuchsia|purple)-\d{2,3}\b/g,
  // Stock emerald/amber. Unlike every rule above these are not a RETIRED hue —
  // emerald is the live brand family and amber is the live warning family,
  // which is exactly why they went unmeasured: a `bg-emerald-50` looks correct
  // in review. It is not. The stock ramp's 50/100 steps are near-white, so on
  // the near-black surface they render as glowing pills, and the tokens they
  // should be using (--success, --warning, bg-tint-emerald, bg-tint-amber) are
  // theme-aware where the ramp is not.
  //
  // Found the whole Social Tracker doing this on one side of a conditional and
  // the token on the other — `good ? "bg-emerald-50 text-emerald-700" :
  // "bg-error/10 text-error"` — so the good branch glowed and the bad branch
  // was correct.
  "raw-emerald": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|decoration|fill|stroke|accent|caret)-(?:emerald|amber)-\d{2,3}\b/g,
  // Literal old-brand hexes in UI code. One is legitimate and permanent:
  // #7c3aed is also PALETTE[3] in app/admin/dashboard/ui.tsx, a validated
  // categorical chart hue that happens to collide with the retired accent.
  "brand-hex": /#(?:335cff|7c3aed|d946ef)\b/gi,
  // The migration scaffold itself. MUST reach 0 before the .legacy-light block
  // is deleted from globals.css — that deletion is the last step of the
  // migration, and this is the gate on it.
  "legacy-light": /\blegacy-light\b/g,
  // ANY colour literal in an inline style, not just the retired brand's.
  //
  // Every rule above matches class strings, and the codemod only ever rewrote
  // class strings — so a colour written as `style={{ background: "#ffffff" }}`
  // was invisible to both. That is precisely how the four free-tool components
  // kept a white drop zone and blue buttons through the whole migration while
  // the ratchet reported "on budget": the debt was real, just unmeasured.
  //
  // Deliberately narrow, to stay honest rather than noisy: only hexes inside a
  // `style` prop or a style object's value, so an SVG `stroke="#..."` and a hex
  // in a comment don't inflate it.
  //
  // The 320 baseline is a MEASUREMENT, not a certificate — unlike the budgets
  // above it is not all deliberate. Roughly:
  //   209  create/{streamer,split,viral-split-screen,reddit,text}-video — caption
  //        presets and chat themes that ffmpeg burns into the exported video.
  //        Permanent; recolouring these corrupts product output.
  //     6  global-error.tsx — already the emerald values, hardcoded because it
  //        renders its own <html>/<body> outside the shell, so no CSS var from
  //        globals.css is in scope. Correct as-is.
  //    ~35 per-item identity colours (voice-catalog avatars, social platform
  //        brand colours). Categorical, like a chart palette — defensible.
  //    ~70 GENUINE REMAINING DEBT: QuestCard's accent dots still use the retired
  //        brand hexes, AccountPicker/AccountSettingsList carry light `bg` tints
  //        (#ffe8e8, #f1f5f9), and AICreatorWizard/auto-clip are unaudited.
  // Lower this number as that last group is migrated.
  "inline-hex": /(?:style=\{\{|(?:background|backgroundColor|color|borderColor|border|fill|stroke|boxShadow|outline)\s*:)[^}\n]*?#[0-9a-fA-F]{3,8}\b/g,
};

// Exact expected counts. Lower these as each stage lands; never raise them.
const BUDGET = {
  // 65 -> 64: deleting app/components/SubtitleStylePicker.tsx (the 16-swatch
  // index-based caption grid) took its hover:ring-gray-300 with it.
  // 64 -> 63: one more went with the deleted caption tile grids.
  "raw-gray": 35,
  // 5 -> 4: same deletion.
  "bg-white": 1,
  "raw-slate": 9,
  "raw-zinc": 0,
  "raw-blue": 0,
  "raw-red": 11,
  // First measurement, 2026-09-10. Not a certificate — this pocket was
  // unmeasured until now, so nearly all of it is genuine debt spread over
  // ~30 files (dashboard, assets, clips, settings, onboarding, admin).
  // The review surfaces' share was paid off in the same commit that added
  // this rule: the two modals' focus rings and the attachment drop zone's
  // border now use `primary`, which is where a focus state belonged anyway.
  "raw-violet": 100,
  // First measurement, 2026-09-10, taken AFTER the Social Tracker's share was
  // paid off in the same commit that added the rule. The 138 that remain are
  // spread over ~30 files — pricing (11), PlansModal (10), admin/ops (8),
  // admin/reviews (7) — and are genuine debt, not a certificate. Every one is
  // a near-white pill or a hue that ignores the theme.
  "raw-emerald": 138,
  // 51 -> 47: four of the retired brand hexes lived in the caption tile tables
  // deleted below.
  // 47 -> 43: four more went with the per-page voice lists, whose entries
  // each carried a hand-assigned avatar tint.
  "brand-hex": 37,
  "legacy-light": 0,
  // 320 -> 318: same deletion. The replacement (CaptionStyleGrid) still needs
  // two inline hex values for the swatch gradient — that is product artwork
  // standing in for video, not chrome — so this is a net -2, not -4.
  // 318 -> 317: that gradient turned out not to need hexes at all. The swatch
  // and the new hover preview now stand on `bg-gradient-to-br from-surface-3
  // to-bg`, and the one remaining literal (a #000 in a text-shadow) became
  // rgba(0,0,0,1) — the same colour, measurable by the class-based rules.
  // 317 -> 152: the single biggest drop in this ratchet's life. The four
  // create pages (reddit, split-video, viral-split-screen, streamer) each
  // carried a verbatim copy of the same ONE_WORD_STYLES/LINE_STYLES CSS tile
  // tables — ~165 inline colour literals describing caption looks that the
  // renderer defined separately and had already drifted from. All four now
  // render the shared named-template grid, which draws each swatch from the
  // template's own ASS style, so the preview and the burn-in cannot disagree.
  // 152 -> 112: the six hand-maintained voice lists are gone. Each entry
  // carried a decorative colour literal, and two pages additionally held a
  // copy of the provider's voice ids purely to build preview URLs by hand.
  "inline-hex": 55,
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (EXCLUDED.some((p) => rel === p || rel.startsWith(p + "/"))) continue;
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push({ abs, rel });
  }
  return out;
}

const files = walk(join(ROOT, "app"));
const inScope = files;

function census(fileList) {
  const totals = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]));
  const worst = {};
  for (const { abs, rel } of fileList) {
    const text = readFileSync(abs, "utf8");
    for (const [name, re] of Object.entries(PATTERNS)) {
      const n = (text.match(re) ?? []).length;
      if (!n) continue;
      totals[name] += n;
      (worst[name] ??= []).push([rel, n]);
    }
  }
  return { totals, worst };
}

const { totals, worst } = census(inScope);

let failed = false;

for (const [name, expected] of Object.entries(BUDGET)) {
  const actual = totals[name];
  if (actual > expected) {
    const top = (worst[name] ?? []).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.error(
      `✗ ${name}: ${actual} occurrence(s), budget is ${expected} (+${actual - expected}).\n` +
        `  This migration only removes light-theme styling. Use the new tokens\n` +
        `  (bg-panel / text-fg / text-fg-muted / border-line / text-error …) instead.\n` +
        `  Heaviest files: ${top.map(([f, n]) => `${f} (${n})`).join(", ")}`,
    );
    failed = true;
  } else if (actual < expected) {
    console.error(
      `✗ ${name}: budget says ${expected} but only ${actual} remain — lower it to ${actual}\n` +
        `  in scripts/check-theme-debt.mjs so the win can't regress.`,
    );
    failed = true;
  }
}

if (!failed) {
  const line = Object.entries(BUDGET)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");
  console.log(`✓ theme debt on budget — ${line}`);
}

process.exit(failed ? 1 : 0);
