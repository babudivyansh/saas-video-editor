import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { removeCompetitor } from "@/lib/social/competitors";
import { withRateLimit } from "@/lib/with-rate-limit";

// DELETE = stop tracking. Auth-only (not subscriber-gated) so users can always
// remove tracked data, mirroring the social-account disconnect rule.
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await removeCompetitor(auth.userId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

// Rate limited, which it was not — the only unbounded write on this surface.
// Deletes are cheap individually, but an unbounded loop against them is a
// database write per request with no ceiling at all.
export const DELETE = withRateLimit(handleDELETE, {
  limit: 30,
  windowSec: 3600,
  keyBy: "user",
  name: "social:competitors:delete",
});
