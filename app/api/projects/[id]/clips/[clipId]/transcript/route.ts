import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { requestRerender, transcriptSchema } from "@/lib/autoclip-rerender";

// PUT /api/projects/[id]/clips/[clipId]/transcript
// Saves user corrections to a clip's word-level transcript and re-renders so
// the burned-in captions pick them up.
//
// Like the style route, this previously rendered for free with an unbounded,
// unvalidated payload — the words go straight into an ASS Dialogue line, where
// `{`, `\` and newlines are markup. requestRerender sanitises and bills it.
const bodySchema = z.object({ transcript: transcriptSchema }).strict();

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid transcript" }, { status: 400 });
  }

  const result = await requestRerender({
    userId: auth.userId,
    projectId,
    clipId,
    patch: { transcript: parsed.data.transcript },
    reason: "transcript",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    status: "queued",
    creditsCharged: result.creditsCharged,
    creditsRemaining: result.creditsRemaining,
  });
}

export const PUT = withRateLimit(handlePUT, {
  limit: 20, windowSec: 60, keyBy: "user", name: "auto-clip:transcript",
});
