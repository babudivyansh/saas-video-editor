// The anonymise path against a REAL database: it is one transaction of ~35
// writes whose order has to satisfy the schema's foreign keys (Purchase and
// Invoice are onDelete: Restrict), and a mocked prisma would only test the
// mock. External side effects are stubbed. Skips cleanly when no database is
// reachable.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn(async () => {}) } }));
vi.mock("@/lib/auth", () => ({ invalidateAllSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/cancel-on-account-lifecycle", () => ({ cancelRazorpaySubscriptionBestEffort: vi.fn(async () => {}) }));
vi.mock("@/utils/elevenlabs", () => ({ deleteClonedVoice: vi.fn(async () => {}) }));
vi.mock("@/utils/s3-upload", () => ({ deleteS3Object: vi.fn(async () => {}) }));

const { prisma } = await import("@/lib/prisma");
const { hardDeleteUserAccount } = await import("@/lib/account-deletion");
const { findUserByEmail } = await import("@/lib/identifier");

const RUN = randomUUID().slice(0, 8);
const email = `purge-${RUN}@test.invalid`;
let userId = "";
let affiliateOwnerId = "";
let dbUp = true;

beforeAll(async () => {
  try {
    affiliateOwnerId = (await prisma.user.create({ data: { email: `aff-${RUN}@test.invalid`, passwordHash: "x" } })).id;
    const affiliate = await prisma.affiliate.create({ data: { userId: affiliateOwnerId, code: `AFF${RUN}` } });

    const user = await prisma.user.create({
      data: {
        email, passwordHash: "$2b$12$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0", name: "Jane Buyer",
        billingName: "Jane Buyer Pvt Ltd", billingAddress: "1 MG Road", billingGstin: "09ABCDE1234F1Z5",
        credits: 40, purchasedCredits: 40, deactivatedAt: new Date("2026-09-01"),
        deactivationScheduledPurgeAt: new Date("2026-10-01"),
      },
    });
    userId = user.id;
    await prisma.referral.create({ data: { affiliateId: affiliate.id, referredUserId: userId, signupIp: "203.0.113.9" } });
    await prisma.purchase.create({ data: { id: `pay_${RUN}`, userId, amountInPaise: 49900, credits: 40 } });
    await prisma.invoice.create({
      data: {
        number: `CLP/TEST/${RUN}`, fy: `T${RUN}`, seq: 1, purchaseId: `pay_${RUN}`, userId, paidAt: new Date(),
        sellerName: "Clipiro", sellerAddress: "x", sellerGstin: "x", sellerState: "09",
        buyerName: "Jane Buyer Pvt Ltd", buyerEmail: email, buyerAddress: "1 MG Road", buyerGstin: "09ABCDE1234F1Z5",
        placeOfSupply: "09", description: "Pro", sac: "998439", taxable: 42288, igst: 7612, total: 49900, paymentRef: `pay_${RUN}`,
      },
    });
    const project = await prisma.project.create({ data: { userId, title: "My video" } });
    await prisma.clip.create({ data: { projectId: project.id, index: 0, startSec: 0, endSec: 5, durationSec: 5 } });
    await prisma.asset.create({ data: { userId, name: "a.mp4", s3Key: `test/${RUN}/a.mp4`, url: "u", mimeType: "video/mp4", kind: "video", size: 10 } });
    await prisma.notification.create({ data: { userId, type: "billing_test", title: "hi" } });
    await prisma.loginEvent.create({ data: { userId } });
    await prisma.creditTransaction.create({ data: { userId, bucket: "purchased", delta: 40, reason: "grant:pack" } });
    await prisma.emailLog.create({ data: { recipient: email, templateId: "welcome", status: "sent" } });
  } catch (e) {
    dbUp = false;
    // eslint-disable-next-line no-console
    console.warn("account-deletion db suite skipped — no database:", String(e).split("\n")[0]);
  }
}, 60_000);

afterAll(async () => {
  if (!dbUp) return;
  await prisma.invoice.deleteMany({ where: { userId } });
  await prisma.purchase.deleteMany({ where: { userId } });
  await prisma.referral.deleteMany({ where: { referredUserId: userId } });
  await prisma.affiliate.deleteMany({ where: { userId: affiliateOwnerId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, affiliateOwnerId] } } });
});

describe("hardDeleteUserAccount on a paying account (real database)", () => {
  it("purges everything but the billing records and anonymises the user", async () => {
    if (!dbUp) return;
    expect(await hardDeleteUserAccount(userId)).toEqual({ ok: true, mode: "anonymised" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      email: `deleted-${userId}@deleted.clipiro.invalid`, passwordHash: "", name: null,
      billingName: null, billingGstin: null, credits: 0, purchasedCredits: 0, deactivationScheduledPurgeAt: null,
    });
    expect(user.purgedAt).toBeInstanceOf(Date);
    expect(user.deactivatedAt).toEqual(new Date("2026-09-01"));

    // Kept, unchanged: the invoice still carries the buyer as billed.
    expect(await prisma.purchase.count({ where: { userId } })).toBe(1);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { userId } });
    expect(invoice).toMatchObject({ buyerName: "Jane Buyer Pvt Ltd", buyerEmail: email, buyerGstin: "09ABCDE1234F1Z5" });

    // Gone.
    expect(await prisma.project.count({ where: { userId } })).toBe(0);
    expect(await prisma.asset.count({ where: { userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);
    expect(await prisma.loginEvent.count({ where: { userId } })).toBe(0);
    expect(await prisma.creditTransaction.count({ where: { userId } })).toBe(0);
    expect(await prisma.emailLog.count({ where: { recipient: email } })).toBe(0);

    // The referral stays (the affiliate's record) without the IP.
    const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userId } });
    expect(referral.signupIp).toBeNull();
  });

  it("leaves no sign-in path to the tombstone, and a second run is a no-op", async () => {
    if (!dbUp) return;
    expect(await findUserByEmail(email)).toBeNull();
    expect(await findUserByEmail(`deleted-${userId}@deleted.clipiro.invalid`)).toBeNull();
    expect(await hardDeleteUserAccount(userId)).toEqual({ ok: true, mode: "anonymised" });
  });
});
