import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { creatorDiscountFor } from "@/lib/creator-program";

// The signed-in user's creator partner discount, if they have one right now
// (lib/creator-program.ts creatorDiscountFor). Read by the checkout summaries
// so the total shown is the total charged. Exposes no offer id.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d = await creatorDiscountFor(user.userId);
  return NextResponse.json({ discount: d ? { pct: d.discountPct, handle: d.creatorHandle } : null });
}
