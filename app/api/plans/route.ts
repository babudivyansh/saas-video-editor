import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public: active plans for the pricing page and checkout UI. No auth required.
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
  return NextResponse.json({ plans });
}
