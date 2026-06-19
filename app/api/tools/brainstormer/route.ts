import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthUser } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

const CREDIT_COST = 1;

async function refundCredit(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: CREDIT_COST } },
  });
  const cached = await redis.get(`credits:${userId}`);
  if (cached !== null) {
    await redis.set(`credits:${userId}`, String(parseInt(cached, 10) + CREDIT_COST), "EX", 3600);
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Brainstormer not configured" }, { status: 503 });
  }

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  let body: { topic?: string; tone?: string; targetAudience?: string; videoType?: string };
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

  // Deduct credit
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { credits: { decrement: CREDIT_COST } },
    select: { credits: true },
  });
  if (user.credits < 0) {
    await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: CREDIT_COST } } });
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

    const result = await model.generateContent(prompt);
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

    return NextResponse.json({ ideas });
  } catch (err) {
    try { await refundCredit(auth.userId); } catch { /* swallow */ }
    const msg = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
