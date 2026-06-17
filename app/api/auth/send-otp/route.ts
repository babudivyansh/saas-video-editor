import { NextRequest, NextResponse } from "next/server";
import { issueOtp } from "@/lib/otp";
import { normalizeIdentifier, findUserByMethod, type AuthMethod } from "@/lib/identifier";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const method: AuthMethod = body.method === "phone" ? "phone" : "email";
    const identifier = normalizeIdentifier(method, body.identifier ?? body.email ?? body.phone ?? "");

    if (!identifier) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // OTP is a sign-in method, so the account must already exist.
    const user = await findUserByMethod(method, identifier);
    if (!user) {
      const label = method === "email" ? "email" : "phone number";
      return NextResponse.json({ error: `No account found with this ${label}` }, { status: 404 });
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
