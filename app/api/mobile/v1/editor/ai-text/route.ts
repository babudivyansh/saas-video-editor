import type { NextRequest } from "next/server";
import { aiTextRequest } from "@clipiro/shared";
import { POST as webAiText } from "@/app/api/editor/ai-text/route";
import { addEmojisToText, autoLineBreaks, isLlmOperation, removeFillerWords } from "@/lib/editor/ai-text";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/editor/ai-text { operation, texts, targetLang? } → { texts }.
// The three instant operations run here with the web's own functions. The
// AI ones go through the web route (its prompts, daily fair-use cap): one
// text, one call; several (every caption at once) are sent as one text, a
// line each, and split back — a single call against the cap. If the AI
// doesn't hand back the same number of lines, nothing is changed (422).
export const POST = withMobileAuth(async (req: NextRequest) => {
  const body = await parseBody(req, aiTextRequest);
  if (!body.ok) return body.res;
  const { operation, texts, targetLang } = body.data;

  if (!isLlmOperation(operation)) {
    const fn = operation === "emojis" ? addEmojisToText : operation === "lineBreaks" ? autoLineBreaks : removeFillerWords;
    return mobileJson({ texts: texts.map((t) => fn(t)) });
  }

  // One line per text: a caption's own line breaks would split it in two.
  const lines = texts.map((t) => t.replace(/\s*\n\s*/g, " ").trim());
  const joined = lines.join("\n");
  if (joined.length > 4000) {
    return mobileError(400, "That’s too much text for one go. Select a caption or text on the timeline and run it on that.", { code: "too_long" });
  }
  const r = await callWeb(webAiText, req, { operation, text: joined, targetLang });
  if (r.status >= 400) return webError(r);
  const out = String(r.json.result ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (texts.length === 1) return mobileJson({ texts: [out.join(" ")] });
  if (out.length !== texts.length) {
    return mobileError(422, "The AI didn’t keep one line per caption, so nothing was changed. Try again, or run it on one caption at a time.", { code: "lines_mismatch" });
  }
  return mobileJson({ texts: out });
});
