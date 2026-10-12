import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Reports, share links, CSV export and the competitors "You" row for the app:
// the web's own routes (stand-ins here) and the rows they leave, in the app's shapes.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(async () => ({ userId: "u1" })),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const web = { run: vi.fn(), runGet: vi.fn(), link: vi.fn(), revoke: vi.fn(), exportCsv: vi.fn() };
vi.mock("@/app/api/social/reports/route", () => ({ POST: web.run }));
vi.mock("@/app/api/social/reports/[id]/route", () => ({ GET: web.runGet }));
vi.mock("@/app/api/social/report-link/route", () => ({ POST: web.link }));
vi.mock("@/app/api/social/report-link/[id]/route", () => ({ DELETE: web.revoke }));
vi.mock("@/app/api/social/export/route", () => ({ GET: web.exportCsv }));
vi.mock("@/lib/social/competitors", async () => ({ ...(await vi.importActual<object>("@/lib/social/competitors")), competitorTrackingConfigured: () => true }));
const db = {
  socialReportConfig: { findMany: vi.fn() },
  socialReportRun: { findMany: vi.fn() },
  socialReportLink: { findMany: vi.fn() },
  socialAccount: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const reports = await import("./reports/route");
const download = (await import("./reports/[id]/download/route")).GET;
const links = await import("./share-links/route");
const revoke = (await import("./share-links/[id]/route")).DELETE;
const exportCsv = (await import("./export/route")).GET;
const { myCompetitorStats } = await import("@/lib/mobile/social");

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost/api/mobile/v1/social${url}`, { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const d = (s: string) => new Date(s);

beforeEach(() => {
  vi.clearAllMocks();
  db.socialAccount.findMany.mockResolvedValue([
    { id: "yt", provider: "youtube" },
    { id: "ig", provider: "instagram" },
  ]);
});

describe("reports", () => {
  it("lists setups, files named after them, and active links", async () => {
    db.socialReportConfig.findMany.mockResolvedValue([{ id: "c1", name: "Monthly", accountIds: ["yt"], sections: ["kpis", "trends"], format: "pdf", schedule: "monthly" }]);
    db.socialReportRun.findMany.mockResolvedValue([
      { id: "r1", configId: "c1", format: "pdf", status: "done", sizeBytes: 2048, createdAt: d("2026-10-01T09:00:00Z"), periodStart: d("2026-09-01T00:00:00Z"), periodEnd: d("2026-09-30T00:00:00Z") },
      { id: "r2", configId: null, format: "csv", status: "queued", sizeBytes: null, createdAt: d("2026-10-02T09:00:00Z"), periodStart: d("2026-09-02T00:00:00Z"), periodEnd: d("2026-10-01T00:00:00Z") },
    ]);
    db.socialReportLink.findMany.mockResolvedValue([{ id: "l1", accountIds: ["yt", "ig"], sections: ["kpis", "content"], viewCount: 4, expiresAt: d("2026-10-17T00:00:00Z") }]);
    const res = await reports.GET(req("/reports"));
    expect(await res.json()).toEqual({
      saved: [{ id: "c1", name: "Monthly", accountIds: ["yt"], sections: ["kpis", "trends"], format: "pdf", schedule: "monthly" }],
      files: [
        { id: "r1", title: "Monthly · Sep 1 – Sep 30", format: "pdf", status: "ready", sizeBytes: 2048, createdAt: "2026-10-01T09:00:00.000Z" },
        { id: "r2", title: "Report · Sep 2 – Oct 1", format: "csv", status: "running", sizeBytes: null, createdAt: "2026-10-02T09:00:00.000Z" },
      ],
      links: [{ id: "l1", name: "YouTube, Instagram · KPIs, Content", views: 4, expiresAt: "2026-10-17T00:00:00.000Z" }],
    });
    // Only the caller's rows, and only links still live.
    expect(db.socialReportLink.findMany.mock.calls[0]![0].where).toMatchObject({ userId: "u1", revokedAt: null });
  });

  it("runs a report through the web route; a scheduled one is emailed to its owner", async () => {
    web.run.mockResolvedValue(NextResponse.json({ data: { run: { id: "r3", format: "pdf", status: "queued", sizeBytes: null, createdAt: "2026-10-10T09:00:00Z", periodStart: "2026-10-03T00:00:00Z", periodEnd: "2026-10-10T00:00:00Z" } } }, { status: 202 }));
    const res = await reports.POST(req("/reports?tz=Asia/Kolkata", "POST", { name: "Weekly", accountIds: ["yt"], sections: ["kpis"], format: "pdf", schedule: "weekly" }));
    expect([res.status, await res.json()]).toEqual([202, { file: { id: "r3", title: "Weekly · Oct 3 – Oct 10", format: "pdf", status: "running", sizeBytes: null, createdAt: "2026-10-10T09:00:00.000Z" } }]);
    expect(await (web.run.mock.calls[0]![0] as NextRequest).json()).toEqual({
      config: { name: "Weekly", accountIds: ["yt"], sections: ["kpis"], format: "pdf", schedule: "weekly", period: "weekly", deliverToOwner: true },
      format: "pdf",
      period: "weekly",
      tz: "Asia/Kolkata",
    });
  });

  it("hands out a download link only once the file is ready", async () => {
    web.runGet.mockResolvedValueOnce(NextResponse.json({ data: { run: { format: "pdf" }, downloadUrl: null } }));
    let res = await download(req("/reports/r1/download"), ctx("r1"));
    expect([res.status, (await res.json()).code]).toEqual([409, "not_ready"]);
    web.runGet.mockResolvedValueOnce(NextResponse.json({ data: { run: { format: "xlsx", periodEnd: "2026-09-30T00:00:00.000Z" }, downloadUrl: "https://s3/report?signed" } }));
    res = await download(req("/reports/r1/download"), ctx("r1"));
    expect(await res.json()).toEqual({ url: "https://s3/report?signed", filename: "clipiro-report-2026-09-30.xlsx" });
  });
});

describe("share links", () => {
  it("makes a revocable link and says what it shows", async () => {
    web.link.mockResolvedValue(NextResponse.json({ data: { url: "https://clipiro.com/report/social/tok", link: { id: "l2", accountIds: ["ig"], sections: ["kpis", "trends", "content"], expiresAt: "2026-10-17T09:00:00Z" } } }, { status: 201 }));
    const res = await links.POST(req("/share-links", "POST", { accountIds: ["ig"], days: 7 }));
    expect([res.status, await res.json()]).toEqual([201, { link: { id: "l2", name: "Instagram · KPIs, Trends, Content", views: 0, expiresAt: "2026-10-17T09:00:00.000Z" }, url: "https://clipiro.com/report/social/tok" }]);
    expect(await (web.link.mock.calls[0]![0] as NextRequest).json()).toEqual({ accountIds: ["ig"], sections: ["kpis", "trends", "content"], expiresInDays: 7 });
  });

  it("passes the active-link limit through, and revokes", async () => {
    web.link.mockResolvedValue(NextResponse.json({ error: "You can have up to 10 active links. Revoke one first.", code: "limit_reached" }, { status: 409 }));
    const res = await links.POST(req("/share-links", "POST", { accountIds: ["ig"], days: 7 }));
    expect([res.status, (await res.json()).code]).toEqual([409, "limit_reached"]);
    web.revoke.mockResolvedValue(NextResponse.json({ data: { revoked: true } }));
    expect(await (await revoke(req("/share-links/l2", "DELETE"), ctx("l2"))).json()).toEqual({ ok: true });
  });
});

describe("CSV export", () => {
  it("returns the web's CSV for one account, with its file name and row count", async () => {
    web.exportCsv.mockResolvedValue(new NextResponse("title,views\nHello,10\nWorld,20\n", { headers: { "content-disposition": 'attachment; filename="youtube-maya-posts.csv"' } }));
    const res = await exportCsv(req("/export?accountId=yt"));
    expect(await res.json()).toEqual({ filename: "youtube-maya-posts.csv", csv: "title,views\nHello,10\nWorld,20\n", rows: 2 });
    expect(new URL((web.exportCsv.mock.calls[0]![0] as NextRequest).url).search).toBe("?accountId=yt&kind=posts");
  });
});

describe("competitors: your own row", () => {
  it("measures your accounts the way competitors are measured", async () => {
    db.socialAccount.findMany.mockResolvedValue([{ id: "ig", provider: "instagram", followers: 1000 }]);
    db.socialPost.findMany.mockResolvedValue([
      { likes: 40, comments: 10, publishedAt: d("2026-10-01T00:00:00Z") },
      { likes: 60, comments: 10, publishedAt: d("2026-10-08T00:00:00Z") },
    ]);
    // (avg likes 50 + avg comments 10) / 1,000 followers = 6%; 2 posts over 7 days = 2 a week.
    expect(await myCompetitorStats("u1")).toEqual([{ accountId: "ig", provider: "instagram", engagementRate: 6, postsPerWeek: 2 }]);
  });
});
