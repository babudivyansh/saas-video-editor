import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";

// Opt-in auto top-up (2026-07 audit). GET returns the current setting; PATCH
// sets/clears it. `packSlug: null` turns auto top-up off.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { autoTopupPackSlug: true } });
  return NextResponse.json({ autoTopupPackSlug: user?.autoTopupPackSlug ?? null });
}

async function handlePATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { packSlug?: string | null };
  if (body.packSlug !== null && typeof body.packSlug !== "string") {
    return NextResponse.json({ error: "packSlug must be a string or null" }, { status: 400 });
  }

  if (body.packSlug) {
    const pack = await prisma.plan.findUnique({ where: { slug: body.packSlug } });
    if (!pack || !pack.active || pack.kind !== "pack") {
      return NextResponse.json({ error: "Invalid top-up pack" }, { status: 400 });
    }
  }

  await prisma.user.update({ where: { id: auth.userId }, data: { autoTopupPackSlug: body.packSlug } });
  return NextResponse.json({ autoTopupPackSlug: body.packSlug });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "billing:auto-topup:get" });
export const PATCH = withRateLimit(handlePATCH, { limit: 20, windowSec: 60, keyBy: "user", name: "billing:auto-topup:patch" });
