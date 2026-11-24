import { beforeEach, describe, expect, it, vi } from "vitest";

// The send loop against an in-memory stand-in for the two campaign tables.
// What matters: nobody is mailed twice, the budget is respected, opt-outs and
// failures are recorded rather than retried, and a finished campaign is closed.

interface C { id: string; status: string; scheduledAt: Date | null; startedAt: Date | null; audience: unknown; blocks: unknown; subject: string; preheader: string; utmCampaign: string; sentCount: number; skippedCount: number; failedCount: number; audienceCount: number | null; completedAt: Date | null }
interface R { id: string; campaignId: string; userId: string; status: string; detail: string | null; messageId: string | null; claimedAt: Date | null; sentAt: Date | null; createdAt: Date }

let campaigns: C[] = [];
let recipients: R[] = [];
const users: Record<string, { email: string; name: string | null; purgedAt: Date | null; suspendedAt: Date | null; deactivatedAt: Date | null }> = {};

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    const val = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("in" in o) return (o.in as unknown[]).includes(val);
      if ("lte" in o) return val instanceof Date && val <= (o.lte as Date);
      if ("lt" in o) return val instanceof Date && val < (o.lt as Date);
      return true;
    }
    return val === v;
  });
}
function apply(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) row[k] = (row[k] as number) + (v as { increment: number }).increment;
    else row[k] = v;
  }
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailCampaign: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => campaigns.filter((c) => matches(c as never, where))),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = campaigns.filter((c) => matches(c as never, where));
        rows.forEach((r) => apply(r as never, data));
        return { count: rows.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = campaigns.find((x) => x.id === where.id)!;
        apply(c as never, data);
        return c;
      }),
    },
    emailCampaignRecipient: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = recipients.filter((r) => matches(r as never, where));
        rows.forEach((r) => apply(r as never, data));
        return { count: rows.length };
      }),
      findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        recipients.filter((r) => matches(r as never, where)).slice(0, take).map((r) => ({ ...r, user: users[r.userId] }))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = recipients.find((x) => x.id === where.id)!;
        apply(r as never, data);
        return r;
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => recipients.filter((r) => matches(r as never, where)).length),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const snapshotRecipients = vi.fn(async (campaignId: string) => {
  for (const uid of Object.keys(users)) {
    recipients.push({ id: `${campaignId}:${uid}`, campaignId, userId: uid, status: "pending", detail: null, messageId: null, claimedAt: null, sentAt: null, createdAt: new Date() });
  }
  return Object.keys(users).length;
});
vi.mock("./audience", () => ({ snapshotRecipients: (id: string) => snapshotRecipients(id), readAudience: (a: unknown) => a }));

let allowed = 100;
vi.mock("./budget", () => ({ campaignBudget: vi.fn(async () => ({ allowed, blockedBy: allowed ? null : "daily_cap" })) }));

const sendTemplate = vi.fn(async (_id: string, to: string) =>
  to.startsWith("optout") ? { status: "skipped-optout", channel: null, messageId: null }
    : to.startsWith("bad") ? { status: "failed", channel: null, messageId: null, error: "boom" }
      : { status: "sent", channel: "brevo", messageId: `m-${to}` });
vi.mock("@/lib/email/send", () => ({ sendTemplate: (...a: unknown[]) => (sendTemplate as unknown as (...x: unknown[]) => unknown)(...a) }));

const { runCampaigns, outcomeFor } = await import("./sender");

const BLOCKS = [{ kind: "heading", text: "Hi {{name}}" }];
function addCampaign(o: Partial<C> = {}): C {
  const c: C = {
    id: "c1", status: "scheduled", scheduledAt: new Date(Date.now() - 1000), startedAt: null, audience: { plan: "all" },
    blocks: BLOCKS, subject: "S", preheader: "P", utmCampaign: "bf", sentCount: 0, skippedCount: 0, failedCount: 0,
    audienceCount: null, completedAt: null, ...o,
  };
  campaigns.push(c);
  return c;
}
const user = (id: string, email: string) => { users[id] = { email, name: "Ana", purgedAt: null, suspendedAt: null, deactivatedAt: null }; };

