import { z } from "zod";

// Request/response shapes for the auth endpoints, shared by the Android app
// (form validation) and — from Phase 5 — the /api/mobile/v1 routes, so both
// sides agree on what "valid" means. The rules mirror the web's
// lib/auth-validation.ts and app/api/auth/* exactly; change them together.

export const NAME_MAX = 60;
export const PASSWORD_MIN = 8;
/** bcrypt hashes only the first 72 bytes; longer passwords would silently not count. */
export const PASSWORD_MAX_BYTES = 72;
export const OTP_LENGTH = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .max(254, "Enter a valid email address")
  .regex(EMAIL_RE, "Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .refine((p) => utf8Bytes(p) <= PASSWORD_MAX_BYTES, `Password must be ${PASSWORD_MAX_BYTES} characters or fewer`);

/** Trimmed, control characters stripped, inner whitespace collapsed (web: cleanName). */
export const nameSchema = z
  .string()
  // eslint-disable-next-line no-control-regex
  .transform((n) => n.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Enter your name").max(NAME_MAX, `Name must be ${NAME_MAX} characters or fewer`));

export const otpSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`);

// ── Requests ─────────────────────────────────────────────────────────────

/** POST /api/auth/login */
export const loginRequest = z.object({
  email: emailSchema,
  // Login only checks presence; the server decides if it matches.
  password: z.string().min(1, "Enter your password"),
});

/** POST /api/auth/register → 202 { pending, email, signupToken } */
export const signupRequest = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    referralCode: z.string().trim().max(64).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

/** POST /api/auth/register/verify → { token, user } */
export const signupVerifyRequest = z.object({
  email: emailSchema,
  otp: otpSchema,
  signupToken: z.string().min(1),
});

/** POST /api/auth/forgot-password — always answers ok (no account enumeration). */
export const forgotPasswordRequest = z.object({ email: emailSchema });

// ── Responses ────────────────────────────────────────────────────────────

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable().optional(),
});

export const signupPendingResponse = z.object({
  pending: z.literal(true),
  email: z.string(),
  signupToken: z.string(),
});

export const loginResponse = z.union([
  z.object({ token: z.string(), user: userSchema }),
  z.object({ requires2fa: z.literal(true), ticket: z.string() }),
  z.object({ requiresEmailVerification: z.literal(true), email: z.string() }),
]);

export type LoginRequest = z.input<typeof loginRequest>;
export type SignupRequest = z.input<typeof signupRequest>;
export type SignupVerifyRequest = z.input<typeof signupVerifyRequest>;
export type ForgotPasswordRequest = z.input<typeof forgotPasswordRequest>;
export type User = z.infer<typeof userSchema>;
export type LoginResponse = z.infer<typeof loginResponse>;
export type SignupPendingResponse = z.infer<typeof signupPendingResponse>;

/** Field → first error message, for showing inline under each field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
