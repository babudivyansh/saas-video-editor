import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "clipiro.com";
  const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const redirectUri = `${proto}://${host}/api/auth/callback/google`;

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