beforeEach(() => {
  campaigns = [];
  recipients = [];
  for (const k of Object.keys(users)) delete users[k];
  allowed = 100;
  sendTemplate.mockClear();
  snapshotRecipients.mockClear();
});

describe("runCampaigns", () => {
  it("starts a due campaign, mails each recipient once with an idempotency key, then closes it", async () => {
    user("u1", "a@x.co"); user("u2", "optout@x.co"); user("u3", "bad@x.co");
    const c = addCampaign();

    const r = await runCampaigns();
    expect(r.started).toEqual(["c1"]);
    expect(sendTemplate).toHaveBeenCalledTimes(3);
    expect(sendTemplate.mock.calls[0][0]).toBe("campaign");
    expect((sendTemplate.mock.calls[0] as unknown[])[3]).toMatchObject({ userId: "u1", idempotencyKey: "campaign:c1:u1" });
    expect(c).toMatchObject({ status: "sent", sentCount: 1, skippedCount: 1, failedCount: 1, audienceCount: 3 });
    expect(recipients.find((x) => x.userId === "u2")).toMatchObject({ status: "skipped", detail: "opted out" });
    expect(recipients.find((x) => x.userId === "u3")).toMatchObject({ status: "failed", detail: "boom" });

    // A second run finds nothing to do and mails nobody again.
    await runCampaigns();
    expect(sendTemplate).toHaveBeenCalledTimes(3);
  });

  it("doesn't start a campaign scheduled for later", async () => {
    user("u1", "a@x.co");
    addCampaign({ scheduledAt: new Date(Date.now() + 3_600_000) });
    const r = await runCampaigns();
    expect(r.started).toEqual([]);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("stops at the budget and carries the rest over", async () => {
    for (let i = 0; i < 5; i++) user(`u${i}`, `a${i}@x.co`);
    const c = addCampaign();
    allowed = 2;
    await runCampaigns();
    expect(sendTemplate).toHaveBeenCalledTimes(2);
    expect(c.status).toBe("sending");

    allowed = 100;
    await runCampaigns();
    expect(sendTemplate).toHaveBeenCalledTimes(5);
    expect(c.status).toBe("sent");
  });

  it("sends nothing for a paused campaign", async () => {
    user("u1", "a@x.co");
    addCampaign({ status: "paused", startedAt: new Date() });
    recipients.push({ id: "r1", campaignId: "c1", userId: "u1", status: "pending", detail: null, messageId: null, claimedAt: null, sentAt: null, createdAt: new Date() });
    await runCampaigns();
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("skips accounts deactivated since the list was fixed", async () => {
    user("u1", "a@x.co");
    users.u1.suspendedAt = new Date();
    const c = addCampaign();
    await runCampaigns();
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(c).toMatchObject({ status: "sent", skippedCount: 1 });
  });

  it("pauses a campaign whose stored content is invalid instead of sending it", async () => {
    user("u1", "a@x.co");
    const c = addCampaign({ blocks: [{ kind: "script" }] });
    await runCampaigns();
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(c.status).toBe("paused");
  });
});

describe("outcomeFor", () => {
  it("counts quota only for what a provider took", () => {
    expect(outcomeFor({ status: "sent", channel: "brevo", messageId: "m" })).toMatchObject({ status: "sent", spendsQuota: true });
    expect(outcomeFor({ status: "duplicate", channel: "brevo", messageId: "m" })).toMatchObject({ status: "sent", spendsQuota: false });
    expect(outcomeFor({ status: "deferred", channel: null, messageId: null })).toMatchObject({ status: "queued", spendsQuota: true });
    expect(outcomeFor({ status: "suppressed", channel: null, messageId: null })).toMatchObject({ status: "skipped", spendsQuota: false });
  });
});
