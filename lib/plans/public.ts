import { prisma } from "@/lib/prisma";
import { getPlanPriceMinor } from "@/lib/currency";

// Active plans as the public pricing surfaces see them — shared by
// GET /api/plans and the server-rendered /pricing page, so the two can't
// drift. Every plan carries both its INR price (source of truth,
// priceInPaise) and a computed USD price (usdPriceInCents) so the client never
// needs its own FX/price-book logic.
export async function getPublicPlans() {
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
      monthlyMinutes: true,
      minutes: true,
      tier: true,
    },
  });
  return Promise.all(
    plans.map(async (p) => ({
      ...p,
      usdPriceInCents: await getPlanPriceMinor(p.slug, p.priceInPaise, "USD"),
    })),
  );
}

export type PublicPlan = Awaited<ReturnType<typeof getPublicPlans>>[number];
