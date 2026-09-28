import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A real (in-memory) key-value store, so issue→consume round-trips for real.
const store = new Map<string, string>();
vi.mock("./redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));

let channel: "email" | "dev-console" | "failed" = "email";
const sent: { to: string; code: string; purpose: string }[] = [];
vi.mock("./email", () => ({
  sendOtpEmail: vi.fn(async (to: string, code: string, purpose: string) => {
    sent.push({ to, code, purpose });
    return channel;
  }),
}));

const { issueOtp, consumeOtp, OtpDeliveryError } = await import("./otp");

const lastCode = () => sent[sent.length - 1].code;

beforeEach(() => {
  store.clear();
  sent.length = 0;
  channel = "email";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/otp", () => {
  it("emails a 6-digit code tagged with its purpose, and never returns it when delivery worked", async () => {
    const extras = await issueOtp("signup", "a@test.com");
    expect(extras).toEqual({});
    expect(sent[0]).toMatchObject({ to: "a@test.com", purpose: "signup" });
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it("only accepts a code for the purpose it was issued for", async () => {
    await issueOtp("login", "a@test.com");
    const code = lastCode();
    expect(await consumeOtp("signup", "a@test.com", code)).toBe(false);
    expect(await consumeOtp("step-up", "a@test.com", code)).toBe(false);
    expect(await consumeOtp("login", "a@test.com", code)).toBe(true);
  });

  it("is single-use and rejects wrong or malformed codes", async () => {
    await issueOtp("login", "a@test.com");
    const code = lastCode();
    expect(await consumeOtp("login", "a@test.com", "000000" === code ? "111111" : "000000")).toBe(false);
    expect(await consumeOtp("login", "a@test.com", { not: "a code" })).toBe(false);
    expect(await consumeOtp("login", "a@test.com", code)).toBe(true);
    expect(await consumeOtp("login", "a@test.com", code)).toBe(false);
  });

  it("outside production, hands back the code when no email provider is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    channel = "dev-console";
    const extras = await issueOtp("login", "a@test.com");
    expect(extras.devCode).toBe(lastCode());
  });

  it("in production, NEVER returns the code — an undelivered code is an error", async () => {
    // The removed SMS path returned the code whenever delivery wasn't
    // configured or failed, letting anyone sign in as anyone.
    vi.stubEnv("NODE_ENV", "production");
    channel = "dev-console";
    await expect(issueOtp("login", "a@test.com")).rejects.toBeInstanceOf(OtpDeliveryError);
    channel = "failed";
    await expect(issueOtp("login", "a@test.com")).rejects.toBeInstanceOf(OtpDeliveryError);
  });
});
