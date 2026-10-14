import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { MAX_COLLECTIONS_PER_USER, collectionNameSchema } from "@/lib/clip-collections";

// GET  /api/clip-collections — the caller's collections with clip counts, and
//                              the size of Favorites (every hearted clip).
// POST /api/clip-collections — create one: { name }.

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [collections, favorites] = await Promise.all([
    prisma.clipCollection.findMany({
      where: { userId: auth.userId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { items: true } } },
    }),
    prisma.clip.count({ where: { isFavorite: true, project: { userId: auth.userId } } }),
  ]);

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      clipCount: c._count.items,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    favorites: { clipCount: favorites },
  });
}

const createSchema = z.object({ name: collectionNameSchema }).strict();

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const count = await prisma.clipCollection.count({ where: { userId: auth.userId } });
  if (count >= MAX_COLLECTIONS_PER_USER) {
    return NextResponse.json(
      { error: `You can have up to ${MAX_COLLECTIONS_PER_USER} collections. Delete one to make another.` },
      { status: 409 },
    );
  }

  const c = await prisma.clipCollection.create({
    data: { userId: auth.userId, name: parsed.data.name },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json(
    {
      collection: {
        id: c.id,
        name: c.name,
        clipCount: 0,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

export const GET = withRateLimit(handleGET, { limit: 120, windowSec: 60, keyBy: "user", name: "clip-collections:list" });
export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "clip-collections:create" });
