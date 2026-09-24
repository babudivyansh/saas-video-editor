import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { requestRerender } from "@/lib/autoclip-rerender";
import { translateTranscript, isSupportedCaptionLanguage } from "@/lib/caption-translate";
import { CAPTION_LANGUAGES } from "@/lib/languages";
import { logger } from "@/lib/logger";
import type { WordTiming } from "@/utils/elevenlabs";

// GET  → the languages captions can be translated into.
// POST → translate this clip's captions and re-render with them.
//
// Translation used to be reachable only as a side effect of dubbing, so
// getting Spanish subtitles meant paying for a Spanish voice track you didn't
// want. This is the captions-only path.

const bodySchema = z.object({
  targetLang: z.string().min(2).max(8),
  /**
   * Accepted for compatibility and ignored. It stashed the source transcript
   * inside liteEdits, which nothing ever read back — and liteEdits is a STRICT
   * schema, so the unknown key made every later parse fail and silently
   * dropped the clip's speed, music and fades on its next render.
   */
  keepOriginal: z.boolean().optional(),
}).strict();

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ languages: CAPTION_LANGUAGES });
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string; clipId: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, clipId } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { targetLang } = parsed.data;
  if (!isSupportedCaptionLanguage(targetLang)) {
    return NextResponse.json({ error: "That language isn't supported for captions yet" }, { status: 400 });
  }

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, project: { id: projectId, userId: auth.userId } },
    select: { id: true, transcriptJson: true, status: true },
  });
  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  // Checked BEFORE the model call. requestRerender's claim below is still the
  // real guard, but a busy clip used to get a free Gemini translation and then
  // a 409 — an unmetered translator, one click at a time.
  if (clip.status === "queued" || clip.status === "rendering") {
    return NextResponse.json({ error: "This clip is already rendering — try again when it finishes." }, { status: 409 });
  }

  const words = (clip.transcriptJson as unknown as WordTiming[] | null) ?? [];
  if (words.length === 0) {
    return NextResponse.json(
      { error: "This clip has no transcript to translate — captions were off, or transcription didn't succeed." },
      { status: 400 },
    );
  }

  let translated: WordTiming[];
  try {
    translated = await translateTranscript(words, targetLang);
  } catch (err) {
    logger.error("caption-translate", `translation failed for clip ${clipId}`, err);
    return NextResponse.json({ error: "Translation failed — please try again" }, { status: 503 });
  }

  // Goes through the shared re-render path, so it claims, charges and
  // rate-limits exactly like every other trigger.
  const result = await requestRerender({
    userId: auth.userId,
    projectId,
    clipId,
    patch: { transcript: translated },
    reason: `translate:${targetLang}`,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    status: "queued",
    targetLang,
    words: translated.length,
    creditsCharged: result.creditsCharged,
    creditsRemaining: result.creditsRemaining,
  });
}

export const POST = withRateLimit(handlePOST, {
  limit: 10, windowSec: 60, keyBy: "user", name: "auto-clip:translate",
});
