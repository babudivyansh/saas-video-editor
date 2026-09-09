import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/flags";
import { generateHookCandidates, MAX_HOOK_CHARS } from "@/lib/captions/hooks";
import type { WordTiming } from "@/utils/elevenlabs";

/**
 * AI hook-title suggestions for a clip.
 *
 * Free (no credit charge): it is one small Gemini text call over a transcript
 * we already have, the same basis on which brainstormer and the social AI
 * helpers are priced at 0-1 credits. Rate limited instead, so it can't be used
 * as an unmetered text generator.
 *
 * Returns suggestions only — nothing is applied. The user picks or edits one
 * and passes it to the render route, because a confidently wrong hook burned
 * into a video is worse than no hook.
 */
const handler = withApi<{ id: string; clipId: string }>(async (_req, { auth, params }) => {
  if (!(await isFeatureEnabled("submagic_hooks", true))) {
    return NextResponse.json({ candidates: [], maxChars: MAX_HOOK_CHARS });
  }

  const clip = await prisma.clip.findFirst({
    where: { id: params.clipId, project: { userId: auth.userId } },
    select: { transcriptJson: true, title: true },
  });
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const words = (clip.transcriptJson as unknown as WordTiming[] | null) ?? [];
  const candidates = await generateHookCandidates(words, { title: clip.title });

  // [] is a normal outcome (no transcript, Gemini unconfigured, model failure)
  // and the client renders a manual text box for it — never an error toast.
  return NextResponse.json({ candidates, maxChars: MAX_HOOK_CHARS });
});

export const POST = withRateLimit(handler, {
  limit: 20,
  windowSec: 60,
  keyBy: "user",
  name: "captions:hooks",
});
