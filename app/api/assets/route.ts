import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Inline stats (avoids /stats sub-route conflicting with /[id] dynamic route)
  if (searchParams.get("stats") === "true") {
    const rows = await prisma.asset.findMany({
      where: { userId: auth.userId },
      select: { kind: true, size: true },
    });
    const totalSize = rows.reduce((s, a) => s + a.size, 0);
    const count = rows.length;
    const byKind = { video: 0, audio: 0, image: 0 };
    for (const a of rows) {
      if (a.kind === "video") byKind.video++;
      else if (a.kind === "audio") byKind.audio++;
      else byKind.image++;
    }
    return NextResponse.json({ totalSize, count, byKind });
  }

  const kind = searchParams.get("kind") ?? "all";
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "date";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const cursor = searchParams.get("cursor") ?? undefined;

  const orderBy =
    sort === "name" ? { name: "asc" as const } :
    sort === "size" ? { size: "desc" as const } :
    sort === "oldest" ? { createdAt: "asc" as const } :
    { createdAt: "desc" as const };

  const assets = await prisma.asset.findMany({
    where: {
      userId: auth.userId,
      ...(kind !== "all" ? { kind } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = assets.length > limit;
  const items = hasMore ? assets.slice(0, limit) : assets;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ assets: items, nextCursor });
}
