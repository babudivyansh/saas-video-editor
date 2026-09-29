import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseBody: real.parseBody,
    withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string; email: string } }) => Promise<Response>) =>
      async (req: NextRequest) => {
        try {
          return await handler(req, { admin: { userId: "admin1", email: "ops@clipiro.test" } });
        } catch (e) {
          return real.mapHandlerError("test", req, e);
        }
      },
  };
});
const env: Record<string, string | undefined> = { CRON_SECRET: "cron-s", SOCIAL_REFRESH_SECRET: "social-s", ASSET_CLEANUP_SECRET: undefined };
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn(async () => {}), get: vi.fn(async () => null), del: vi.fn(async () => {}) } }));
const audit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction: (...a: unknown[]) => audit(...a), auditIp: () => "127.0.0.1" }));
const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => { pending.push(fn()); },
}));

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
const { POST } = await import("./route");

const run = (body: unknown) =>
  POST(new NextRequest("https://clipiro.test/api/admin/ops/cron/run", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  audit.mockClear();
  fetchMock.mockClear();
  pending.length = 0;
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/admin/ops/cron/run", () => {
  it("runs a safe job through its own route with its own secret, and audits it", async () => {
    const res = await run({ path: "/api/cron/clip-publish" });
    expect(res.status).toBe(202);
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://clipiro.test/api/cron/clip-publish",
      expect.objectContaining({ headers: { Authorization: "Bearer cron-s" } }),
    );
    expect(audit).toHaveBeenCalledWith("admin1", "cron.run_manual", "clip-publish", expect.objectContaining({ after: { path: "/api/cron/clip-publish" } }));
  });

  it("refuses any path that isn't an exact scheduled job", async () => {
    for (const path of ["/api/cron/clip-publish?x=1", "https://evil.test/api/cron/clip-publish", "/api/admin/users"]) {
      expect((await run({ path })).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the typed phrase for a danger-tier job, server-side", async () => {
    expect((await run({ path: "/api/cron/refill-credits" })).status).toBe(400);
    expect((await run({ path: "/api/cron/refill-credits", confirmPhrase: "refill" })).status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
    expect((await run({ path: "/api/cron/refill-credits", confirmPhrase: "refill-credits", reason: "missed run" })).status).toBe(202);
  });

  it("says so instead of running when the job's secret isn't configured", async () => {
    const res = await run({ path: "/api/cron/asset-cleanup" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("ASSET_CLEANUP_SECRET");
  });

  it("rejects unknown fields", async () => {
    expect((await run({ path: "/api/cron/clip-publish", secret: "x" })).status).toBe(400);
  });
});
