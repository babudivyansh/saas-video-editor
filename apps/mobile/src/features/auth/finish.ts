import type { MobileLoginResponse } from "@clipiro/shared";
import { router } from "expo-router";
import { auth } from "@/lib/api";
import { getGoogleIdToken } from "@/lib/google";
import { useSession } from "@/state/session";

/**
 * Where a sign-in answer leads: a session signs in (the root layout then
 * swaps to the tabs), 2FA goes to the code screen, and an account that never
 * verified its email goes to the OTP screen in login mode.
 */
export async function finishSignIn(res: MobileLoginResponse) {
  if ("accessToken" in res) return useSession.getState().signIn(res);
  if ("requires2fa" in res) return void router.push({ pathname: "/two-factor", params: { ticket: res.ticket } });
  router.push({ pathname: "/otp", params: { email: res.email, mode: "login", proof: res.passwordProof } });
}

/** The "Continue with Google" button, for useSubmit().run. Backing out of the picker does nothing. */
export async function continueWithGoogle() {
  const idToken = await getGoogleIdToken();
  if (idToken) await finishSignIn(await auth.google({ idToken }));
}
