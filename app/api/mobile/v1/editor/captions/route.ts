import type { NextRequest } from "next/server";
import { captionsRequest } from "@clipiro/shared";
import { POST as webCaptions } from "@/app/api/editor/captions/route";
import { callWeb, mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/editor/captions { assetId, languageCode? } → { words,
// minutesCharged, minutesRemaining }: word timings (source-time ms) for one
// video in the caller's Assets. Wraps the web route: its price (Clip Minutes,
// 1 per started minute of the whole file), refund on failure, and limits. A
// shortfall is a 402 with code insufficient_minutes and the numbers.
export const POST = withMobileAuth(async (req: NextRequest) => {
  const body = await parseBody(req, captionsRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webCaptions, req, body.data);
  if (r.status >= 400) {
    const extra: Record<string, unknown> = {};
    for (const k of ["code", "required", "balance"]) if (r.json[k] !== undefined) extra[k] = r.json[k];
    // The web's "transcription unavailable" answer keeps its readable line in `message`.
    const msg = typeof r.json.message === "string" ? r.json.message : typeof r.json.error === "string" ? r.json.error : "Couldn’t make captions. Try again.";
    return mobileError(r.status, msg, extra);
  }
  return mobileJson({ words: r.json.words ?? [], minutesCharged: r.json.minutesCharged ?? 0, minutesRemaining: r.json.minutesRemaining ?? 0 });
});
