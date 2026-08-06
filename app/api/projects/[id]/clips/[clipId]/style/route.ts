import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
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
  subtitleStyleOverride: subtitleStyleOverrideSchema.optional(),
  silenceSettings: silenceSettingsSchema.optional(),
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
    patch: parsed.data,
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
