import { z } from "zod";
import {
  forgotPasswordRequest,
  googleSignInRequest,
  loginRequest,
  mobileLoginResponse,
  mobileSessionOr2fa,
  mobileSessionSchema,
  okResponse,
  resendCodeRequest,
  signupPendingResponse,
  signupRequest,
  signupVerifyRequest,
  twoFactorRequest,
  verifyEmailRequest,
  type AuthTokens,
} from "../schemas/auth";
import type { ApiClient } from "./client";

// /api/mobile/v1/auth. Requests are validated here too, so a bad form fails
// before it leaves the phone with the same messages the server would give.
// A session answer goes into the client's TokenStore via tokensOf();
// the caller keeps the user it signs in.

const ok = okResponse.loose();

export function authApi(api: ApiClient) {
  const post = <S extends z.ZodType>(path: string, body: unknown, schema: S) => api.request(path, { method: "POST", body, schema, auth: false });
  return {
    login: (b: z.input<typeof loginRequest>) => post("/auth/login", loginRequest.parse(b), mobileLoginResponse),
    verifyEmail: (b: z.input<typeof verifyEmailRequest>) => post("/auth/login/verify-email", verifyEmailRequest.parse(b), mobileSessionOr2fa),
    resendLoginCode: (b: z.input<typeof resendCodeRequest>) => post("/auth/login/resend", resendCodeRequest.parse(b), ok),
    signup: (b: z.input<typeof signupRequest>) => post("/auth/signup", signupRequest.parse(b), signupPendingResponse.loose()),
    verifySignup: (b: z.input<typeof signupVerifyRequest>) => post("/auth/signup/verify", signupVerifyRequest.parse(b), mobileSessionSchema),
    resendSignupCode: (b: z.input<typeof resendCodeRequest>) => post("/auth/signup/resend", resendCodeRequest.parse(b), ok),
    twoFactor: (b: z.input<typeof twoFactorRequest>) => post("/auth/2fa", twoFactorRequest.parse(b), mobileSessionSchema),
    google: (b: z.input<typeof googleSignInRequest>) => post("/auth/google", googleSignInRequest.parse(b), mobileSessionOr2fa),
    forgotPassword: (b: z.input<typeof forgotPasswordRequest>) => post("/auth/forgot-password", forgotPasswordRequest.parse(b), ok),
    reactivate: (b: z.input<typeof loginRequest>) => post("/auth/reactivate", loginRequest.parse(b), mobileLoginResponse),
    /** Ends this device's session on the server; the caller clears its tokens. */
    logout: (tokens: AuthTokens | null) =>
      api.request("/auth/logout", { method: "POST", body: tokens ? { refreshToken: tokens.refreshToken } : {}, schema: okResponse }),
  };
}

/** The tokens out of a session answer, for TokenStore.set. */
export const tokensOf = (s: { accessToken: string; refreshToken: string; expiresIn: number }): AuthTokens => ({
  accessToken: s.accessToken,
  refreshToken: s.refreshToken,
  expiresIn: s.expiresIn,
});
