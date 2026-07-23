import nodemailer from "nodemailer";
import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

export type DeliveryChannel = "email" | "sms" | "dev-console";

export async function sendOtpEmail(to: string, otp: string): Promise<DeliveryChannel> {
  const from = env.EMAIL_FROM || "onboarding@resend.dev";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 32px;">
        <div style="background: #2563eb; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <span style="font-size: 18px; font-weight: 800; color: #0f172a;">Clipiro</span>
      </div>

      <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Verify your email address</h1>
      <p style="color: #64748b; font-size: 15px; margin: 0 0 28px; line-height: 1.6;">
        Enter the code below to continue. This code expires in <strong>10 minutes</strong>.
      </p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; text-align: center; margin-bottom: 28px;">
        <span style="font-size: 42px; font-weight: 800; letter-spacing: 14px; color: #0f172a; font-variant-numeric: tabular-nums;">${otp}</span>
      </div>

      <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0;">
        If you didn&apos;t request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;" />
      <p style="color: #cbd5e1; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Clipiro. All rights reserved.</p>
    </div>
  `;

  // 1. Try sending with Resend if configured
  if (resend) {
    try {
      await resend.emails.send({
        from: `Clipiro <${from}>`,
        to: [to],
        subject: "Your Clipiro verification code",
        html,
      });
      return "email";
    } catch (err) {
      logger.error("email:resend", "Failed to send OTP email", err);
    }
  }

  // 2. Fallback to Nodemailer SMTP
  if (env.EMAIL_USER) {
    const smtpFrom = env.EMAIL_FROM || env.EMAIL_USER || "noreply@clipiro.app";
    await transporter.sendMail({
      from: `"Clipiro" <${smtpFrom}>`,
      to,
      subject: "Your Clipiro verification code",
      html,
    });
    return "email";
  }

  // 3. Fallback to Dev Console Logging
  logger.info("email:dev", `OTP for ${to}: ${otp}`);
  return "dev-console";
}

export async function sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<void> {
  const from = env.EMAIL_FROM || "onboarding@resend.dev";
  const greeting = name ? `Hi ${name}` : "Hi there";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 32px;">
        <div style="background: #2563eb; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <span style="font-size: 18px; font-weight: 800; color: #0f172a;">Clipiro</span>
      </div>

      <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 8px;">${greeting}, reset your password</h1>
      <p style="color: #64748b; font-size: 15px; margin: 0 0 28px; line-height: 1.6;">
        We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>15 minutes</strong>.
      </p>

      <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 999px;">
        Reset password
      </a>

      <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 28px 0 0;">
        If you didn&apos;t request a password reset, you can safely ignore this email — your password will not change.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;" />
      <p style="color: #cbd5e1; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Clipiro. All rights reserved.</p>
    </div>
  `;

  // 1. Try sending with Resend if configured
  if (resend) {
    try {
      await resend.emails.send({
        from: `Clipiro <${from}>`,
        to: [to],
        subject: "Reset your Clipiro password",
        html,
      });
      return;
    } catch (err) {
      logger.error("email:resend", "Failed to send password reset email", err);
    }
  }

  // 2. Fallback to Nodemailer SMTP
  if (env.EMAIL_USER) {
    const smtpFrom = env.EMAIL_FROM || env.EMAIL_USER || "noreply@clipiro.app";
    await transporter.sendMail({
      from: `"Clipiro" <${smtpFrom}>`,
      to,
      subject: "Reset your Clipiro password",
      html,
    });
    return;
  }

  // 3. Fallback to Dev Console Logging
  logger.info("email:dev", `Password reset for ${to}: ${resetLink}`);
}

export interface PurchaseEmailData {
  userEmail: string;
  userName: string;
  planName: string;
  creditsAdded: number;
  amountInPaise: number;
  orderId: string;
  isSubscription: boolean;
}

