import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";

const MIN_THRESHOLD = 5;
const MAX_THRESHOLD = 100;
const DEFAULT_THRESHOLD = 10; // mirrors the Prisma schema default

// Opt-in auto top-up (2026-07 audit). GET returns the current setting; PATCH
// sets/clears it. `packSlug: null` turns auto top-up off. `threshold` is the
// balance (credits) that triggers the prompt — see lib/credits.ts's
// maybeAutoTopup, which used to fire at one hardcoded value for everyone.
async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { autoTopupPackSlug: true, autoTopupThreshold: true },
  });
  return NextResponse.json({
    autoTopupPackSlug: user?.autoTopupPackSlug ?? null,
    autoTopupThreshold: user?.autoTopupThreshold ?? DEFAULT_THRESHOLD,
  });
}

async function handlePATCH(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { packSlug?: string | null; threshold?: number };
  const data: { autoTopupPackSlug?: string | null; autoTopupThreshold?: number } = {};

  // packSlug stays a required field in practice (the UI always sends the
  // current value alongside a threshold-only change — see BillingPanel's
  // AutoTopupToggle), but is validated only when actually present so a
  // threshold-only PATCH isn't rejected for omitting an unrelated field.
  if ("packSlug" in body) {
    if (body.packSlug !== null && typeof body.packSlug !== "string") {
      return NextResponse.json({ error: "packSlug must be a string or null" }, { status: 400 });
    }
    if (body.packSlug) {
      const pack = await prisma.plan.findUnique({ where: { slug: body.packSlug } });
      if (!pack || !pack.active || pack.kind !== "pack") {
        return NextResponse.json({ error: "Invalid top-up pack" }, { status: 400 });
      }
    }
    data.autoTopupPackSlug = body.packSlug;
  }

  if ("threshold" in body) {
    if (
      typeof body.threshold !== "number" ||
      !Number.isInteger(body.threshold) ||
      body.threshold < MIN_THRESHOLD ||
      body.threshold > MAX_THRESHOLD
    ) {
      return NextResponse.json(
        { error: `threshold must be a whole number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}` },
        { status: 400 },
      );
    }
    data.autoTopupThreshold = body.threshold;
  }

  const updated = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { autoTopupPackSlug: true, autoTopupThreshold: true },
  });
  return NextResponse.json(updated);
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "billing:auto-topup:get" });
export const PATCH = withRateLimit(handlePATCH, { limit: 20, windowSec: 60, keyBy: "user", name: "billing:auto-topup:patch" });
