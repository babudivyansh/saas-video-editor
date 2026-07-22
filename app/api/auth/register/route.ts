import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { completeLogin, setSessionCookie } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { attributeReferral } from "@/lib/affiliate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const phoneRaw = (body.phone ?? "").trim();
    const phone = phoneRaw.replace(/[\s-]/g, "");
    const { password, confirmPassword } = body;
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim() : null;

    if (!firstName || !lastName || !email || !phone || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (!PHONE_RE.test(phone)) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
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

    const [emailTaken, phoneTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { phone } }),
    ]);
    if (emailTaken) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    if (phoneTaken) {
      return NextResponse.json({ error: "Phone number already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        passwordHash,
        // Signup grant lands in the bonus bucket (30-day expiry); the monthly
        // free-tier drip is anchored one month out from signup.
        credits: 10,
        bonusCredits: 10,
        bonusCreditsExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        freeCreditsRefillAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      },
      select: { id: true, email: true, credits: true },
    });

    const { token } = await completeLogin(req, user);

    const referralOutcome = await attributeReferral({
      cookieCode: req.cookies.get("affiliate_ref")?.value ?? null,
      typedCode: referralCode,
      email,
      phone,
      newUser: { id: user.id, firstName, name: `${firstName} ${lastName}` },
      signupIp:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        null,
    });
    // Never leak the affiliate's own email/name back to the newly-registered
    // client — only the outcome (and code, on success) is safe to return.
    const referralForClient = referralOutcome
      ? referralOutcome.applied
        ? { applied: true as const, code: referralOutcome.code }
        : referralOutcome
      : undefined;

    const res = NextResponse.json(
      { token, user, ...(referralForClient ? { referral: referralForClient } : {}) },
      { status: 201 },
    );
    setSessionCookie(res, token);
    // Clear the affiliate cookie after attribution
    res.cookies.set("affiliate_ref", "", { maxAge: 0, path: "/" });

    // ── Welcome email (non-fatal) ────────────────────────────────────────
    sendWelcomeEmail(user.email, firstName, user.credits).catch(
      (e) => logger.error("register", "welcome email error", e)
    );

    return res;
  } catch (err) {
    logger.error("register", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
