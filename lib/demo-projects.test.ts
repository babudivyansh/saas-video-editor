// Demo projects: what every signed-in user may see of a run that isn't theirs.

import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFindMany = vi.fn();
const projectFindUnique = vi.fn();
const clipFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findMany: (a: unknown) => projectFindMany(a), findUnique: (a: unknown) => projectFindUnique(a) },
    clip: { findMany: (a: unknown) => clipFindMany(a) },
  },
}));
vi.mock("@/lib/clip-view-query", () => ({
  clipViewSelect: () => ({}),
  toClipView: async (row: Record<string, unknown>) => ({ ...row, projectTitle: "Sample podcast: owner's title", videoUrl: "https://signed/x.mp4" }),
}));

const { listDemoProjects, demoProjectClips } = await import("./demo-projects");

beforeEach(() => vi.clearAllMocks());

describe("listDemoProjects", () => {
  it("returns finished demos with ready clips, in the samples' order", async () => {
    projectFindMany.mockResolvedValue([
      { demoSlug: "vlog", _count: { clips: 7 } },
      { demoSlug: "podcast", _count: { clips: 9 } },
      { demoSlug: "gaming", _count: { clips: 0 } },
    ]);
    const cards = await listDemoProjects();
    expect(cards.map((c) => [c.slug, c.clipCount])).toEqual([["podcast", 9], ["vlog", 7]]);
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "completed" }) }));
  });
});

describe("demoProjectClips", () => {
  it("serves only ready clips, without the source video or anyone's feedback", async () => {
    projectFindUnique.mockResolvedValue({ id: "p1", status: "completed", autoClipCaptionStyle: 0, updatedAt: new Date(), instructions: null });
    clipFindMany.mockResolvedValue([{ id: "c1", isFavorite: true, isDisliked: false }]);
    const data = await demoProjectClips("podcast", true);
    expect(projectFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { demoSlug: "podcast" } }));
    expect(clipFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "p1", status: "ready" } }));
    expect(data?.project.uploadedVideoUrl).toBeNull();
    expect(data?.clips[0]).toMatchObject({ isFavorite: false, projectTitle: "Where Are Rich Indians Investing Globally?" });
    expect(data?.demo).toMatchObject({ slug: "podcast", creator: "Sonia Shenoy" });
  });

  it("is null for an unknown slug (no query), a missing demo, or one still running", async () => {
    expect(await demoProjectClips("../../etc", false)).toBeNull();
    expect(projectFindUnique).not.toHaveBeenCalled();
    projectFindUnique.mockResolvedValueOnce(null);
    expect(await demoProjectClips("gaming", false)).toBeNull();
    projectFindUnique.mockResolvedValueOnce({ id: "p2", status: "rendering" });
    expect(await demoProjectClips("gaming", false)).toBeNull();
    expect(clipFindMany).not.toHaveBeenCalled();
  });
});
