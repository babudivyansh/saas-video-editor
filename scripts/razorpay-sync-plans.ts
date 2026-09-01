// Admin-run, one-off/occasional script: creates Razorpay Plans for every
// active subscription-kind Plan row and stores the resulting ids back on
// Plan.razorpayPlanIdInr / razorpayPlanIdUsd.
//
// Run: npx tsx scripts/razorpay-sync-plans.ts [--currency=INR|USD] [--force]
//
// Idempotent by default — re-running skips plans that already have an id for
// the currency being synced. `--force` re-mints them at the CURRENT price,
// which is what you want after editing a price outside the admin panel
// (/admin/pricing does this automatically on save; see lib/billing/razorpay-plans.ts).
//
// Until a Plan has a razorpayPlanId for its currency, checkout falls back to
// the legacy one-time order flow (see app/api/billing/checkout/route.ts) —
// so this can be run plan-by-plan without breaking checkout for the rest.

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { syncRazorpayPlan, storedPlanId } from "../lib/billing/razorpay-plans";
import type { Currency } from "../lib/currency";

const currencyArg = (process.argv.find((a) => a.startsWith("--currency="))?.split("=")[1] ?? "INR").toUpperCase();
if (currencyArg !== "INR" && currencyArg !== "USD") {
  console.error(`Unsupported currency: ${currencyArg}`);
  process.exit(1);
}
const currency: Currency = currencyArg;
const force = process.argv.includes("--force");

async function main() {
  const plans = await prisma.plan.findMany({
    where: { kind: "subscription", active: true },
    orderBy: { sortOrder: "asc" },
  });

  for (const plan of plans) {
    const existing = storedPlanId(plan, currency);
    if (existing && !force) {
      console.log(`skip ${plan.slug} (${currency}) — already synced: ${existing}`);
      continue;
    }

    const result = await syncRazorpayPlan(plan, currency, { force });
    if (!result.ok) {
      console.error(`FAILED ${plan.slug} (${currency}): ${result.error}`);
      continue;
    }
    console.log(
      result.created
        ? `synced ${plan.slug} (${currency}) -> ${result.razorpayPlanId}${existing ? ` (replaced ${existing})` : ""}`
        : `skip ${plan.slug} (${currency}) — already synced: ${result.razorpayPlanId}`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
