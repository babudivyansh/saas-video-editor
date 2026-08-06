// Regression coverage for the misconfiguration behind two real outages: a
// deployment with RESEND_API_KEY set but EMAIL_FROM unset silently sends every
// email from onboarding@resend.dev, which Resend hard-restricts to the account
// owner's own inbox. Both incidents needed a production log paste and a round
// trip through the Resend MCP to diagnose, because nothing said WHY the wrong
// address was in use — only that Resend had refused it.
//
// The check in send.ts is module-level, so it runs once at import time. That
// means each case here needs a fresh module instance — vi.resetModules() plus a
// dynamic import — rather than the usual top-level import.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const baseEnv = {
  EMAIL_USER: "",
  EMAIL_PASS: "",
  EMAIL_HOST: "",
  EMAIL_PORT: "",
  NEXT_PUBLIC_APP_URL: "https://clipiro.com",
  JWT_SECRET: "test-secret",
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => null },
    emailSuppression: { findUnique: async () => null },
    emailLog: { create: async () => ({}) },
  },
}));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: async () => true }));

let logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetModules();
  logger = { error: vi.fn(), info: vi.fn() };
  vi.doMock("@/lib/logger", () => ({ logger }));
});

afterEach(() => {
  vi.doUnmock("@/lib/env");
  vi.doUnmock("@/lib/logger");
});

describe("boot-time EMAIL_FROM check", () => {
  it("warns when a Resend key is configured with no EMAIL_FROM", async () => {
    vi.doMock("@/lib/env", () => ({ env: { ...baseEnv, RESEND_API_KEY: "re_live_key", EMAIL_FROM: "" } }));
    await import("./send");

    expect(logger.error).toHaveBeenCalledWith(
      "email:config",
      expect.stringContaining("onboarding@resend.dev"),
    );
  });

  it("stays silent when EMAIL_FROM is set", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { ...baseEnv, RESEND_API_KEY: "re_live_key", EMAIL_FROM: "noreply@clipiro.com" },
    }));
    await import("./send");

    expect(logger.error).not.toHaveBeenCalled();
  });

  // The unset combination is ordinary local dev — nothing to warn about, since
  // sendTemplate's own dev-console fallback already covers "no provider at all".
  it("stays silent when no Resend key is configured either", async () => {
    vi.doMock("@/lib/env", () => ({ env: { ...baseEnv, RESEND_API_KEY: "", EMAIL_FROM: "" } }));
    await import("./send");

    expect(logger.error).not.toHaveBeenCalled();
  });
});
