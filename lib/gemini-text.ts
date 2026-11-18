// Reading text out of a @google/generative-ai response, with Gemini's safety
// refusals told apart from real failures.
//
// `result.response.text()` THROWS when Gemini blocked the prompt or the answer
// ("[GoogleGenerativeAI Error]: Text not available. Response was blocked due
// to PROHIBITED_CONTENT"). /api/tools/enhance-prompt had no try/catch at all,
// so a blocked prompt was an unhandled 500 in Sentry (CLIPIRO-WEB-13); the
// editor AI routes and the brainstormer caught it but logged it as an error
// and told the user to "try again", which can never help.

import type { GenerateContentResult } from "@google/generative-ai";

/** finishReason values that mean "refused on policy", not "broken". */
const POLICY_FINISH = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

export const GEMINI_BLOCKED_MESSAGE =
  "Our AI provider declined this request under its content policy. Try rewording it.";

export class GeminiBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Gemini blocked the request (${reason})`);
    this.name = "GeminiBlockedError";
  }
}

/** The response text, or a GeminiBlockedError when Gemini refused. */
export function geminiText(result: GenerateContentResult): string {
  const res = result.response;
  const blockReason = res.promptFeedback?.blockReason;
  if (blockReason) throw new GeminiBlockedError(String(blockReason));
  const finish = res.candidates?.[0]?.finishReason;
  if (finish && POLICY_FINISH.has(String(finish))) throw new GeminiBlockedError(String(finish));
  try {
    return res.text();
  } catch (err) {
    // Any refusal shape the checks above don't know yet.
    if (err instanceof Error && /blocked due to/i.test(err.message)) {
      throw new GeminiBlockedError(err.message.replace(/^.*blocked due to\s*/i, "") || "unknown");
    }
    throw err;
  }
}
