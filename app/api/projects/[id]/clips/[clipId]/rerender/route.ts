import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { requestRerender, rerenderPatchSchema } from "@/lib/autoclip-rerender";

// POST /api/projects/[id]/clips/[clipId]/rerender
// Re-cuts a single already-rendered clip with new in/out points, caption style
// or aspect ratio — without re-running transcription, Gemini or Rekognition
// (all reused from the clip's persisted transcriptJson/cropKeyframes).
//
// Claim/charge/patch/enqueue all live in lib/autoclip-rerender.ts, shared with
// the style and transcript routes so every path that triggers a render is
// billed and rate-limited identically.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const parsed = rerenderPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await requestRerender({
    userId: auth.userId,
    projectId,
    clipId,
    patch: parsed.data,
    reason: "trim",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    status: "queued",
    creditsCharged: result.creditsCharged,
    creditsRemaining: result.creditsRemaining,
  });
}

export const POST = withRateLimit(handlePOST, {
  limit: 20, windowSec: 60, keyBy: "user", name: "auto-clip:rerender",
});
