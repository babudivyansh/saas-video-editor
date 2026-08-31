// SECURITY REGRESSION — same class of bug as the account-export status route:
// the jobId is an unguessable UUID, but that was being treated as the entire
// authorization check. Any authenticated user who learned another user's
// bulk-download jobId got that user's presigned asset-zip URL. This suite
// pins the fix — a stored userId on the status record, checked against the
// caller before the URL is ever returned.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AssetZipStatus } from "@/lib/asset-zip";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

let status: AssetZipStatus = { status: "queued" };
const getAssetZipStatus = vi.fn(async () => status);
vi.mock("@/lib/asset-zip", () => ({ getAssetZipStatus }));

const { GET } = await import("./route");

function get(jobId: string): NextRequest {
  return new NextRequest(`http://localhost/api/assets/bulk/download/${jobId}`);
}
const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  authUser = { userId: "u1" };
  status = { status: "queued" };
  vi.clearAllMocks();
});

describe("GET /api/assets/bulk/download/[jobId] — ownership", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(401);
  });

  it("403s a ready zip belonging to a different user", async () => {
    status = { status: "ready", url: "https://signed.example/assets.zip", count: 3, userId: "someone-else" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.url).toBeUndefined();
  });

  it("returns the URL to the zip's own owner, without leaking the userId field", async () => {
    status = { status: "ready", url: "https://signed.example/assets.zip", count: 3, userId: "u1" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://signed.example/assets.zip");
    expect(body.userId).toBeUndefined();
  });

  it("does not 403 a still-queued job (no userId on the record yet)", async () => {
    status = { status: "queued" };
    const res = await GET(get("job1"), ctx("job1"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("queued");
  });
});
