import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

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

// Imagen 3 supports a fixed set of aspect ratios — map UI labels to them.
// Unsupported ratios (3:2, 2:3, 21:9) fall back to the closest match.
const RATIO_MAP: Record<string, string> = {
  "Original": "1:1",
  "1:1":      "1:1",
  "4:3":      "4:3",
  "3:4":      "3:4",
  "16:9":     "16:9",
  "9:16":     "9:16",
  "3:2":      "16:9",
  "2:3":      "3:4",
  "21:9":     "16:9",
};

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
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
  if (prompt.length > 2000) return NextResponse.json({ error: "Prompt too long (max 2000 chars)" }, { status: 400 });

  const aspectRatio = RATIO_MAP[body.ratio ?? ""] ?? "1:1";

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
    const imagenRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio },
        }),
      },
    );

    if (!imagenRes.ok) {
      const err = await imagenRes.text();
      console.error("[image-generator] Imagen 3 error", imagenRes.status, err);
      await refundCredit(auth.userId);
      return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 502 });
    }

    const json = (await imagenRes.json()) as {
      predictions?: { bytesBase64Encoded: string; mimeType: string }[];
    };
    const b64 = json.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) {
      await refundCredit(auth.userId);
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");
    const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
    const imageUrl = await uploadBufferToS3(buffer, key, "image/png");

    return NextResponse.json({ imageUrl });
  } catch (err) {
    console.error("[image-generator]", err);
    try { await refundCredit(auth.userId); } catch { /* swallow */ }
    return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
  }
}
