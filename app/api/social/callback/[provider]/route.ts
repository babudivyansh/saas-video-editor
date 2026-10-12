import { NextRequest, NextResponse } from "next/server";
import { appUrl, consumeState, stateClient, type OAuthClient } from "@/lib/social/oauth";
import { handleCallback, oauthProviderFor } from "@/lib/social/service";
import type { OAuthProvider, ProviderId } from "@/lib/social/types";
import { logger } from "@/lib/logger";
import { markQuestComplete } from "@/lib/quests";

// OAuth redirect target. This is a top-level browser navigation (no Authorization
// header), so the caller's identity comes from the signed `state` we minted at
// connect time. On success/failure it bounces back to the dashboard with a flag
// — or, for a connect started in the phone app (a state signed with
// client "app"), back into the app at its Accounts screen.
//
// Built from appUrl() — the same source of truth that built the redirect_uri we
// registered with the provider — NOT req.nextUrl.origin. Behind a reverse proxy
// (Hostinger/Passenger) the Node process sees its own internal bind address, so
// req.nextUrl.origin resolves to http://0.0.0.0:3000 and the user lands on an
// unreachable URL after an otherwise successful connect.

/** The app's Accounts screen (the scheme in apps/mobile/app.json). */
const APP_RETURN = "clipiro://social";

function dest(query: Record<string, string>, client: OAuthClient): URL {
  const qs = new URLSearchParams(query);
  return client === "app" ? new URL(`${APP_RETURN}?${qs}`) : new URL(`/dashboard/social-tracker?${qs}`, appUrl());
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params; // OAuth app: "youtube" | "meta"
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  // Before the state is consumed, only its signature says who started this.
  const client = stateClient(state);

  const oauthError = sp.get("error");
  if (oauthError) return NextResponse.redirect(dest({ error: oauthError }, client));

  if (!code || !state) return NextResponse.redirect(dest({ error: "missing_code" }, client));
  if (provider !== "youtube" && provider !== "meta") {
    return NextResponse.redirect(dest({ error: "bad_provider" }, client));
  }

  const consumed = await consumeState(state);
  if (!consumed) return NextResponse.redirect(dest({ error: "invalid_state" }, client));
  // The platform encoded in state must route through this OAuth app.
  if (oauthProviderFor(consumed.provider as ProviderId) !== provider) {
    return NextResponse.redirect(dest({ error: "provider_mismatch" }, consumed.client));
  }

  try {
    const connected = await handleCallback(provider as OAuthProvider, consumed.userId, code, consumed.verifier);
    void markQuestComplete(consumed.userId, "track-account");
    return NextResponse.redirect(dest({ connected: connected.join(",") }, consumed.client));
  } catch (e) {
    logger.error("social-callback", "request failed", e);
    return NextResponse.redirect(dest({ error: "connect_failed" }, consumed.client));
  }
}
