// Regression coverage for migrating this route onto the shared withApi()
// wrapper (lib/api-handler.ts) as a proof of concept — it previously
// hand-picked known fields off the raw body with no type validation at all,
// so a malformed field (e.g. fontSize as a string) went straight to Prisma
// and surfaced as a raw, unhandled 500 instead of a clean 400.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "kit1", ...data }));
const findMany = vi.fn(async () => [{ id: "kit1", name: "My Kit" }]);
vi.mock("@/lib/prisma", () => ({ prisma: { brandKit: { create: (...a: unknown[]) => create(...(a as [{ data: Record<string, unknown> }])), findMany } } }));

const { GET, POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/brand-kits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(): NextRequest {
  return new NextRequest("http://localhost/api/brand-kits");
}

beforeEach(() => {
  authUser = { userId: "u1" };
  vi.clearAllMocks();
});

describe("GET /api/brand-kits", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("lists the user's kits", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect((await res.json()).kits).toHaveLength(1);
  });
});

describe("POST /api/brand-kits", () => {
  const VALID = {
    name: "My Kit", fontName: "Outfit", fontSize: 80,
    baseColor: "&H00FFFFFF", highlightColor: "&H0000FFFF", outlineColor: "&H00000000", shadowColor: "&H00000000",
    outlineWidth: 8, shadowDepth: 0, borderStyle: 1, alignment: 5, animated: true,
  };

  it("saves a kit with the full field set the editor sends", async () => {
    const res = await POST(post(VALID));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u1", name: "My Kit", fontSize: 80 }) });
  });

  it("400s a missing name instead of creating an unnamed kit", async () => {
    const res = await POST(post({ ...VALID, name: "" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("400s a non-integer fontSize instead of letting a bad value reach Prisma", async () => {
    const res = await POST(post({ ...VALID, fontSize: "huge" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await POST(post(VALID));
    expect(res.status).toBe(401);
  });
});
