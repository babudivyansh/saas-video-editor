import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { collectionNameSchema, getOwnedCollection } from "@/lib/clip-collections";

// PATCH  /api/clip-collections/[id] — rename: { name }.
// DELETE /api/clip-collections/[id] — delete the collection. Its clips stay
//                                     in their projects; only the grouping goes.

const renameSchema = z.object({ name: collectionNameSchema }).strict();

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await getOwnedCollection(id, auth.userId))) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  const parsed = renameSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const c = await prisma.clipCollection.update({
    where: { id },
    data: { name: parsed.data.name },
    select: { id: true, name: true },
  });
  return NextResponse.json({ collection: c });
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // deleteMany scoped by userId: ownership and the delete are one statement.
  const { count } = await prisma.clipCollection.deleteMany({ where: { id, userId: auth.userId } });
  if (count === 0) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withRateLimit(handlePATCH, { limit: 40, windowSec: 60, keyBy: "user", name: "clip-collections:rename" });
export const DELETE = withRateLimit(handleDELETE, { limit: 30, windowSec: 60, keyBy: "user", name: "clip-collections:delete" });
