import { z } from "zod";
import { assistantHistoryResponse, assistantSendRequest, assistantStreamEvent, type AssistantStreamEvent } from "../schemas/home";
import type { ApiClient } from "./client";

// /api/mobile/v1/assistant: Clipiro AI (mobile Phase 13).
export function assistantApi(api: ApiClient) {
  return {
    /** The conversation, oldest first, and today's allowance. */
    history: () => api.request("/assistant/messages", { schema: assistantHistoryResponse }),
    /**
     * Sends a message; the reply streams to `onEvent` (text as it's written,
     * cards, then "done" with the saved reply, or "error"). `fetch` must
     * stream: the app passes expo/fetch.
     */
    send: (text: string, o: { fetch: typeof fetch; tz: string; signal?: AbortSignal }, onEvent: (e: AssistantStreamEvent) => void) =>
      api.stream(`/assistant/messages?tz=${encodeURIComponent(o.tz)}`, { body: assistantSendRequest.parse({ text }), schema: assistantStreamEvent, fetch: o.fetch, signal: o.signal }, onEvent),
    /** "New chat". */
    clear: () => api.request("/assistant/messages", { method: "DELETE", schema: z.object({ ok: z.literal(true) }) }),
  };
}
