import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/tool-config";
import { getAutoClipPricing, AUTOCLIP_PRICING_DEFAULTS, type AutoClipPricing } from "@/lib/autoclip-pipeline";

// Admin-adjustable AutoClip credit pricing (P2.6). The rates were never a
// number an engineer should invent — this makes them settable without a code
// deploy, same pattern as /api/admin/tools for the rest of the app's tool costs.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pricing = await getAutoClipPricing();
  return NextResponse.json({ pricing, defaults: AUTOCLIP_PRICING_DEFAULTS });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Partial<AutoClipPricing>;
  const current = await getAutoClipPricing();
  const next: AutoClipPricing = { ...current };

  for (const key of ["base", "perExtraClip", "perMinute", "rerender"] as const) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: `${key} must be a non-negative integer` }, { status: 400 });
    }
    next[key] = n;
  }

  await prisma.config.upsert({
    where: { key: "autoclip_pricing" },
    update: { value: JSON.stringify(next) },
    create: { key: "autoclip_pricing", value: JSON.stringify(next) },
  });

  await writeAuditLog({ adminId: admin.userId, action: "autoclip_pricing.updated", before: current, after: next });

  return NextResponse.json({ pricing: next });
}
