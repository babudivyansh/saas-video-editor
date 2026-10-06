import { beforeEach, describe, expect, it, vi } from "vitest";
import { clipDetailSchema, clipsPageSchema, projectDetailSchema, projectsPageSchema } from "@clipiro/shared";

const projectFindMany = vi.fn();
const projectFindFirst = vi.fn();
const clipFindMany = vi.fn();
const clipFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { project: { findMany: projectFindMany, findFirst: projectFindFirst }, clip: { findMany: clipFindMany, findFirst: clipFindFirst } },
}));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => (u ? `${u}?signed` : null)) }));

const { clipStatus, draftStepsOf, getClipDetail, getDownloadLink, getProjectDetail, listClips, listProjects, projectStatus } = await import("./projects");

const run = (over: Record<string, unknown> = {}) => ({
  id: "p42",
  title: "Founders Pod · Ep. 42",
  productType: "auto-clip",
  status: "completed",
  editorDoc: null,
  updatedAt: new Date("2026-10-05T10:00:00Z"),
  sourceAsset: { duration: 2531.6 },
  _count: { clips: 12 },
  clips: [{ aspectRatio: "9:16", thumbnailUrl: "https://b.s3.amazonaws.com/t.jpg" }],
  ...over,
});
const clipRow = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  projectId: "p42",
  index: 0,
  title: "Nobody tells you this part",
  score: 92,
  durationSec: 41.37,
  aspectRatio: "9:16",
  status: "ready",
  thumbnailUrl: "https://b.s3.amazonaws.com/c1.jpg",
  isFavorite: true,
  failureReason: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("status and draft progress", () => {
  it.each([
    ["draft", "draft"],
    ["queued", "processing"],
    ["analyzing", "processing"],
    ["rendering", "rendering"],
    ["completed", "completed"],
    ["failed", "failed"],
  ])("project %s → %s", (web, app) => expect(projectStatus(web)).toBe(app));

  it.each([
    ["queued", "queued"],
    ["rendering", "rendering"],
    ["ready", "ready"],
    ["failed", "failed"],
  ])("clip %s → %s", (web, app) => expect(clipStatus(web)).toBe(app));

  it("reads a draft's checklist from its editor doc", () => {
    expect(draftStepsOf(null)).toEqual([]);
    expect(draftStepsOf({ tracks: { video: [{ srcIn: 0 }], caption: [], audio: [], text: [] } })).toEqual(["media"]);
    expect(draftStepsOf({ tracks: { video: [{ srcIn: 3.2 }], caption: [{}], audio: [{}], text: [{}] } })).toEqual(["media", "trim", "captions", "audio", "text"]);
    // Splitting a clip in two counts as trimming too.
    expect(draftStepsOf({ tracks: { video: [{ srcIn: 0 }, { srcIn: 0 }] } })).toEqual(["media", "trim"]);
  });
});

describe("projects", () => {
  it("lists only real work, in the app's shape, and pages by id", async () => {
    projectFindMany.mockResolvedValue([run(), ...Array.from({ length: 30 }, (_, i) => run({ id: `p${i}` }))]);
    const page = projectsPageSchema.parse(await listProjects("u1", null));
    const where = projectFindMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ userId: "u1", productType: { in: ["auto-clip", "editor"] } });
    expect(where.OR.length).toBeGreaterThan(0); // the "started" signals
    expect(page.projects).toHaveLength(30);
    expect(page.projects[0]).toEqual({
      id: "p42", title: "Founders Pod · Ep. 42", kind: "autoclip", status: "completed", aspect: "9:16",
      thumbnailUrl: "https://b.s3.amazonaws.com/t.jpg?signed", clipCount: 12, durationSec: 2532, updatedAt: "2026-10-05T10:00:00.000Z",
    });
    expect(page.nextCursor).toBe("p28");
  });

  it("gives an editor draft its doc's aspect, length and checklist", async () => {
    projectFindFirst.mockResolvedValue(
      run({ productType: "editor", status: "draft", sourceAsset: null, _count: { clips: 0 }, clips: [], editorDoc: { aspect: "16:9", tracks: { video: [{ timelineStart: 0, duration: 30, srcIn: 2 }], text: [{ timelineStart: 25, duration: 10 }] } } }),
    );
    clipFindMany.mockResolvedValue([]);
    const p = projectDetailSchema.parse(await getProjectDetail("u1", "p42"));
    expect(p).toMatchObject({ kind: "editor", status: "draft", aspect: "16:9", durationSec: 35, thumbnailUrl: "", draftSteps: ["media", "trim", "text"], clips: [] });
  });

  it("returns null for someone else's project", async () => {
    projectFindFirst.mockResolvedValue(null);
    expect(await getProjectDetail("u1", "theirs")).toBeNull();
    expect(projectFindFirst.mock.calls[0]![0].where).toEqual({ id: "theirs", userId: "u1" });
  });
});

describe("clips", () => {
  it("filters by shape and favourites, owned through the project", async () => {
    clipFindMany.mockResolvedValue([clipRow(), clipRow({ id: "c2", index: 3, title: null, score: 140, status: "failed", failureReason: null, isFavorite: false })]);
    const page = clipsPageSchema.parse(await listClips("u1", { aspect: "9:16", favorites: true, cursor: null }));
    expect(clipFindMany.mock.calls[0]![0].where).toEqual({ project: { userId: "u1" }, aspectRatio: "9:16", isFavorite: true });
    expect(page.clips[0]).toMatchObject({ rank: 1, score: 92, durationSec: 41.4, favorite: true, failureReason: null });
    expect(page.clips[1]).toMatchObject({ rank: 4, title: "Clip 4", score: 99, status: "failed", failureReason: "This clip couldn't be rendered." });
  });

  it("explains the score and signs the video only when ready", async () => {
    clipFindFirst.mockResolvedValue({
      ...clipRow(),
      startSec: 812.4,
      endSec: 853.8,
      videoUrl: "https://b.s3.amazonaws.com/c1.mp4",
      project: { title: "Founders Pod · Ep. 42" },
      scoreBreakdown: { hook: 95, pacing: 88.4, payoff: 90, engagement: 93, audio: 71, speechRate: 99, silence: 140, composite: 92, reasoning: "A clear, contrarian opener.", hookExplanation: " " },
    });
    const c = clipDetailSchema.parse(await getClipDetail("u1", "c1"));
    expect(c.breakdown).toEqual({ hook: 95, pacing: 88, payoff: 90, engagement: 93, audio: 71, speechRate: 99, silence: 99 });
    expect([c.reasoning, c.hookExplanation, c.videoUrl]).toEqual(["A clear, contrarian opener.", null, "https://b.s3.amazonaws.com/c1.mp4?signed"]);
    expect(clipFindFirst.mock.calls[0]![0].where).toEqual({ id: "c1", project: { userId: "u1" } });
  });

  it("links a ready clip for download, with a tidy file name", async () => {
    clipFindFirst.mockResolvedValue({ index: 0, title: "Nobody tells you THIS part!", status: "ready", videoUrl: "https://b.s3.amazonaws.com/c1.mp4" });
    expect(await getDownloadLink("u1", "c1")).toMatchObject({ url: "https://b.s3.amazonaws.com/c1.mp4?signed", fileName: "nobody-tells-you-this-part.mp4" });
    clipFindFirst.mockResolvedValue({ index: 2, title: null, status: "rendering", videoUrl: null });
    expect(await getDownloadLink("u1", "c1")).toBe("not-ready");
    clipFindFirst.mockResolvedValue(null);
    expect(await getDownloadLink("u1", "c1")).toBe("not-found");
  });
});
