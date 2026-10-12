import type { MobileSession } from "@clipiro/shared";

// A stand-in for /api/mobile/v1/auth behind the app's real API client
// (src/lib/api.ts calls globalThis.fetch). Answers as the server does,
// including its error statuses. Special inputs pick a path:
//   password "wrong-password"   → 401
//   email "unverified@…"        → login needs the email verified (→ OTP, mode login)
//   email "2fa@…"               → login needs a 2FA code (→ two-factor)
//   email "deactivated@…"       → 403 deactivated (→ reactivate sheet)
//   email "taken@…"             → 409 on sign-up
//   email "offline@…"           → no connection
//   OTP / 2FA code "000000"     → 401 wrong code

export const SESSION = (email = "maya@creatorlab.co"): MobileSession => ({
  accessToken: "acc-1",
  refreshToken: "u1.s1.secret",
  expiresIn: 3600,
  user: { id: "usr_maya", email, name: "Maya Okafor", avatarUrl: null },
});

type Call = { path: string; body: Record<string, unknown>; headers: Record<string, string> };

export function installFakeAuthServer() {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/mobile\/v1/, "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ path, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const email = String(body.email ?? "");
    if (email.startsWith("offline@")) throw new TypeError("Network request failed");

    switch (path) {
      case "/auth/login":
        if (body.password === "wrong-password") return reply(401, { error: "Email or password is incorrect" });
        if (email.startsWith("unverified@")) return reply(200, { requiresEmailVerification: true, email, passwordProof: "proof-1" });
        if (email.startsWith("2fa@")) return reply(200, { requires2fa: true, ticket: "ticket-1" });
        if (email.startsWith("deactivated@")) return reply(403, { error: "This account is deactivated.", deactivated: true });
        return reply(200, SESSION(email));
      case "/auth/reactivate":
        return reply(200, SESSION(email));
      case "/auth/signup":
        if (email.startsWith("taken@")) return reply(409, { error: "An account with this email already exists. Log in instead." });
        return reply(202, { pending: true, email, signupToken: "signup-token-1" });
      case "/auth/signup/verify":
      case "/auth/login/verify-email":
        if (body.otp === "000000") return reply(401, { error: "Invalid or expired code" });
        return reply(200, SESSION(email));
      case "/auth/2fa":
        if (body.code === "000000") return reply(401, { error: "Invalid code" });
        return reply(200, SESSION());
      case "/auth/refresh":
        return reply(401, { error: "Your session has ended. Log in again.", code: "refresh_invalid" });
      case "/auth/google":
        return reply(201, SESSION());
      case "/auth/signup/resend":
      case "/auth/login/resend":
      case "/auth/forgot-password":
      case "/auth/logout":
        return reply(200, { ok: true });
      default:
        return reply(404, { error: "Not found" });
    }
  }) as unknown as typeof fetch;

  return {
    calls,
    /** The calls to one path, in order. */
    to: (path: string) => calls.filter((c) => c.path === path),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
