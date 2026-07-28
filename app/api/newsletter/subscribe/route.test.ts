import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let existing: { status: string; token: string } | null = null;
const create = vi.fn(async () => ({}));
const update = vi.fn(async () => ({}));
const findUnique = vi.fn(async () => existing);

vi.mock("@/lib/prisma", () => ({
  prisma: { newsletterSubscriber: { findUnique, create, update } },
}));

const sendNewsletterConfirmEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendNewsletterConfirmEmail }));

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock("@/lib/marketing-analytics", () => ({ recordMarketingEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  existing = null;
  vi.clearAllMocks();
});

describe("POST /api/newsletter/subscribe", () => {
  it("creates a pending subscriber and sends a confirmation email", async () => {
    const res = await POST(post({ email: "new@example.com" }));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(sendNewsletterConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it("normalizes the address before storing it", async () => {
    await POST(post({ email: "  MiXeD@Example.COM  " }));
    const [{ data }] = create.mock.calls[0] as [{ data: { email: string; token: string } }];
    expect(data.email).toBe("mixed@example.com");
  });

  it("mints a long random token", async () => {
    await POST(post({ email: "new@example.com" }));
    const [{ data }] = create.mock.calls[0] as [{ data: { token: string } }];
    expect(data.token).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * The enumeration guard. If a known address produced any observable
   * difference — status, body, or timing-free shape — this endpoint would tell
   * an attacker which addresses have accounts here.
   */
  it("answers an already-confirmed address identically to a brand-new one", async () => {
    const fresh = await POST(post({ email: "new@example.com" }));
    const freshBody = await fresh.json();

    vi.clearAllMocks();
    existing = { status: "confirmed", token: "t".repeat(64) };
    const known = await POST(post({ email: "known@example.com" }));
    const knownBody = await known.json();

    expect(known.status).toBe(fresh.status);
    expect(knownBody).toEqual(freshBody);
  });

  it("does not email or write for an already-confirmed address", async () => {
    existing = { status: "confirmed", token: "t".repeat(64) };
    await POST(post({ email: "known@example.com" }));
    expect(sendNewsletterConfirmEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("resends confirmation for a still-pending address without creating a duplicate", async () => {
    existing = { status: "pending", token: "t".repeat(64) };
    const res = await POST(post({ email: "pending@example.com" }));
    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(sendNewsletterConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it("lets a previously unsubscribed address opt back in via a fresh confirmation", async () => {
    existing = { status: "unsubscribed", token: "t".repeat(64) };
    await POST(post({ email: "back@example.com" }));
    const [{ data }] = update.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data).toMatchObject({ status: "pending", unsubscribedAt: null });
    expect(sendNewsletterConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid address without sending mail", async () => {
    const res = await POST(post({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(sendNewsletterConfirmEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  // Same generic 400 as a real validation failure, so a bot learns nothing
  // from the response shape.
  it("answers a filled honeypot exactly like a validation failure", async () => {
    const invalid = await POST(post({ email: "not-an-email" }));
    const trapped = await POST(post({ email: "bot@example.com", hp: "gotcha" }));

    expect(trapped.status).toBe(invalid.status);
    expect(await trapped.json()).toEqual(await invalid.json());
    expect(create).not.toHaveBeenCalled();
    expect(sendNewsletterConfirmEmail).not.toHaveBeenCalled();
  });

  it("accepts a submission whose honeypot is present but empty", async () => {
    const res = await POST(post({ email: "human@example.com", hp: "" }));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects unexpected keys (strict schema)", async () => {
    const res = await POST(post({ email: "a@b.com", status: "confirmed" }));
    expect(res.status).toBe(400);
  });

  // A mail outage must not surface as a 500 that implies the address was
  // accepted-but-broken; the visitor can simply resubmit.
  it("still returns 200 when the confirmation email fails to send", async () => {
    sendNewsletterConfirmEmail.mockRejectedValueOnce(new Error("smtp down"));
    const res = await POST(post({ email: "new@example.com" }));
    expect(res.status).toBe(200);
  });
});
