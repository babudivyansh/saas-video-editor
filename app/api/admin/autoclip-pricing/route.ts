import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { autoclipPricingSchema } from "@/lib/admin/schemas";
import { getAutoClipPricing, AUTOCLIP_PRICING_DEFAULTS, type AutoClipPricing } from "@/lib/autoclip-pipeline";

// Admin-adjustable AutoClip credit pricing (P2.6). The rates were never a
// number an engineer should invent — this makes them settable without a code
// deploy, same pattern as /api/admin/tools for the rest of the app's tool costs.
export const GET = withAdmin(async () => {
  const pricing = await getAutoClipPricing();
  return NextResponse.json({ pricing, defaults: AUTOCLIP_PRICING_DEFAULTS });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, autoclipPricingSchema);
  const current = await getAutoClipPricing();
  const next: AutoClipPricing = { ...current, ...body };

  await prisma.config.upsert({
    where: { key: "autoclip_pricing" },
    update: { value: JSON.stringify(next) },
    create: { key: "autoclip_pricing", value: JSON.stringify(next) },
  });

  await auditAdminAction(admin.userId, "autoclip_pricing.updated", undefined, {
    before: current,
    after: next,
    ip: auditIp(req),
  });

  return NextResponse.json({ pricing: next });
});
