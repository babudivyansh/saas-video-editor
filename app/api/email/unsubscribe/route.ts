import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { upsertNotificationPreference } from "@/lib/notifications";
import { withRateLimit } from "@/lib/with-rate-limit";
import { verifyUnsubToken } from "@/lib/email/unsubscribe";

// Opt out of one category of lifecycle email.
//
// Modelled on app/api/newsletter/unsubscribe/route.ts, including its
// anti-enumeration behaviour: the response is identical whether or not the token
// resolves, so this endpoint cannot be used to probe which tokens are real.
// Unsubscribing twice is a no-op.
//
// Deliberately NOT auth-gated. The whole point is that it works from a mail
// client, where there is no session — the signed token IS the authorisation, and
// it only ever grants the power to turn one category off for one user. Requiring
// a login here would make the one-click requirement below impossible to meet.

function landing(category?: string): URL {
  const url = new URL("/dashboard/settings/notifications", env.NEXT_PUBLIC_APP_URL);
  if (category) url.searchParams.set("unsubscribed", category);
  return url;
}

async function optOut(token: string | null): Promise<string | null> {
  if (!token) return null;
  const claim = verifyUnsubToken(token);
  if (!claim) return null;

  await upsertNotificationPreference(claim.userId, { [claim.category]: false });
  logger.info("email:unsubscribe", `user=${claim.userId} category=${claim.category}`);
  return claim.category;
}

/** Clicked from an email client. */
async function handleGET(req: NextRequest) {
  const category = await optOut(new URL(req.url).searchParams.get("t"));
  return NextResponse.redirect(landing(category ?? undefined));
}

/**
 * RFC 8058 one-click unsubscribe.
 *
 * Gmail and Yahoo's bulk-sender rules require that the List-Unsubscribe header
 * be actionable without a round trip, which means the mail provider POSTs here
 * directly. It must therefore be unauthenticated, CSRF-exempt and idempotent —
 * and it must return 200 even on a bad token, because a provider treats a
 * failure as a broken unsubscribe and penalises the sender's reputation.
 */
async function handlePOST(req: NextRequest) {
  await optOut(new URL(req.url).searchParams.get("t"));
  return new NextResponse(null, { status: 200 });
}

const LIMIT = { limit: 20, windowSec: 300, keyBy: "ip", name: "email:unsubscribe" } as const;

export const GET = withRateLimit(handleGET, LIMIT);
export const POST = withRateLimit(handlePOST, LIMIT);
