import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { evaluatePromptTrigger, recordPrompt } from "@/lib/reviews/prompt-triggers";
import { notify } from "@/lib/notify";
import { shouldSendCategory } from "@/lib/notifications";
import { sendReviewPromptEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

//   GET /api/cron/review-prompts
//   Authorization: Bearer <CRON_SECRET>
//
// Daily. Calendar-driven counterpart to the real-time prompt-check route —
// a cron can't pop a modal on a closed browser, so this becomes an in-app
// notification + optional email deep-linking to /dashboard?prompt=1, which
// ReviewPromptProvider (mounted globally in DashboardShell) picks up to open
// the review modal on landing.
const MIN_ACCOUNT_AGE_DAYS = 14;
const RECENT_LOGIN_DAYS = 3;

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const accountAgeCutoff = new Date(now.getTime() - MIN_ACCOUNT_AGE_DAYS * 86400_000);
  const recentLoginCutoff = new Date(now.getTime() - RECENT_LOGIN_DAYS * 86400_000);

  // Still-engaged (recent login) users old enough to have formed an
  // opinion, who haven't reviewed yet — don't nag an already-lapsed account.
  const candidates = await prisma.user.findMany({
    where: { review: null, createdAt: { lte: accountAgeCutoff }, lastLoginAt: { gte: recentLoginCutoff } },
    select: { id: true, email: true, firstName: true, name: true },
  });

  let prompted = 0;
  let errors = 0;
  for (const user of candidates) {
    try {
      const result = await evaluatePromptTrigger(user.id, "days_active");
      if (!result.shouldPrompt) continue;

      await recordPrompt(user.id, "days_active");
      await notify({
        userId: user.id,
        type: "review_prompt",
        title: "Got a minute to review Clipiro?",
        body: "Your feedback helps other creators decide, and helps us improve.",
        href: "/dashboard?prompt=1",
      });

      if (await shouldSendCategory(user.id, "reviewPrompts")) {
        const name = user.name || user.firstName || "";
        await sendReviewPromptEmail(user.email, name, "https://clipiro.com/dashboard?prompt=1").catch((e) =>
          logger.warn("review-prompts", `email failed for ${user.email}`, { reason: (e as Error).message }),
        );
      }
      prompted++;
    } catch (e) {
      errors++;
      logger.error("review-prompts", `failed for user ${user.id}`, e);
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, prompted, errors });
}
