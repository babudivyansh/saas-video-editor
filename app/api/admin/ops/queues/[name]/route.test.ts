import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseBody: real.parseBody,
    parseQuery: real.parseQuery,
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
vi.mock("@/lib/env", () => ({ env: { RENDER_QUEUE_DRIVER: "in-process" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({ redis: { ping: vi.fn(async () => true), get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
const audit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction: (...a: unknown[]) => audit(...a), auditIp: () => "127.0.0.1" }));

const { InProcessQueue } = await import("@/lib/job-queue");
const { GET, POST } = await import("./route");

const settle = () => new Promise((r) => setTimeout(r, 30));
const ctx = (name: string) => ({ params: Promise.resolve({ name }) });
const post = (name: string, body: unknown) =>
  POST(new NextRequest(`http://x/api/admin/ops/queues/${name}`, { method: "POST", body: JSON.stringify(body) }), ctx(name));
const get = (name: string, state = "failed") => GET(new NextRequest(`http://x/api/admin/ops/queues/${name}?state=${state}`), ctx(name));

beforeEach(() => audit.mockClear());

describe("/api/admin/ops/queues/[name] (in-process driver)", () => {
  it("404s a queue name that isn't a known render queue", async () => {
    expect((await get("not-a-queue")).status).toBe(404);
    expect((await post("not-a-queue", { action: "pause" })).status).toBe(404);
  });

  it("lists failed jobs with secrets redacted, and retries one", async () => {
    let fail = true;
    const q = new InProcessQueue<{ projectId: string; uploadUrl: string; apiToken: string }>("editor-render", async () => {
      if (fail) throw new Error("ffmpeg exited 1");
    });
    q.enqueue("job-1", { projectId: "p1", uploadUrl: "https://s3/x.mp4?X-Amz-Signature=abc123", apiToken: "sekret" });
    await settle();

    const body = await (await get("editor-render")).json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({ id: "job-1", projectId: "p1", error: "ffmpeg exited 1", attempts: 3 });
    expect(body.jobs[0].data).not.toContain("sekret");
    expect(body.jobs[0].data).not.toContain("abc123");

    fail = false;
    const res = await post("editor-render", { action: "retry", jobId: "job-1" });
    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith("admin1", "queue.retry", "job-1", expect.anything());
  });

  it("requires the queue name typed for drain and clean-failed", async () => {
    new InProcessQueue("asset-zip", async () => {});
    expect((await post("asset-zip", { action: "drain-waiting" })).status).toBe(400);
    expect((await post("asset-zip", { action: "clean-failed", confirmPhrase: "asset" })).status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
    expect((await post("asset-zip", { action: "drain-waiting", confirmPhrase: "asset-zip", reason: "stuck" })).status).toBe(200);
  });

  it("explains a queue this process never started instead of pretending it acted", async () => {
    const res = await post("account-export", { action: "pause" });
    expect(res.status).toBe(409);
  });

  it("needs a jobId for per-job actions", async () => {
    new InProcessQueue("asset-moderation", async () => {});
    expect((await post("asset-moderation", { action: "retry" })).status).toBe(400);
  });
});
