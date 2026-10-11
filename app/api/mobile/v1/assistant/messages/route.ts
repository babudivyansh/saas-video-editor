import type { NextRequest } from "next/server";
import { assistantSendRequest, type AssistantStreamEvent } from "@clipiro/shared";
import { chatOverride, runAssistant, toHistory } from "@/lib/assistant/run";
import { clear, dailyLimit, giveBack, history, prune, remaining, save, takeMessage } from "@/lib/assistant/store";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";
import { timezoneSchema } from "@/lib/social/schemas";

// Clipiro AI (mobile Phase 13). One ongoing chat per person, free within a
// daily allowance (decisions A1–A3 A).

const tzOf = (req: NextRequest) => {
  const parsed = timezoneSchema.safeParse(req.nextUrl.searchParams.get("tz") ?? "UTC");
  return parsed.success ? parsed.data : "UTC";
};

// GET /api/mobile/v1/assistant/messages → { messages, remaining, limit }
export const GET = withMobileAuth(async (_req: NextRequest, auth) => {
  const [messages, left] = await Promise.all([history(auth.userId), remaining(auth.userId)]);
  return mobileJson({ messages, ...left });
});

// DELETE /api/mobile/v1/assistant/messages → { ok }: "New chat".
export const DELETE = withMobileAuth(async (_req: NextRequest, auth) => {
  await clear(auth.userId);
  return mobileJson({ ok: true });
});

// POST /api/mobile/v1/assistant/messages?tz= { text } → a stream of
// newline-delimited AssistantStreamEvent: the saved question, text as it's
// written, tool status and cards, then the saved reply (or an error).
export const POST = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, assistantSendRequest);
  if (!body.ok) return body.res;
  if (!env.GEMINI_API_KEY && !chatOverride()) return mobileError(503, "Clipiro AI isn’t available right now.", { code: "assistant_unavailable" });

  const limit = await dailyLimit(auth.userId);
  if (!(await takeMessage(auth.userId, limit))) {
    return mobileError(429, `You’ve sent today’s ${limit} messages to Clipiro AI. It resets in 24 hours.`, { code: "assistant_limit" });
  }

  const earlier = await history(auth.userId);
  const question = await save(auth.userId, "user", body.data.text);
  void prune(auth.userId).catch(() => {});
  const tz = tzOf(req);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AssistantStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      send({ type: "user", message: question });
      let wrote = false;
      try {
        const reply = await runAssistant(
          { ctx: { userId: auth.userId, tz, now: new Date() }, history: toHistory(earlier), text: body.data.text, startChat: chatOverride() },
          (e) => {
            if (e.type === "text" || e.type === "card") wrote = true;
            send(e);
          },
        );
        const saved = await save(auth.userId, "assistant", reply.text || "Done.", reply.cards);
        send({ type: "done", message: saved, remaining: (await remaining(auth.userId, limit)).remaining });
      } catch (e) {
        logger.error("assistant", `reply failed for ${auth.userId}`, e);
        // Nothing reached the person: the message doesn't count.
        if (!wrote) await giveBack(auth.userId).catch(() => {});
        send({ type: "error", error: "Clipiro AI couldn’t answer just now. Try again.", code: "assistant_failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
