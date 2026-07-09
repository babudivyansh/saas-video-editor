import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseS3Url } from "@/lib/reframe";
import { getS3ObjectSize } from "@/utils/s3-upload";
import type { TimelineDoc, VideoClip, TextClip, Aspect } from "@/lib/editor/types";
import type { WordTiming } from "@/utils/elevenlabs";

// Mirrors app/dashboard/editor/components/properties/VideoClipProps.tsx's
// wordsToCaptionClips exactly (same grouping/styling convention) so a clip
// handed off here looks identical to running the editor's own "Auto
// captions" — except it reuses the transcript AutoClip already has instead
// of re-transcribing (which is what VideoClipProps does when there's no
// pre-existing transcript to hand off).
const CAPTION_WORDS_PER_LINE = 4;
function wordsToCaptionClips(words: WordTiming[]): TextClip[] {
  const clips: TextClip[] = [];
  for (let i = 0; i < words.length; i += CAPTION_WORDS_PER_LINE) {
    const group = words.slice(i, i + CAPTION_WORDS_PER_LINE);
    const startSec = group[0].start / 1000;
    const endSec = group[group.length - 1].end / 1000;
    clips.push({
      type: "text",
      id: randomUUID(),
      timelineStart: startSec,
      duration: Math.max(endSec - startSec, 0.2),
      text: group.map((w) => w.word).join(" "),
      fontFamily: "Arial",
      fontSizePct: 0.04,
      color: "#ffffff",
      bold: true,
      align: "center",
      x: 0.5,
      y: 0.85,
      bgColor: "#000000",
    });
  }
  return clips;
}

// POST /api/projects/[id]/clips/[clipId]/edit-in-editor
// Bridges a rendered AutoClip clip into the full manual timeline editor
// (P2.1): adopts the clip's rendered video as an Asset (no re-upload — it's
// already in S3), then seeds a fresh productType:"editor" Project with one
// VideoClip pointing at it. Returns the new project id so the client can
// redirect to /dashboard/editor?projectId=<id>.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (clip.status !== "ready" || !clip.videoUrl) {
    return NextResponse.json({ error: "Clip must finish rendering first" }, { status: 409 });
  }

  const loc = parseS3Url(clip.videoUrl);
  if (!loc) return NextResponse.json({ error: "Could not resolve clip's storage location" }, { status: 500 });

  const size = await getS3ObjectSize(loc.key).catch(() => 0);
  const asset = await prisma.asset.create({
    data: {
      userId: auth.userId,
      name: clip.title || `AutoClip ${clip.index + 1}`,
      s3Key: loc.key,
      url: clip.videoUrl,
      mimeType: "video/mp4",
      kind: "video",
      size,
      duration: clip.durationSec,
    },
  });

  const aspect: Aspect = (["9:16", "1:1", "16:9"] as const).includes(clip.aspectRatio as Aspect)
    ? (clip.aspectRatio as Aspect)
    : "9:16";
  const videoClip: VideoClip = {
    id: randomUUID(),
    type: "video",
    timelineStart: 0,
    duration: clip.durationSec,
    assetId: asset.id,
    srcIn: 0,
    volume: 1,
    muted: false,
  };
  const textClips = clip.hasCaptions && clip.transcriptJson
    ? wordsToCaptionClips(clip.transcriptJson as unknown as WordTiming[])
    : [];
  const editorDoc: TimelineDoc = {
    version: 1,
    aspect,
    fps: 30,
    tracks: { video: [videoClip], text: textClips, audio: [], image: [] },
  };

  const editorProject = await prisma.project.create({
    data: {
      userId: auth.userId,
      title: clip.title || `AutoClip ${clip.index + 1} (editing)`,
      productType: "editor",
      editorDoc: editorDoc as unknown as object,
      status: "draft",
    },
  });

  // Return the created asset too — the editor's MediaPanel keeps a
  // client-side cache shared across all its panels/PreviewStage (see its
  // registerAsset() doc comment) that only refreshes on its own fetch. A
  // brand-new asset created here server-side is invisible to that cache
  // until the client explicitly registers it, otherwise PreviewStage's
  // <video src={...}> resolves to "" on first mount (React console error,
  // and no visible video) until a manual reload.
  return NextResponse.json({ editorProjectId: editorProject.id, asset });
}
