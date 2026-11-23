import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAuthUser = vi.fn(async () => ({ userId: "u2" }) as { userId: string } | null);
vi.mock("@/lib/auth", () => ({ getAuthUser: () => getAuthUser() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
const demoProjectClips = vi.fn();
vi.mock("@/lib/demo-projects", () => ({ demoProjectClips: (...a: unknown[]) => demoProjectClips(...a) }));

const { GET } = await import("./route");
const call = (slug: string, qs = "") =>
  GET(new NextRequest(`http://localhost/api/demo-projects/${slug}/clips${qs}`), { params: Promise.resolve({ slug }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/demo-projects/[slug]/clips", () => {
  it("serves a demo to any signed-in user, not just its owner", async () => {
    demoProjectClips.mockResolvedValue({ project: {}, clips: [], demo: { slug: "vlog" } });
    const res = await call("vlog", "?excerpts=1");
    expect(res.status).toBe(200);
    expect(demoProjectClips).toHaveBeenCalledWith("vlog", true);
  });

  it("401s a signed-out caller and 404s a missing demo", async () => {
    demoProjectClips.mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
    getAuthUser.mockResolvedValueOnce(null);
    expect((await call("vlog")).status).toBe(401);
  });
});
