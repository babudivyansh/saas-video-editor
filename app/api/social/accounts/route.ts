import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { getOverview } from "@/lib/social/service";
import { availableProviders } from "@/lib/social/providers";

// Dashboard payload: linked accounts + latest metrics + recent posts + trend
// snapshots, plus which providers this deployment can connect. Token fields
// are never selected (see service.overviewSelect).
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Social Tracker is available on paid plans.", code: "subscription_required" },
      { status: 402 },
    );
  }
  const data = await getOverview(auth.userId);
  return NextResponse.json({ ...data, providers: availableProviders() });
}
