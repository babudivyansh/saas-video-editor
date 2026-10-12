import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const webPatch = vi.fn();
vi.mock("@/app/api/projects/[id]/route", () => ({ PATCH: webPatch }));
const webEditInEditor = vi.fn();
vi.mock("@/app/api/projects/[id]/clips/[clipId]/edit-in-editor/route", () => ({ POST: webEditInEditor }));
vi.mock("@/lib/mobile/editor", () => ({ openEditor: vi.fn(async () => null), createFromAsset: vi.fn(async () => "not-ready"), createBlank: vi.fn(async () => ({ projectId: "b1" })) }));
const findOwnedClip = vi.fn();
vi.mock("@/lib/mobile/projects", () => ({ findOwnedClip }));

const { GET, PUT } = await import("./route");
const create = (await import("../../../editor/projects/route")).POST;

const ctx = { params: Promise.resolve({ id: "p1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/mobile/v1/projects/p1/editor", { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const clip = { id: "v1", type: "video", assetId: "a1", timelineStart: 0, duration: 10, srcIn: 0, volume: 1, muted: false };
const doc = { version: 1, aspect: "9:16", fps: 30, tracks: { video: [clip], text: [], audio: [], image: [], caption: [] } };

beforeEach(() => vi.clearAllMocks());

describe("editor routes", () => {
  it("404s an edit that is not the caller's", async () => {
    expect((await GET(req("GET"), ctx)).status).toBe(404);
  });

  it("saves a valid doc through the web route's version check and returns the new version", async () => {
    webPatch.mockResolvedValue(NextResponse.json({ project: { editorVersion: 8 } }));
    const res = await PUT(req("PUT", { doc, expectedVersion: 7 }), ctx);
    expect(await res.json()).toEqual({ version: 8 });
    expect(await (webPatch.mock.calls[0]![0] as NextRequest).json()).toEqual({ editorDoc: doc, expectedVersion: 7 });
  });

  it("refuses a doc the renderer would refuse, before saving", async () => {
    const overlapping = { ...doc, tracks: { ...doc.tracks, video: [clip, { ...clip, id: "v2", timelineStart: 5 }] } };
    const res = await PUT(req("PUT", { doc: overlapping, expectedVersion: 7 }), ctx);
    expect(res.status).toBe(400);
    expect(webPatch).not.toHaveBeenCalled();
  });

  it("says when the edit changed elsewhere", async () => {
    webPatch.mockResolvedValue(NextResponse.json({ error: "version_conflict", currentVersion: 9 }, { status: 409 }));
    const res = await PUT(req("PUT", { doc, expectedVersion: 7 }), ctx);
    expect([res.status, await res.json()]).toEqual([409, { error: "This edit was changed somewhere else. Reload to get the latest version.", code: "version_conflict", currentVersion: 9 }]);
  });

  it("starts an edit from the caller's clip through the web's edit-in-editor", async () => {
    findOwnedClip.mockResolvedValue({ id: "c1", projectId: "run1" });
    webEditInEditor.mockResolvedValue(NextResponse.json({ editorProjectId: "ed9", asset: {} }));
    const res = await create(req("POST", { from: "clip", clipId: "c1" }));
    expect([res.status, await res.json()]).toEqual([201, { projectId: "ed9" }]);
    expect(await webEditInEditor.mock.calls[0]![1].params).toEqual({ id: "run1", clipId: "c1" });
    findOwnedClip.mockResolvedValue(null);
    expect((await create(req("POST", { from: "clip", clipId: "theirs" }))).status).toBe(404);
  });

  it("explains a file that is still processing, and starts blank edits", async () => {
    expect((await create(req("POST", { from: "asset", assetId: "a1" }))).status).toBe(409);
    expect(await (await create(req("POST", { from: "blank", aspect: "1:1" }))).json()).toEqual({ projectId: "b1" });
  });
});
