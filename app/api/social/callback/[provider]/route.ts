import { NextRequest, NextResponse } from "next/server";
import { appUrl, consumeState } from "@/lib/social/oauth";
import { handleCallback, oauthProviderFor } from "@/lib/social/service";
import type { OAuthProvider, ProviderId } from "@/lib/social/types";
import { logger } from "@/lib/logger";
import { markQuestComplete } from "@/lib/quests";

// OAuth redirect target. This is a top-level browser navigation (no Authorization
// header), so the caller's identity comes from the signed `state` we minted at
// connect time. On success/failure it bounces back to the dashboard with a flag.
//
// Built from appUrl() — the same source of truth that built the redirect_uri we
// registered with the provider — NOT req.nextUrl.origin. Behind a reverse proxy
// (Hostinger/Passenger) the Node process sees its own internal bind address, so
// req.nextUrl.origin resolves to http://0.0.0.0:3000 and the user lands on an
// unreachable URL after an otherwise successful connect.
function dest(query: Record<string, string>): URL {
  return new URL(`/dashboard/social-tracker?${new URLSearchParams(query)}`, appUrl());
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params; // OAuth app: "youtube" | "meta"
  const sp = req.nextUrl.searchParams;

  const oauthError = sp.get("error");
  if (oauthError) return NextResponse.redirect(dest({ error: oauthError }));

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return NextResponse.redirect(dest({ error: "missing_code" }));
  if (provider !== "youtube" && provider !== "meta") {
    return NextResponse.redirect(dest({ error: "bad_provider" }));
  }

  const consumed = await consumeState(state);
  if (!consumed) return NextResponse.redirect(dest({ error: "invalid_state" }));
  // The platform encoded in state must route through this OAuth app.
  if (oauthProviderFor(consumed.provider as ProviderId) !== provider) {
    return NextResponse.redirect(dest({ error: "provider_mismatch" }));
  }

  try {
    const connected = await handleCallback(provider as OAuthProvider, consumed.userId, code, consumed.verifier);
    void markQuestComplete(consumed.userId, "track-account");
    return NextResponse.redirect(dest({ connected: connected.join(",") }));
  } catch (e) {
    logger.error("social-callback", "request failed", e);
    return NextResponse.redirect(dest({ error: "connect_failed" }));
  }
}
