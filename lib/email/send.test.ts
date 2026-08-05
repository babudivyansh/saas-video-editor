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
const suppressionFind = vi.fn(async () => null as { email: string } | null);
const logCreate = vi.fn(async () => ({}));

// The full surface send.ts touches. An incomplete mock here would still pass —
// suppression.ts and logEmail both swallow their own errors by design — but the
// suppression path would never actually run, so the tests would be green for
// the wrong reason.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) },
    emailSuppression: { findUnique: (...a: unknown[]) => suppressionFind(...(a as [])) },
    emailLog: { create: (...a: unknown[]) => logCreate(...(a as [])) },
  },
}));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: (...a: unknown[]) => shouldSend(...(a as [])) }));

const { sendTemplate } = await import("./send");

beforeEach(() => {
  findUnique.mockClear();
  shouldSend.mockClear();
  suppressionFind.mockClear();
  logCreate.mockClear();
  shouldSend.mockResolvedValue(true);
  suppressionFind.mockResolvedValue(null);
  findUnique.mockResolvedValue({ id: "user_1" });
});

/** The status recorded on the EmailLog row for the most recent write. */
function loggedStatus(): string | undefined {
  const last = logCreate.mock.calls.at(-1) as [{ data: { status: string } }] | undefined;
  return last?.[0].data.status;
}

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

describe("suppression", () => {
  it("refuses to send to a suppressed address", async () => {
    suppressionFind.mockResolvedValue({ email: "dead@b.com" });
    const r = await sendTemplate("welcome", "dead@b.com", { firstName: "Div", credits: 30 });
    expect(r.status).toBe("suppressed");
  });

  /**
   * Suppression outranks even transactional mail. A hard bounce means the
   * mailbox does not exist, so a receipt sent there reaches nobody either — it
   * only damages the sending domain's reputation.
   */
  it("suppresses transactional mail too, not just marketing", async () => {
    suppressionFind.mockResolvedValue({ email: "dead@b.com" });
    const r = await sendTemplate("otp", "dead@b.com", { otp: "123456" });
    expect(r.status).toBe("suppressed");
  });

  it("checks suppression before consulting preferences", async () => {
    suppressionFind.mockResolvedValue({ email: "dead@b.com" });
    await sendTemplate("welcome", "dead@b.com", { firstName: "Div", credits: 30 });
    expect(shouldSend).not.toHaveBeenCalled();
  });

  // A database blip must not stop transactional email. A receipt that fails to
  // send is worse than one sent to an address we should have skipped, and the
  // next webhook re-asserts the suppression anyway.
  it("sends anyway when the suppression lookup itself fails", async () => {
    suppressionFind.mockRejectedValue(new Error("db down") as never);
    const r = await sendTemplate("otp", "a@b.com", { otp: "123456" });
    expect(r.status).toBe("dev-logged");
  });
});

describe("delivery log", () => {
  it("records every outcome, including the ones that never left the building", async () => {
    await sendTemplate("otp", "a@b.com", { otp: "123456" });
    expect(loggedStatus()).toBe("dev-logged");

    suppressionFind.mockResolvedValue({ email: "dead@b.com" });
    await sendTemplate("otp", "dead@b.com", { otp: "123456" });
    expect(loggedStatus()).toBe("suppressed");

    suppressionFind.mockResolvedValue(null);
    shouldSend.mockResolvedValue(false);
    await sendTemplate("reengagement-7d", "a@b.com", { name: "Div", creditsLeft: 5 });
    expect(loggedStatus()).toBe("skipped-optout");
  });

  it("records a failure with its reason", async () => {
    await sendTemplate("social-digest", "a@b.com", { name: "Div", accounts: null });
    expect(loggedStatus()).toBe("failed");
  });

  it("does not fail a send when the log write itself fails", async () => {
    logCreate.mockRejectedValue(new Error("db down") as never);
    const r = await sendTemplate("otp", "a@b.com", { otp: "123456" });
    expect(r.status).toBe("dev-logged");
  });
});
