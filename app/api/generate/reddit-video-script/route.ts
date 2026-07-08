import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

const SYSTEM_PROMPT = `You are a viral Reddit storyteller. Given a topic and a tone, generate a compelling first-person Reddit post.

Return ONLY a raw JSON object (no markdown fences) in this exact shape:
{
  "postTitle": "string (catchy post title, under 100 chars)",
  "script": "string (narration text, 150-350 words, first-person, immersive)",
  "username": "string (plausible Reddit username, no spaces)"
}

Tones:
- informative: educational, matter-of-fact, adds context and insight
- funny: comedic, self-deprecating, punchy one-liners
- dramatic: high stakes, emotional tension, cliff-hangers
- serious: somber, measured, weighted delivery
- emotional: deeply personal, vulnerable, moving
- shocking: unexpected twist, gasping reveal, jaw-drop moment

Make the script feel like a real person's Reddit post — not an essay. Short sentences. Real emotion.`;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, tone } = await req.json() as { topic?: string; tone?: string };
  if (!topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const apiKey = env.GOOGLE_GEMINI_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini API key not configured" }, { status: 503 });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `${SYSTEM_PROMPT}\n\nTopic: ${topic.trim()}\nTone: ${tone ?? "dramatic"}`;
    const result = await withRetry(
      (signal) => model.generateContent(prompt, { signal }),
      { timeoutMs: 20_000 },
    );
    const raw = result.response.text().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const data = JSON.parse(raw) as { postTitle: string; script: string; username: string };
    return NextResponse.json(data);
  } catch (err) {
    logger.error("reddit-video-script", "request failed", err);
    return NextResponse.json({ error: "Script generation failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:reddit-video-script" });
