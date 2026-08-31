// SECURITY REGRESSION — the jobId here is an unguessable UUID, but that was
// being treated as the entire authorization check: any authenticated user who
// learned another user's export jobId got that user's presigned "download my
// data" URL. This suite pins the fix — a stored userId on the status record,
// checked against the caller before the URL is ever returned.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AccountExportStatus } from "@/lib/account-export";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

let status: AccountExportStatus = { status: "queued" };
const getAccountExportStatus = vi.fn(async () => status);
vi.mock("@/lib/account-export", () => ({ getAccountExportStatus }));

const { GET } = await import("./route");

function get(jobId: string): NextRequest {
  return new NextRequest(`http://localhost/api/account/export/${jobId}`);
}
const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  authUser = { userId: "u1" };
  status = { status: "queued" };
  vi.clearAllMocks();
});

describe("GET /api/account/export/[jobId] — ownership", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(401);
  });

  it("403s a ready export belonging to a different user", async () => {
    status = { status: "ready", url: "https://signed.example/export.json", userId: "someone-else" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.url).toBeUndefined();
  });

  it("403s a failed export's error record belonging to a different user", async () => {
    status = { status: "failed", error: "boom", userId: "someone-else" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(403);
  });

  it("returns the URL to the export's own owner, without leaking the userId field", async () => {
    status = { status: "ready", url: "https://signed.example/export.json", userId: "u1" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://signed.example/export.json");
    expect(body.userId).toBeUndefined();
  });

  it("does not 403 a still-queued job (no userId on the record yet)", async () => {
    status = { status: "queued" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("queued");
  });
});
