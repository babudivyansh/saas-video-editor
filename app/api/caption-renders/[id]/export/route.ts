import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";
import { claimAndEnqueueExport } from "@/lib/caption-render-job";
import { serializeCaptionRenderJob } from "@/lib/captions/serialize";

/**
 * Triggers the final render.
 *
 * The user explicitly asks for this — nothing renders on its own, because the
 * project was created with auto-render off precisely so captions could be
 * reviewed first (§12/§16).
 *
 * Double-click safety is NOT in this handler: claimAndEnqueueExport does an
 * atomic status transition, so of two simultaneous requests exactly one claims
 * the job and the other gets `claimed: false`. A read-then-write check here
 * would be a stale snapshot and would let both through.
 */
const handler = withApi<{ id: string }>(async (_req, { auth, params }) => {
  const job = await prisma.captionRenderJob.findFirst({
    where: { id: params.id, clip: { project: { userId: auth.userId } } },
    include: { clip: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const claimed = await claimAndEnqueueExport(job);
  if (!claimed) {
    // Already exporting, already finished, or still transcribing. Not an error
    // — return current state and let the client keep polling.
    const fresh = await prisma.captionRenderJob.findUnique({ where: { id: job.id } });
    return NextResponse.json(
      { started: false, job: fresh ? serializeCaptionRenderJob(fresh) : null },
      { status: 200 },
    );
  }

  const fresh = await prisma.captionRenderJob.findUnique({ where: { id: job.id } });
  return NextResponse.json({ started: true, job: fresh ? serializeCaptionRenderJob(fresh) : null });
});

export const POST = withRateLimit(handler, {
  limit: 30,
  windowSec: 60,
  keyBy: "user",
  name: "captions:export",
});
