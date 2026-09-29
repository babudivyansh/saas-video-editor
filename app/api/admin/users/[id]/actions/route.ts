import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateOneSession } from "@/lib/auth";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { userActionSchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";
import { issuePasswordReset } from "@/lib/password-reset";
import { cancelSubscriptionForUser } from "@/lib/billing/cancel-subscription";
import { hardDeleteUserAccount } from "@/lib/account-deletion";
import { logger } from "@/lib/logger";

// POST /api/admin/users/[id]/actions — per-account controls for support:
//   reset_2fa            turn off two-factor (lost authenticator)      typed email + reason
//   mark_email_verified  set emailVerifiedAt                           reason
//   resend_verification  email a fresh verification code
//   send_password_reset  email the same reset link "Forgot password" sends
//   revoke_session       sign out one device
//   cancel_subscription  stop auto-renewal (access runs to period end) typed email + reason
//   hard_delete          delete the account and its stored files       typed email + reason
//
// Refused on ADMIN accounts (except revoke_session) and on yourself: an admin
// account is changed by demoting it first, never from this panel. Every
// action is audited as user.<action>.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const body = await parseBody(req, userActionSchema);

  const { allowed } = await rateLimit(`admin-user-action:${admin.userId}`, 30, 900);
  if (!allowed) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true, twoFactorEnabled: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (body.action !== "revoke_session") {
    if (id === admin.userId) return NextResponse.json({ error: "Use your own Settings for your account." }, { status: 400 });
    if (user.role === "ADMIN") {
      return NextResponse.json({ error: "Demote the admin role before changing this account." }, { status: 409 });
    }
  }
  if ("confirmPhrase" in body && body.confirmPhrase.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: `Type the user's email (${user.email}) to confirm` }, { status: 400 });
  }

  const reason = "reason" in body ? body.reason : undefined;
  const audit = (after?: Record<string, unknown>, before?: Record<string, unknown>) =>
    auditAdminAction(admin.userId, `user.${body.action}`, id, { before, after, reason, ip: auditIp(req) });

  switch (body.action) {
    case "reset_2fa": {
      if (!user.twoFactorEnabled) return NextResponse.json({ error: "Two-factor isn't on for this account" }, { status: 409 });
      await prisma.$transaction([
        prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: id } }),
        prisma.user.update({
          where: { id },
          data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorLastUsedStep: null },
        }),
      ]);
      await audit({ twoFactorEnabled: false }, { twoFactorEnabled: true });
      return NextResponse.json({ ok: true });
    }

    case "mark_email_verified": {
      if (user.emailVerifiedAt) return NextResponse.json({ error: "Email is already verified" }, { status: 409 });
      const emailVerifiedAt = new Date();
      await prisma.user.update({ where: { id }, data: { emailVerifiedAt } });
      await audit({ emailVerifiedAt }, { emailVerifiedAt: null });
      return NextResponse.json({ ok: true, emailVerifiedAt });
    }

    case "resend_verification": {
      if (user.emailVerifiedAt) return NextResponse.json({ error: "Email is already verified" }, { status: 409 });
      try {
        await issueOtp("verify", user.email);
      } catch (e) {
        if (e instanceof OtpDeliveryError) return NextResponse.json({ error: "The email couldn't be sent" }, { status: 502 });
        throw e;
      }
      await audit();
      return NextResponse.json({ ok: true });
    }

    case "send_password_reset": {
      try {
        await issuePasswordReset(user);
      } catch (e) {
        logger.error("admin-user-action", "password reset email failed", e);
        return NextResponse.json({ error: "The email couldn't be sent" }, { status: 502 });
      }
      await audit();
      return NextResponse.json({ ok: true });
    }

    case "revoke_session": {
      await invalidateOneSession(id, body.sessionId);
      await audit({ sessionId: body.sessionId });
      return NextResponse.json({ ok: true });
    }

    case "cancel_subscription": {
      const result = await cancelSubscriptionForUser(id, "admin_requested");
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      await audit({ subscriptionCancelledAt: result.subscriptionCancelledAt, subscriptionEndsAt: result.subscriptionEndsAt });
      return NextResponse.json({ ok: true, subscriptionCancelledAt: result.subscriptionCancelledAt, subscriptionEndsAt: result.subscriptionEndsAt });
    }

    case "hard_delete": {
      const result = await hardDeleteUserAccount(id);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
      await audit(undefined, { email: user.email, name: user.name });
      return NextResponse.json({ ok: true });
    }
  }
});
