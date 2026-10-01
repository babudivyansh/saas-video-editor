import {
  forgotPasswordRequest,
  loginRequest,
  signupRequest,
  signupVerifyRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LoginResponse,
  type SignupPendingResponse,
  type SignupRequest,
  type SignupVerifyRequest,
  type User,
} from "@clipiro/shared";

// Stand-in for /api/mobile/v1/auth until Phase 5–6. Same request validation
// (the shared zod schemas) and the same response shapes as the real API, so
// screens built on it don't change when the network arrives.
//
// Special inputs exercise every path the screens must handle:
//   password "wrong-password"      → 401 "Email or password is incorrect"
//   email "taken@…"                → 409 on sign-up
//   email "unverified@…"           → login needs email verification (→ OTP)
//   email "offline@…"              → network error
//   OTP "000000"                   → wrong/expired code

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly field?: string) {
    super(message);
  }
}
export class NetworkError extends Error {
  constructor() {
    super("No connection. Check your internet and try again.");
  }
}

let delayMs = 700;
/** Tests set 0. */
export function setMockDelay(ms: number) {
  delayMs = ms;
}
const wait = () => new Promise((r) => setTimeout(r, delayMs));

const MAYA: User = { id: "usr_maya", email: "maya@creatorlab.co", name: "Maya Okafor", avatarUrl: null };

function guard(email: string) {
  if (email.startsWith("offline@")) throw new NetworkError();
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const { email, password } = loginRequest.parse(input);
  await wait();
  guard(email);
  if (password === "wrong-password") throw new ApiError("Email or password is incorrect", 401);
  if (email.startsWith("unverified@")) return { requiresEmailVerification: true, email };
  return { token: "mock-token", user: { ...MAYA, email } };
}

export async function signup(input: SignupRequest): Promise<SignupPendingResponse> {
  const { email } = signupRequest.parse(input);
  await wait();
  guard(email);
  if (email.startsWith("taken@")) throw new ApiError("An account with this email already exists. Log in instead.", 409, "email");
  return { pending: true, email, signupToken: "mock-signup-token" };
}

export async function verifySignup(input: SignupVerifyRequest): Promise<{ token: string; user: User }> {
  const { email, otp } = signupVerifyRequest.parse(input);
  await wait();
  guard(email);
  if (otp === "000000") throw new ApiError("That code is incorrect or has expired.", 400, "otp");
  return { token: "mock-token", user: { ...MAYA, email } };
}

export async function resendCode(email: string): Promise<{ ok: true }> {
  await wait();
  guard(email);
  return { ok: true };
}

export async function forgotPassword(input: ForgotPasswordRequest): Promise<{ ok: true }> {
  const { email } = forgotPasswordRequest.parse(input);
  await wait();
  guard(email);
  return { ok: true };
}

/** Message for any error thrown by the calls above. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  return "Something went wrong. Please try again.";
}
