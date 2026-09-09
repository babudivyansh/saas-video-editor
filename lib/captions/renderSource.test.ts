// @vitest-environment node
//
// The ownership seam. A caption render can now be owned by a Clip (AutoClip)
// or by a Project (reddit-video / split-screen / streamer-video), and every
// read that used to go through `job.clip` goes through here instead. A mistake
// in this file is cross-tenant data access, not a wrong-looking caption, so it
// gets its own tests.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { clipFindFirst, projectFindFirst, clipUpdate, projectUpdate } = vi.hoisted(() => ({
  clipFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  clipUpdate: vi.fn(async () => ({})),
  projectUpdate: vi.fn(async () => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clip: { findFirst: clipFindFirst, update: clipUpdate },
    project: { findFirst: projectFindFirst, update: projectUpdate },
  },
}));
vi.mock("@/utils/s3-upload", () => ({
  s3KeyToPublicUrl: (k: string) => `https://cdn.invalid/${k}`,
}));

const {
  resolveRenderSource, applyRenderResult, adoptTranscript, renderRefId, ownedJobWhere,
} = await import("./renderSource");

const CLIP = {
  id: "clip-1", projectId: "proj-1", videoUrl: "https://cdn.invalid/renders/clip-1.mp4",
  durationSec: 42, title: "A clip", status: "ready", transcriptJson: [{ word: "hi", start: 0, end: 100 }],
  project: { userId: "user-1" },
};
const PROJECT = {
  id: "proj-9", userId: "user-1", videoUrl: "https://cdn.invalid/renders/proj-9.mp4",
  title: "Editor render", status: "completed", productType: "editor",
  captionsJson: [{ word: "posted", start: 0, end: 300 }],
};

const clipJob = { id: "job-1", clipId: "clip-1", projectId: null, userId: "user-1" };
const projectJob = { id: "job-2", clipId: null, projectId: "proj-9", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  clipFindFirst.mockResolvedValue(CLIP);
  projectFindFirst.mockResolvedValue(PROJECT);
});

describe("resolveRenderSource", () => {
  it("resolves a clip-owned job exactly as before", async () => {
    const s = await resolveRenderSource(clipJob);
    expect(s).toMatchObject({
      owner: { type: "clip", id: "clip-1" },
      userId: "user-1",
      projectId: "proj-1",
      durationSec: 42,
      ready: true,
      sourceFeature: "autoclip",
      sourceClipId: "clip-1",
    });
    expect(s?.transcript).toHaveLength(1);
  });

  it("resolves a project-owned job, which has no Clip row at all", async () => {
    const s = await resolveRenderSource(projectJob);
    expect(s).toMatchObject({
      owner: { type: "project", id: "proj-9" },
      userId: "user-1",
      projectId: "proj-9",
      ready: true,
      sourceFeature: "video-generator",
    });
    expect(s?.sourceClipId).toBeUndefined();
    expect(clipFindFirst).not.toHaveBeenCalled();
  });

  it("puts the userId in the WHERE clause, not in a check afterwards", async () => {
    // The difference matters: a post-hoc check is something a caller can
    // forget. This way a job belonging to someone else cannot be loaded at all.
    await resolveRenderSource(clipJob, { userId: "user-2" });
    expect(clipFindFirst.mock.calls[0][0].where).toEqual({
      id: "clip-1",
      project: { userId: "user-2" },
    });

    await resolveRenderSource(projectJob, { userId: "user-2" });
    expect(projectFindFirst.mock.calls[0][0].where).toEqual({ id: "proj-9", userId: "user-2" });
  });

  it("returns null — not a row — when the scoped lookup misses", async () => {
    clipFindFirst.mockResolvedValue(null);
    expect(await resolveRenderSource(clipJob, { userId: "someone-else" })).toBeNull();
  });

  it("omits the user scope for workers, which act on already-authorised jobs", async () => {
    await resolveRenderSource(clipJob);
    expect(clipFindFirst.mock.calls[0][0].where).toEqual({ id: "clip-1" });
  });

  it("is not ready until the owner's video actually exists", async () => {
    clipFindFirst.mockResolvedValue({ ...CLIP, status: "rendering" });
    expect((await resolveRenderSource(clipJob))?.ready).toBe(false);

    projectFindFirst.mockResolvedValue({ ...PROJECT, videoUrl: null });
    expect((await resolveRenderSource(projectJob))?.ready).toBe(false);
  });

  it("treats a job with neither owner as missing rather than crashing a worker", async () => {
    expect(await resolveRenderSource({ id: "x", clipId: null, projectId: null, userId: "u" })).toBeNull();
  });
});

describe("applyRenderResult", () => {
  it("points a clip at the captioned render, and marks it captioned", async () => {
    await applyRenderResult(clipJob, "renders/proj-1/caption-job-1.mp4");
    expect(clipUpdate).toHaveBeenCalledWith({
      where: { id: "clip-1" },
      data: { videoUrl: "https://cdn.invalid/renders/proj-1/caption-job-1.mp4", hasCaptions: true },
    });
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("points a project at it instead when that is the owner", async () => {
    await applyRenderResult(projectJob, "renders/proj-9/caption-job-2.mp4");
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "proj-9" },
      data: { videoUrl: "https://cdn.invalid/renders/proj-9/caption-job-2.mp4" },
    });
    expect(clipUpdate).not.toHaveBeenCalled();
  });
});

describe("adoptTranscript", () => {
  it("writes to the owner's own transcript column", async () => {
    const words = [{ word: "hello", start: 0, end: 100 }];
    await adoptTranscript(clipJob, words);
    expect(clipUpdate.mock.calls[0][0].data).toHaveProperty("transcriptJson");

    await adoptTranscript(projectJob, words);
    expect(projectUpdate.mock.calls[0][0].data).toHaveProperty("captionsJson");
  });
});

describe("renderRefId", () => {
  it("is owner-typed, so a clip and a project can never share a ledger entry", () => {
    // Both id spaces are opaque strings; without the type in the key, a clip
    // and a project with the same id would refund each other's credits.
    expect(renderRefId({ type: "clip", id: "abc" }, 0)).toBe("caption-render:abc:0");
    expect(renderRefId({ type: "project", id: "abc" }, 0)).toBe("caption-render:project:abc:0");
    expect(renderRefId({ type: "clip", id: "abc" }, 0))
      .not.toBe(renderRefId({ type: "project", id: "abc" }, 0));
  });
});

describe("ownedJobWhere", () => {
  it("matches either owner, and still goes through the relation", async () => {
    // NOT `{ userId }` on the job itself: that column is for refunds, and
    // authorising with it would make a stale copy of ownership load-bearing.
    expect(ownedJobWhere("job-1", "user-1")).toEqual({
      id: "job-1",
      OR: [{ clip: { project: { userId: "user-1" } } }, { project: { userId: "user-1" } }],
    });
  });
});
