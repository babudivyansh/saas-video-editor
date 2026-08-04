import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "t", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));

type User = { userId: string; email: string; sessionId: string };
let subscriber: User | null = null;
let authUser: User | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => authUser),
}));

interface AccountRow { id: string; userId: string; provider: string }
interface RunRow { id: string; userId: string; status: string; storageKey: string | null }
let accountRows: AccountRow[] = [];
let runRows: RunRow[] = [];
let configRows: Array<{ id: string; userId: string; accountIds: string[]; period: string; sections: string[]; format: string }> = [];

const createRun = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run_new", ...data }));
const createConfig = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "cfg_new", ...data }));
const deleteRun = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; userId: string } }) =>
        accountRows.filter((a) => a.userId === where.userId && (!where.id?.in || where.id.in.includes(a.id))),
      ),
    },
    socialReportRun: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        runRows.filter((r) => r.userId === where.userId),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        runRows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      ),
      create: createRun,
      delete: deleteRun,
    },
    socialReportConfig: {
      findMany: vi.fn(async () => configRows),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        configRows.find((c) => c.id === where.id && c.userId === where.userId) ?? null,
      ),
      create: createConfig,
    },
  },
}));

const enqueueReport = vi.fn(async () => ({ driver: "in-process" as const }));
vi.mock("@/lib/social/reports/queue", () => ({ enqueueReport }));

const getPresignedUrl = vi.fn(async () => "https://s3.example/signed");
vi.mock("@/utils/s3-upload", () => ({ getPresignedUrl }));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET, POST } = await import("./route");
const { GET: GET_ONE, DELETE } = await import("./[id]/route");

const ALICE: User = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/reports", { method: "POST", body: JSON.stringify(body) }));
const one = (id: string) =>
  GET_ONE(new NextRequest(`http://localhost/api/social/reports/${id}`), { params: Promise.resolve({ id }) });
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/social/reports/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  subscriber = ALICE;
  authUser = ALICE;
  createRun.mockClear();
  createConfig.mockClear();
  deleteRun.mockClear();
  enqueueReport.mockClear();
  getPresignedUrl.mockClear();
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
  configRows = [
    { id: "cfg_bob_00000001", userId: "user_bob", accountIds: [BOB_ACC], period: "monthly", sections: ["kpis"], format: "pdf" },
  ];
  runRows = [
    { id: "run_alice", userId: ALICE.userId, status: "done", storageKey: "social-reports/alice/run.pdf" },
    { id: "run_bob", userId: "user_bob", status: "done", storageKey: "social-reports/bob/run.pdf" },
  ];
});

describe("POST /api/social/reports", () => {
  it("404s when the run would cover another tenant's account", async () => {
    const res = await post({ config: { accountIds: [BOB_ACC], period: "monthly", sections: ["kpis"], format: "pdf" } });
    expect(res.status).toBe(404);
    expect(createRun).not.toHaveBeenCalled();
  });

  it("404s on another tenant's saved config", async () => {
    const res = await post({ configId: "cfg_bob_00000001" });
    expect(res.status).toBe(404);
    expect(enqueueReport).not.toHaveBeenCalled();
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await post({})).status).toBe(402);
  });

  it("accepts with 202 and queues rather than building inline", async () => {
    // Building an annual PDF inside the request would block the event loop for
    // every other request on the instance.
    const res = await post({
      config: { accountIds: [ALICE_ACC], period: "monthly", sections: ["kpis"], format: "pdf" },
    });
    expect(res.status).toBe(202);
    expect(enqueueReport).toHaveBeenCalledWith("run_new");
    expect((await res.json()).data.run.status).toBe("queued");
  });

  it("persists an inline config so the run can explain itself later", async () => {
    await post({ config: { accountIds: [ALICE_ACC], period: "weekly", sections: ["kpis"], format: "csv" } });
    expect(createConfig).toHaveBeenCalledTimes(1);
    expect(createRun.mock.calls[0][0].data.configId).toBe("cfg_new");
  });

  it("400s on a format the renderers do not implement", async () => {
    expect((await post({ format: "docx" })).status).toBe(400);
  });
});

describe("GET /api/social/reports", () => {
  it("never selects the S3 key", async () => {
    // Asserted on the query rather than the response: the object path is
    // internal, and downloads go through the presigned route instead of the
    // client knowing where the object lives.
    await GET(new NextRequest("http://localhost/api/social/reports"));
    const { prisma } = await import("@/lib/prisma");
    const select = vi.mocked(prisma.socialReportRun.findMany).mock.calls[0][0]!.select!;
    expect(select).not.toHaveProperty("storageKey");
    expect(select).toHaveProperty("status");
  });
});

describe("/api/social/reports/[id]", () => {
  it("404s on another tenant's run", async () => {
    expect((await one("run_bob")).status).toBe(404);
    expect((await del("run_bob")).status).toBe(404);
    expect(deleteRun).not.toHaveBeenCalled();
  });

  it("mints a short-lived presigned URL rather than exposing the object", async () => {
    const body = await (await one("run_alice")).json();
    expect(getPresignedUrl).toHaveBeenCalledWith("social-reports/alice/run.pdf", 300);
    expect(body.data.downloadUrl).toBe("https://s3.example/signed");
    expect(body.data.expiresInSeconds).toBe(300);
  });

  it("returns no download URL while the run is still building", async () => {
    runRows[0] = { ...runRows[0], status: "queued", storageKey: null };
    const body = await (await one("run_alice")).json();
    expect(body.data.downloadUrl).toBeNull();
    expect(getPresignedUrl).not.toHaveBeenCalled();
  });

  it("lets a lapsed subscriber delete their own run", async () => {
    subscriber = null; // lapsed, still signed in
    expect((await del("run_alice")).status).toBe(200);
    expect(deleteRun).toHaveBeenCalled();
  });
});
