import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Lifecycle moves are conditional on the current status, so a stale tab (or
// the cron) can't push a campaign somewhere it shouldn't go, and cancelling
// drops everyone not yet mailed.

vi.mock("@/lib/admin/api", () => ({
  withAdmin: (h: (req: NextRequest, ctx: unknown) => unknown) => (req: NextRequest, ctx: { params: Promise<unknown> }) =>
    ctx.params.then((params) => h(req, { admin: { userId: "admin1", email: "a@x.co", sessionId: "s" }, params })),
  parseBody: async (req: NextRequest, schema: { parse: (v: unknown) => unknown }) => schema.parse(await req.json()),
}));
const audit = vi.fn(async () => {});
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction: (...a: unknown[]) => (audit as unknown as (...x: unknown[]) => unknown)(...a), auditIp: () => undefined }));
vi.mock("@/lib/campaigns/serialize", () => ({ serializeCampaign: (c: unknown) => c }));

let row: { id: string; status: string; scheduledAt: Date | null; sentCount: number; skippedCount: number };
const recipientUpdateMany = vi.fn(async () => ({ count: 3 }));
const campaignUpdate = vi.fn(async ({ data }: { data: { skippedCount: { increment: number } } }) => {
  row.skippedCount += data.skippedCount.increment;
  return row;
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailCampaign: {
      findUnique: vi.fn(async () => row),
      findUniqueOrThrow: vi.fn(async () => row),
      updateMany: vi.fn(async ({ where, data }: { where: { status: { in: string[] } }; data: Record<string, unknown> }) => {
        if (!where.status.in.includes(row.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: (...a: unknown[]) => (campaignUpdate as unknown as (...x: unknown[]) => unknown)(...a),
    },
    emailCampaignRecipient: { updateMany: (...a: unknown[]) => (recipientUpdateMany as unknown as (...x: unknown[]) => unknown)(...a) },
  },
}));

const { POST } = await import("./route");

const call = (body: unknown) =>
  POST(new NextRequest("http://x/api/admin/campaigns/c1/action", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "c1" }) });

beforeEach(() => {
  row = { id: "c1", status: "draft", scheduledAt: null, sentCount: 0, skippedCount: 0 };
  recipientUpdateMany.mockClear();
  audit.mockClear();
});

describe("POST /api/admin/campaigns/[id]/action", () => {
  it("schedules a draft and audits it", async () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const res = await call({ action: "schedule", scheduledAt: at });
    expect(res.status).toBe(200);
    expect(row.status).toBe("scheduled");
    expect(row.scheduledAt?.toISOString()).toBe(at);
    expect(audit).toHaveBeenCalledWith("admin1", "campaign.schedule", "c1", expect.anything());
  });

  it("refuses a time in the past", async () => {
    const res = await call({ action: "schedule", scheduledAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect(res.status).toBe(400);
    expect(row.status).toBe("draft");
  });

  it("refuses a move the current status doesn't allow", async () => {
    row.status = "sent";
    const res = await call({ action: "pause" });
    expect(res.status).toBe(409);
    expect(row.status).toBe("sent");
  });

  it("cancelling drops pending recipients and counts them as skipped", async () => {
    row.status = "sending";
    const res = await call({ action: "cancel" });
    expect(res.status).toBe(200);
    expect(row.status).toBe("cancelled");
    expect(recipientUpdateMany).toHaveBeenCalledWith({
      where: { campaignId: "c1", status: "pending" },
      data: { status: "skipped", detail: "campaign cancelled" },
    });
    expect(row.skippedCount).toBe(3);
  });
});
