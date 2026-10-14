import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { parseS3Url } from "@/lib/s3-url";
import { copyS3Object, s3KeyToPublicUrl } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";
import { copyKeyFor } from "@/lib/clip-duplicate";

// POST /api/projects/[id]/clips/[clipId]/duplicate — a second, independent
// copy of a clip in the same project, to edit without losing the original.
//
// The rendered video and thumbnail are COPIED to new keys rather than shared:
// deleting a clip deletes its objects (see ../route.ts DELETE), so a shared key
// would leave the other clip pointing at nothing. Dubs, publishes, caption
// renders and collection memberships belong to the original and stay with it.

async function copyObject(url: string | null, suffix: string): Promise<string | null> {
  if (!url) return null;
  const key = parseS3Url(url)?.key;
  // A URL that isn't one of ours (an external thumbnail) is safe to share:
  // the clip delete only ever removes objects it can parse as S3 keys.
  if (!key) return url;
  const toKey = copyKeyFor(key, suffix);
  await copyS3Object(key, toKey);
  return s3KeyToPublicUrl(toKey);
}

const json = (v: Prisma.JsonValue | null) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const clip = await prisma.clip.findFirst({ where: { id: clipId, projectId, project: { userId: auth.userId } } });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  if (clip.status !== "ready") {
    return NextResponse.json(
      { error: clip.status === "failed" ? "This clip failed to render, so there's nothing to copy." : "This clip is still rendering. Wait for it to finish, then duplicate it." },
      { status: 409 },
    );
  }

  const suffix = randomUUID().slice(0, 8);
  let videoUrl: string | null;
  let thumbnailUrl: string | null;
  try {
    [videoUrl, thumbnailUrl] = await Promise.all([copyObject(clip.videoUrl, suffix), copyObject(clip.thumbnailUrl, suffix)]);
  } catch (e) {
    logger.warn("clips", "clip duplicate copy failed", { clipId, reason: (e as Error).message });
    return NextResponse.json({ error: "Couldn't copy this clip. Try again." }, { status: 502 });
  }

  const last = await prisma.clip.findFirst({ where: { projectId }, orderBy: { index: "desc" }, select: { index: true } });
  const baseTitle = clip.title?.trim() || `Clip ${clip.index + 1}`;

  const copy = await prisma.clip.create({
    data: {
      projectId,
      index: (last?.index ?? clip.index) + 1,
      title: `${baseTitle} (copy)`.slice(0, 200),
      startSec: clip.startSec,
      endSec: clip.endSec,
      durationSec: clip.durationSec,
      aspectRatio: clip.aspectRatio,
      score: clip.score,
      // Carried over, not reset: the first re-render of a clip is free, and a
      // fresh counter would make "duplicate, then re-render" a free re-render.
      rerenderCount: clip.rerenderCount,
      scoreBreakdown: json(clip.scoreBreakdown),
      mood: clip.mood,
      status: "ready",
      progress: 100,
      videoUrl,
      thumbnailUrl,
      transcriptJson: json(clip.transcriptJson),
      captionStyleIndex: clip.captionStyleIndex,
      hasCaptions: clip.hasCaptions,
      cropKeyframes: json(clip.cropKeyframes),
      brollQuery: clip.brollQuery,
      brollUrl: clip.brollUrl,
      brollStartSec: clip.brollStartSec,
      brollEndSec: clip.brollEndSec,
      brollWindows: json(clip.brollWindows),
      subtitleStyleOverride: json(clip.subtitleStyleOverride),
      silenceSettings: json(clip.silenceSettings),
      signalTrack: json(clip.signalTrack),
      liteEdits: json(clip.liteEdits),
      audioPeaks: json(clip.audioPeaks),
      renderTarget: clip.renderTarget,
      sourceAssetId: clip.sourceAssetId,
    },
    select: { id: true, index: true, title: true },
  });

  return NextResponse.json({ clip: copy }, { status: 201 });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "clips:duplicate" });
