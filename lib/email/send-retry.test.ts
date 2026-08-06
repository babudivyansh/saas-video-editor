// Retry policy for the Resend call.
//
// Regression test for a bug production logs caught: a 403 for an unverified
// sending domain was thrown from inside withRetry, which retries EVERY throw.
// The error class was called NonRetryableError but was retried three times
// regardless, delaying the SMTP fallback by the whole backoff for an answer
// that could not change between attempts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "noreply@clipiro.com",
    EMAIL_USER: "", // no SMTP fallback, so the Resend outcome is the result
    EMAIL_PASS: "",
    EMAIL_HOST: "",
    EMAIL_PORT: "",
    NEXT_PUBLIC_APP_URL: "https://clipiro.com",
    JWT_SECRET: "test-secret",
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => null },
    emailSuppression: { findUnique: async () => null },
    emailLog: { create: async () => ({}) },
  },
}));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: async () => true }));

const { sendTemplate } = await import("./send");

let calls = 0;
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = 0;
});

function stubFetch(handler: () => Response) {
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes("api.resend.com")) {
      calls += 1;
      return handler();
    }
    throw new Error("unexpected fetch");
  }) as typeof fetch;
}

describe("Resend retry policy", () => {
  it("does not retry a 4xx — the answer cannot change", async () => {
    stubFetch(() =>
      respond(403, {
        statusCode: 403,
        name: "validation_error",
        message: "You can only send testing emails to your own email address.",
      }),
    );

    const r = await sendTemplate("verify-email", "someone@example.com", {
      name: "Div",
      verifyLink: "https://clipiro.com/verify?t=x",
    });

    expect(calls).toBe(1);
    expect(r.status).toBe("failed");
  });

  it("surfaces the provider's own explanation, not a generic message", async () => {
    stubFetch(() => respond(403, { message: "please verify a domain" }));
    const r = await sendTemplate("verify-email", "someone@example.com", {
      name: "Div",
      verifyLink: "https://clipiro.com/verify?t=x",
    });
    // Without the real reason in the result, diagnosing this took a production
    // log dump rather than a glance at EmailLog.
    expect(r.error).toContain("403");
    expect(r.error).toContain("verify a domain");
  });

  it("does retry a 5xx, which is genuinely transient", async () => {
    stubFetch(() => respond(500, { message: "upstream boom" }));
    await sendTemplate("verify-email", "someone@example.com", {
      name: "Div",
      verifyLink: "https://clipiro.com/verify?t=x",
    });
    expect(calls).toBe(3);
  });

  it("succeeds on the first attempt when the provider accepts", async () => {
    stubFetch(() => respond(200, { id: "msg_1" }));
    const r = await sendTemplate("verify-email", "someone@example.com", {
      name: "Div",
      verifyLink: "https://clipiro.com/verify?t=x",
    });
    expect(calls).toBe(1);
    expect(r).toMatchObject({ status: "sent", channel: "resend", messageId: "msg_1" });
  });
});
