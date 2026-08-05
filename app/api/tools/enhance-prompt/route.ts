import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";

export const maxDuration = 30;

// Uses Gemini to rewrite a short image prompt into a detailed, vivid description
// that produces better results from image generation models.
async function handlePOST(req: NextRequest) {
  if (!env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Prompt enhancement not configured" }, { status: 503 });
  }

  let prompt = "";
  try {
    const body = await req.json();
    prompt = (body.prompt ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent(
    `You are an expert AI image prompt engineer. Rewrite the following image prompt to be more detailed, vivid, and descriptive. Add specific details about lighting, style, atmosphere, colors, and composition. Keep the core subject and intent identical. Return ONLY the enhanced prompt text — no explanations, no quotes, no prefixes.\n\nOriginal prompt: ${prompt}`
  );

  const enhanced = result.response.text().trim();
  return NextResponse.json({ prompt: enhanced });
}

// Same bucket/limit as before this was converted to the shared wrapper —
// unauthenticated route, so this keys on IP either way.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 3600, keyBy: "ip", name: "enhance-prompt" });
