import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The app's contact form: the web's /api/contact, signed with the account's
// own name and email (never ones typed in the request).

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => ({ name: "Maya Okafor", email: "maya@example.com" })) } } }));
const web = vi.fn();
vi.mock("@/app/api/contact/route", () => ({ POST: web }));

const { POST } = await import("./contact/route");
const req = (body: unknown) => new NextRequest("http://localhost/api/mobile/v1/support/contact", { method: "POST", headers: { authorization: "Bearer a" }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());

describe("POST /support/contact", () => {
  it("sends the message as the signed-in account", async () => {
    web.mockResolvedValue(NextResponse.json({ ok: true }));
    const res = await POST(req({ subject: "billing", message: "My invoice shows the wrong GST number.", email: "attacker@evil.test" }));
    expect(await res.json()).toEqual({ ok: true });
    const sent = await (web.mock.calls[0]![0] as NextRequest).json();
    expect(sent).toEqual({ name: "Maya Okafor", email: "maya@example.com", subject: "billing", message: "My invoice shows the wrong GST number." });
  });

  it("asks for more than a few words", async () => {
    const res = await POST(req({ subject: "support", message: "help" }));
    expect(res.status).toBe(400);
    expect(web).not.toHaveBeenCalled();
  });
});
