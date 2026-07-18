import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — rename a key. Only the display name is editable after creation —
// scopes/expiration are fixed at mint time (changing what a live key can do
// without rotating it is a real security footgun, not a convenience worth adding).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { name } = await req.json().catch(() => ({}));
  const trimmed = typeof name === "string" ? name.trim().slice(0, 100) : "";
  if (!trimmed) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const result = await prisma.apiKey.updateMany({ where: { id, userId: auth.userId }, data: { name: trimmed } });
  if (result.count === 0) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  return NextResponse.json({ status: "renamed" });
}

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
