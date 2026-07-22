import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import { appUrl } from "@/lib/social/oauth";

export async function GET() {
  // Fixed, config-driven redirect_uri (same pattern as lib/social/oauth.ts's
  // other OAuth providers) — not derived from the request's Host header.
  // That header can differ between this initial redirect and the eventual
  // callback request (behind a proxy/CDN, or a www/non-www redirect), which
  // makes Google reject the token exchange with redirect_uri_mismatch even
  // though both of this app's own routes agree with each other.
  const redirectUri = `${appUrl()}/api/auth/callback/google`;

  // Anti-CSRF state: random nonce echoed back by Google and matched against
  // an httpOnly cookie in the callback, so an attacker can't complete a
  // login flow they initiated (login CSRF) by handing the victim a code.
  const state = crypto.randomBytes(16).toString("hex");

  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const options = {
    redirect_uri: redirectUri,
    client_id: env.GOOGLE_CLIENT_ID!,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    state,
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  };
  const q = new URLSearchParams(options).toString();
  const res = NextResponse.redirect(`${rootUrl}?${q}`);
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/callback/google",
    maxAge: 10 * 60,
  });
  return res;
}
