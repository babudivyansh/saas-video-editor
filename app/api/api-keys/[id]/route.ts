import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// PATCH — rename a key. Only the display name is editable after creation —
// scopes/expiration are fixed at mint time (changing what a live key can do
// without rotating it is a real security footgun, not a convenience worth adding).
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

export const PATCH = withRateLimit(handlePATCH, { limit: 20, windowSec: 900, keyBy: "user", name: "api-keys:rename" });
export const DELETE = withRateLimit(handleDELETE, { limit: 20, windowSec: 900, keyBy: "user", name: "api-keys:revoke" });
