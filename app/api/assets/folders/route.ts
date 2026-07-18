import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folders = await prisma.assetFolder.findMany({
    where: { userId: auth.userId },
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  return NextResponse.json({
    folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color, assetCount: f._count.assets, createdAt: f.createdAt })),
  });
}

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string };
  const name = (body.name ?? "").trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const existing = await prisma.assetFolder.findFirst({ where: { userId: auth.userId, name } });
  if (existing) return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });

  const folder = await prisma.assetFolder.create({
    data: { userId: auth.userId, name, color: body.color?.slice(0, 20) },
  });
  return NextResponse.json({ folder }, { status: 201 });
}

export const GET = withRateLimit(handleGET, { limit: 120, windowSec: 60, keyBy: "user", name: "assets:folders:list" });
export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "assets:folders:create" });
