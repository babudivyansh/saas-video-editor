import type { NextRequest } from "next/server";
import { enhancePromptRequest } from "@clipiro/shared";
import { POST as webEnhance } from "@/app/api/tools/enhance-prompt/route";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/tools/enhance-prompt { prompt } → { prompt }: the AI
// Media "Prompt generator", the web's own (Gemini, free, 20 an hour per user).
export const POST = withMobileAuth(async (req: NextRequest) => {
  const body = await parseBody(req, enhancePromptRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webEnhance, req, { prompt: body.data.prompt });
  if (r.status === 429) return mobileError(429, "You’ve used the prompt generator a lot this hour. Try again later.", { code: "rate_limited" });
  if (r.status >= 400) return webError(r);
  const prompt = typeof r.json.prompt === "string" ? r.json.prompt.trim() : "";
  return prompt ? mobileJson({ prompt }) : mobileError(502, "The prompt generator didn’t answer. Try again.");
});
