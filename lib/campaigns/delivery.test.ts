import { describe, expect, it, vi } from "vitest";

// A campaign's delivery report: the router's message (found by the sender's
// idempotency key) wins; the older EmailLog (by provider message id) covers
// sends that never went through the router.

const RECIPIENTS = [
  { userId: "u1", messageId: "m1" }, // router: delivered
  { userId: "u2", messageId: "m2" }, // router: bounced
  { userId: "u3", messageId: null }, // queued by the router, later complained
  { userId: "u4", messageId: "m4" }, // no router record; log says delivered
  { userId: "u5", messageId: "m5" }, // router: accepted, no report yet
  { userId: "u6", messageId: null }, // nothing anywhere
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailCampaignRecipient: { findMany: vi.fn(async () => RECIPIENTS) },
    emailMessage: {
      findMany: vi.fn(async () => [
        { idempotencyKey: "campaign:c1:u1", status: "delivered" },
        { idempotencyKey: "campaign:c1:u2", status: "bounced" },
        { idempotencyKey: "campaign:c1:u3", status: "complained" },
        { idempotencyKey: "campaign:c1:u5", status: "accepted" },
      ]),
    },
    emailLog: {
      findMany: vi.fn(async ({ where }: { where: { providerMessageId: { in: string[] } } }) =>
        // Only asked about sends the router has no record of.
        where.providerMessageId.in.includes("m4") && !where.providerMessageId.in.includes("m1")
          ? [{ providerMessageId: "m4", status: "delivered" }]
          : []),
    },
  },
}));

const { campaignDelivery, deliveryBucket, campaignKey } = await import("./delivery");

describe("campaignDelivery", () => {
  it("counts each sent recipient once, router first, log as fallback", async () => {
    expect(await campaignDelivery("c1")).toEqual({
      handedOff: 6, delivered: 2, bounced: 1, complained: 1, failed: 0, pending: 1, untracked: 1,
    });
  });
});

describe("deliveryBucket", () => {
  it("maps router and log statuses", () => {
    expect(deliveryBucket("delivered")).toBe("delivered");
    expect(deliveryBucket("suppressed")).toBe("failed");
    expect(deliveryBucket("deferred")).toBe("pending");
    expect(deliveryBucket("sent")).toBe("pending");
    expect(deliveryBucket("dev-logged")).toBe("untracked");
    expect(deliveryBucket(undefined)).toBe("untracked");
  });

  it("uses the same key the sender sends with", () => {
    expect(campaignKey("c1", "u1")).toBe("campaign:c1:u1");
  });
});
