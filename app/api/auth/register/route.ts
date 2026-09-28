import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { issueOtp, OtpDeliveryError } from "@/lib/otp";
import { savePendingSignup } from "@/lib/signup-pending";
import { cleanName, isValidEmail, normalizeEmail, validateName, validatePassword } from "@/lib/auth-validation";

// POST /api/auth/register { name, email, password, confirmPassword, referralCode? }
//
// Step one of two. Validates the form, parks it in Redis and emails a 6-digit
// code — no account exists yet and no session is issued. The account is
// created by POST /api/auth/register/verify once the code proves the inbox.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = cleanName(body.name);
    const email = normalizeEmail(body.email);
    const { password, confirmPassword } = body;
    const referralCode = typeof body.referralCode === "string" && body.referralCode.trim()
      ? body.referralCode.trim()
      : null;

    const nameError = validateName(name);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    const passwordError = validatePassword(password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const [ipLimit, emailLimit] = await Promise.all([
      rateLimit(`register:ip:${ip}`, 20, 3600),
      rateLimit(`register:email:${email}`, 5, 3600),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await savePendingSignup(email, { name, passwordHash, referralCode });

    let extras: { devCode?: string };
    try {
      extras = await issueOtp("signup", email);
    } catch (err) {
      if (err instanceof OtpDeliveryError) {
        return NextResponse.json({ error: "We couldn't send the verification email. Please try again." }, { status: 503 });
      }
      throw err;
    }

    return NextResponse.json({ pending: true, email, ...extras }, { status: 202 });
  } catch (err) {
    logger.error("register", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
