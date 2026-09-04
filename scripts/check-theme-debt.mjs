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
  "raw-gray": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|decoration|fill|stroke|accent|caret)-gray-\d{2,3}\b/g,
  // Opaque white surfaces. `bg-white/40` is deliberately NOT counted — a
  // translucent white overlay is already correct on a dark ground.
  "bg-white": /\bbg-white(?![/\w-])/g,
  // Stock slate/stone/neutral ramps. Unlike gray these are NOT bridged by the
  // inverted ramp in globals.css, so each one has to be codemodded outright.
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
  // The 322 baseline is a MEASUREMENT, not a certificate — unlike the budgets
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
  "raw-gray": 65,
  "bg-white": 5,
  "raw-slate": 16,
  "raw-zinc": 2,
  "raw-blue": 42,
  "raw-red": 15,
  "brand-hex": 51,
  "legacy-light": 0,
  "inline-hex": 322,
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
