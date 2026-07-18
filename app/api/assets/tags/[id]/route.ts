import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// Renames a tag for every asset that has it (it's one shared row per name,
// not a per-asset copy).
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.tag.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim().toLowerCase().slice(0, 50);
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const clash = await prisma.tag.findFirst({ where: { userId: auth.userId, name, NOT: { id } } });
  if (clash) return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });

  const tag = await prisma.tag.update({ where: { id }, data: { name } });
  return NextResponse.json({ tag });
}

// Deletes the tag entirely (untags every asset that had it — AssetTag rows
// cascade) rather than just detaching it from one asset.
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await prisma.tag.deleteMany({ where: { id, userId: auth.userId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ status: "deleted" });
}

export const PATCH = withRateLimit(handlePATCH, { limit: 30, windowSec: 60, keyBy: "user", name: "assets:tags:patch" });
export const DELETE = withRateLimit(handleDELETE, { limit: 30, windowSec: 60, keyBy: "user", name: "assets:tags:delete" });
