import { NextRequest, NextResponse } from "next/server";
import { issueOtp } from "@/lib/otp";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const method: AuthMethod = body.method === "phone" ? "phone" : "email";
    const identifier = normalizeIdentifier(method, body.identifier ?? body.email ?? body.phone ?? "");

    if (!identifier) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const [idLimit, ipLimit] = await Promise.all([
      rateLimit(`otp-send:${method}:${identifier}`, 3, 600),
      rateLimit(`otp-send:ip:${getClientIp(req)}`, 10, 600),
    ]);
    if (!idLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    // OTP is a sign-in method, so the account must already exist — but we
    // don't reveal that: a non-existent identifier gets the same success
    // response as a real one (no code is actually sent), so responses can't
    // be used to enumerate accounts. Mirrors forgot-password's approach.
    const user = await findUserByMethod(method, identifier);
    if (!user) {
      return NextResponse.json({ success: true, channel: "otp-sent" });
    }

    const { code, channel } = await issueOtp(method, identifier);

    // When no real email/SMS provider is configured, return the code so dev
    // login works end-to-end. Real deliveries never expose it.
    const devCode = channel === "dev-console" ? code : undefined;

    return NextResponse.json({ success: true, channel, devCode });
  } catch (err) {
    console.error("[send-otp]", err);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
