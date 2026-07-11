import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";

function resolveDisplayName(modelId: string | null, toolSlug: string): string {
  if (modelId) {
    const found = IMAGE_MODELS.find(m => m.id === modelId) ?? VIDEO_MODELS.find(m => m.id === modelId);
    if (found) return found.displayName;
  }
  return toolSlug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// Cursor-paginated generation history — this is what fixes the old "−1 credit"
// display bug (the credits page hardcoded that string regardless of the
// tool's real cost); callers should read `creditsCost`/`status` per row.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));
  const cursor = req.nextUrl.searchParams.get("cursor");

  const rows = await prisma.generation.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      toolSlug: true,
      modelId: true,
      generationType: true,
      creditsCost: true,
      status: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const generations = page.map(g => ({
    ...g,
    displayName: resolveDisplayName(g.modelId, g.toolSlug),
  }));

  return NextResponse.json({
    generations,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
