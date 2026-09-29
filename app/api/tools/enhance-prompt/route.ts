import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getAuthUser } from "@/lib/auth";

// An image prompt, not an essay. Without a cap this was a free, general-purpose
// LLM endpoint for anyone who could rotate IPs.
const MAX_PROMPT_CHARS = 1000;

export const maxDuration = 30;

// Uses Gemini to rewrite a short image prompt into a detailed, vivid description
// that produces better results from image generation models.
async function handlePOST(req: NextRequest) {
  // Signed-in only: generating the image needs an account anyway, and an
  // anonymous Gemini proxy is the one thing this route must not be.
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Sign in to enhance prompts" }, { status: 401 });

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
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: `Keep the prompt under ${MAX_PROMPT_CHARS} characters` }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent(
    `You are an expert AI image prompt engineer. Rewrite the following image prompt to be more detailed, vivid, and descriptive. Add specific details about lighting, style, atmosphere, colors, and composition. Keep the core subject and intent identical. Return ONLY the enhanced prompt text — no explanations, no quotes, no prefixes.\n\nOriginal prompt: ${prompt}`
  );

  const enhanced = result.response.text().trim();
  return NextResponse.json({ prompt: enhanced });
}

export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 3600, keyBy: "user", name: "enhance-prompt" });
