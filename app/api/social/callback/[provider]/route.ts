import { NextRequest, NextResponse } from "next/server";
import {
  appUrl,
  consumeState,
  parkAppConnect,
  stateClient,
  OAUTH_BROWSER_COOKIE,
  OAUTH_BROWSER_COOKIE_OPTIONS,
  type OAuthClient,
} from "@/lib/social/oauth";
import { handleCallback, oauthProviderFor } from "@/lib/social/service";
import type { OAuthProvider, ProviderId } from "@/lib/social/types";
import { logger } from "@/lib/logger";
import { markQuestComplete } from "@/lib/quests";

// OAuth redirect target. This is a top-level browser navigation (no Authorization
// header), so the caller's identity comes from the signed `state` we minted at
// connect time — honoured only in the browser that started it: a web state
// needs the httpOnly nonce cookie set by connect, and a phone state is not
// finished here at all but parked for the app to finish with its own session
// (lib/social/oauth.ts). On success/failure it bounces back to the dashboard
// with a flag — or, for the phone, back into the app at its Accounts screen.
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const res = await handle(req, ctx);
  // Spent or not, a binding cookie has done its job once the provider sends
  // the browser back.
  res.cookies.set(OAUTH_BROWSER_COOKIE, "", { ...OAUTH_BROWSER_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}

async function handle(req: NextRequest, { params }: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
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

  const consumed = await consumeState(state, req.cookies.get(OAUTH_BROWSER_COOKIE)?.value);
  if (!consumed) return NextResponse.redirect(dest({ error: "invalid_state" }, client));
  // The platform encoded in state must route through this OAuth app.
  if (oauthProviderFor(consumed.provider as ProviderId) !== provider) {
    return NextResponse.redirect(dest({ error: "provider_mismatch" }, consumed.client));
  }

  if (consumed.client === "app") {
    const pending = await parkAppConnect({
      userId: consumed.userId,
      provider: consumed.provider,
      oauthProvider: provider,
      code,
      verifier: consumed.verifier,
    });
    return NextResponse.redirect(dest({ pending }, "app"));
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
