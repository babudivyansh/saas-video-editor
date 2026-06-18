import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export type DeliveryChannel = "email" | "sms" | "dev-console";

export async function sendOtpEmail(to: string, otp: string): Promise<DeliveryChannel> {
  // No SMTP configured → dev fallback so OTP login is testable without an
  // email provider. Plug EMAIL_USER/EMAIL_PASS into .env to send real mail.
  if (!process.env.EMAIL_USER) {
    console.log(`[email:dev] OTP for ${to}: ${otp}`);
    return "dev-console";
  }

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@clipiro.app";

  await transporter.sendMail({
    from: `"Clipiro" <${from}>`,
    to,
    subject: "Your Clipiro verification code",
    html: `
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
    `,
  });

  return "email";
}
