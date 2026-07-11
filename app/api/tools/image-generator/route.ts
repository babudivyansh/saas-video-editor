import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import { markQuestComplete } from "@/lib/quests";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getImageModel } from "@/lib/models/imageModels";
import { falSubmit, falPollUntilDone, extractResultUrl } from "@/lib/fal";
import { chargeCredits, refundCredits, markGenerationStatus, checkModelAccess } from "@/lib/credits";

export const maxDuration = 120;

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    prompt?: string;
    model?: string;
    ratio?: string;
    negativePrompt?: string;
    seed?: number;
    guidanceScale?: number;
    steps?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

  const modelEntry = getImageModel(body.model);
  const CREDIT_COST = modelEntry.creditCost;

  if (modelEntry.integration === "direct-gemini") {
    if (!env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Image generation is not configured (missing GEMINI_API_KEY)" }, { status: 503 });
    }
  } else if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Image generation is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  const access = await checkModelAccess(auth.userId, modelEntry);
  if (!access.allowed) {
    return NextResponse.json(
      { error: `${modelEntry.displayName} requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "image-generator",
    log: { modelId: modelEntry.id, generationType: "image", prompt, estimatedCostUsd: modelEntry.costUsd },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Image generation is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }
  const generationId = charge.generationId;

  try {
    if (modelEntry.integration === "fal") {
      const bodyValues: Partial<Record<typeof modelEntry.supportedParameters[number], string | number>> = {
        aspectRatio: body.ratio,
        negativePrompt: body.negativePrompt,
        seed: body.seed,
        guidanceScale: body.guidanceScale,
        steps: body.steps,
      };
      const input: Record<string, unknown> = {};
      for (const p of modelEntry.supportedParameters) {
        const key = modelEntry.inputMap[p] ?? p;
        if (p === "prompt") input[key] = prompt;
        else if (bodyValues[p] !== undefined) input[key] = bodyValues[p];
        else if (modelEntry.defaultValues[p] !== undefined) input[key] = modelEntry.defaultValues[p];
      }

      const requestId = await falSubmit(modelEntry.falEndpoint, input);
      const raw = await falPollUntilDone(modelEntry.falEndpoint, requestId);
      const resultUrl = extractResultUrl(raw, modelEntry.resultPath);

      const dlRes = await fetch(resultUrl);
      if (!dlRes.ok) throw new Error("Failed to download image from fal.ai");
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
      const imageUrl = await uploadBufferToS3(buffer, key, "image/png");

      void markQuestComplete(auth.userId, "picture-this");
      if (generationId) void markGenerationStatus(generationId, "completed");
      return NextResponse.json({ imageUrl });
    }

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
      await refundCredits({ userId: auth.userId, amount: CREDIT_COST });
      if (generationId) void markGenerationStatus(generationId, "failed", "gemini-2.5-flash-image error");
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
      await refundCredits({ userId: auth.userId, amount: CREDIT_COST });
      if (generationId) void markGenerationStatus(generationId, "failed", "No image returned");
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    const buffer = Buffer.from(b64, "base64");
    const key = `generated-images/${auth.userId}/${randomUUID()}.png`;
    const imageUrl = await uploadBufferToS3(buffer, key, "image/png");

    void markQuestComplete(auth.userId, "picture-this");
    if (generationId) void markGenerationStatus(generationId, "completed");
    return NextResponse.json({ imageUrl });
  } catch (err) {
    logger.error("image-generator", "request failed", err);
    try {
      await refundCredits({ userId: auth.userId, amount: CREDIT_COST });
      if (generationId) void markGenerationStatus(generationId, "failed", err instanceof Error ? err.message : "unknown error");
    } catch { /* swallow */ }
    return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:image-generator" });
