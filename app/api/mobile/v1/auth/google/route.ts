import type { NextRequest } from "next/server";
import { googleSignInRequest } from "@clipiro/shared";
import { convertToMobileSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { GoogleTokenError, signInWithGoogleProfile, verifyGoogleIdToken } from "@/lib/google-account";
import { finishLogin } from "@/lib/login-tail";
import { logger } from "@/lib/logger";
import { mobileError, mobileJson, mobileSessionResponse, parseBody } from "@/lib/mobile/http";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { mintTwoFactorTicket } from "@/lib/two-factor-ticket";
import { sendWelcomeEmail } from "@/lib/email";
import { greetingName } from "@/lib/display-name";

// POST /api/mobile/v1/auth/google { idToken } → a session or { requires2fa, ticket }.
// Native Google Sign-In hands the app an ID token; it is verified here
// against Google's keys, with our OAuth client IDs as the audience, then
// goes through the same find-or-create and account gates as the web flow.
export async function POST(req: NextRequest) {
  const body = await parseBody(req, googleSignInRequest);
  if (!body.ok) return body.res;

  const limit = await rateLimit(`oauth:google:ip:${getClientIp(req)}`, 20, 3600);
  if (!limit.allowed) return mobileError(429, "Too many attempts. Please try again later.");

  // The web client ID is the audience when the app asks Google for a token
  // for our server (serverClientId); the Android one is accepted too.
  const audiences = [env.GOOGLE_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID].filter((a): a is string => !!a);
  let profile;
  try {
    profile = await verifyGoogleIdToken(body.data.idToken, audiences);
  } catch (e) {
    if (e instanceof GoogleTokenError) return mobileError(401, "Google sign-in failed. Try again.", { code: "google_token_invalid" });
    logger.error("mobile-google", "verify failed", e);
    return mobileError(503, "Couldn't reach Google. Try again.");
  }

  try {
    const result = await signInWithGoogleProfile(req, profile);
    if (result.kind === "error") {
      return mobileError(result.status, result.error, result.reason === "deactivated" ? { deactivated: true } : {});
    }
    if (result.kind === "2fa") return mobileJson({ requires2fa: true, ticket: await mintTwoFactorTicket(result.user.id) });

    const { user, isNewUser } = result;
    const tokens = await convertToMobileSession(await finishLogin(req, user, getClientIp(req)));
    if (!tokens) return mobileError(500, "Couldn't start your session. Try again.");
    if (isNewUser) {
      sendWelcomeEmail(user.email, greetingName(user.name), user.credits ?? 10).catch((e) => logger.error("mobile-google", "welcome email error", e));
    }
    return mobileSessionResponse(tokens, isNewUser ? 201 : 200);
  } catch (e) {
    logger.error("mobile-google", "request failed", e);
    return mobileError(500, "Internal server error");
  }
}
