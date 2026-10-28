// POST /api/api-keys — a key outlives the session that minted it, so creating
// one takes the same step-up as other sensitive actions (lib/step-up.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let stepUpOk = true;
const verifyStepUp = vi.hoisted(() => vi.fn());
const apiKeyCreate = vi.hoisted(() => vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "k1", ...data })));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", sessionId: "s1" })),
  generateApiKey: vi.fn(() => ({ plaintext: "sk_live_x", hash: "h", prefix: "sk_live_x" })),
}));
vi.mock("@/lib/step-up", () => ({ verifyStepUp }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "u1", email: "a@example.com", passwordHash: "x" })) },
    apiKey: { count: vi.fn(async () => 0), create: apiKeyCreate, findMany: vi.fn(async () => []) },
  },
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/api-keys", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  stepUpOk = true;
  verifyStepUp.mockImplementation(async () => (stepUpOk ? { ok: true } : { ok: false, error: "Enter your password to continue" }));
});

describe("POST /api/api-keys", () => {
  it("refuses without the step-up and creates nothing", async () => {
    stepUpOk = false;
    const res = await post({ name: "CI", scopes: ["read"] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Enter your password to continue" });
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });

  it("checks the submitted password/otp and then creates the key", async () => {
    const res = await post({ name: "CI", scopes: ["read"], password: "pw" });
    expect(res.status).toBe(201);
    expect(verifyStepUp).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), expect.objectContaining({ password: "pw" }));
    expect(apiKeyCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "u1", scopes: ["read"] }) }));
  });
});