export async function sendPurchaseConfirmationEmail(data: PurchaseEmailData): Promise<void> {
  const from = env.EMAIL_FROM || "onboarding@resend.dev";
  const amountFormatted = `₹${(data.amountInPaise / 100).toFixed(2)}`;
  const greeting = data.userName ? `Hi ${data.userName}` : "Hi there";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 32px;">
        <div style="background: #2563eb; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <span style="font-size: 18px; font-weight: 800; color: #0f172a;">Clipiro</span>
      </div>

      <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 6px;">${greeting} — payment confirmed!</h1>
      <p style="color: #64748b; font-size: 15px; margin: 0 0 28px; line-height: 1.6;">
        Your ${data.isSubscription ? "subscription" : "credit pack"} is now active and ready to use.
      </p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; font-size: 14px; padding: 6px 0;">Plan</td>
            <td style="color: #0f172a; font-size: 14px; font-weight: 600; text-align: right; padding: 6px 0;">${data.planName}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-size: 14px; padding: 6px 0;">Credits added</td>
            <td style="color: #16a34a; font-size: 14px; font-weight: 700; text-align: right; padding: 6px 0;">+${data.creditsAdded} credits</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-size: 14px; padding: 6px 0;">Amount paid</td>
            <td style="color: #0f172a; font-size: 14px; font-weight: 600; text-align: right; padding: 6px 0;">${amountFormatted}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-size: 14px; padding: 6px 0;">Order ID</td>
            <td style="color: #94a3b8; font-size: 12px; font-family: monospace; text-align: right; padding: 6px 0;">${data.orderId}</td>
          </tr>
        </table>
      </div>

      <a href="https://clipiro.com/dashboard" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 999px;">
        Go to Dashboard →
      </a>

      <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 28px 0 0;">
        Questions? Reply to this email and we&apos;ll get back to you within 24 hours.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #cbd5e1; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Clipiro. All rights reserved.</p>
    </div>
  `;

  // 1. Try sending with Resend if configured
  if (resend) {
    try {
      await resend.emails.send({
        from: `Clipiro <${from}>`,
        to: [data.userEmail],
        subject: `Payment confirmed — ${data.planName} activated`,
        html,
      });
      return;
    } catch (err) {
      logger.error("email:resend", "Failed to send purchase confirmation email", err);
    }
  }

  // 2. Fallback to Nodemailer SMTP
  if (env.EMAIL_USER) {
    const smtpFrom = env.EMAIL_FROM || env.EMAIL_USER || "noreply@clipiro.app";
    await transporter.sendMail({
      from: `"Clipiro" <${smtpFrom}>`,
      to: data.userEmail,
      subject: `Payment confirmed — ${data.planName} activated`,
      html,
    });
    return;
  }


  // 3. Fallback to Dev Console Logging
  logger.info("email:dev", `Purchase confirmation for ${data.userEmail}: ${data.planName} (+${data.creditsAdded} credits)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: shared send wrapper (Resend → SMTP → console)
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string, logTag: string): Promise<void> {
  const from = env.EMAIL_FROM || "onboarding@resend.dev";

  if (resend) {
    try {
      await resend.emails.send({ from: `Clipiro <${from}>`, to: [to], subject, html });
      return;
    } catch (err) {
      logger.error(`email:resend:${logTag}`, "send failed", err);
    }
  }
  if (env.EMAIL_USER) {
    const smtpFrom = env.EMAIL_FROM || env.EMAIL_USER;
    await transporter.sendMail({ from: `"Clipiro" <${smtpFrom}>`, to, subject, html });
    return;
  }
  logger.info(`email:dev:${logTag}`, `to=${to} subject=${subject}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared header / footer partials
// ─────────────────────────────────────────────────────────────────────────────
function emailHeader(): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#ffffff;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px;">
      <div style="background:#2563eb;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      </div>
      <span style="font-size:18px;font-weight:800;color:#0f172a;">Clipiro</span>
    </div>`;
}

function emailFooter(): string {
  return `
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0;"/>
    <p style="color:#cbd5e1;font-size:12px;margin:0;">© ${new Date().getFullYear()} Clipiro. All rights reserved. · <a href="https://clipiro.com/privacy" style="color:#94a3b8;">Privacy</a></p>
    </div>`;
}

function ctaButton(href: string, label: string, color = "#2563eb"): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:white;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:999px;margin:20px 0;">${label}</a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WELCOME EMAIL
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, firstName: string, credits: number): Promise<void> {
  const name = firstName || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 8px;">Welcome to Clipiro, ${name}! 🎬</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">You&apos;re all set. Start making AI-powered viral videos in minutes.</p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="color:#1d4ed8;font-size:14px;font-weight:600;margin:0 0 4px;">YOUR STARTING CREDITS</p>
      <span style="font-size:52px;font-weight:800;color:#1e40af;">${credits}</span>
      <p style="color:#3b82f6;font-size:14px;margin:4px 0 0;">credits ready to use right now</p>
    </div>

    <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">Get started in 3 steps:</p>
    <table style="width:100%;margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">① &nbsp;Go to your dashboard</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">② &nbsp;Pick a video style or tool</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">③ &nbsp;Export your first AI video</td></tr>
    </table>

    ${ctaButton("https://clipiro.com/dashboard", "Go to Dashboard →")}

    <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:24px 0 0;">
      💡 <strong>Pro tip:</strong> Each credit = one AI render. Start with a short clip to see the quality!
    </p>
    ${emailFooter()}`;

  await sendEmail(to, `Welcome to Clipiro, ${name}! Here are your ${credits} free credits 🎬`, html, "welcome");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NEW LOGIN SECURITY ALERT
// ─────────────────────────────────────────────────────────────────────────────
export async function sendNewLoginAlertEmail(
  to: string, name: string, time: string, location: string, device: string
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">New sign-in to your account</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">Hi ${displayName}, we noticed a new login to your Clipiro account.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#64748b;font-size:14px;padding:6px 0;">Time</td><td style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${time}</td></tr>
        <tr><td style="color:#64748b;font-size:14px;padding:6px 0;">Location</td><td style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${location}</td></tr>
        <tr><td style="color:#64748b;font-size:14px;padding:6px 0;">Device</td><td style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${device}</td></tr>
      </table>
    </div>

    <p style="color:#475569;font-size:14px;margin:0 0 16px;">If this was you, no action is needed. If you don&apos;t recognise this sign-in, secure your account immediately.</p>
    ${ctaButton("https://clipiro.com/reset-password-request", "Secure My Account →", "#dc2626")}
    ${emailFooter()}`;

  await sendEmail(to, "New sign-in to your Clipiro account", html, "login-alert");
}

