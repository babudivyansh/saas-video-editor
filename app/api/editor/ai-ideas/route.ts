import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { getUserTier } from "@/lib/auth";
import { takeFairUse } from "@/lib/fair-use";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AI_IDEA_KINDS, buildAiIdeasPrompt, parseAiIdeas, type AiIdeaKind } from "@/lib/editor/ai-text";

const MAX_BRIEF_LENGTH = 500;

// POST /api/editor/ai-ideas { kind: "hooks" | "titles" | "ctas", brief }
// The Text panel's "AI write" tab: a few fresh lines from a one-line brief.
// Same Gemini model and the same daily fair-use bucket as /api/editor/ai-text,
// so it is free and counts toward the same "rewrites left today" allowance.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as string | undefined;
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";

  if (!kind || !(AI_IDEA_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!brief) return NextResponse.json({ error: "Describe the video first" }, { status: 400 });
  if (brief.length > MAX_BRIEF_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_BRIEF_LENGTH} characters` }, { status: 400 });
  }
  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "AI Tools are not configured on this server" }, { status: 503 });
  }

  const use = await takeFairUse(auth.userId, "editor-ai-text", await getUserTier(auth.userId));
  if (!use.allowed) return NextResponse.json({ error: use.message }, { status: 429 });

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = buildAiIdeasPrompt(kind as AiIdeaKind, brief);
    const result = await withRetry((signal) => model.generateContent(prompt, { signal }), { timeoutMs: 30_000 });
    const ideas = parseAiIdeas(result.response.text());
    if (ideas.length === 0) throw new Error("empty response");
    return NextResponse.json({ ideas });
  } catch (err) {
    logger.error("editor-ai-ideas", `kind ${kind} failed`, err);
    return NextResponse.json({ error: "AI request failed — try again" }, { status: 500 });
  }
}
