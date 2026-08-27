import { beforeEach, describe, expect, it, vi } from "vitest";

// firePostCreditSpendEmails is the one place every credit-spending route in
// the app converges on for the first-video/low-credit emails (via
// spendCredits() — see credits.postspend.test.ts for that wiring). This file
// pins two things specific to THIS module:
//
//   1. firstVideoAt is only written once the send has actually succeeded —
//      previously it was written first, so a transient send failure silently
//      and permanently lost a user's one-shot "first video" email with no
//      retry. A "sent"/"suppressed"/"skipped-optout"/"dev-logged" outcome
//      all correctly count as handled; only "failed" must leave it unset.
//   2. fireZeroCreditsEmail's own independent rate-limit/opt-out behavior.

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  name: string | null;
  firstVideoAt: Date | null;
  monthlyCredits: number | null;
  lowCreditEmailSentAt: Date | null;
}
let user: UserRow;
let categoryAllowed: boolean;
const sendFirstVideoSuccessEmail = vi.fn<(to: string, name: string) => Promise<boolean>>();
const sendLowCreditsEmail = vi.fn(async () => {});
const sendZeroCreditsEmail = vi.fn(async () => {});

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: vi.fn(async () => categoryAllowed) }));
vi.mock("@/lib/email", () => ({ sendFirstVideoSuccessEmail, sendLowCreditsEmail, sendZeroCreditsEmail }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === user.id ? { ...user } : null),
      update: vi.fn(async ({ data }: { data: Partial<UserRow> }) => {
        Object.assign(user, data);
        return { ...user };
      }),
    },
  },
}));

const { firePostCreditSpendEmails, fireZeroCreditsEmail } = await import("./credit-events");

// Both functions are intentionally fire-and-forget (void-returning); give the
// microtask/macrotask queue a tick so their internal async IIFE settles
// before asserting.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  user = {
    id: "u1",
    email: "u@test.co",
    firstName: "Ada",
    name: null,
    firstVideoAt: null,
    monthlyCredits: 0,
    lowCreditEmailSentAt: null,
  };
  categoryAllowed = true;
  vi.clearAllMocks();
});

describe("firePostCreditSpendEmails — first-video send/flag ordering", () => {
  it("sets firstVideoAt only after a successful send", async () => {
    sendFirstVideoSuccessEmail.mockResolvedValueOnce(true);
    firePostCreditSpendEmails("u1", 40);
    await flush();
    expect(sendFirstVideoSuccessEmail).toHaveBeenCalledWith("u@test.co", "Ada");
    expect(user.firstVideoAt).not.toBeNull();
  });

  it("leaves firstVideoAt unset when the send fails, so the next spend retries it", async () => {
    sendFirstVideoSuccessEmail.mockResolvedValueOnce(false);
    firePostCreditSpendEmails("u1", 40);
    await flush();
    expect(user.firstVideoAt).toBeNull();
  });

  it("leaves firstVideoAt unset when the send rejects outright", async () => {
    sendFirstVideoSuccessEmail.mockRejectedValueOnce(new Error("resend down"));
    firePostCreditSpendEmails("u1", 40);
    await flush();
    expect(user.firstVideoAt).toBeNull();
  });

  it("never re-sends once firstVideoAt is already set", async () => {
    user.firstVideoAt = new Date();
    firePostCreditSpendEmails("u1", 40);
    await flush();
    expect(sendFirstVideoSuccessEmail).not.toHaveBeenCalled();
  });

  it("a retried spend after a failed send succeeds and sets the flag", async () => {
    sendFirstVideoSuccessEmail.mockResolvedValueOnce(false);
    firePostCreditSpendEmails("u1", 40);
    await flush();
    expect(user.firstVideoAt).toBeNull();

    sendFirstVideoSuccessEmail.mockResolvedValueOnce(true);
    firePostCreditSpendEmails("u1", 38);
    await flush();
    expect(user.firstVideoAt).not.toBeNull();
    expect(sendFirstVideoSuccessEmail).toHaveBeenCalledTimes(2);
  });
});

describe("fireZeroCreditsEmail", () => {
  it("sends once and stamps lowCreditEmailSentAt", async () => {
    fireZeroCreditsEmail("u1");
    await flush();
    expect(sendZeroCreditsEmail).toHaveBeenCalledWith("u@test.co", "Ada");
    expect(user.lowCreditEmailSentAt).not.toBeNull();
  });

  it("does not re-send within the 24h cooldown", async () => {
    user.lowCreditEmailSentAt = new Date();
    fireZeroCreditsEmail("u1");
    await flush();
    expect(sendZeroCreditsEmail).not.toHaveBeenCalled();
  });

  it("re-sends once the cooldown has passed", async () => {
    user.lowCreditEmailSentAt = new Date(Date.now() - 25 * 3600_000);
    fireZeroCreditsEmail("u1");
    await flush();
    expect(sendZeroCreditsEmail).toHaveBeenCalledTimes(1);
  });

  it("respects the usageAlerts opt-out", async () => {
    categoryAllowed = false;
    fireZeroCreditsEmail("u1");
    await flush();
    expect(sendZeroCreditsEmail).not.toHaveBeenCalled();
    // Still rate-limited even though nothing was sent — an opted-out user
    // shouldn't cause a DB write storm on every failed spend.
    expect(user.lowCreditEmailSentAt).not.toBeNull();
  });
});
