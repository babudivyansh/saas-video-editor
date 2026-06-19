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

// Maps UI model slugs → Together AI model IDs + recommended steps
const MODEL_MAP: Record<string, { model: string; steps: number }> = {
  "seedream-4.5":      { model: "black-forest-labs/FLUX.1-dev",           steps: 28 },
  "seedream-5-lite":   { model: "black-forest-labs/FLUX.1-schnell-Free",  steps: 4  },
  "flux-schnell":      { model: "black-forest-labs/FLUX.1-schnell-Free",  steps: 4  },
  "ideogram-v3":       { model: "black-forest-labs/FLUX.1.1-pro",         steps: 28 },
  "bria-3.2":          { model: "black-forest-labs/FLUX.1-dev",           steps: 28 },
  "nano-banana":       { model: "black-forest-labs/FLUX.1-schnell-Free",  steps: 4  },
  "nano-banana-pro":   { model: "black-forest-labs/FLUX.1.1-pro",         steps: 28 },
};

// Maps ratio label → pixel dimensions (multiples of 8 for Flux)
const RATIO_MAP: Record<string, { width: number; height: number }> = {
  "Original": { width: 1024, height: 1024 },
  "1:1":      { width: 1024, height: 1024 },
  "4:3":      { width: 1024, height: 768  },
  "3:4":      { width: 768,  height: 1024 },
  "16:9":     { width: 1024, height: 576  },
  "9:16":     { width: 576,  height: 1024 },
  "3:2":      { width: 1024, height: 672  },
  "2:3":      { width: 672,  height: 1024 },
  "21:9":     { width: 1024, height: 440  },
};

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.TOGETHER_API_KEY) {
    return NextResponse.json({ error: "Image generation is not configured (missing TOGETHER_API_KEY)" }, { status: 503 });
  }

  // Fast pre-check against cached credit balance
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

  const { model, steps } = MODEL_MAP[body.model ?? ""] ?? MODEL_MAP["seedream-4.5"];
  const { width, height } = RATIO_MAP[body.ratio ?? ""] ?? RATIO_MAP["9:16"];

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
    const togetherRes = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        width,
        height,
        steps,
        n: 1,
        response_format: "b64_json",
      }),
    });

    if (!togetherRes.ok) {
      const err = await togetherRes.text();
      console.error("[image-generator] Together AI error", togetherRes.status, err);
      await refundCredit(auth.userId);
      return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 502 });
    }

    const json = (await togetherRes.json()) as { data: { b64_json: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      await refundCredit(auth.userId);
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");
    const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
    const imageUrl = await uploadBufferToS3(buffer, key, "image/png");

    return NextResponse.json({ imageUrl, width, height });
  } catch (err) {
    console.error("[image-generator]", err);
    try { await refundCredit(auth.userId); } catch { /* swallow */ }
    return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
  }
}