// Sent whenever a password change succeeds — never gated by notification
// preferences (lib/notifications.ts), same as the login alert above.
export async function sendPasswordChangedAlertEmail(to: string, name: string, time: string): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Your password was changed</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, this confirms your Clipiro password was changed on ${time}. Every other device you were
      signed in on has been signed out — this device stays signed in.
    </p>
    <p style="color:#475569;font-size:14px;margin:0 0 16px;">If you made this change, no action is needed. If you didn&apos;t, secure your account immediately.</p>
    ${ctaButton("https://clipiro.com/reset-password-request", "Secure My Account →", "#dc2626")}
    ${emailFooter()}`;

  await sendEmail(to, "Your Clipiro password was changed", html, "password-changed-alert");
}

// Sent whenever 2FA is switched on or off — same never-gated security-alert
// tier as the two above. Turning 2FA *off* is the one an attacker would want
// to happen quietly, so it is the more important of the two directions.
export async function sendTwoFactorChangedAlertEmail(
  to: string, name: string, enabled: boolean, time: string
): Promise<void> {
  const displayName = name || "there";
  const headline = enabled
    ? "Two-factor authentication is on"
    : "Two-factor authentication was turned off";
  const body = enabled
    ? `Hi ${displayName}, two-factor authentication was enabled on your Clipiro account on ${time}. You&apos;ll now be asked for a code from your authenticator app each time you sign in.`
    : `Hi ${displayName}, two-factor authentication was disabled on your Clipiro account on ${time}, and every other device has been signed out. Your account is now protected by your password alone.`;
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">${headline}</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">${body}</p>
    <p style="color:#475569;font-size:14px;margin:0 0 16px;">If you made this change, no action is needed. If you didn&apos;t, secure your account immediately.</p>
    ${ctaButton("https://clipiro.com/reset-password-request", "Secure My Account →", "#dc2626")}
    ${emailFooter()}`;

  await sendEmail(
    to,
    enabled ? "Two-factor authentication enabled on Clipiro" : "Two-factor authentication disabled on Clipiro",
    html,
    "two-factor-changed-alert",
  );
}

// Verify-email / change-email confirmation links. Both point at the same
// confirm route with a Redis-backed one-time token (mirrors sendPasswordResetEmail's
// pattern exactly) — see app/api/auth/verify-email/* and app/api/auth/change-email/*.
export async function sendVerifyEmailEmail(to: string, name: string, verifyLink: string): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Verify your email</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, confirm this is your email address to finish securing your Clipiro account.
    </p>
    ${ctaButton(verifyLink, "Verify Email →", "#7c3aed")}
    <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">This link expires in 30 minutes. If you didn&apos;t request this, you can ignore it.</p>
    ${emailFooter()}`;

  await sendEmail(to, "Verify your email — Clipiro", html, "verify-email");
}

export async function sendAccountExportReadyEmail(to: string, name: string, downloadUrl: string): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Your data export is ready</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, the copy of your Clipiro account data you requested is ready to download.
    </p>
    ${ctaButton(downloadUrl, "Download My Data →", "#7c3aed")}
    <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">This link expires in 24 hours.</p>
    ${emailFooter()}`;

  await sendEmail(to, "Your Clipiro data export is ready", html, "account-export-ready");
}

