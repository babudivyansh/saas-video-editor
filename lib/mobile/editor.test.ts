import { beforeEach, describe, expect, it, vi } from "vitest";
import { editorOpenResponse, validateDoc } from "@clipiro/shared";

// Opening an edit (doc, version, playable links for the caller's own files)
// and starting one from a file in Assets or from nothing.

const projectFindFirst = vi.fn();
const projectCreate = vi.fn(async (_a: { data: Record<string, unknown> }) => ({ id: "ed1" }));
const assetFindMany = vi.fn();
const assetFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findFirst: projectFindFirst, create: projectCreate }, asset: { findMany: assetFindMany, findFirst: assetFindFirst } } }));
vi.mock("@/lib/mobile/assets", () => ({
  include: {},
  serialize: vi.fn(async (rows: { id: string; name: string }[]) =>
    rows.map((r) => ({ id: r.id, name: r.name, kind: "video", sizeBytes: 1, durationSec: 41, thumbnailUrl: null, folderId: null, favorite: false, archivedAt: null, source: "upload", madeWith: null, status: "ready", createdAt: "2026-10-09T00:00:00.000Z", url: `https://signed/${r.id}` })),
  ),
}));

const { assetIdsOf, createBlank, createFromAsset, openEditor } = await import("./editor");

const video = (id: string, assetId: string, start = 0) => ({ id, type: "video", assetId, timelineStart: start, duration: 10, srcIn: 0, volume: 1, muted: false });

beforeEach(() => vi.clearAllMocks());

describe("openEditor", () => {
  it("returns the doc, its version and a signed link per file the caller owns", async () => {
    projectFindFirst.mockResolvedValue({
      id: "p1",
      title: "Leg day",
      editorVersion: 7,
      // An older doc without a caption track: filled in.
      editorDoc: { version: 1, aspect: "9:16", fps: 30, tracks: { video: [video("v1", "a1"), video("v2", "a1", 10)], text: [], audio: [{ id: "m1", type: "audio", assetId: "a2", timelineStart: 0, duration: 20, srcIn: 0, volume: 0.3 }], image: [] } },
    });
    assetFindMany.mockResolvedValue([{ id: "a1", name: "Leg day.mov" }]);
    const open = editorOpenResponse.parse(await openEditor("u1", "p1"));
    expect(projectFindFirst.mock.calls[0]![0].where).toEqual({ id: "p1", userId: "u1", productType: "editor" });
    expect(assetFindMany.mock.calls[0]![0].where).toEqual({ id: { in: ["a1", "a2"] }, userId: "u1" });
    expect(open).toMatchObject({ projectId: "p1", title: "Leg day", version: 7 });
    expect(open.doc.tracks.caption).toEqual([]);
    // a2 is not the caller's (or was deleted): no link for it.
    expect(Object.keys(open.media)).toEqual(["a1"]);
    expect(open.media.a1!.url).toBe("https://signed/a1");
  });

  it("is null for someone else's project or a non-editor one", async () => {
    projectFindFirst.mockResolvedValue(null);
    expect(await openEditor("u1", "theirs")).toBeNull();
  });

  it("lists each file once", () => {
    expect(assetIdsOf({ version: 1, aspect: "9:16", fps: 30, tracks: { video: [video("v1", "a1") as never, video("v2", "a1", 10) as never], text: [], audio: [], image: [], caption: [] } })).toEqual(["a1"]);
  });
});

describe("creating an edit", () => {
  it("puts a video from Assets on the timeline, in its own frame shape", async () => {
    assetFindFirst.mockResolvedValue({ id: "a1", name: "Leg day.mov", kind: "video", duration: 52, width: 1080, height: 1920, status: "ready" });
    expect(await createFromAsset("u1", "a1")).toEqual({ projectId: "ed1" });
    expect(assetFindFirst.mock.calls[0]![0].where).toEqual({ id: "a1", userId: "u1", archivedAt: null });
    const data = projectCreate.mock.calls[0]![0].data as { title: string; productType: string; editorDoc: unknown };
    expect(data).toMatchObject({ title: "Leg day", productType: "editor", status: "draft" });
    expect(validateDoc(data.editorDoc)).toBeNull();
    expect(data.editorDoc).toMatchObject({ aspect: "9:16", tracks: { video: [{ type: "video", assetId: "a1", duration: 52, srcIn: 0 }] } });
  });

  it("lays audio on the audio track and a landscape image in 16:9", async () => {
    assetFindFirst.mockResolvedValueOnce({ id: "a2", name: "Intro.mp3", kind: "audio", duration: 8, width: null, height: null, status: "ready" });
    await createFromAsset("u1", "a2");
    expect(projectCreate.mock.calls[0]![0].data.editorDoc).toMatchObject({ tracks: { audio: [{ type: "audio", assetId: "a2" }], video: [] } });
    assetFindFirst.mockResolvedValueOnce({ id: "a3", name: "Wide.png", kind: "image", duration: null, width: 1920, height: 1080, status: "ready" });
    await createFromAsset("u1", "a3");
    expect(projectCreate.mock.calls[1]![0].data.editorDoc).toMatchObject({ aspect: "16:9", tracks: { image: [{ type: "image", duration: 5 }] } });
  });

  it("refuses a missing or still-processing file", async () => {
    assetFindFirst.mockResolvedValueOnce(null);
    expect(await createFromAsset("u1", "x")).toBe("not-found");
    assetFindFirst.mockResolvedValueOnce({ id: "a1", name: "x.mp4", kind: "video", duration: 5, width: null, height: null, status: "processing" });
    expect(await createFromAsset("u1", "a1")).toBe("not-ready");
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("starts a blank edit in the chosen shape", async () => {
    await createBlank("u1", "1:1");
    const doc = projectCreate.mock.calls[0]![0].data.editorDoc;
    expect(validateDoc(doc)).toBeNull();
    expect(doc).toMatchObject({ aspect: "1:1" });
  });
});
