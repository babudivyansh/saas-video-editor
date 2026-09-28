import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, setLocaleCookieFromUser } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { claimUnverifiedAccount } from "@/lib/account-claim";
import { cleanName, NAME_MAX } from "@/lib/auth-validation";
import { greetingName } from "@/lib/display-name";
import { sendWelcomeEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { grantFreeTierMinutes } from "@/lib/minutes";
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
    const name =
      cleanName(profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ")).slice(0, NAME_MAX) ||
      null;
    const avatarUrl = profile.picture;

    if (!email) {
      return NextResponse.json({ error: "Email not provided by Google account" }, { status: 400 });
    }

    // Account-linking by email is takeover-adjacent: a Google account whose
    // email is unverified could otherwise link into (or create) an account on
    // an address its owner never proved control of. Google's v3 userinfo
    // returns email_verified for the email scope; anything but an explicit
    // true (false, or the field missing) is refused.
    if (profile.email_verified !== true) {
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
          avatarUrl,
          passwordHash,
          // The hash above is random and never shown to anyone, so this
          // account has no password its owner knows — sensitive actions step
          // up with an emailed code instead (lib/step-up.ts).
          hasPassword: false,
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

      // The free tier's Clip Minutes, through the ledgered helper (a raw column
      // write here would leave refunds nothing to restore against). Best-effort:
      // a failed grant must not fail the signup — the monthly drip retries it.
      const newUserId = user.id;
      await grantFreeTierMinutes(newUserId, "grant:signup").catch((e) =>
        logger.error("auth", `signup minutes grant failed for ${newUserId}`, e));

      // Google doesn't collect a typed code, so this is cookie-attribution
      // only — the helper degrades gracefully.
      await attributeReferral({
        cookieCode: req.cookies.get("affiliate_ref")?.value ?? null,
        typedCode: null,
        email,
        newUser: { id: user.id, name },
        // The rightmost trusted hop, not the client-supplied leftmost one.
        signupIp: (() => { const ip = getClientIp(req); return ip === "unknown" ? null : ip; })(),
      });
    } else {
      // Existing account. If its address was never verified, whoever created
      // it may not own the inbox — they could have registered this address
      // first, set the password and even 2FA, waiting for the real owner to
      // sign in with Google. The Google sign-in is the first proof of the
      // inbox, so the account is claimed clean: password, 2FA and every
      // session are dropped (lib/account-claim.ts).
      if (!user.emailVerifiedAt) {
        await claimUnverifiedAccount(user.id);
      }
      // Backfill the avatar if they had none.
      if (avatarUrl && !user.avatarUrl) {
        await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
      }
      user = (await prisma.user.findUnique({ where: { id: user.id } }))!;
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

    // 5. Issue JWT and cache session — the same tail as password logins, so a
    // Google sign-in records a LoginEvent, bumps lastLoginAt and sends the
    // new-sign-in alert like every other login does.
    const token = await finishLogin(req, user, getClientIp(req));

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
    setLocaleCookieFromUser(res, user.preferredLanguage);
    res.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/api/auth/callback/google" });

    if (isNewUser) {
      // Clear the affiliate cookie after attribution
      res.cookies.set("affiliate_ref", "", { maxAge: 0, path: "/" });
      // Same shape for campaign attribution: record the conversion and clear
      // the first-touch cookie. Never throws; a missing cookie is a no-op.
      await recordSignupAttribution(req, res, "/api/auth/callback/google");
      // ── Welcome email for new Google signup (non-fatal) ───────────
      sendWelcomeEmail(user.email, greetingName(user.name), user.credits ?? 10).catch(
        (e) => logger.error("google-callback", "welcome email error", e)
      );
    }

    return res;
  } catch (err) {
    logger.error("google-callback", "request failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
