import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.assetFolder.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string };
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim().slice(0, 100);
    const clash = await prisma.assetFolder.findFirst({ where: { userId: auth.userId, name, NOT: { id } } });
    if (clash) return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });
    data.name = name;
  }
  if (typeof body.color === "string") data.color = body.color.slice(0, 20);

  const folder = await prisma.assetFolder.update({ where: { id }, data });
  return NextResponse.json({ folder });
}

// Deleting a folder never deletes its assets — Asset.folderId is
// onDelete: SetNull, so contained assets simply become unfiled.
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await prisma.assetFolder.deleteMany({ where: { id, userId: auth.userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ status: "deleted" });
}

export const PATCH = withRateLimit(handlePATCH, { limit: 30, windowSec: 60, keyBy: "user", name: "assets:folders:patch" });
export const DELETE = withRateLimit(handleDELETE, { limit: 30, windowSec: 60, keyBy: "user", name: "assets:folders:delete" });
