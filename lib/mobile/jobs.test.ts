import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobSchema } from "@clipiro/shared";

const generationFindFirst = vi.fn();
const projectFindFirst = vi.fn();
const clipCount = vi.fn(async () => 7);
vi.mock("@/lib/prisma", () => ({
  prisma: { generation: { findFirst: generationFindFirst }, project: { findFirst: projectFindFirst }, clip: { count: clipCount } },
}));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => (u ? `${u}?signed` : null)) }));

const { readJob } = await import("./jobs");

const at = new Date("2026-10-06T10:00:00Z");
const gen = (over: Record<string, unknown>) => ({ toolSlug: "voiceover", status: "pending", progress: 0, errorMessage: null, createdAt: at, result: null, resultAssetId: null, ...over });
const project = (over: Record<string, unknown>) => ({ status: "queued", progress: 0, failureReason: null, createdAt: at, updatedAt: at, videoUrl: null, ...over });

beforeEach(() => vi.clearAllMocks());

describe("readJob", () => {
  it.each([
    [{ status: "pending", progress: 0 }, "queued"],
    [{ status: "pending", progress: 40 }, "running"],
    [{ status: "completed", progress: 100 }, "done"],
    [{ status: "failed" }, "failed"],
    [{ status: "refunded" }, "failed"],
  ])("AI tool %j → %s", async (row, status) => {
    generationFindFirst.mockResolvedValue(gen(row));
    expect((await readJob("u1", "gen_g1"))!.status).toBe(status);
  });

  it("returns a finished AI job's asset and a signed link", async () => {
    generationFindFirst.mockResolvedValue(gen({ toolSlug: "image-generator", status: "completed", progress: 100, result: { url: "https://b/x.png" }, resultAssetId: "as1" }));
    const job = jobSchema.parse(await readJob("u1", "gen_g1"));
    expect(job).toMatchObject({ type: "ai-image", status: "done", progress: 100, result: { assetId: "as1", url: "https://b/x.png?signed", projectId: null } });
    expect(generationFindFirst.mock.calls[0]![0].where).toEqual({ id: "g1", userId: "u1" });
  });

  it("explains a failure, including one a restart caused", async () => {
    generationFindFirst.mockResolvedValue(gen({ status: "failed", errorMessage: "This job was interrupted by a server restart — your credits have been refunded." }));
    expect((await readJob("u1", "gen_g1"))!.error).toMatch(/server restart/);
  });

  it("ignores Generations that aren't app jobs", async () => {
    generationFindFirst.mockResolvedValue(gen({ toolSlug: "social-exec-report" }));
    expect(await readJob("u1", "gen_g1")).toBeNull();
  });

  it.each([
    ["draft", "queued"],
    ["queued", "queued"],
    ["analyzing", "running"],
    ["rendering", "running"],
    ["completed", "done"],
    ["failed", "failed"],
  ])("AutoClip project %s → %s", async (status, want) => {
    projectFindFirst.mockResolvedValue(project({ status }));
    expect((await readJob("u1", "run_p1"))!.status).toBe(want);
  });

  it("counts a finished run's ready clips, and links a finished export's video", async () => {
    projectFindFirst.mockResolvedValue(project({ status: "completed", progress: 100 }));
    expect((await readJob("u1", "run_p1"))!.result).toEqual({ assetId: null, url: null, projectId: "p1", clipCount: 7 });
    expect(projectFindFirst.mock.calls[0]![0].where).toEqual({ id: "p1", userId: "u1", productType: "auto-clip" });

    projectFindFirst.mockResolvedValue(project({ status: "completed", videoUrl: "https://b/renders/p2.mp4" }));
    const exp = jobSchema.parse(await readJob("u1", "exp_p2"));
    expect(exp).toMatchObject({ type: "export", result: { url: "https://b/renders/p2.mp4?signed", projectId: "p2" } });
    expect(projectFindFirst.mock.calls[1]![0].where.productType).toBe("editor");
  });

  it("returns null for an id it doesn't recognise", async () => {
    expect(await readJob("u1", "nonsense")).toBeNull();
    expect(generationFindFirst).not.toHaveBeenCalled();
  });
});
