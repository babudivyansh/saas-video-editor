import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCoupon } from "@/lib/coupons";
import { withRateLimit } from "@/lib/with-rate-limit";

// Live discount preview for the checkout UI. Resolves the same cart amount the
// checkout route uses, then validates the coupon against it.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const planSlug: string | undefined = body.planId ?? body.packId;
  const addonSlugs: string[] = Array.isArray(body.addonIds) ? body.addonIds : [];
  const code: string = typeof body.code === "string" ? body.code : "";

  if (!planSlug) return NextResponse.json({ error: "planId is required" }, { status: 400 });
  if (!code.trim()) return NextResponse.json({ error: "Enter a coupon code." }, { status: 400 });

  const basePlan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!basePlan || !basePlan.active) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const addons = addonSlugs.length
    ? await prisma.plan.findMany({ where: { slug: { in: addonSlugs }, active: true, kind: "pack" } })
    : [];

  const amountInPaise = basePlan.priceInPaise + addons.reduce((s, a) => s + a.priceInPaise, 0);

  const result = await validateCoupon({
    code,
    userId: auth.userId,
    cartKind: basePlan.kind as "subscription" | "pack" | "addon",
    planSlug: basePlan.slug,
    amountInPaise,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 200 });

  return NextResponse.json({
    code: result.code,
    label: result.label,
    discountInPaise: result.discountInPaise,
    finalPaise: result.finalPaise,
    originalPaise: amountInPaise,
  });
}

// A live-typing coupon field can fire on every keystroke/blur — this is
// authenticated but was ungated at every layer (not in PUBLIC_API_PREFIXES,
// not one of proxy.ts's GROUP_LIMITS), so nothing stopped unlimited
// per-user code guessing.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "coupons:validate" });
