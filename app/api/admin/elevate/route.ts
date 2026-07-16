import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { createElevationOtp, isElevated, verifyElevationOtp, ELEVATION_HOURS } from "@/lib/admin/elevation";
import { sendOtpEmail } from "@/lib/email";

// Admin step-up auth. Deliberately uses requireAdmin (role check) WITHOUT the
// elevation gate — this is the route that grants elevation.
//   GET  → { elevated }
//   POST { action: "send" }            → email a 6-digit code (3/15min)
//   POST { action: "verify", code }    → grant an 8h elevation window

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ elevated: await isElevated(admin.userId), hours: ELEVATION_HOURS });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string };

  if (body.action === "send") {
    const { allowed } = await rateLimit(`admin-elevate-send:${admin.userId}`, 3, 900);
    if (!allowed) {
      return NextResponse.json({ error: "Too many codes requested — wait a few minutes." }, { status: 429 });
    }
    const code = await createElevationOtp(admin.userId);
    const channel = await sendOtpEmail(admin.email, code);
    return NextResponse.json({ sent: true, channel });
  }

  if (body.action === "verify") {
    if (!/^\d{6}$/.test(body.code ?? "")) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }
    const { allowed } = await rateLimit(`admin-elevate-verify:${admin.userId}`, 10, 900);
    if (!allowed) return NextResponse.json({ error: "Too many attempts — wait a few minutes." }, { status: 429 });

    const result = await verifyElevationOtp(admin.userId, body.code!);
    if (!result.ok) {
      const msg =
        result.reason === "expired"
          ? "Code expired — request a new one."
          : result.reason === "too_many_attempts"
            ? "Too many wrong attempts — request a new code."
            : "Wrong code — check your email and try again.";
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    await auditAdminAction(admin.userId, "admin.elevated", undefined, {
      after: { hours: ELEVATION_HOURS },
      ip: auditIp(req),
    });
    return NextResponse.json({ elevated: true });
  }

  return NextResponse.json({ error: "action must be send or verify" }, { status: 400 });
}
