import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { auditEvent, auditIp } from "@/lib/admin/audit";
import { createElevationOtp, isElevated, verifyElevationOtp, ELEVATION_HOURS } from "@/lib/admin/elevation";
import { sendOtpEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { verifySecondFactor } from "@/lib/two-factor-verify";

// Admin step-up auth. Deliberately uses requireAdmin (role check) WITHOUT the
// elevation gate — this is the route that grants elevation.
//   GET  → { elevated, twoFactorEnabled }
//   POST { action: "send" }                  → email a 6-digit code (3/15min)
//   POST { action: "verify", code, totp }    → grant an 8h elevation window
//
// Two factors, both required: the emailed code AND the admin's authenticator
// (or a recovery code). Email alone meant whoever controlled one admin's inbox
// had the whole console. An admin without 2FA is refused with code
// "two_factor_required" until they turn it on in Settings → Security.
//
// Every step is audited — including failures, which are exactly what an
// attempted break-in into an admin session looks like. Outside withAdmin, so
// who/where is passed explicitly rather than taken from the request context.

const TWO_FACTOR_REQUIRED = {
  error: "Turn on two-factor authentication in Settings → Security before using the admin console.",
  code: "two_factor_required",
} as const;

function loadSecondFactor(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, twoFactorEnabled: true, twoFactorSecretEnc: true },
  });
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await loadSecondFactor(admin.userId);
  return NextResponse.json({
    elevated: await isElevated(admin.userId, admin.sessionId),
    hours: ELEVATION_HOURS,
    twoFactorEnabled: Boolean(user?.twoFactorEnabled && user.twoFactorSecretEnc),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const audit = (action: string, after?: Record<string, unknown>, reason?: string) =>
    auditEvent({
      actorId: admin.userId,
      actorType: "admin",
      action,
      after,
      reason,
      ip: auditIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
      sessionId: admin.sessionId,
    });

  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; totp?: string };

  const user = await loadSecondFactor(admin.userId);
  if (!user?.twoFactorEnabled || !user.twoFactorSecretEnc) {
    await audit("admin.elevation_failed", { step: body.action ?? "unknown" }, "Two-factor authentication is not turned on");
    return NextResponse.json(TWO_FACTOR_REQUIRED, { status: 403 });
  }

  if (body.action === "send") {
    const { allowed } = await rateLimit(`admin-elevate-send:${admin.userId}`, 3, 900);
    if (!allowed) {
      await audit("admin.elevation_failed", { step: "send" }, "Too many codes requested");
      return NextResponse.json({ error: "Too many codes requested — wait a few minutes." }, { status: 429 });
    }
    const code = await createElevationOtp(admin.userId);
    const channel = await sendOtpEmail(admin.email, code);
    await audit("admin.elevation_code_sent", { channel });
    return NextResponse.json({ sent: true, channel });
  }

  if (body.action === "verify") {
    if (!/^\d{6}$/.test(body.code ?? "")) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }
    const { allowed } = await rateLimit(`admin-elevate-verify:${admin.userId}`, 10, 900);
    if (!allowed) {
      await audit("admin.elevation_failed", { step: "verify" }, "Too many verification attempts (rate limited)");
      return NextResponse.json({ error: "Too many attempts — wait a few minutes." }, { status: 429 });
    }

    const totp = (body.totp ?? "").trim();
    if (!totp) return NextResponse.json({ error: "Enter the code from your authenticator app." }, { status: 400 });
    // Checked before the emailed code: verifyElevationOtp grants elevation the
    // moment the email code matches.
    const second = await verifySecondFactor(user, totp);
    if (second !== "ok") {
      const msg =
        second === "locked"
          ? "Too many incorrect authenticator codes. Try again in 15 minutes."
          : "Wrong authenticator code — check your app and try again.";
      await audit("admin.elevation_failed", { step: "verify", result: `totp_${second}` }, msg);
      return NextResponse.json({ error: msg }, { status: second === "locked" ? 429 : 401 });
    }

    const result = await verifyElevationOtp(admin.userId, body.code!, admin.sessionId);
    if (!result.ok) {
      const msg =
        result.reason === "expired"
          ? "Code expired — request a new one."
          : result.reason === "too_many_attempts"
            ? "Too many wrong attempts — request a new code."
            : "Wrong code — check your email and try again.";
      await audit("admin.elevation_failed", { step: "verify", result: result.reason }, msg);
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    await audit("admin.elevated", { hours: ELEVATION_HOURS });
    return NextResponse.json({ elevated: true });
  }

  return NextResponse.json({ error: "action must be send or verify" }, { status: 400 });
}
