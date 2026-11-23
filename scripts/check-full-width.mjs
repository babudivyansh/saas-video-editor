#!/usr/bin/env node
// Full-width layout guardrail (2026-11 full-width pass).
//
// App pages (dashboard/admin) fill the screen on every device with
// `px-(--page-gutter)`; marketing pages use the centred CONTENT /
// CONTENT_WIDE / TEXT columns from app/components/marketing/styles.ts
// (OpusClip-style, full-width header). This fails if the old ad-hoc
// patterns come back:
//
//   - `max-w-screen-*` (the 1280/1536px page caps)
//   - `lg:px-[120px]` (the oversized landing-section padding)
//   - `ml-15` / `ml-25` (the hard-coded logo offset that pushed the logo,
//     footer card and CTA card in from the left edge)
//
// Reading columns (max-w-2xl, max-w-[760px] …), modals and cards are fine —
// they sit INSIDE the full-width frame.
//
// OG images render outside the app at a fixed 1200px canvas and are exempt.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN = ["app"];
const EXEMPT = [/opengraph-image\.tsx$/, /twitter-image\.tsx$/, /\.test\.tsx?$/];

const RULES = [
  { re: /\bmax-w-screen-(?:sm|md|lg|xl|2xl)\b/, why: "page-width cap — use px-(--page-gutter) with no max-width" },
  { re: /\blg:px-\[120px\]/, why: "oversized section padding — use px-(--page-gutter)" },
  { re: /(?:^|[\s"'`])(?:[a-z0-9]+:)?ml-(?:15|25)\b/, why: "hard-coded logo offset — the logo sits on the frame gutter" },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      yield* walk(p);
    } else if (/\.(tsx|ts|jsx|js)$/.test(name)) {
      yield p;
    }
  }
}

const hits = [];
for (const base of SCAN) {
  for (const file of walk(join(ROOT, base))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (EXEMPT.some((r) => r.test(rel))) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("{/*")) return;
      for (const { re, why } of RULES) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}  ${why}\n    ${trimmed.slice(0, 140)}`);
      }
    });
  }
}

if (hits.length) {
  console.error(`check:full-width — ${hits.length} centered-layout pattern(s) found:\n`);
  for (const h of hits) console.error("  " + h);
  console.error("\nSee docs/FULL_WIDTH_LAYOUT_PLAN.md.");
  process.exit(1);
}
console.log("check:full-width — OK (no page-width caps)");
