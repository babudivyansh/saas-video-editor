import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

const sendContactMessageEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendContactMessageEmail }));

let admins: { email: string }[] = [{ email: "admin1@clipiro.com" }];
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn(async () => admins) } },
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");

const VALID = { name: "Aarav", email: "aarav@example.com", subject: "support", message: "Hi, I need help." };

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  admins = [{ email: "admin1@clipiro.com" }];
  vi.clearAllMocks();
});

describe("POST /api/contact", () => {
  it("emails every admin with the submitted message", async () => {
    admins = [{ email: "admin1@clipiro.com" }, { email: "admin2@clipiro.com" }];
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);
    expect(sendContactMessageEmail).toHaveBeenCalledTimes(2);
    expect(sendContactMessageEmail).toHaveBeenCalledWith(
      "admin1@clipiro.com",
      expect.objectContaining({ name: "Aarav", email: "aarav@example.com", message: "Hi, I need help." }),
    );
  });

  it("resolves the subject enum to a display label", async () => {
    await POST(post({ ...VALID, subject: "billing" }));
    const [, data] = sendContactMessageEmail.mock.calls[0] as [string, { subjectLabel: string }];
    expect(data.subjectLabel).toBe("Billing & refund inquiry");
  });

  it("rejects an invalid subject", async () => {
    const res = await POST(post({ ...VALID, subject: "not-a-real-category" }));
    expect(res.status).toBe(400);
    expect(sendContactMessageEmail).not.toHaveBeenCalled();
  });

  it("rejects a missing message", async () => {
    const res = await POST(post({ ...VALID, message: "" }));
    expect(res.status).toBe(400);
    expect(sendContactMessageEmail).not.toHaveBeenCalled();
  });

  // Same generic 400 as a real validation failure, so a bot learns nothing
  // from the response shape.
  it("answers a filled honeypot exactly like a validation failure", async () => {
    const invalid = await POST(post({ ...VALID, message: "" }));
    const trapped = await POST(post({ ...VALID, hp: "gotcha" }));
    expect(trapped.status).toBe(invalid.status);
    expect(await trapped.json()).toEqual(await invalid.json());
    expect(sendContactMessageEmail).not.toHaveBeenCalled();
  });

  it("still returns 200 when one admin's email fails to send", async () => {
    admins = [{ email: "admin1@clipiro.com" }, { email: "admin2@clipiro.com" }];
    sendContactMessageEmail.mockRejectedValueOnce(new Error("smtp down")).mockResolvedValueOnce(undefined);
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);
  });

  it("rejects unexpected keys (strict schema)", async () => {
    const res = await POST(post({ ...VALID, extra: "nope" }));
    expect(res.status).toBe(400);
  });
});
