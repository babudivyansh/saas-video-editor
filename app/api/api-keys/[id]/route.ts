import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE — revoke a key. Soft-delete (sets revokedAt) rather than removing
// the row, so it still shows up in the key-management list (as revoked)
// instead of silently disappearing, and so lastUsedAt/audit history survives.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await prisma.apiKey.updateMany({
    where: { id, userId: auth.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  return NextResponse.json({ status: "revoked" });
}
