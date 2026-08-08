#!/usr/bin/env node
// Pricing-safety CI guard (2026-07 pricing audit).
//
// Rule: no model or tool ships with an unverified provider cost unless it is
// explicitly allowlisted here — and anything allowlisted must be mitigated
// (tier-gated or disabled). Adding a new `verify-before-ship` marker without
// updating this file fails the build, so unverified-cost exposure can only
// grow deliberately, never by accident.
//
// Run: node scripts/check-unverified-costs.mjs   (wired into `npm run lint`)

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Files that may legitimately contain cost annotations.
const SCAN = [
  "lib/tool-costs.ts",
  ...readdirSync(join(ROOT, "lib/models")).map((f) => `lib/models/${f}`),
];

// Known, mitigated markers: "<file>:<count>". Each entry documents WHY it is
// acceptable to ship. Shrink these counts as costs get verified; never grow
// them — add a verified cost instead.
const ALLOWLIST = {
  // ideogram-4 tier-slug ambiguity (`/fast` vs `/instant`) — cheap either way.
  "lib/models/imageModels.ts": 1,
  // pixverse (v5.6) — weak cost/slug data (~$0.01/s reported); priced at a
  // conservative 3 cr/s (>=3x either way) and creator+ gated. The other video
  // models had their fal costs confirmed in the 2026-08 audit (per-resolution
  // rates now in resolutionCredits), so their markers were removed.
  "lib/models/videoModels.ts": 1,
  // subtitle-remover: costUsd unknown → route-gated pro+ (face-swap is also
  // costUsd:null + gated, but carries no marker).
  "lib/tool-costs.ts": 1,
};

let failed = false;

for (const rel of SCAN) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const count = (text.match(/verify-before-ship/g) ?? []).length;
  const allowed = ALLOWLIST[rel] ?? 0;
  if (count > allowed) {
    console.error(
      `✗ ${rel}: ${count} 'verify-before-ship' marker(s), allowlist permits ${allowed}.\n` +
        `  Verify the provider cost (then remove the marker) or tier-gate the model\n` +
        `  and update the allowlist in scripts/check-unverified-costs.mjs with a rationale.`,
    );
    failed = true;
  } else if (count < allowed) {
    console.error(
      `✗ ${rel}: allowlist says ${allowed} marker(s) but found ${count} — shrink the allowlist to match.`,
    );
    failed = true;
  }
}

// A model priced with no cost basis at all is always an error outside tool-costs
// (tool-costs uses `costUsd: null` deliberately, gated via requiredTier).
for (const rel of SCAN.filter((f) => f.startsWith("lib/models/"))) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (/costUsd:\s*(null|undefined)/.test(text)) {
    console.error(`✗ ${rel}: model entry with costUsd null/undefined — every registry model needs a cost estimate.`);
    failed = true;
  }
}

// ── Raw credit-mutation guard ───────────────────────────────────────────────
// lib/credits.ts is the only module allowed to mutate credit columns — every
// other increment/decrement bypasses the bucket ledger and breaks balances.
function* walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(rel);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield rel;
  }
}
const MUTATION = /(credits|subscriptionCredits|purchasedCredits|bonusCredits)['"]?\s*:\s*\{\s*(increment|decrement)/;
for (const dir of ["app", "lib", "utils"]) {
  for (const rel of walk(dir)) {
    if (rel === "lib/credits.ts") continue;
    const text = readFileSync(join(ROOT, rel), "utf8");
    if (MUTATION.test(text)) {
      console.error(`✗ ${rel}: raw credit-column mutation — use lib/credits.ts (spendCredits/grantCredits/restoreSpend/clawbackCredits).`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("✓ cost verification + credit-mutation guard passed", `(${SCAN.length} cost files)`);