export async function sendChangeEmailConfirmationEmail(to: string, name: string, confirmLink: string): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Confirm your new email</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, someone requested to change the email on a Clipiro account to this address. Confirm it
      below to complete the change — your account still uses your old email until you do.
    </p>
    ${ctaButton(confirmLink, "Confirm Email Change →", "#7c3aed")}
    <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">This link expires in 30 minutes. If you didn&apos;t request this, you can ignore it — your email won&apos;t change.</p>
    ${emailFooter()}`;

  await sendEmail(to, "Confirm your new email — Clipiro", html, "change-email-confirm");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AFFILIATE — REFERRAL SIGNED UP
// ─────────────────────────────────────────────────────────────────────────────
export async function sendAffiliateReferralSignupEmail(
  to: string, affiliateName: string, referredName: string, totalReferrals: number
): Promise<void> {
  const name = affiliateName || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">🎉 ${referredName} just joined using your link!</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${name}, great news — <strong>${referredName}</strong> signed up to Clipiro using your referral link.
      You&apos;ll earn a commission when they make their first purchase.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="color:#16a34a;font-size:14px;font-weight:600;margin:0 0 4px;">TOTAL REFERRALS</p>
      <span style="font-size:48px;font-weight:800;color:#15803d;">${totalReferrals}</span>
    </div>

    <p style="color:#475569;font-size:14px;margin:0 0 20px;">Keep sharing your link to earn more commissions. Top affiliates earn ₹5,000+ per month!</p>
    ${ctaButton("https://clipiro.com/affiliate-program", "View Affiliate Dashboard →", "#16a34a")}
    ${emailFooter()}`;

  await sendEmail(to, `🎉 ${referredName} just joined Clipiro using your referral link!`, html, "affiliate-referral-signup");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AFFILIATE — COMMISSION EARNED
