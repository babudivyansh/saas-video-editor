import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { getUserTier } from "@/lib/auth";
import { takeFairUse } from "@/lib/fair-use";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AI_TEXT_LLM_OPERATIONS, buildAiTextPrompt, type AiTextLlmOperation } from "@/lib/editor/ai-text";

const MAX_TEXT_LENGTH = 4000; // generous for a caption cue or a text-clip run; guards against pasting a whole script

// POST /api/editor/ai-text { operation, text, targetLang? }
// Free since 2026-09-26 (a single Gemini text call costs well under $0.001),
// under a daily fair-use cap — lib/fair-use.ts. It used to cost 1 credit. Only the LLM-shaped operations reach this route; the
// deterministic ones (emojis/lineBreaks/fillerWords, see lib/editor/ai-text.ts)
// are free and run entirely client-side, never hitting the network.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const operation = body.operation as string | undefined;
  const text = body.text as string | undefined;
  const targetLang = body.targetLang as string | undefined;

  if (!operation || !(AI_TEXT_LLM_OPERATIONS as readonly string[]).includes(operation)) {
    return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
  }
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` }, { status: 400 });
  }
  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "AI Tools are not configured on this server" }, { status: 503 });
  }

  const use = await takeFairUse(auth.userId, "editor-ai-text", await getUserTier(auth.userId));
  if (!use.allowed) return NextResponse.json({ error: use.message }, { status: 429 });

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = buildAiTextPrompt(operation as AiTextLlmOperation, text, targetLang);
    const result = await withRetry((signal) => model.generateContent(prompt, { signal }), { timeoutMs: 30_000 });
    const out = result.response.text().trim();
    if (!out) throw new Error("empty response");
    return NextResponse.json({ result: out });
  } catch (err) {
    logger.error("editor-ai-text", `operation ${operation} failed`, err);
    return NextResponse.json({ error: "AI Tools request failed — try again" }, { status: 500 });
  }
}
