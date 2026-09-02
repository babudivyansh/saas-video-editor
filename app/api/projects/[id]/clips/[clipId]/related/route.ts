import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getClipRelated } from "@/lib/related-content";

// GET /api/projects/[id]/clips/[clipId]/related
//
// Everything the clip workspace's Related tab needs: the source video and
// where this clip sits inside it, the other clips from the same run, and what
// has been made from this clip since (dubs, publishes, editor hand-offs).
//
// Ownership is checked at both levels — project belongs to the caller, clip
// belongs to that project — before anything is read. Checking only the project
// and then querying by clipId is exactly the gap that made another tenant's
// publish and dub rows readable on the sibling routes.
async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clipId: string }> },
) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId }, select: { id: true } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const related = await getClipRelated(clipId, projectId, auth.userId);
  return NextResponse.json({ related });
}

export const GET = withRateLimit(handleGET, {
  limit: 120,
  windowSec: 60,
  keyBy: "user",
  name: "clips:related",
});
