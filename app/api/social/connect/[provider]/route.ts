import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/social/service";
import type { ProviderId } from "@/lib/social/types";

const VALID: ProviderId[] = ["youtube", "instagram", "facebook"];

// Returns the provider's OAuth authorize URL for the (subscribed) caller to
// redirect to. Subscriber-gated — Social Tracker is a paid feature.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const { provider } = await params;
  if (!VALID.includes(provider as ProviderId)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  try {
    const url = await buildAuthUrl(auth.userId, provider as ProviderId);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
