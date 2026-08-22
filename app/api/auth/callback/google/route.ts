import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { completeLogin, setSessionCookie } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { appUrl } from "@/lib/social/oauth";
import { mintTwoFactorTicket } from "@/lib/two-factor-ticket";
import { attributeReferral } from "@/lib/affiliate";
import { recordSignupAttribution } from "@/lib/marketing-analytics";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { withNextParam } from "@/lib/safe-redirect";
import { decodeNextFromState, toInlineScriptJson } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Authorization code not provided" }, { status: 400 });
    }

    // Anti-CSRF: the state Google echoes back must match the nonce we set as
    // an httpOnly cookie when the flow started (app/api/auth/google/route.ts).
    // Without this, an attacker could complete a flow *they* initiated in the
    // victim's browser (login CSRF), silently signing the victim into the
    // attacker's account.
    const state = searchParams.get("state");
    const stateCookie = req.cookies.get("google_oauth_state")?.value;
    const stateValid =
      !!state &&
      !!stateCookie &&
      state.length === stateCookie.length &&
      crypto.timingSafeEqual(Buffer.from(state), Buffer.from(stateCookie));
    if (!stateValid) {
      logger.warn("google-callback", "OAuth state mismatch or missing");
      return NextResponse.redirect(new URL("/login?error=oauth_state", appUrl()));
    }
    // state is confirmed non-null by stateValid above.
    const next = decodeNextFromState(state!);

    const rateLimitResult = await rateLimit(`oauth:google:ip:${getClientIp(req)}`, 20, 3600);
    if (!rateLimitResult.allowed) {
      return NextResponse.redirect(new URL("/login?error=rate_limited", appUrl()));
    }

    // Must exactly match the redirect_uri sent during the initial authorize
    // request in app/api/auth/google/route.ts — same fixed, config-driven
    // value (see the comment there), not derived from this request's Host
    // header, which is what let the two silently drift apart in production.
    const redirectUri = `${appUrl()}/api/auth/callback/google`;

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
      logger.error("google-callback", "Token exchange failed", { redirectUri, appUrlValue: env.NEXT_PUBLIC_APP_URL, errorData });
      return NextResponse.json({ error: "Failed to exchange authorization code" }, { status: 400 });
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

    // Account-linking by email is takeover-adjacent: a Google account whose
    // email is unverified could otherwise link into (or create) an account on
    // an address its owner never proved control of. Google's v3 userinfo
    // returns email_verified for the email scope; reject an explicit false.
    if (profile.email_verified === false) {
      return NextResponse.json({ error: "Your Google email address is not verified." }, { status: 400 });
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
          // Signup grant lands in the bonus bucket (30-day expiry); the
          // monthly free-tier drip is anchored one month out from signup.
          credits: 10,
          bonusCredits: 10,
          bonusCreditsExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          freeCreditsRefillAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
          // Google's OAuth flow already proves control of this inbox — no
          // separate verify-email round trip needed for a Google signup.
          emailVerifiedAt: new Date(),
        },
      });

      // Google doesn't collect a phone or a typed code, so this is
      // cookie-attribution only — the helper degrades gracefully.
      await attributeReferral({
        cookieCode: req.cookies.get("affiliate_ref")?.value ?? null,
        typedCode: null,
        email,
        phone: null,
        newUser: { id: user.id, firstName: profile.given_name ?? null, name },
        signupIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip") ??
          null,
      });
    } else {
      // Existing user signing in via Google — backfill avatar if they had
      // none, and count this as email verification if it wasn't already
      // (they've just proven control of the inbox via Google's own flow).
      const updates: { avatarUrl?: string; emailVerifiedAt?: Date } = {};
      if (avatarUrl && !user.avatarUrl) updates.avatarUrl = avatarUrl;
      if (!user.emailVerifiedAt) updates.emailVerifiedAt = new Date();
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: updates });
      }
    }

    // 4. Same account gates as /api/auth/login — proving control of the Google
    // inbox authenticates the *first* factor and nothing more. Without these,
    // any account whose email matched a Google account skipped 2FA outright,
    // and suspended/deactivated accounts signed straight back in.
    if (user.suspendedAt) {
      return NextResponse.redirect(new URL("/login?error=suspended", appUrl()));
    }
    if (user.deactivatedAt) {
      return NextResponse.redirect(new URL("/login?error=deactivated", appUrl()));
    }
    if (user.twoFactorEnabled) {
      // Redirect rather than JSON: this is a top-level browser navigation, so
      // the sign-in page picks the ticket back up from the query string and
      // opens on the code step (see AuthForm's `2fa` param handling). `next`
      // rides along the same way — /login itself reads it from the URL once
      // the user actually completes the 2FA step there.
      const ticket = await mintTwoFactorTicket(user.id);
      const dest = withNextParam(`/login?2fa=${encodeURIComponent(ticket)}`, next);
      return NextResponse.redirect(new URL(dest, appUrl()));
    }

    // 5. Issue JWT and cache session
    const { token } = await completeLogin(req, user);

    // 6. Return HTML page that sets localStorage and redirects.
    // toInlineScriptJson escapes "<" so a value can never contain a literal
    // "</script>" that would break out of this block — `next` passed
    // getSafeNextPath (which allows any same-origin path, no HTML-safety
    // guarantee) so this is a real boundary, not defensive-for-show. `token`
    // is JWT-shaped and wouldn't contain this today, but there's no reason
    // for its embedding to depend on that staying true.
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authenticating...</title>
        </head>
        <body>
          <p>Redirecting...</p>
          <script>
            localStorage.setItem("token", ${toInlineScriptJson(token)});
            window.location.href = ${toInlineScriptJson(next ?? "/dashboard")};
          </script>
        </body>
      </html>
    `;

    const res = new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
    setSessionCookie(res, token);
    res.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/api/auth/callback/google" });

    if (isNewUser) {
      // Clear the affiliate cookie after attribution
      res.cookies.set("affiliate_ref", "", { maxAge: 0, path: "/" });
      // Same shape for campaign attribution: record the conversion and clear
      // the first-touch cookie. Never throws; a missing cookie is a no-op.
      await recordSignupAttribution(req, res, "/api/auth/callback/google");
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
