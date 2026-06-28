import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireSubscriber } from "@/lib/auth";
import { refreshAccount, disconnect } from "@/lib/social/service";

// POST = manually re-sync this account's analytics (subscriber-gated).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const { id } = await params;
  try {
    const ok = await refreshAccount(auth.userId, id);
    if (!ok) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

// DELETE = disconnect (revoke + wipe tokens). Allowed for the owner regardless of
// subscription state — users can always remove their linked data.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await disconnect(auth.userId, id);
  if (!ok) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
