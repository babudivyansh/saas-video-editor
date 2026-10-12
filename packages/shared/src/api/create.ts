import { enhancePromptRequest, enhancePromptResponse } from "../schemas/create";
import type { ApiClient } from "./client";

// /api/mobile/v1/tools: the Create tab's helpers that aren't jobs (the jobs
// themselves go through jobsApi: POST /jobs { type: "ai-image" | "voiceover" | … }).
export function createToolsApi(api: ApiClient) {
  return {
    /** Rewrites a short image prompt in more detail. 429 code "rate_limited" past 20 an hour. */
    enhancePrompt: (prompt: string) => api.request("/tools/enhance-prompt", { method: "POST", body: enhancePromptRequest.parse({ prompt }), schema: enhancePromptResponse }),
  };
}
