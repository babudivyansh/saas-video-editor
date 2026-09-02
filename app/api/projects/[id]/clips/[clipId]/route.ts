import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { parseS3Url } from "@/lib/s3-url";
import { deleteS3Object } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

// PATCH / DELETE for a single clip.
//
// Neither existed. A user could re-render, dub, translate and publish a clip
// but could not rename one or throw one away — the only way to remove a bad
// clip was to delete the entire project, taking the good clips with it.

/** Ownership: the project must be the caller's AND the clip must be in it. */
async function getOwnedClip(projectId: string, clipId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return null;
  return prisma.clip.findFirst({
    where: { id: clipId, projectId },
    select: { id: true, videoUrl: true, thumbnailUrl: true, status: true },
  });
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    isFavorite: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.isFavorite !== undefined, {
    message: "Nothing to update",
  });

async function handlePATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clipId: string }> },
) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const clip = await getOwnedClip(projectId, clipId, auth.userId);
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Renaming is metadata only — deliberately NOT a re-render. The title is
  // never burned into the video, so charging a render for it would be absurd.
  const updated = await prisma.clip.update({
    where: { id: clipId },
    data: parsed.data,
    select: { id: true, title: true, isFavorite: true },
  });

  return NextResponse.json({ clip: updated });
}

async function handleDELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clipId: string }> },
) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const clip = await getOwnedClip(projectId, clipId, auth.userId);
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  // A clip mid-render has a worker writing to it; deleting the row underneath
  // that produces a confusing "record not found" crash in the queue rather
  // than a clean cancellation, which isn't built yet.
  if (clip.status === "rendering") {
    return NextResponse.json(
      { error: "This clip is still rendering. Wait for it to finish, then delete it." },
      { status: 409 },
    );
  }

  // The rendered mp4 may since have been adopted into the asset library. If it
  // has, the Asset owns those bytes now and its own delete/retention flow is
  // responsible for them — removing the object here would leave the user with
  // a library entry pointing at nothing. Only clean up storage that nothing
  // else references.
  const objectKeys = [clip.videoUrl, clip.thumbnailUrl]
    .map((url) => (url ? parseS3Url(url)?.key ?? null : null))
    .filter((k): k is string => k !== null);

  const referenced = objectKeys.length
    ? await prisma.asset.findMany({
        where: { userId: auth.userId, s3Key: { in: objectKeys } },
        select: { s3Key: true },
      })
    : [];
  const referencedKeys = new Set(referenced.map((a) => a.s3Key));

  await prisma.clip.delete({ where: { id: clipId } });

  // After the row is gone — an orphaned object is recoverable by the cleanup
  // cron, whereas a deleted object with a live row is a broken clip.
  for (const key of objectKeys) {
    if (referencedKeys.has(key)) continue;
    await deleteS3Object(key).catch((e) => {
      logger.warn("clips", "clip object cleanup failed", { key, reason: (e as Error).message });
    });
  }

  return NextResponse.json({ ok: true });
}

export const PATCH = withRateLimit(handlePATCH, {
  limit: 40,
  windowSec: 60,
  keyBy: "user",
  name: "clips:patch",
});
export const DELETE = withRateLimit(handleDELETE, {
  limit: 30,
  windowSec: 60,
  keyBy: "user",
  name: "clips:delete",
});
