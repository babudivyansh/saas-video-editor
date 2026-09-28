import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 2 })),
  getClientIp: vi.fn(() => "9.9.9.9"),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
// No artificial delay in tests.
vi.mock("@/lib/min-duration", () => ({ atLeast: vi.fn(async () => {}) }));

class OtpDeliveryError extends Error {}
const issueOtp = vi.fn(async () => ({}));
vi.mock("@/lib/otp", () => ({ issueOtp, OtpDeliveryError }));

let exists = true;
vi.mock("@/lib/identifier", async () => ({
  ...(await vi.importActual<typeof import("@/lib/identifier")>("@/lib/identifier")),
  findUserByEmail: vi.fn(async () => (exists ? { id: "u1" } : null)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { POST } = await import("./route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/auth/send-otp", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  exists = true;
});

describe("POST /api/auth/send-otp", () => {
  it("emails a sign-in code to a registered address", async () => {
    const res = await post({ email: "A@Test.com" });
    expect(res.status).toBe(200);
    expect(issueOtp).toHaveBeenCalledWith("login", "a@test.com");
  });

  it("answers an unknown address exactly like a known one, and sends nothing", async () => {
    exists = false;
    const res = await post({ email: "nobody@test.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(issueOtp).not.toHaveBeenCalled();
  });

  it("503s — never leaks the code — when delivery fails in production", async () => {
    issueOtp.mockRejectedValueOnce(new OtpDeliveryError());
    const res = await post({ email: "a@test.com" });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/\d{6}/);
  });

  it("treats a phone-number request as an (unknown) email — phone sign-in is gone", async () => {
    exists = false;
    const res = await post({ method: "phone", identifier: "+911234567890" });
    expect(res.status).toBe(200);
    expect(issueOtp).not.toHaveBeenCalled();
  });
});
