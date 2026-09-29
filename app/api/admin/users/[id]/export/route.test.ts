import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseBody: real.parseBody,
    withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string }; params: unknown }) => Promise<Response>) =>
      async (req: NextRequest, ctx: { params: Promise<unknown> }) => {
        try {
          return await handler(req, { admin: { userId: "admin1" }, params: await ctx.params });
        } catch (e) {
          return real.mapHandlerError("test", req, e);
        }
      },
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "u1" ? { id: "u1" } : null)) } },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
const audit = vi.fn();
const seen = new Set<string>();
vi.mock("@/lib/admin/audit", () => ({
  auditAdminAction: (...a: unknown[]) => audit(...a),
  auditIp: () => "127.0.0.1",
  auditOnce: async (key: string) => (seen.has(key) ? false : (seen.add(key), true)),
}));
const enqueue = vi.fn(() => "job-1");
const statuses: Record<string, unknown> = {};
vi.mock("@/lib/account-export", () => ({
  enqueueAccountExport: (...a: unknown[]) => enqueue(...(a as [])),
  getAccountExportStatus: vi.fn(async (id: string) => statuses[id] ?? { status: "queued" }),
}));

const { POST } = await import("./route");
const { GET } = await import("./[jobId]/route");

beforeEach(() => vi.clearAllMocks());

describe("admin user data export", () => {
  it("starts an export WITHOUT emailing the user, and audits it with the reason", async () => {
    const res = await POST(
      new NextRequest("http://x/api/admin/users/u1/export", { method: "POST", body: JSON.stringify({ reason: "GDPR access request #42" }) }),
      { params: Promise.resolve({ id: "u1" }) },
    );
    expect(res.status).toBe(202);
    expect(enqueue).toHaveBeenCalledWith("u1", { notifyUser: false });
    expect(audit).toHaveBeenCalledWith("admin1", "user.data_exported", "u1", expect.objectContaining({ reason: "GDPR access request #42" }));
  });

  it("needs a reason, and a real user", async () => {
    const noReason = await POST(new NextRequest("http://x", { method: "POST", body: JSON.stringify({}) }), { params: Promise.resolve({ id: "u1" }) });
    expect(noReason.status).toBe(400);
    const missing = await POST(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ reason: "request" }) }), { params: Promise.resolve({ id: "nope" }) });
    expect(missing.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns the download link, but refuses another account's export job", async () => {
    statuses["job-1"] = { status: "ready", url: "https://s3/x.json", userId: "u1" };
    const mine = await GET(new NextRequest("http://x"), { params: Promise.resolve({ id: "u1", jobId: "job-1" }) });
    expect(await mine.json()).toEqual({ status: "ready", url: "https://s3/x.json" });
    // The download is audited once, not on every poll.
    await GET(new NextRequest("http://x"), { params: Promise.resolve({ id: "u1", jobId: "job-1" }) });
    expect(audit.mock.calls.filter((c) => c[1] === "user.data_export_downloaded")).toHaveLength(1);
    const other = await GET(new NextRequest("http://x"), { params: Promise.resolve({ id: "u2", jobId: "job-1" }) });
    expect(other.status).toBe(403);
  });
});
