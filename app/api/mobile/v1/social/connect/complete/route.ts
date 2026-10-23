import type { NextRequest } from "next/server";
import { connectCompleteRequest } from "@clipiro/shared";
import { takeAppConnect } from "@/lib/social/oauth";
import { handleCallback } from "@/lib/social/service";
import { markQuestComplete } from "@/lib/quests";
import { logger } from "@/lib/logger";
import { mobileError, mobileJson, parseBody, withMobileAuth } from "@/lib/mobile/http";

// POST /api/mobile/v1/social/connect/complete { pending } → { connected }.
// The last step of a phone connect. The OAuth callback ran in a Custom Tab
// with none of our cookies, so it couldn't tell whose browser it was in; it
// parked the provider's code under a one-time id and sent it back as
// clipiro://social?pending=…. Only the Bearer session of the user who started
// the connect can finish it, so a sign-in link forced on someone else can't
// attach their account to the attacker's (lib/social/oauth.ts).
export const POST = withMobileAuth(async (req: NextRequest, auth) => {
  const body = await parseBody(req, connectCompleteRequest);
  if (!body.ok) return body.res;
  const pending = await takeAppConnect(body.data.pending);
  if (!pending || pending.userId !== auth.userId) {
    return mobileError(400, "That sign-in took too long or was already used. Try connecting again.", { code: "invalid_state" });
  }
  try {
    const connected = await handleCallback(pending.oauthProvider, pending.userId, pending.code, pending.verifier);
    void markQuestComplete(pending.userId, "track-account");
    return mobileJson({ connected });
  } catch (e) {
    logger.error("social-connect-complete", "request failed", e);
    return mobileError(502, "Signed in, but the account couldn't be read. Try again in a minute.", { code: "connect_failed" });
  }
});
