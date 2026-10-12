import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const deleteProjects = vi.fn(async () => ({ deleted: 2, skipped: 0 }));
const deleteClips = vi.fn(async () => ({ deleted: 1, skipped: 1 }));
vi.mock("@/lib/mobile/projects", () => ({ deleteProjects, deleteClips }));

const projects = (await import("./route")).POST;
const clips = (await import("../../clips/delete/route")).POST;
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/mobile/v1/projects/delete", { method: "POST", headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());

describe("bulk delete routes", () => {
  it("deletes the caller's projects and clips, once per id", async () => {
    expect(await (await projects(post({ ids: ["p1", "p2", "p1"] }))).json()).toEqual({ deleted: 2, skipped: 0 });
    expect(deleteProjects).toHaveBeenCalledWith("u1", ["p1", "p2"]);
    expect(await (await clips(post({ ids: ["c1", "c2"] }))).json()).toEqual({ deleted: 1, skipped: 1 });
    expect(deleteClips).toHaveBeenCalledWith("u1", ["c1", "c2"]);
  });

  it("refuses an empty list or more than 50", async () => {
    expect((await projects(post({ ids: [] }))).status).toBe(400);
    expect((await clips(post({ ids: Array.from({ length: 51 }, (_, i) => `c${i}`) }))).status).toBe(400);
    expect(deleteProjects).not.toHaveBeenCalled();
    expect(deleteClips).not.toHaveBeenCalled();
  });
});
