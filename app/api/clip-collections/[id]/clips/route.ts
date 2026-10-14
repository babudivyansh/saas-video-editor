import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { clipViewSelect, toClipView } from "@/lib/clip-view-query";
import { FAVORITES_ID, clipIdsSchema, getOwnedCollection, ownedClipIds } from "@/lib/clip-collections";

// GET    /api/clip-collections/[id]/clips — the collection's clips, newest
//        addition first, in the same shape as a project's clips page.
//        [id] = "favorites" lists every hearted clip.
// POST   /api/clip-collections/[id]/clips — add: { clipIds }.
// DELETE /api/clip-collections/[id]/clips — remove: { clipIds }.
//
// Clips have no userId of their own: every clip id from the client is checked
// against the caller's projects before it is read, added or removed.

const MAX_LISTED = 500;

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const wantExcerpts = new URL(req.url).searchParams.get("excerpts") === "1";
  const select = clipViewSelect(wantExcerpts);

  if (id === FAVORITES_ID) {
    const rows = await prisma.clip.findMany({
      where: { isFavorite: true, project: { userId: auth.userId } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: MAX_LISTED,
      select,
    });
    return NextResponse.json({
      collection: { id: FAVORITES_ID, name: "Favorites", builtIn: true },
      clips: rows.map((r) => toClipView(r, wantExcerpts)),
    });
  }

  const collection = await getOwnedCollection(id, auth.userId);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const items = await prisma.clipCollectionItem.findMany({
    // The project check is belt and braces: items are only ever added for the
    // owner's clips, but a read should not depend on that having held.
    where: { collectionId: id, clip: { project: { userId: auth.userId } } },
    orderBy: [{ addedAt: "desc" }, { clipId: "asc" }],
    take: MAX_LISTED,
    select: { clip: { select } },
  });
  return NextResponse.json({
    collection: { ...collection, builtIn: false },
    clips: items.map((i) => toClipView(i.clip, wantExcerpts)),
  });
}

async function readTarget(req: NextRequest, id: string, userId: string) {
  if (id === FAVORITES_ID) {
    return { ok: false as const, error: NextResponse.json({ error: "Use the heart on a clip to change Favorites." }, { status: 400 }) };
  }
  if (!(await getOwnedCollection(id, userId))) {
    return { ok: false as const, error: NextResponse.json({ error: "Collection not found" }, { status: 404 }) };
  }
  const parsed = clipIdsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return { ok: false as const, error: NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 }) };
  }
  const clipIds = await ownedClipIds(parsed.data.clipIds, userId);
  if (clipIds.length === 0) {
    return { ok: false as const, error: NextResponse.json({ error: "Clip not found" }, { status: 404 }) };
  }
  return { ok: true as const, clipIds };
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const target = await readTarget(req, id, auth.userId);
  if (!target.ok) return target.error;

  const { count } = await prisma.clipCollectionItem.createMany({
    data: target.clipIds.map((clipId) => ({ collectionId: id, clipId })),
    // Adding a clip that's already there is a no-op, not an error.
    skipDuplicates: true,
  });
  await prisma.clipCollection.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ added: count });
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const target = await readTarget(req, id, auth.userId);
  if (!target.ok) return target.error;

  const { count } = await prisma.clipCollectionItem.deleteMany({
    where: { collectionId: id, clipId: { in: target.clipIds } },
  });
  return NextResponse.json({ removed: count });
}

export const GET = withRateLimit(handleGET, { limit: 240, windowSec: 60, keyBy: "user", name: "clip-collections:clips" });
export const POST = withRateLimit(handlePOST, { limit: 60, windowSec: 60, keyBy: "user", name: "clip-collections:add" });
export const DELETE = withRateLimit(handleDELETE, { limit: 60, windowSec: 60, keyBy: "user", name: "clip-collections:remove" });
