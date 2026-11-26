import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { recordFunnelEvent } from "@/lib/user-events";
import { UPGRADE_PLACEMENTS } from "@/lib/conversion";

// POST /api/events/funnel — the browser's half of the paywall funnel: an
// upgrade offer shown or clicked, the plans view opened, and a Razorpay
// checkout closed or failed (checkout STARTS are recorded server-side by
// /api/billing/checkout). Signed-in only; always 204 so analytics can never
// break the button that fired it.

const placement = z.enum(UPGRADE_PLACEMENTS);

const Body = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("upgrade_prompt"),
    placement,
    action: z.enum(["shown", "clicked"]),
    offer: z.enum(["trial", "pack", "plans"]).optional(),
  }),
  z.object({ type: z.literal("plans_viewed"), placement }),
  z.object({
    type: z.literal("checkout"),
    stage: z.enum(["dismissed", "failed"]),
    plan: z.string().min(1).max(60),
    placement,
    trial: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  }),
]);

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const e = parsed.data;

  if (e.type === "upgrade_prompt") {
    await recordFunnelEvent(auth.userId, { type: "upgrade_prompt", meta: { placement: e.placement, action: e.action, offer: e.offer } });
  } else if (e.type === "plans_viewed") {
    await recordFunnelEvent(auth.userId, { type: "plans_viewed", meta: { placement: e.placement } });
  } else {
    await recordFunnelEvent(auth.userId, {
      type: "checkout",
      meta: { stage: e.stage, plan: e.plan, placement: e.placement, trial: e.trial, reason: e.reason },
    });
  }
  return new NextResponse(null, { status: 204 });
}

export const POST = withRateLimit(handlePOST, { limit: 60, windowSec: 60, keyBy: "user", name: "events:funnel" });
