// Admin-run, one-off/occasional script: creates Razorpay Plans for every
// active subscription-kind Plan row and stores the resulting ids back on
// Plan.razorpayPlanIdInr / razorpayPlanIdUsd. Idempotent — re-running skips
// plans that already have an id for the currency being synced.
//
// Run: npx tsx scripts/razorpay-sync-plans.ts [--currency=INR|USD]
//
// Until a Plan has a razorpayPlanId for its currency, checkout falls back to
// the legacy one-time order flow (see app/api/billing/checkout/route.ts) —
// so this can be run plan-by-plan without breaking checkout for the rest.

import "dotenv/config";
import Razorpay from "razorpay";
import { prisma } from "../lib/prisma";
import { getPlanPriceMinor, type Currency } from "../lib/currency";

const currencyArg = (process.argv.find((a) => a.startsWith("--currency="))?.split("=")[1] ?? "INR").toUpperCase();
if (currencyArg !== "INR" && currencyArg !== "USD") {
  console.error(`Unsupported currency: ${currencyArg}`);
  process.exit(1);
}
const currency: Currency = currencyArg;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

async function main() {
  const plans = await prisma.plan.findMany({
    where: { kind: "subscription", active: true },
    orderBy: { sortOrder: "asc" },
  });

  for (const plan of plans) {
    const existing = currency === "INR" ? plan.razorpayPlanIdInr : plan.razorpayPlanIdUsd;
    if (existing) {
      console.log(`skip ${plan.slug} (${currency}) — already synced: ${existing}`);
      continue;
    }
    if (!plan.intervalMonths) {
      console.log(`skip ${plan.slug} — no intervalMonths`);
      continue;
    }

    // Razorpay Plans are priced per billing cycle; intervalMonths=12 plans
    // still bill monthly in the Subscriptions API (period="monthly",
    // interval=1) with total_count driving the term — but our yearly SKUs
    // are prepaid-annual pricing, so we bill them as period="yearly" here to
    // keep the charge cadence matching what the price represents.
    const period = plan.intervalMonths === 1 ? "monthly" : "yearly";

    // Must go through getPlanPriceMinor, not priceInPaise. priceInPaise is INR
    // minor units; sending it with currency:"USD" would have created the
    // Creator plan at $999/month instead of $15 — and because `existing`
    // short-circuits re-runs, that wrong plan would then stick. This is also
    // the same function the pricing page and checkout use, so the Razorpay
    // Plan amount agrees with the price the customer was shown.
    const amount = await getPlanPriceMinor(plan.slug, plan.priceInPaise, currency);
    console.log(`  ${plan.slug}: charging ${amount} ${currency} minor units (${period})`);

    const created = await razorpay.plans.create({
      period,
      interval: 1,
      item: {
        name: plan.name,
        amount,
        currency,
        description: `Clipiro ${plan.name}`,
      },
      notes: { planSlug: plan.slug },
    });

    await prisma.plan.update({
      where: { id: plan.id },
      data: currency === "INR" ? { razorpayPlanIdInr: created.id } : { razorpayPlanIdUsd: created.id },
    });
    console.log(`synced ${plan.slug} (${currency}) -> ${created.id}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
