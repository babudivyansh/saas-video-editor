import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sanitizeCaptionWord } from "@/lib/caption-sanitize";
import { MAX_CAPTION_WORDS } from "@/lib/captions/words";
import { serializeCaptionRenderJob } from "@/lib/captions/serialize";
import type { Prisma } from "@prisma/client";

// Bounds mirror transcriptSchema in lib/autoclip-rerender.ts. Every word here
// ends up in an ASS subtitle file if the render falls back to native captions,
// so the same limits apply: an unbounded array is an unbounded write, and
// unsanitized text can inject libass drawing commands.
const bodySchema = z
  .object({
    transcript: z
      .array(
        z
          .object({
            word: z.string().max(200),
            start: z.number().min(0).max(24 * 3600 * 1000),
            end: z.number().min(0).max(24 * 3600 * 1000),
            speaker: z.string().max(64).optional(),
          })
          .strict(),
      )
      .max(MAX_CAPTION_WORDS),
  })
  .strict();

/**
 * Saves user caption edits.
 *
 * THE ORDER HERE IS THE POINT (§12): Clipiro's transcript is written FIRST and
 * unconditionally. The provider is only told about it later, at export time,
 * from the stored value. So a provider outage, a rejected update, or a rate
 * limit can never lose a user's edit — the worst case is that the premium
 * render is delayed or falls back to native captions, with the corrected text
 * intact either way.
 *
 * Bumping captionRevision is what makes the next render a legitimately
 * different job under the idempotency key, so an edit can be re-rendered while
 * a double-click still cannot.
 */
export const PUT = withApi<{ id: string }>(async (req, { auth, params }) => {
  const { transcript } = await parseBody(req, bodySchema);

  const job = await prisma.captionRenderJob.findFirst({
    where: { id: params.id, clip: { project: { userId: auth.userId } } },
    include: { clip: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json(
      { error: "This render has already finished. Start a new one to change the captions." },
      { status: 409 },
    );
  }

  // speaker is carried through deliberately: a .strict() schema that omitted it
  // once destroyed diarization on every transcript edit, permanently, because
  // the edit overwrites the stored value.
  const words = transcript.map((w) => ({
    word: sanitizeCaptionWord(w.word),
    start: Math.round(w.start),
    end: Math.round(Math.max(w.start, w.end)),
    ...(w.speaker ? { speaker: w.speaker } : {}),
  }));

  const updated = await prisma.$transaction(async (tx) => {
    await tx.clip.update({
      where: { id: job.clipId },
      data: { transcriptJson: words as unknown as Prisma.InputJsonValue },
    });
    return tx.captionRenderJob.update({
      where: { id: job.id },
      data: {
        captionRevision: { increment: 1 },
        // Only move to "editing" from a state that's actually waiting for the
        // user — never drag a job backwards out of an in-flight render.
        ...(job.status === "ready_to_edit" ? { status: "editing" } : {}),
      },
    });
  });

  logger.info("caption-render", `transcript updated for ${job.id} (${words.length} words)`);

  return NextResponse.json({ job: serializeCaptionRenderJob(updated), words: words.length });
});
