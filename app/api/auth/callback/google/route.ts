import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, cacheSession, setSessionCookie } from "@/lib/auth";
import { sendWelcomeEmail, sendAffiliateReferralSignupEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Authorization code not provided" }, { status: 400 });
    }

    const host = req.headers.get("host") || "clipiro.com";
    const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    const redirectUri = `${proto}://${host}/api/auth/callback/google`;

    // 1. Exchange code for access tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error("google-callback", "Token exchange failed", errorData);
      return NextResponse.json({
        error: "Failed to exchange authorization code",
        details: errorData
      }, { status: 400 });
    }

    const { access_token } = await tokenResponse.json();

    // 2. Fetch user profile from Google
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 400 });
    }

    const profile = await profileResponse.json();
    const email = profile.email?.toLowerCase();
    const name = profile.name || `${profile.given_name} ${profile.family_name}`.trim();
    const avatarUrl = profile.picture;

    if (!email) {
      return NextResponse.json({ error: "Email not provided by Google account" }, { status: 400 });
    }

    // 3. Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      // Create new user (automatically registering them)
      // Secure random hash for password since they log in via Google
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await prisma.user.create({
        data: {
          email,
          name,
          firstName: profile.given_name || null,
          lastName: profile.family_name || null,
          avatarUrl,
          passwordHash,
          credits: 10, // Default free trial credits
        },
      });

      // Affiliate attribution — read cookie set by middleware
      const affiliateRef = req.cookies.get("affiliate_ref")?.value;
      if (affiliateRef) {
        try {
          const affiliate = await prisma.affiliate.findUnique({ where: { code: affiliateRef } });
          if (affiliate && affiliate.userId !== user.id && affiliate.status === "active") {
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

            // ── Notify affiliate (non-fatal) ────────────────────────────
            const affiliateUser = await prisma.user.findUnique({
              where: { id: affiliate.userId },
              select: { email: true, firstName: true, name: true },
            });
            const totalReferrals = await prisma.referral.count({ where: { affiliateId: affiliate.id } });
            if (affiliateUser && !sameSubnet) {
              sendAffiliateReferralSignupEmail(
                affiliateUser.email,
                affiliateUser.firstName ?? affiliateUser.name ?? "",
                profile.given_name ?? name ?? "A new user",
                totalReferrals,
              ).catch((e) => logger.error("google-callback", "affiliate referral email error", e));
            }
          }
        } catch {
          // Non-fatal
        }
      }
    } else if (avatarUrl && !user.avatarUrl) {
      // Update avatar if they had none
      user = await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl },
      });
    }

    // 4. Issue JWT and cache session
    const token = signToken({ userId: user.id, email: user.email });
    await cacheSession(user.id, token);

    // 5. Return HTML page that sets localStorage and redirects
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authenticating...</title>
        </head>
        <body>
          <p>Redirecting to dashboard...</p>
          <script>
            localStorage.setItem("token", ${JSON.stringify(token)});
            window.location.href = "/dashboard";
          </script>
        </body>
      </html>
    `;

    const res = new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
    setSessionCookie(res, token);

    if (isNewUser) {
      // Clear the affiliate cookie after attribution
      res.cookies.set("affiliate_ref", "", { maxAge: 0, path: "/" });
      // ── Welcome email for new Google signup (non-fatal) ───────────
      sendWelcomeEmail(user.email, profile.given_name ?? "", user.credits ?? 10).catch(
        (e) => logger.error("google-callback", "welcome email error", e)
      );
    }

    return res;
  } catch (err) {
    logger.error("google-callback", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
