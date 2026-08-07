import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { requestRerender } from "@/lib/autoclip-rerender";
import { liteEditsSchema } from "@/lib/autoclip-lite";

// PUT /api/projects/[id]/clips/[clipId]/lite
// Applies the inline editor's adjustments — speed, music bed, fades, B-roll
// swap — and re-renders the clip.
//
// The whole lite-edit state arrives in ONE request on purpose. Each knob
// autosaving separately would mean a render (and a charge) per knob; batching
// them into a single explicit "Apply" keeps it to one of each, which is both
// cheaper for the user and far less queue pressure.
const bodySchema = z.object({
  liteEdits: liteEditsSchema,
  /** Trim can be adjusted in the same Apply. */
  startSec: z.number().min(0).max(24 * 3600).optional(),
  endSec: z.number().min(0).max(24 * 3600).optional(),
}).strict();

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await requestRerender({
    userId: auth.userId,
    projectId,
    clipId,
    patch: {
      liteEdits: parsed.data.liteEdits,
      ...(parsed.data.startSec !== undefined ? { startSec: parsed.data.startSec } : {}),
      ...(parsed.data.endSec !== undefined ? { endSec: parsed.data.endSec } : {}),
    },
    reason: "lite",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    status: "queued",
    creditsCharged: result.creditsCharged,
    creditsRemaining: result.creditsRemaining,
  });
}

export const PUT = withRateLimit(handlePUT, {
  limit: 20, windowSec: 60, keyBy: "user", name: "auto-clip:lite",
});
