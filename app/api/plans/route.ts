import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlanPriceMinor } from "@/lib/currency";

// Public: active plans for the pricing page and checkout UI. No auth required.
// Every plan carries both its INR price (source of truth, priceInPaise) and
// a computed USD price (usdPriceInCents) so the client never needs its own
// FX/price-book logic — it just picks the field for the selected currency.
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      priceInPaise: true,
      currency: true,
      credits: true,
      features: true,
      kind: true,
      intervalMonths: true,
      monthlyCredits: true,
      tier: true,
    },
  });
  const withUsd = await Promise.all(
    plans.map(async (p) => ({
      ...p,
      usdPriceInCents: await getPlanPriceMinor(p.slug, p.priceInPaise, "USD"),
    })),
  );
  return NextResponse.json({ plans: withUsd });
}
