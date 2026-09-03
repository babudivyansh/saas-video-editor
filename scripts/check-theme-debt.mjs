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
//   - admin/**    out of scope for this migration (counted informationally)
//   - *-image.tsx Satori-rendered social cards on their own background
const EXCLUDED = [
  "app/dashboard/editor",
  "app/opengraph-image.tsx",
  "app/twitter-image.tsx",
];
const INFORMATIONAL = ["app/admin"];

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
  // The fourth palette (error/404 pages, legacy editor wizard).
  "raw-zinc": /\b(?:bg|text|border|ring|divide|placeholder|from|to|via)-zinc-\d{2,3}\b/g,
  // Literal old-brand hexes in UI code.
  "brand-hex": /#(?:335cff|7c3aed|d946ef)\b/gi,
  // The migration scaffold itself. MUST reach 0 before the .legacy-light block
  // is deleted from globals.css — that deletion is the last step of the
  // migration, and this is the gate on it.
  "legacy-light": /\blegacy-light\b/g,
};

// Exact expected counts. Lower these as each stage lands; never raise them.
const BUDGET = {
  "raw-gray": 1172,
  "bg-white": 192,
  "raw-slate": 101,
  "raw-zinc": 102,
  "brand-hex": 75,
  "legacy-light": 0,
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
const inScope = files.filter((f) => !INFORMATIONAL.some((p) => f.rel.startsWith(p + "/")));
const outOfScope = files.filter((f) => INFORMATIONAL.some((p) => f.rel.startsWith(p + "/")));

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
const outTotals = census(outOfScope).totals;

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
  console.log(
    `  (out of scope, informational: app/admin ` +
      Object.entries(outTotals)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ") +
      `)`,
  );
}

process.exit(failed ? 1 : 0);
