import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { clipDeleteBlocker, deleteClipAndMedia } from "@/lib/clip-delete";

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
    isDisliked: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.isFavorite !== undefined || v.isDisliked !== undefined, {
    message: "Nothing to update",
  })
  .refine((v) => !(v.isFavorite === true && v.isDisliked === true), {
    message: "A clip can't be both favorited and disliked",
  });

/** Heart and thumbs-down are one choice: turning either on turns the other off. */
function feedbackData(v: z.infer<typeof patchSchema>) {
  const data: { title?: string; isFavorite?: boolean; isDisliked?: boolean } = { ...v };
  if (v.isFavorite === true) data.isDisliked = false;
  if (v.isDisliked === true) data.isFavorite = false;
  return data;
}

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
    data: feedbackData(parsed.data),
    select: { id: true, title: true, isFavorite: true, isDisliked: true },
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

  const blocker = await clipDeleteBlocker(clip);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });

  await deleteClipAndMedia(clip, auth.userId);

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
