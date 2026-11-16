import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveReferralCode } from "@/lib/affiliate";
import { getCreatorProgram, planDiscountLive } from "@/lib/creator-program";

const bodySchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    email: z.string().trim().toLowerCase().optional(),
  })
  .strict();

// Live onBlur check on the registration form, reachable pre-account (see
// lib/api-public-routes.ts). Its own IP rate limit stands in for the
// GROUP_LIMITS group check, which only applies to session-gated routes.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = await rateLimit(`affiliate:validate-code:ip:${ip}`, 20, 300);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { code, email } = parsed.data;

  const cookieCode = req.cookies.get("affiliate_ref")?.value ?? null;
  const result = await resolveReferralCode({ cookieCode, typedCode: code, email: email ?? "" });

  if (!result || result.applied) {
    // A creator partner's code also tells the form about the discount it
    // brings, so the visitor sees it before they sign up.
    let creator: { handle: string | null; discountPct: number } | undefined;
    if (result?.applied && result.creator) {
      const program = await getCreatorProgram();
      // Only once the plan discount is really charged (offer id set), so the
      // form never promises money off that checkout won't take.
      if (planDiscountLive(program)) creator = { handle: result.creator.handle, discountPct: program.discountPct };
    }
    return NextResponse.json({ valid: true, code: result?.applied ? result.code : code, ...(creator ? { creator } : {}) });
  }
  return NextResponse.json({ valid: false, reason: result.reason });
}