// ─────────────────────────────────────────────────────────────────────────────
export async function sendAffiliateCommissionEmail(
  to: string, affiliateName: string, commission: number, baseAmount: number,
  totalEarned: number, availableAt: Date
): Promise<void> {
  const name = affiliateName || "there";
  const availableStr = availableAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">💰 You earned ₹${commission.toFixed(2)} in commission!</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">Hi ${name}, one of your referrals just made a purchase. Here&apos;s your commission breakdown:</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#64748b;font-size:14px;padding:6px 0;">Purchase amount</td><td style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;">₹${baseAmount.toFixed(2)}</td></tr>
        <tr><td style="color:#64748b;font-size:14px;padding:6px 0;">Commission earned</td><td style="color:#16a34a;font-size:15px;font-weight:800;text-align:right;">₹${commission.toFixed(2)}</td></tr>
        <tr><td style="color:#64748b;font-size:14px;padding:6px 0;">Available from</td><td style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${availableStr}</td></tr>
        <tr style="border-top:1px solid #e2e8f0;"><td style="color:#64748b;font-size:14px;padding:10px 0 6px;">Total earned (all time)</td><td style="color:#0f172a;font-size:14px;font-weight:700;text-align:right;padding:10px 0 6px;">₹${totalEarned.toFixed(2)}</td></tr>
      </table>
    </div>

    <p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">⏳ Commission is held for 30 days as fraud protection, then becomes available for payout.</p>
    ${ctaButton("https://clipiro.com/affiliate-program", "View Earnings →", "#16a34a")}
    ${emailFooter()}`;

  await sendEmail(to, `💰 You earned ₹${commission.toFixed(2)} — commission confirmed!`, html, "affiliate-commission");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. AFFILIATE — COMMISSION NOW AVAILABLE FOR PAYOUT
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCommissionAvailableEmail(
  to: string, affiliateName: string, amount: number
): Promise<void> {
  const name = affiliateName || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Your commission is ready for payout!</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">Hi ${name}, your 30-day hold period is over.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;padding:28px;text-align:center;margin-bottom:24px;">
      <p style="color:#16a34a;font-size:14px;font-weight:600;margin:0 0 4px;">AVAILABLE FOR WITHDRAWAL</p>
      <span style="font-size:52px;font-weight:800;color:#15803d;">₹${amount.toFixed(2)}</span>
    </div>

    ${ctaButton("https://clipiro.com/affiliate-program", "Request Payout →", "#16a34a")}
    ${emailFooter()}`;

  await sendEmail(to, `Your ₹${amount.toFixed(2)} commission is ready for payout`, html, "commission-available");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUBSCRIPTION EXPIRY WARNING
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSubscriptionExpiryWarningEmail(
  to: string, name: string, planName: string, daysLeft: number, expiryDate: Date
): Promise<void> {
  const displayName = name || "there";
  const expiryStr = expiryDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const urgencyColor = daysLeft <= 1 ? "#dc2626" : daysLeft <= 3 ? "#ea580c" : "#d97706";
  const emoji = daysLeft <= 1 ? "⏰" : daysLeft <= 3 ? "⚠️" : "📅";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">${emoji} Your ${planName} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, your subscription ends on <strong>${expiryStr}</strong>.
      Renew now to keep your monthly credits and all Pro features.
    </p>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:${urgencyColor};font-size:14px;font-weight:700;margin:0 0 8px;">What you&apos;ll lose after expiry:</p>
      <ul style="color:#475569;font-size:14px;margin:0;padding-left:20px;line-height:2;">
        <li>Monthly credit refills</li>
        <li>Pro-only tools and features</li>
        <li>Priority rendering</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/pricing", `Renew ${planName} →`, urgencyColor)}
    <p style="color:#94a3b8;font-size:13px;margin:16px 0 0;">Renewing takes less than 60 seconds.</p>
    ${emailFooter()}`;

  const subject = daysLeft <= 1
    ? `⏰ Last chance — your subscription expires tomorrow`
    : `${emoji} ${daysLeft} days left on your Clipiro ${planName} plan`;
  await sendEmail(to, subject, html, `expiry-warning-${daysLeft}d`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SUBSCRIPTION EXPIRED
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSubscriptionExpiredEmail(
  to: string, name: string, planName: string, creditsRemaining: number
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Your ${planName} subscription has ended</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, your Clipiro Pro plan has expired. Don&apos;t worry — your <strong>${creditsRemaining} existing credits</strong> are still safe in your account.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 8px;">On free tier, you can still:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2;">
        <li>Use your remaining ${creditsRemaining} credits</li>
        <li>Access basic tools</li>
      </ul>
      <p style="color:#475569;font-size:14px;font-weight:600;margin:16px 0 8px;">To get back on Pro:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2;">
        <li>Monthly credit refills</li>
        <li>All Pro AI tools</li>
        <li>Priority rendering queue</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/pricing", "Resubscribe → Pick a Plan", "#2563eb")}
    ${emailFooter()}`;

  await sendEmail(to, `Your Clipiro ${planName} subscription has ended`, html, "sub-expired");
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MONTHLY CREDITS REFILLED
// ─────────────────────────────────────────────────────────────────────────────
export async function sendCreditsRefilledEmail(
  to: string, name: string, creditsAdded: number, newBalance: number
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">🔄 Your ${creditsAdded} credits have been refreshed!</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">Hi ${displayName}, your monthly credit refill is here. Time to create!</p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:28px;text-align:center;margin-bottom:24px;">
      <p style="color:#1d4ed8;font-size:14px;font-weight:600;margin:0 0 4px;">CURRENT BALANCE</p>
      <span style="font-size:52px;font-weight:800;color:#1e40af;">${newBalance}</span>
      <p style="color:#3b82f6;font-size:14px;margin:4px 0 0;">credits</p>
    </div>

    ${ctaButton("https://clipiro.com/dashboard", "Start Creating →")}
    ${emailFooter()}`;

  await sendEmail(to, `🔄 Your ${creditsAdded} Clipiro credits have been refreshed!`, html, "credits-refilled");
}

// ─────────────────────────────────────────────────────────────────────────────
// 8b. AUTO TOP-UP: one-click purchase link (2026-07 audit)
// ─────────────────────────────────────────────────────────────────────────────
// Auto top-up in India mostly can't complete as an instant background charge
// — recurring debits require a registered mandate with pre-debit
// notification, which most saved payment methods here don't have wired up.
// This email IS the dominant "auto" top-up path: one click lands the user
// straight in checkout for their chosen pack, prefilled.
export async function sendAutoTopupPromptEmail(
  to: string, name: string, balance: number, packName: string, checkoutUrl: string,
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">You're running low on credits</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">
      Hi ${displayName}, your balance just dropped to <strong>${balance} credit${balance === 1 ? "" : "s"}</strong>.
      You've turned on auto top-up — one click below tops you up with ${packName} so you're never blocked mid-render.
    </p>
    ${ctaButton(checkoutUrl, "Top up now →")}
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">You can turn off auto top-up anytime from Billing settings.</p>
    ${emailFooter()}`;

  await sendEmail(to, `You're low on Clipiro credits — top up in one click`, html, "auto-topup-prompt");
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. UNUSED CREDITS REMINDER (mid-month)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendUnusedCreditsReminderEmail(
  to: string, name: string, creditsLeft: number, nextRefillAt: Date
): Promise<void> {
  const displayName = name || "there";
  const refillStr = nextRefillAt.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">You have ${creditsLeft} credits sitting unused</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, your credits refresh on <strong>${refillStr}</strong>. Don&apos;t let this month&apos;s credits go to waste!
    </p>

    <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">Quick ideas for your ${creditsLeft} credits:</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
        <li>🎬 Create a YouTube Short from a script</li>
        <li>🎤 Generate an AI voiceover for your next video</li>
        <li>✂️ Auto-clip a long video into viral shorts</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/dashboard", "Use My Credits →")}
    ${emailFooter()}`;

  await sendEmail(to, `${displayName}, you have ${creditsLeft} credits sitting unused this month`, html, "unused-credits");
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. LOW CREDITS WARNING (≤20% of monthly allocation)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendLowCreditsEmail(
  to: string, name: string, creditsLeft: number, estimatedVideos: number
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">You&apos;re running low on credits</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, you&apos;ve been productive! You have <strong>${creditsLeft} credits</strong> remaining — enough for about <strong>~${estimatedVideos} more video${estimatedVideos === 1 ? "" : "s"}</strong>.
    </p>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#ea580c;font-size:24px;font-weight:800;margin:0 0 4px;">${creditsLeft} credits left</p>
      <p style="color:#92400e;font-size:13px;margin:0;">💡 Tip: Preview your video before rendering to save credits</p>
    </div>

    ${ctaButton("https://clipiro.com/pricing", "Top Up Credits →", "#ea580c")}
    ${emailFooter()}`;

  await sendEmail(to, `You&apos;re running low — ${creditsLeft} credits left`, html, "low-credits");
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. ZERO CREDITS — HARD CONVERSION
// ─────────────────────────────────────────────────────────────────────────────
export async function sendZeroCreditsEmail(to: string, name: string): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">You&apos;ve used all your credits</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, you tried to create something but ran out of credits. Get back to creating in under 60 seconds:
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">Top up options:</p>
      <table style="width:100%;">
        <tr>
          <td style="padding:8px;background:#eff6ff;border-radius:8px;text-align:center;">
            <p style="color:#1e40af;font-weight:700;font-size:16px;margin:0;">Starter Pack</p>
            <p style="color:#3b82f6;font-size:13px;margin:4px 0;">+100 credits</p>
          </td>
          <td style="width:12px;"></td>
          <td style="padding:8px;background:#f0fdf4;border-radius:8px;text-align:center;">
            <p style="color:#15803d;font-weight:700;font-size:16px;margin:0;">Pro Plan</p>
            <p style="color:#16a34a;font-size:13px;margin:4px 0;">500 credits/month</p>
          </td>
        </tr>
      </table>
    </div>

    ${ctaButton("https://clipiro.com/pricing", "Get More Credits →", "#2563eb")}
    ${emailFooter()}`;

  await sendEmail(to, "You've used all your credits — here's how to get more", html, "zero-credits");
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. ONBOARDING DAY 1 — No activity nudge
// ─────────────────────────────────────────────────────────────────────────────
export async function sendOnboardingDay1Email(to: string, name: string, creditsLeft: number): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Your ${creditsLeft} credits are waiting, ${displayName}!</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      You signed up yesterday but haven&apos;t created anything yet. Your first AI video takes less than 2 minutes — here&apos;s how:
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">3 ideas to try right now:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
        <li>🎬 <strong>Split-screen video</strong> — paste a script, get a video</li>
        <li>✂️ <strong>Auto Clip</strong> — upload a long video, get viral shorts</li>
        <li>🎤 <strong>AI Voiceover</strong> — turn text into professional narration</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/dashboard", "Create My First Video →")}
    ${emailFooter()}`;

  await sendEmail(to, `Your ${creditsLeft} Clipiro credits are waiting — here's how to use them`, html, "onboarding-day1");
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. ONBOARDING DAY 3
// ─────────────────────────────────────────────────────────────────────────────
export async function sendOnboardingDay3Email(
  to: string, name: string, creditsUsed: number, hasUsed: boolean
): Promise<void> {
  const displayName = name || "there";
  const subject = hasUsed
    ? `${displayName}, you've already created ${creditsUsed} videos 🔥 Here's what's next`
    : `Still haven't tried Clipiro? Here's what you're missing`;

  const bodyHtml = hasUsed
    ? `<p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">You&apos;ve already used <strong>${creditsUsed} credits</strong> — amazing start! Here&apos;s a feature you might not have discovered yet:</p>
       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
         <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0 0 8px;">🎯 Social Tracker</p>
         <p style="color:#64748b;font-size:14px;margin:0;">Connect your YouTube or Instagram and track your video performance — views, likes, growth — all in one dashboard.</p>
       </div>`
    : `<p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">You&apos;ve been signed up for 3 days but haven&apos;t created anything yet. Here&apos;s what thousands of creators are making with Clipiro:</p>
       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
         <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
           <li>Viral YouTube Shorts from text scripts</li>
           <li>Auto-clipped highlights from long-form videos</li>
           <li>AI voiceovers in 50+ voices</li>
         </ul>
       </div>`;

  const html = `${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">${hasUsed ? "🔥 Great progress!" : "👀 You're missing out"}</h1>
    ${bodyHtml}
    ${ctaButton("https://clipiro.com/dashboard", "Go to Dashboard →")}
    ${emailFooter()}`;

  await sendEmail(to, subject, html, "onboarding-day3");
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. ONBOARDING DAY 7 — Upgrade prompt
// ─────────────────────────────────────────────────────────────────────────────
export async function sendOnboardingDay7Email(to: string, name: string, creditsLeft: number): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">One week in — keep your momentum going!</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, you have <strong>${creditsLeft} free credits</strong> remaining. When they&apos;re gone, upgrade to keep creating non-stop.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">With a Pro plan you get:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
        <li>✅ Monthly credit refills — never run out</li>
        <li>✅ All AI tools unlocked</li>
        <li>✅ Priority rendering queue</li>
        <li>✅ Social Tracker analytics</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/pricing", "See Plans & Pricing →")}
    <p style="color:#94a3b8;font-size:13px;margin:16px 0 0;">Plans start from just ₹299/month. Cancel anytime.</p>
    ${emailFooter()}`;

  await sendEmail(to, `Keep creating — ${creditsLeft} free credits left, upgrade for more`, html, "onboarding-day7");
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. RE-ENGAGEMENT — 7 days inactive
// ─────────────────────────────────────────────────────────────────────────────
export async function sendReengagement7DayEmail(
  to: string, name: string, creditsLeft: number
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">We miss you, ${displayName}! 👋</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      You haven&apos;t created anything in a while. Your <strong>${creditsLeft} credits</strong> are still here, ready to go.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">Jump back in and try something new:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
        <li>🤖 AI Creator Wizard — describe your idea, get a full video</li>
        <li>🎭 Voice Changer — transform any voice in seconds</li>
        <li>📊 Social Tracker — see how your videos are performing</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/dashboard", "Jump Back In →")}
    ${emailFooter()}`;

  await sendEmail(to, `${displayName}, your ${creditsLeft} credits are waiting for you`, html, "reengagement-7d");
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. RE-ENGAGEMENT — 30 days inactive (win-back)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendReengagement30DayEmail(
  to: string, name: string, creditsLeft: number, daysSinceLogin: number
): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">It&apos;s been a while — here&apos;s what&apos;s new</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, it&apos;s been ${daysSinceLogin} days since you last logged in. A lot has improved — and you still have <strong>${creditsLeft} credits</strong> waiting.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">🆕 What&apos;s new at Clipiro:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
        <li>Faster rendering engine — 2× speed improvement</li>
        <li>50+ new AI voice styles</li>
        <li>Instagram & YouTube Social Tracker</li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/dashboard", "See What's New →")}
    <p style="color:#94a3b8;font-size:13px;margin:16px 0 0;">Your ${creditsLeft} credits never expire while you&apos;re on a paid plan.</p>
    ${emailFooter()}`;

  await sendEmail(to, `We miss you — here's what's new at Clipiro`, html, "reengagement-30d");
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — WEEKLY OPERATIONS DIGEST
// ─────────────────────────────────────────────────────────────────────────────
export interface AdminDigestData {
  mrrInPaise: number;
  revenueMtdInPaise: number;
  newUsers7d: number;
  activeSubscribers: number;
  generations7d: number;
  failedGenerations7d: number;
  syncFailuresToday: number;
}

export async function sendAdminDigestEmail(to: string, d: AdminDigestData): Promise<void> {
  const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
  const row = (label: string, value: string, accent = "#0f172a") =>
    `<tr><td style="color:#64748b;font-size:14px;padding:6px 0;">${label}</td><td style="color:${accent};font-size:14px;font-weight:700;text-align:right;padding:6px 0;">${value}</td></tr>`;
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Clipiro weekly ops digest 📈</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">The numbers that matter, straight from the admin metrics engine.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("MRR", inr(d.mrrInPaise), "#1d4ed8")}
        ${row("Revenue this month", inr(d.revenueMtdInPaise))}
        ${row("Active subscribers", String(d.activeSubscribers))}
        ${row("New users (7d)", String(d.newUsers7d))}
        ${row("Generations (7d)", String(d.generations7d))}
        ${row("Failed generations (7d)", String(d.failedGenerations7d), d.failedGenerations7d > 0 ? "#dc2626" : "#16a34a")}
        ${row("Social sync failures today", String(d.syncFailuresToday), d.syncFailuresToday > 0 ? "#dc2626" : "#16a34a")}
      </table>
    </div>
    ${ctaButton("https://clipiro.com/admin", "Open Admin Dashboard →")}
    ${emailFooter()}`;

  await sendEmail(to, "Clipiro weekly ops digest", html, "admin-digest");
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — AFFILIATE PAYOUT READY
// ─────────────────────────────────────────────────────────────────────────────
export interface AdminAffiliatePayoutReadyData {
  affiliateName: string;
  affiliateEmail: string;
  affiliateCode: string;
  availableAmount: number;
  trigger: "threshold" | "requested";
}

export async function sendAdminAffiliatePayoutReadyEmail(to: string, d: AdminAffiliatePayoutReadyData): Promise<void> {
  const who = d.affiliateName || d.affiliateEmail;
  const heading = d.trigger === "requested"
    ? `${who} requested a payout`
    : `${who} crossed the ₹${MIN_PAYOUT_AMOUNT} payout threshold`;
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">${heading}</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;">
      ${d.affiliateEmail} (<span style="font-family:monospace;">${d.affiliateCode}</span>) has ₹${d.availableAmount.toFixed(2)} available for payout.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="color:#16a34a;font-size:14px;font-weight:600;margin:0 0 4px;">AVAILABLE FOR PAYOUT</p>
      <span style="font-size:44px;font-weight:800;color:#15803d;">₹${d.availableAmount.toFixed(2)}</span>
    </div>
    ${ctaButton("https://clipiro.com/admin/affiliate", "Open Payouts Tab →")}
    ${emailFooter()}`;

  await sendEmail(to, `Payout ready: ${d.affiliateCode} — ₹${d.availableAmount.toFixed(2)}`, html, "admin-affiliate-payout-ready");
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL TRACKER — WEEKLY DIGEST
// ─────────────────────────────────────────────────────────────────────────────
export interface SocialDigestAccount {
  platform: string; // "YouTube" | "Instagram" | …
  name: string; // display name / @username
  followers: number | null;
  followerDelta: number | null; // vs 7 days ago
  postsThisWeek: number;
}

export async function sendSocialDigestEmail(to: string, name: string, accounts: SocialDigestAccount[]): Promise<void> {
  const displayName = name || "there";
  const fmtNum = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const rows = accounts
    .map((a) => {
      const delta =
        a.followerDelta === null
          ? `<span style="color:#94a3b8;">—</span>`
          : a.followerDelta >= 0
            ? `<span style="color:#16a34a;font-weight:700;">+${fmtNum(a.followerDelta)}</span>`
            : `<span style="color:#dc2626;font-weight:700;">−${fmtNum(Math.abs(a.followerDelta))}</span>`;
      return `<tr>
        <td style="color:#0f172a;font-size:14px;font-weight:600;padding:8px 0;">${a.platform} · ${a.name}</td>
        <td style="color:#0f172a;font-size:14px;text-align:right;padding:8px 0;">${a.followers === null ? "—" : fmtNum(a.followers)}</td>
        <td style="font-size:14px;text-align:right;padding:8px 0;">${delta}</td>
        <td style="color:#64748b;font-size:14px;text-align:right;padding:8px 0;">${a.postsThisWeek}</td>
      </tr>`;
    })
    .join("");
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">Your week on social 📊</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">Hi ${displayName}, here&apos;s how your connected accounts did over the last 7 days.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">Account</td>
          <td style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;padding-bottom:4px;">Followers</td>
          <td style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;padding-bottom:4px;">7d</td>
          <td style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;padding-bottom:4px;">Posts</td>
        </tr>
        ${rows}
      </table>
    </div>

    ${ctaButton("https://clipiro.com/dashboard/social-tracker", "Open Social Tracker →")}
    ${emailFooter()}`;

  await sendEmail(to, "Your week on social — Clipiro digest", html, "social-digest");
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. FIRST VIDEO SUCCESS — Upsell at peak excitement
// ─────────────────────────────────────────────────────────────────────────────
export async function sendFirstVideoSuccessEmail(to: string, name: string): Promise<void> {
  const displayName = name || "there";
  const html = `
    ${emailHeader()}
    <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;">You just made your first Clipiro video! 🎬🎉</h1>
    <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.6;">
      Hi ${displayName}, congratulations on your first AI video! Now that you&apos;ve seen what&apos;s possible, here&apos;s what&apos;s waiting for you on Pro:
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <p style="color:#475569;font-size:14px;font-weight:600;margin:0 0 12px;">Upgrade to Pro and unlock:</p>
      <ul style="color:#64748b;font-size:14px;margin:0;padding-left:20px;line-height:2.2;">
        <li>🔄 <strong>Monthly credit refills</strong> — never run out again</li>
        <li>🎬 <strong>Higher resolution exports</strong></li>
        <li>🤖 <strong>All AI tools</strong> — Voice Changer, Auto Clip, Creator Wizard</li>
        <li>📊 <strong>Social Tracker</strong> — see how your videos perform</li>
        <li>⚡ <strong>Priority rendering queue</strong></li>
      </ul>
    </div>

    ${ctaButton("https://clipiro.com/pricing", "Explore Pro Plans →")}
    <p style="color:#94a3b8;font-size:13px;margin:16px 0 0;">Plans start from ₹299/month. Cancel anytime.</p>
    ${emailFooter()}`;

  await sendEmail(to, `You just made your first Clipiro video 🎬 Here's what's next`, html, "first-video-success");
}
