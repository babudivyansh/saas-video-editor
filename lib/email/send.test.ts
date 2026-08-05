// The transport's behavioural contract.
//
// The single most important guarantee here is that sendTemplate NEVER THROWS.
// Several callers fire it without awaiting — lib/credit-events.ts does it in a
// bare IIFE — so a rejection becomes an unhandled promise rejection rather than
// a handled failure. The old transport had the opposite problem: it never threw
// but also never reported failure, resolving successfully when nothing had been
// sent at all.

import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn(async () => ({ id: "user_1" }));
const shouldSend = vi.fn(async () => true);

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) } } }));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: (...a: unknown[]) => shouldSend(...(a as [])) }));

const { sendTemplate } = await import("./send");

beforeEach(() => {
  findUnique.mockClear();
  shouldSend.mockClear();
  shouldSend.mockResolvedValue(true);
});

describe("sendTemplate", () => {
  // No RESEND_API_KEY and no EMAIL_USER in the test environment, so every send
  // lands on the dev-console path. That is reported as its own status, NOT as
  // "sent" — a misconfigured deploy has to be visible rather than looking like
  // it worked, which is precisely what the old transport got wrong.
  it("reports dev-logged rather than sent when no provider is configured", async () => {
    const r = await sendTemplate("welcome", "a@b.com", { firstName: "Div", credits: 30 });
    expect(r.status).toBe("dev-logged");
    expect(r.channel).toBe("dev-console");
  });

  it("returns a failure for an unknown template instead of throwing", async () => {
    const r = await sendTemplate("does-not-exist", "a@b.com", {});
    expect(r.status).toBe("failed");
    expect(r.error).toContain("does-not-exist");
  });

  it("does not throw when a template build fails on malformed props", async () => {
    // social-digest maps over `accounts`; passing a non-array makes it throw.
    const r = await sendTemplate("social-digest", "a@b.com", { name: "Div", accounts: null });
    expect(r.status).toBe("failed");
  });

  it("skips a send when the user has opted out of that category", async () => {
    shouldSend.mockResolvedValue(false);
    const r = await sendTemplate("reengagement-7d", "a@b.com", { name: "Div", creditsLeft: 5 });
    expect(r.status).toBe("skipped-optout");
  });

  it("never consults preferences for transactional mail", async () => {
    const r = await sendTemplate("otp", "a@b.com", { otp: "123456" });
    expect(shouldSend).not.toHaveBeenCalled();
    // Nor does it look up a user, since transactional mail needs no unsubscribe.
    expect(findUnique).not.toHaveBeenCalled();
    expect(r.status).toBe("dev-logged");
  });

  it("resolves a user id from the address so marketing mail can carry an unsubscribe link", async () => {
    await sendTemplate("welcome", "a@b.com", { firstName: "Div", credits: 30 });
    expect(findUnique).toHaveBeenCalledOnce();
    expect(shouldSend).toHaveBeenCalledWith("user_1", "productUpdates");
  });

  it("still sends to an address with no account, without an unsubscribe link", async () => {
    findUnique.mockResolvedValue(null as never);
    const r = await sendTemplate("welcome", "stranger@b.com", { firstName: "Div", credits: 30 });
    expect(r.status).toBe("dev-logged");
    expect(shouldSend).not.toHaveBeenCalled();
  });

  it("survives a database failure during user lookup", async () => {
    findUnique.mockRejectedValue(new Error("db down") as never);
    const r = await sendTemplate("welcome", "a@b.com", { firstName: "Div", credits: 30 });
    expect(r.status).toBe("dev-logged");
  });
});
