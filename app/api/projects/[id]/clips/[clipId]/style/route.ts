import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import {
  requestRerender, subtitleStyleOverrideSchema, silenceSettingsSchema,
} from "@/lib/autoclip-rerender";

// PUT /api/projects/[id]/clips/[clipId]/style
// Applies subtitle styling and/or camera+trimming settings to one clip and
// re-renders it.
//
// This used to enqueue a render with no charge, no rerenderCount increment and
// no rate limit — an unlimited free render button. It now goes through the same
// requestRerender path as every other trigger, so the first re-render of a clip
// is free and subsequent ones are billed. Both payload halves are validated:
// they end up in an ASS subtitle header and an ffmpeg filtergraph respectively.
const bodySchema = z.object({
  // -1 disables burned-in captions; a >=0 index selects a caption style. Lets
  // the Studio drawer re-enable captions on a clip that was picked with them
  // off, instead of forcing a full re-analysis (applyPatch derives hasCaptions).
  captionStyleIndex: z.number().int().min(-1).max(64).optional(),
  subtitleStyleOverride: subtitleStyleOverrideSchema.optional(),
  silenceSettings: silenceSettingsSchema.optional(),
  /**
   * false = save the style on the clip WITHOUT re-rendering (or charging).
   * This is what "Apply to all" sends for the sibling clips: it promised to
   * copy the style only, but every sibling went through requestRerender and
   * was charged a paid re-render after its free one, with the 402s hidden.
   */
  render: z.boolean().optional(),
}).strict();

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  if (parsed.data.render === false) {
    // Style only — merged exactly like requestRerender merges it, so the next
    // real render of this clip picks it up.
    const clip = await prisma.clip.findFirst({
      where: { id: clipId, projectId, project: { userId: auth.userId } },
      select: { id: true, subtitleStyleOverride: true },
    });
    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    if (!parsed.data.subtitleStyleOverride) {
      return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    }
    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        subtitleStyleOverride: {
          ...((clip.subtitleStyleOverride as Record<string, unknown>) ?? {}),
          ...parsed.data.subtitleStyleOverride,
        } as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ status: "saved", creditsCharged: 0 });
  }

  const { render: _render, ...patch } = parsed.data;
  void _render;
  const result = await requestRerender({
    userId: auth.userId,
    projectId,
    clipId,
    patch,
    reason: "style",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    status: "queued",
    creditsCharged: result.creditsCharged,
    creditsRemaining: result.creditsRemaining,
  });
}

export const PUT = withRateLimit(handlePUT, {
  limit: 20, windowSec: 60, keyBy: "user", name: "auto-clip:style",
});
