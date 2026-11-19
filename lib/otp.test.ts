import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A real (in-memory) key-value store, so issue→consume round-trips for real.
const store = new Map<string, string>();
vi.mock("./redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => { store.delete(k); }),
    getdel: vi.fn(async (k: string) => { const v = store.get(k) ?? null; store.delete(k); return v; }),
    incrWithExpire: vi.fn(async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n; }),
  },
}));
const counters = new Map<string, number>();
vi.mock("./rate-limit", () => ({
  rateLimit: vi.fn(async (k: string, max: number) => {
    const n = (counters.get(k) ?? 0) + 1;
    counters.set(k, n);
    return { allowed: n <= max, remaining: Math.max(0, max - n) };
  }),
  releaseRateLimit: vi.fn(async (k: string) => { counters.set(k, Math.max(0, (counters.get(k) ?? 0) - 1)); }),
}));

let channel: "email" | "dev-console" | "failed" = "email";
const sent: { to: string; code: string; purpose: string }[] = [];
vi.mock("./email", () => ({
  sendOtpEmail: vi.fn(async (to: string, code: string, purpose: string) => {
    sent.push({ to, code, purpose });
    return channel;
  }),
}));

const { issueOtp, consumeOtp, OtpDeliveryError, OtpThrottledError, MAX_VERIFY_ATTEMPTS } = await import("./otp");

const lastCode = () => sent[sent.length - 1].code;

beforeEach(() => {
  store.clear();
  counters.clear();
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

  it("stores only a hash of the code, never the code itself", async () => {
    await issueOtp("signup", "a@test.com");
    const stored = store.get("otp:signup:a@test.com")!;
    expect(stored.startsWith("h1:")).toBe(true);
    expect(stored).not.toContain(lastCode());
  });

  it("still accepts a plain code stored before the hashing change", async () => {
    store.set("otp:login:a@test.com", "424242");
    expect(await consumeOtp("login", "a@test.com", "424242")).toBe(true);
  });

  it("burns the code after MAX_VERIFY_ATTEMPTS wrong guesses — even the right code then fails", async () => {
    await issueOtp("login", "a@test.com");
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i++) expect(await consumeOtp("login", "a@test.com", wrong)).toBe(false);
    expect(await consumeOtp("login", "a@test.com", code)).toBe(false);
  });

  it("a repeat request inside the cooldown sends nothing and keeps the first code valid", async () => {
    await issueOtp("signup", "a@test.com");
    const first = lastCode();
    await issueOtp("signup", "a@test.com");
    expect(sent).toHaveLength(1);
    expect(await consumeOtp("signup", "a@test.com", first)).toBe(true);
  });

  it("after the cooldown a new code is sent and replaces the old one", async () => {
    await issueOtp("signup", "a@test.com");
    const first = lastCode();
    store.delete("otp:cooldown:signup:a@test.com"); // cooldown expired
    await issueOtp("signup", "a@test.com");
    expect(sent).toHaveLength(2);
    if (lastCode() !== first) expect(await consumeOtp("signup", "a@test.com", first)).toBe(false);
    expect(await consumeOtp("signup", "a@test.com", lastCode())).toBe(true);
  });

  it("a failed delivery puts the previous code back instead of invalidating it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await issueOtp("login", "a@test.com");
    const first = lastCode();
    store.delete("otp:cooldown:login:a@test.com");
    channel = "failed";
    await expect(issueOtp("login", "a@test.com")).rejects.toBeInstanceOf(OtpDeliveryError);
    expect(await consumeOtp("login", "a@test.com", first)).toBe(true);
  });

  it("caps code emails per address per hour, and a failed send doesn't count", async () => {
    vi.stubEnv("NODE_ENV", "production");
    channel = "failed";
    await expect(issueOtp("login", "b@test.com")).rejects.toBeInstanceOf(OtpDeliveryError);
    channel = "email";
    for (let i = 0; i < 5; i++) {
      store.delete("otp:cooldown:login:b@test.com");
      await issueOtp("login", "b@test.com");
    }
    store.delete("otp:cooldown:login:b@test.com");
    await expect(issueOtp("login", "b@test.com")).rejects.toBeInstanceOf(OtpThrottledError);
  });

  it("two simultaneous correct submissions: only one succeeds", async () => {
    await issueOtp("login", "a@test.com");
    const code = lastCode();
    const results = await Promise.all([consumeOtp("login", "a@test.com", code), consumeOtp("login", "a@test.com", code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
