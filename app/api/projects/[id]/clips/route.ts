import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";

// Poll target for the Auto Clip results grid: the project status + every clip
// with its live status/progress, sorted by virality score (highest first).
//
// `?clipId=` additionally returns that one clip's heavy editing payload
// (transcriptJson). The Clip Studio drawer needs it, but the grid polls this
// endpoint every 2.5s until the project finishes — putting a full word-level
// transcript for every clip in that response would multiply the poll by
// hundreds of KB for data only one open drawer can use.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: auth.userId },
    select: {
      id: true, status: true, warnings: true, failureReason: true,
      autoClipCaptionStyle: true, uploadedVideoUrl: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clips = await prisma.clip.findMany({
    where: { projectId: id },
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { index: "asc" }],
    select: {
      id: true, index: true, title: true, startSec: true, endSec: true, durationSec: true,
      aspectRatio: true, score: true, scoreBreakdown: true, mood: true, status: true, progress: true,
      videoUrl: true, thumbnailUrl: true, hasCaptions: true, captionStyleIndex: true, brollQuery: true,
      // Small settings blobs the drawer needs to show the clip's CURRENT style
      // and camera options rather than silently falling back to defaults.
      subtitleStyleOverride: true, silenceSettings: true, rerenderCount: true,
      // Lite-editor state and the waveform the scrubber draws. Peaks are ~300
      // small numbers per clip — an order of magnitude smaller than the
      // transcript, which stays behind the ?clipId= detail fetch.
      liteEdits: true, audioPeaks: true,
    },
  });

  const clipId = new URL(req.url).searchParams.get("clipId");
  const detail = clipId
    ? await prisma.clip.findFirst({
        where: { id: clipId, projectId: id },
        select: { id: true, transcriptJson: true },
      })
    : null;

  return NextResponse.json({
    project: {
      status: project.status,
      warnings: project.warnings,
      failureReason: project.failureReason,
      captionStyleIndex: project.autoClipCaptionStyle,
      uploadedVideoUrl: project.uploadedVideoUrl,
    },
    clips,
    ...(detail ? { detail } : {}),
  });
}

// The results page polls this every 2.5s while a project is rendering, so the
// limit sits well above that cadence — high enough that normal polling never
// trips it, low enough that it is no longer an unbounded read. It was the only
// clip route with no limit at all, which made it both an abuse and a cost
// vector on the busiest endpoint in the feature.
export const GET = withRateLimit(handleGET, {
  limit: 240,
  windowSec: 60,
  keyBy: "user",
  name: "auto-clip:poll",
});
