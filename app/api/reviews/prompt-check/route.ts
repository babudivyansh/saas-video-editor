import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { evaluatePromptTrigger, recordPrompt } from "@/lib/reviews/prompt-triggers";
import { FEATURE_USED_VALUES } from "@/lib/reviews/constants";

const bodySchema = z
  .object({
    trigger: z.enum(["export_complete", "autoclips_milestone", "tool_generation_complete", "billing_success"]),
    // Non-authoritative hint for analytics grouping + modal prefill only —
    // days_active is deliberately excluded (cron-only, no client caller).
    featureHint: z.enum(FEATURE_USED_VALUES).optional(),
  })
  .strict();

// POST /api/reviews/prompt-check — called from a success/completion screen
// right after a product-success moment (export, Auto Clip batch, an AI
// tool's generation, or a checkout success), never mid-render. No rate
// limit: called at most a few times per session from specific success
// handlers, not user-triggerable arbitrarily.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await evaluatePromptTrigger(auth.userId, parsed.data.trigger);
  if (result.shouldPrompt && result.trigger) {
    await recordPrompt(auth.userId, result.trigger, parsed.data.featureHint);
  }
  return NextResponse.json(result);
}
