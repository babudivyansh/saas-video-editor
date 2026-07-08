import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { generateScript } from "@/utils/gemini";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, style } = await req.json();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  try {
    const result = await generateScript(topic, style ?? "engaging and informative");
    return NextResponse.json(result);
  } catch (err) {
    logger.error("generate/script", "request failed", err);
    return NextResponse.json({ error: "Script generation failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "generate:script" });
