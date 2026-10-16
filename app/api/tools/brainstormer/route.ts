import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { chargeCredits, refundCredits, markGenerationStatus } from "@/lib/credits";
import { getUserTier } from "@/lib/auth";
import { takeFairUse, releaseFairUse } from "@/lib/fair-use";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// maxDuration must stay ahead of withRetry's worst case below (2 attempts x
// 20s + backoff). Gemini 2.5 Flash regularly takes longer than the old 8s
// per-attempt budget, and every timeout used to cost a free user one of their
// five daily uses.
export const maxDuration = 60;

// Free since 2026-09-26 (one Gemini call, well under $0.001) under a daily
// fair-use cap — lib/fair-use.ts. Still routed through chargeCredits at 0 so
// each run keeps its Generation row for the usage and AI-spend dashboards.
const CREDIT_COST = 0;

async function handlePOST(req: NextRequest) {
  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Brainstormer not configured" }, { status: 503 });
  }

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { topic?: string; tone?: string; targetAudience?: string; videoType?: string; idempotencyKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = (body.topic ?? "").trim().slice(0, 200);
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

  const tone = (body.tone ?? "").trim().slice(0, 100);
  const targetAudience = (body.targetAudience ?? "").trim().slice(0, 200);
  const videoType = (body.videoType ?? "").trim().slice(0, 100);

  const use = await takeFairUse(auth.userId, "brainstormer", await getUserTier(auth.userId));
  if (!use.allowed) return NextResponse.json({ error: use.message }, { status: 429 });

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "brainstormer",
    idempotencyKey: body.idempotencyKey,
    log: { generationType: "utility", prompt: topic },
  });
  // A replayed key was charged (and answered) by an earlier request; running
  // Gemini again would be unmetered work, and failing it would refund that
  // earlier request. There is no job to hand back, so refuse it.
  if (!charge.ok || charge.replay) await releaseFairUse(auth.userId, "brainstormer");
  if (charge.ok && charge.replay) {
    return NextResponse.json({ error: "This request was already submitted." }, { status: 409 });
  }
  if (!charge.ok) {
    if (charge.reason === "idempotency_conflict") {
      return NextResponse.json({ error: "This request could not be accepted. Please try again." }, { status: 409 });
    }
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Brainstormer is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  const generationId = charge.generationId;

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    // JSON mode: the model returns the array itself, no markdown fences.
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });

    const prompt = `You are a viral content strategist for short-form video creators. Generate exactly 5 creative and highly engaging content ideas.

Topic/Niche: ${topic}${tone ? `\nTone: ${tone}` : ""}${targetAudience ? `\nTarget Audience: ${targetAudience}` : ""}${videoType ? `\nVideo Type: ${videoType}` : ""}

Return a JSON array of exactly 5 objects with this exact shape:
[{ "title": "...", "description": "..." }]

Rules:
- Each title must be punchy, attention-grabbing and under 10 words
- Each description is 1-2 sentences explaining the hook and angle
- Ideas must be viral-worthy and specifically tailored to the topic and audience
- Return ONLY the JSON array — no markdown code blocks, no extra text, no explanation`;

    const result = await withRetry(
      (signal) => model.generateContent(prompt, { signal }),
      { timeoutMs: 20_000, maxAttempts: 2 },
    );
    const raw = result.response.text().trim();

    let ideas: { title: string; description: string }[];
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      ideas = JSON.parse(cleaned);
      if (!Array.isArray(ideas)) throw new Error("Not an array");
      ideas = ideas.slice(0, 5).map(idea => ({
        title: String(idea.title ?? "").trim(),
        description: String(idea.description ?? "").trim(),
      }));
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    if (generationId) void markGenerationStatus(generationId, "completed");
    return NextResponse.json({ ideas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    logger.error("brainstormer", "generation failed", err);
    // Our failure, so it doesn't count against today's free uses.
    await releaseFairUse(auth.userId, "brainstormer");
    try {
      await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId });
      if (generationId) await markGenerationStatus(generationId, "failed", msg);
    } catch { /* swallow */ }
    // The raw text ("Failed to parse AI response as JSON", provider errors)
    // stays in the logs and on the Generation row.
    return NextResponse.json({ error: "We couldn't come up with ideas just now. Please try again — this didn't use up one of today's uses." }, { status: 502 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:brainstormer" });
