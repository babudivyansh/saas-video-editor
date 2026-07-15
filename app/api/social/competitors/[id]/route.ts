import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { removeCompetitor } from "@/lib/social/competitors";

// DELETE = stop tracking. Auth-only (not subscriber-gated) so users can always
// remove tracked data, mirroring the social-account disconnect rule.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await removeCompetitor(auth.userId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
