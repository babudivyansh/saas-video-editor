import { NextRequest, NextResponse } from "next/server";
import { getApiKeyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// Public API — GET /api/v1/clips/{id}: single clip detail + download URL.
// Ownership is scoped through the clip's parent project (Clip has no
// userId of its own — same pattern as every internal clip route).
async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiKeyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized — missing or invalid API key" }, { status: 401 });
  const { id } = await params;

  const clip = await prisma.clip.findFirst({
    where: { id, project: { userId: auth.userId } },
    select: {
      id: true, projectId: true, index: true, title: true, startSec: true, endSec: true, durationSec: true,
      aspectRatio: true, score: true, mood: true, status: true, progress: true,
      videoUrl: true, thumbnailUrl: true, hasCaptions: true,
    },
  });
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ clip });
}

export const GET = withRateLimit(handleGET, { limit: 120, windowSec: 60, keyBy: "apiKey", name: "v1:clips:detail" });
