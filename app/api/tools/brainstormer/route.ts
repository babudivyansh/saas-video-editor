import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { chargeCredits, refundCredits, markGenerationStatus } from "@/lib/credits";
import { env } from "@/lib/env";

// maxDuration=30 must stay ahead of withRetry's worst case below (3 attempts
// x 8s + backoff ~= 25.5s) — the previous 20s-per-attempt budget could
// exceed 30s on retry, letting the platform kill the request before this
// route's own catch/refund logic ever ran.
export const maxDuration = 30;

const CREDIT_COST = 1;

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

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "brainstormer",
    idempotencyKey: body.idempotencyKey,
    log: { generationType: "utility", prompt: topic },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Brainstormer is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  const generationId = charge.generationId;

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
      { timeoutMs: 8_000 },
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
    try {
      await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId });
      if (generationId) await markGenerationStatus(generationId, "failed", msg);
    } catch { /* swallow */ }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:brainstormer" });
