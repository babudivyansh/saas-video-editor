import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    EMAIL_FROM: "noreply@clipiro.com",
    BREVO_API_KEY: "xkeysib-test",
    MAILJET_API_KEY: "mjpub",
    MAILJET_SECRET_KEY: "mjsec",
    RESEND_API_KEY: "re_test",
  },
}));

const { brevoProvider, classifyBrevo } = await import("./providers/brevo");
const { mailjetProvider, classifyMailjet } = await import("./providers/mailjet");
const { resendProvider, classifyResend } = await import("./providers/resend");
const { classifyNetworkError, sanitizeError } = await import("./http");
import type { OutboundEmail } from "./types";

const EMAIL: OutboundEmail = {
  messageId: "11111111-2222-3333-4444-555555555555",
  to: "person@example.com",
  subject: "Your Clipiro verification code",
  html: "<p>123456</p>",
  text: "123456",
  headers: { "List-Unsubscribe": "<https://x>", "Reply-To-Ignored": "x" },
  replyTo: "support@clipiro.com",
  templateId: "otp",
};

const calls: { url: string; init: RequestInit }[] = [];
function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }));
}
function throwing(err: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => { throw err; }));
}

beforeEach(() => { calls.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("Brevo adapter", () => {
  it("posts the documented v3 shape and returns the messageId", async () => {
    respond(201, { messageId: "<abc@smtp-relay.mailin.fr>" });
    const r = await brevoProvider.send(EMAIL);
    expect(r).toMatchObject({ ok: true, providerMessageId: "<abc@smtp-relay.mailin.fr>" });
    expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((calls[0].init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({
      sender: { email: "noreply@clipiro.com", name: "Clipiro" },
      to: [{ email: "person@example.com" }],
      subject: EMAIL.subject,
      htmlContent: EMAIL.html,
      textContent: EMAIL.text,
      replyTo: { email: "support@clipiro.com" },
    });
    expect(body.tags).toContain(`msg:${EMAIL.messageId}`);
  });

  it.each([
    [401, { code: "unauthorized", message: "Key not found" }, "auth"],
    [402, { code: "not_enough_credits", message: "Not enough credits" }, "quota"],
    [400, { code: "not_enough_credits", message: "x" }, "quota"],
    [429, { message: "Too many requests" }, "rate_limit"],
    [403, { code: "permission_denied", message: "Sender not authorized for domain" }, "sender_config"],
    [400, { code: "invalid_parameter", message: "email is not valid in to" }, "recipient"],
    [400, { code: "account_under_validation", message: "Your account is under validation" }, "suspended"],
    [500, { message: "oops" }, "transient"],
    [504, "gateway timeout", "unknown_outcome"],
  ] as const)("classifies %i %j as %s", (status, body, cls) => {
    expect(classifyBrevo(status, body).errorClass).toBe(cls);
  });
});

describe("Mailjet adapter", () => {
  it("posts v3.1 with CustomID = our message id, filtering custom headers", async () => {
    respond(200, { Messages: [{ Status: "success", To: [{ Email: "person@example.com", MessageUUID: "u", MessageID: 576460 }] }] });
    const r = await mailjetProvider.send(EMAIL);
    expect(r).toMatchObject({ ok: true, providerMessageId: "576460" });
    expect(calls[0].url).toBe("https://api.mailjet.com/v3.1/send");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("mjpub:mjsec").toString("base64")}`);
    const m = JSON.parse(calls[0].init.body as string).Messages[0];
    expect(m).toMatchObject({ CustomID: EMAIL.messageId, To: [{ Email: "person@example.com" }], ReplyTo: { Email: "support@clipiro.com" } });
    expect(m.Headers).toEqual({ "List-Unsubscribe": "<https://x>" });
  });

  it("treats a 200 with Status error as a failure", async () => {
    respond(400, { Messages: [{ Status: "error", Errors: [{ ErrorCode: "mj-0013", StatusCode: 400, ErrorMessage: "\"x\" is an invalid email address.", ErrorRelatedTo: ["To[0].Email"] }] }] });
    const r = await mailjetProvider.send(EMAIL);
    expect(r).toMatchObject({ ok: false, errorClass: "recipient", code: "mj-0013" });
  });

  it.each([
    [401, { ErrorMessage: "API key authentication/authorization failure" }, "auth"],
    [429, {}, "rate_limit"],
    [400, { Messages: [{ Status: "error", Errors: [{ ErrorCode: "send-0003", ErrorMessage: "Sender is not validated", ErrorRelatedTo: ["From.Email"] }] }] }, "sender_config"],
    [403, { ErrorMessage: "Your account has been suspended" }, "suspended"],
    [503, {}, "transient"],
    [502, {}, "unknown_outcome"],
  ] as const)("classifies %i as %s", (status, body, cls) => {
    expect(classifyMailjet(status, body).errorClass).toBe(cls);
  });
});

describe("Resend adapter", () => {
  it("sends an Idempotency-Key of our message id", async () => {
    respond(200, { id: "re_msg_1" });
    const r = await resendProvider.send(EMAIL);
    expect(r).toMatchObject({ ok: true, providerMessageId: "re_msg_1" });
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe(EMAIL.messageId);
  });

  it.each([
    [429, { name: "daily_quota_exceeded" }, "quota", "day"],
    [429, { name: "monthly_quota_exceeded" }, "quota", "month"],
    [429, { name: "rate_limit_exceeded" }, "rate_limit", undefined],
    [403, { name: "suspended_api_key" }, "suspended", undefined],
    [401, { name: "validation_error", message: "API key is invalid" }, "auth", undefined],
    [403, { name: "validation_error", message: "You can only send testing emails to your own email address" }, "sender_config", undefined],
    [403, { name: "validation_error", message: "The clipiro.com domain is not verified" }, "sender_config", undefined],
    [409, { name: "concurrent_idempotent_requests" }, "unknown_outcome", undefined],
  ] as const)("classifies %i %j", (status, body, cls, period) => {
    const c = classifyResend(status, body);
    expect(c.errorClass).toBe(cls);
    expect(c.quotaPeriod).toBe(period);
  });
});

describe("network failures", () => {
  it("a refused connection is safe to fall back from", async () => {
    throwing(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    const r = await brevoProvider.send(EMAIL);
    expect(r).toMatchObject({ ok: false, errorClass: "transient", code: "ECONNREFUSED" });
  });

  it("a timeout or reset mid-request is an unknown outcome", () => {
    expect(classifyNetworkError(Object.assign(new Error("aborted"), { name: "TimeoutError" })).errorClass).toBe("unknown_outcome");
    expect(classifyNetworkError(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })).errorClass).toBe("unknown_outcome");
    expect(classifyNetworkError(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })).errorClass).toBe("transient");
  });
});

describe("sanitizeError", () => {
  it("strips addresses, URLs, keys and 6-digit codes", () => {
    const s = sanitizeError("person@example.com rejected https://clipiro.com/reset?token=abc key xkeysib-0123456789abcdef0123456789abcdef01 code 482913");
    expect(s).not.toContain("person@example.com");
    expect(s).not.toContain("token=abc");
    expect(s).not.toContain("xkeysib-0123");
    expect(s).not.toContain("482913");
  });
});
