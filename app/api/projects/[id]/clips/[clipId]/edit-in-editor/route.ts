import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";
import { parseS3Url } from "@/lib/s3-url";
import { adoptExistingS3Object } from "@/lib/asset-service";
import { serializeOneAsset } from "@/lib/asset-serialize";
import type { TimelineDoc, VideoClip, Aspect } from "@/lib/editor/types";
import { wordsToCaptionCues } from "@/lib/editor/caption-generation";
import type { WordTiming } from "@/utils/elevenlabs";

// POST /api/projects/[id]/clips/[clipId]/edit-in-editor
// Bridges a rendered AutoClip clip into the full manual timeline editor
// (P2.1): adopts the clip's rendered video as an Asset (no re-upload — it's
// already in S3), then seeds a fresh productType:"editor" Project with one
// VideoClip pointing at it. Returns the new project id so the client can
// redirect to /dashboard/editor?projectId=<id>.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
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

  // Adopt through the shared service rather than creating the row by hand.
  // The hand-rolled create bypassed dedup, so hitting "Advanced editor" twice
  // on the same clip produced a second Asset row for the same S3 object —
  // double-counted against the user's storage quota, and shown twice in their
  // library. adoptExistingS3Object dedups on (userId, s3Key) and records the
  // provenance the raw create never set.
  const { asset } = await adoptExistingS3Object({
    userId: auth.userId,
    s3Key: loc.key,
    mimeType: "video/mp4",
    name: clip.title || `AutoClip ${clip.index + 1}`,
    duration: clip.durationSec,
    sourceFeature: "autoclip",
    sourceProjectId: projectId,
    sourceClipId: clip.id,
    // Already moderated on the way in as the project's source; the render is
    // derived from bytes this user already passed through moderation.
    skipModeration: true,
  });

  const aspect: Aspect = (["9:16", "1:1", "16:9"] as Aspect[]).includes(clip.aspectRatio as Aspect)
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
  // The stored transcript is on the clip's source window; the editor lays
  // captions over the RENDERED file, which trimming may have shortened.
  //
  // The transcript arrives as caption cues (not text clips, as it used to),
  // so the Captions panel, transcript editing and filler-word cuts work on it.
  // They arrive HIDDEN: when the AutoClip render has captions, they are
  // already burned into the video's pixels, and visible cues on top showed
  // every line twice. Unhiding them is the user's choice.
  const captionCues = clip.transcriptJson
    ? wordsToCaptionCues(
        (await import("@/lib/autoclip-pipeline")).wordsOnRenderedTimeline(
          clip.transcriptJson as unknown as WordTiming[], clip.endSec - clip.startSec, clip.silenceSettings,
        ),
        videoClip,
      ).map((cue) => ({ ...cue, hidden: true }))
    : [];
  const editorDoc: TimelineDoc = {
    version: 1,
    aspect,
    fps: 30,
    tracks: { video: [videoClip], text: [], audio: [], image: [], caption: captionCues, overlay: [] },
  };

  const editorProject = await prisma.project.create({
    data: {
      userId: auth.userId,
      title: clip.title || `AutoClip ${clip.index + 1} (editing)`,
      productType: "editor",
      editorDoc: editorDoc as unknown as object,
      status: "draft",
      sourceAssetId: asset.id,
    },
  });

  // Return the created asset too — the editor's MediaPanel keeps a
  // client-side cache shared across all its panels/PreviewStage (see its
  // registerAsset() doc comment) that only refreshes on its own fetch. A
  // brand-new asset created here server-side is invisible to that cache
  // until the client explicitly registers it, otherwise PreviewStage's
  // <video src={...}> resolves to "" on first mount (React console error,
  // and no visible video) until a manual reload.
  return NextResponse.json({ editorProjectId: editorProject.id, asset: await serializeOneAsset(asset) });
}

// Every call creates a new editor project and adopts an asset, so it was an
// unbounded write — the only paid-adjacent clip route with no limit at all.
export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "auto-clip:edit-in-editor" });
