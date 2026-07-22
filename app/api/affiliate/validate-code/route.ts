import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveReferralCode } from "@/lib/affiliate";

const bodySchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    email: z.string().trim().toLowerCase().optional(),
    phone: z.string().trim().optional(),
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
  const { code, email, phone } = parsed.data;

  const cookieCode = req.cookies.get("affiliate_ref")?.value ?? null;
  const result = await resolveReferralCode({ cookieCode, typedCode: code, email: email ?? "", phone });

  if (!result || result.applied) {
    return NextResponse.json({ valid: true, code: result?.applied ? result.code : code });
  }
  return NextResponse.json({ valid: false, reason: result.reason });
}
