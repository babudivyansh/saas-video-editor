import { NextResponse } from "next/server";
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

  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const options = {
    redirect_uri: redirectUri,
    client_id: env.GOOGLE_CLIENT_ID!,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  };
  const q = new URLSearchParams(options).toString();
  return NextResponse.redirect(`${rootUrl}?${q}`);
}
