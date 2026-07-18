import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tags = await prisma.tag.findMany({
    where: { userId: auth.userId },
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  return NextResponse.json({
    tags: tags.map((t) => ({ id: t.id, name: t.name, assetCount: t._count.assets })),
  });
}

// Creates an unused tag ahead of assigning it to anything — lets the tag
// picker offer "create '<name>'" before the first asset actually uses it.
// (PATCH /api/assets/[id] with a `tags` array is the normal assign path and
// upserts tags implicitly; this route exists for that empty-tag case.)
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim().toLowerCase().slice(0, 50);
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId: auth.userId, name } },
    create: { userId: auth.userId, name },
    update: {},
  });
  return NextResponse.json({ tag }, { status: 201 });
}

export const GET = withRateLimit(handleGET, { limit: 120, windowSec: 60, keyBy: "user", name: "assets:tags:list" });
export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "assets:tags:create" });
