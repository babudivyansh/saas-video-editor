import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { addCompetitor, competitorTrackingConfigured, listCompetitors, MAX_COMPETITORS } from "@/lib/social/competitors";

// GET  → the user's tracked competitors with follower trend snapshots.
// POST → { provider, handle } add one (vendor-fetches the initial snapshot).
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  const competitors = await listCompetitors(auth.userId);
  return NextResponse.json({ competitors, enabled: competitorTrackingConfigured(), max: MAX_COMPETITORS });
}

export async function POST(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  const body = (await req.json().catch(() => ({}))) as { provider?: string; handle?: string };
  if (!body.provider || !body.handle) {
    return NextResponse.json({ error: "provider and handle are required" }, { status: 400 });
  }
  const result = await addCompetitor(auth.userId, body.provider, body.handle);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
