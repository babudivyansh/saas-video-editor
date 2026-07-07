import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, cacheSession } from "@/lib/auth";
import { sendWelcomeEmail, sendAffiliateReferralSignupEmail } from "@/lib/email";

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
        credits: 10,
      },
      select: { id: true, email: true, credits: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    await cacheSession(user.id, token);

    // Affiliate attribution — read cookie set by middleware
    const affiliateRef = req.cookies.get("affiliate_ref")?.value;
    if (affiliateRef) {
      try {
        const affiliate = await prisma.affiliate.findUnique({ where: { code: affiliateRef } });
        if (affiliate && affiliate.userId !== user.id && affiliate.status === "active") {
          // IP-based fraud detection — flag if same /24 subnet as affiliate's last signup
          const signupIp =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            req.headers.get("x-real-ip") ??
            null;

          const affiliateIp = await prisma.referral
            .findFirst({ where: { affiliateId: affiliate.id }, orderBy: { signedUpAt: "desc" } })
            .then(r => r?.signupIp ?? null);

          const sameSubnet =
            signupIp &&
            affiliateIp &&
            signupIp.split(".").slice(0, 3).join(".") === affiliateIp.split(".").slice(0, 3).join(".");

          await prisma.referral.create({
            data: {
              affiliateId: affiliate.id,
              referredUserId: user.id,
              status: sameSubnet ? "flagged" : "signed_up",
              signupIp,
            },
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { referredBy: affiliate.id },
          });

          // ── Notify affiliate about new referral (non-fatal) ──────────
          const affiliateUser = await prisma.user.findUnique({
            where: { id: affiliate.userId },
            select: { email: true, firstName: true, name: true },
          });
          const totalReferrals = await prisma.referral.count({ where: { affiliateId: affiliate.id } });
          if (affiliateUser && !sameSubnet) {
            sendAffiliateReferralSignupEmail(
              affiliateUser.email,
              affiliateUser.firstName ?? affiliateUser.name ?? "",
              firstName,
              totalReferrals,
            ).catch((e) => console.error("[register] affiliate referral email error", e));
          }
        }
      } catch {
        // Non-fatal: referral attribution failure should not block registration
      }
    }

    const res = NextResponse.json({ token, user }, { status: 201 });
    // Clear the affiliate cookie after attribution
    res.cookies.set("affiliate_ref", "", { maxAge: 0, path: "/" });

    // ── Welcome email (non-fatal) ────────────────────────────────────────
    sendWelcomeEmail(user.email, firstName, user.credits).catch(
      (e) => console.error("[register] welcome email error", e)
    );

    return res;
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
