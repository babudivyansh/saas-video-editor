// @vitest-environment node
//
// Scopes were checked on write but never on read, so a key created as
// write-only could still read every clip and its download URL.
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let scopes = ["write"];
vi.mock("@/lib/auth", () => ({ getApiKeyAuth: vi.fn(async () => ({ userId: "u1", scopes })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const findFirst = vi.fn(async () => ({ id: "c1", videoUrl: "https://s3/c1.mp4" }));
vi.mock("@/lib/prisma", () => ({ prisma: { clip: { findFirst: () => findFirst() } } }));

const { GET } = await import("./route");
const get = () => GET(new NextRequest("http://localhost/api/v1/clips/c1"), { params: Promise.resolve({ id: "c1" }) });

describe("GET /api/v1/clips/[id]", () => {
  it("refuses a key without the read scope, and never reads the clip", async () => {
    scopes = ["write"];
    const res = await get();
    expect(res.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("serves a read-scoped key", async () => {
    scopes = ["read"];
    const res = await get();
    expect(res.status).toBe(200);
  });
});
