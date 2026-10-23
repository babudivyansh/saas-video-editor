import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { setSessionCookie, setLocaleCookieFromUser } from "@/lib/auth";
import { finishLogin } from "@/lib/login-tail";
import { signInWithGoogleProfile } from "@/lib/google-account";
import { greetingName } from "@/lib/display-name";
import { sendWelcomeEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { appUrl } from "@/lib/social/oauth";
import { mintTwoFactorTicket } from "@/lib/two-factor-ticket";
import { recordSignupAttribution } from "@/lib/marketing-analytics";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { withNextParam } from "@/lib/safe-redirect";
import { decodeNextFromState, toInlineScriptJson } from "@/lib/oauth-state";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";

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
      signal: AbortSignal.timeout(FETCH_TIMEOUT.auth),
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT.auth),
    });

    if (!profileResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 400 });
    }

    const profile = await profileResponse.json();

    // 3. Find or create the account, then the same gates as /api/auth/login
    // (lib/google-account.ts, shared with the Android app's ID-token route).
    const result = await signInWithGoogleProfile(req, profile);
    if (result.kind === "error") {
      if (result.reason === "suspended" || result.reason === "deactivated") {
        return NextResponse.redirect(new URL(`/login?error=${result.reason}`, appUrl()));
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.kind === "2fa") {
      // Redirect rather than JSON: this is a top-level browser navigation, so
      // the sign-in page picks the ticket back up from the query string and
      // opens on the code step (see AuthForm's `2fa` param handling). `next`
      // rides along the same way — /login itself reads it from the URL once
      // the user actually completes the 2FA step there.
      const ticket = await mintTwoFactorTicket(result.user.id);
      const dest = withNextParam(`/login?2fa=${encodeURIComponent(ticket)}`, next);
      return NextResponse.redirect(new URL(dest, appUrl()));
    }
    const { user, isNewUser } = result;

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
