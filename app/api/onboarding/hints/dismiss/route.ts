import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Permanently dismisses a FeatureHint card by id — appended to a scalar list
// rather than a join table since hint ids are small, app-defined strings, not
// rows with their own lifecycle.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const hintId = typeof body.hintId === "string" ? body.hintId : null;
  if (!hintId) return NextResponse.json({ error: "hintId required" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { dismissedHints: { push: hintId } },
    select: { id: true, dismissedHints: true },
  });

  return NextResponse.json({ user });
}
