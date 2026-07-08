import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { markQuestComplete } from "@/lib/quests";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";

export const maxDuration = 120;

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

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Image generation is not configured (missing GEMINI_API_KEY)" }, { status: 503 });
  }

  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cached = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (cached !== null && cached < CREDIT_COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  let body: { prompt?: string; model?: string; ratio?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

  // Deduct credit before the paid call; refund on any failure below
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
    // gemini-2.5-flash-image occasionally returns 503 "high demand" — retry a few
    // times with a short backoff before giving up and refunding the credit.
    let geminiRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );
      if (geminiRes.status !== 503) break;
      logger.warn("image-generator", `gemini-2.5-flash-image 503 (attempt ${attempt + 1}/3), retrying...`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (!geminiRes || !geminiRes.ok) {
      const err = geminiRes ? await geminiRes.text() : "no response";
      logger.error("image-generator", `gemini-2.5-flash-image error ${geminiRes?.status}`, err);
      await refundCredit(auth.userId);
      const msg = geminiRes?.status === 503
        ? "Image service is busy right now. Please try again in a moment."
        : "Image generation failed. Please try again.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const json = (await geminiRes.json()) as {
      candidates?: { content: { parts: { inlineData?: { data: string; mimeType: string } }[] } }[];
    };
    const b64 = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!b64) {
      await refundCredit(auth.userId);
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");
    const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
    const imageUrl = await uploadBufferToS3(buffer, key, "image/png");

    void markQuestComplete(auth.userId, "picture-this");
    return NextResponse.json({ imageUrl });
  } catch (err) {
    logger.error("image-generator", "request failed", err);
    try { await refundCredit(auth.userId); } catch { /* swallow */ }
    return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:image-generator" });
