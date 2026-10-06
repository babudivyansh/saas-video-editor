import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The clip and project routes wrap the web's nested ones; those are stand-ins
// here. What's tested: the app's clip id finds its project, fields are
// translated (favorite → isFavorite), and errors pass through.

const webClipPatch = vi.fn();
const webClipDelete = vi.fn();
const webRerender = vi.fn();
const webProjectPatch = vi.fn();
vi.mock("@/app/api/projects/[id]/clips/[clipId]/route", () => ({ PATCH: webClipPatch, DELETE: webClipDelete }));
vi.mock("@/app/api/projects/[id]/clips/[clipId]/rerender/route", () => ({ POST: webRerender }));
vi.mock("@/app/api/projects/[id]/route", () => ({ PATCH: webProjectPatch, DELETE: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const findOwnedClip = vi.fn();
const getClipDetail = vi.fn(async () => ({ id: "c1", favorite: true }));
const getDownloadLink = vi.fn();
vi.mock("@/lib/mobile/projects", () => ({ findOwnedClip, getClipDetail, getDownloadLink, getProjectDetail: vi.fn(async () => ({ id: "p42", title: "New" })) }));

const clip = await import("./[id]/route");
const retry = (await import("./[id]/retry/route")).POST;
const download = (await import("./[id]/download/route")).GET;
const project = await import("../projects/[id]/route");

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/mobile/v1/clips/c1", { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const paramsOf = async (mock: ReturnType<typeof vi.fn>) => (mock.mock.calls[0]![1] as { params: Promise<unknown> }).params;

beforeEach(() => {
  vi.clearAllMocks();
  findOwnedClip.mockResolvedValue({ id: "c1", projectId: "p42" });
});

describe("clips", () => {
  it("stars a clip through the web route, nested under its project", async () => {
    webClipPatch.mockResolvedValue(NextResponse.json({ clip: {} }));
    const res = await clip.PATCH(req("PATCH", { favorite: true }), ctx("c1"));
    expect(await res.json()).toEqual({ id: "c1", favorite: true });
    expect(await (webClipPatch.mock.calls[0]![0] as NextRequest).json()).toEqual({ isFavorite: true });
    expect(await paramsOf(webClipPatch)).toEqual({ id: "p42", clipId: "c1" });
  });

  it("404s a clip that isn't the caller's, without calling the web route", async () => {
    findOwnedClip.mockResolvedValue(null);
    expect((await clip.DELETE(req("DELETE"), ctx("theirs"))).status).toBe(404);
    expect((await retry(req("POST"), ctx("theirs"))).status).toBe(404);
    expect(webClipDelete).not.toHaveBeenCalled();
    expect(webRerender).not.toHaveBeenCalled();
  });

  it("refuses an empty change", async () => {
    expect((await clip.PATCH(req("PATCH", {}), ctx("c1"))).status).toBe(400);
  });

  it("retries as an unchanged re-render, and passes 'already rendering' through", async () => {
    webRerender.mockResolvedValue(NextResponse.json({ status: "queued" }));
    await retry(req("POST"), ctx("c1"));
    expect(await (webRerender.mock.calls[0]![0] as NextRequest).json()).toEqual({});
    webRerender.mockResolvedValue(NextResponse.json({ error: "This clip is already rendering or queued" }, { status: 409 }));
    const res = await retry(req("POST"), ctx("c1"));
    expect([res.status, (await res.json()).error]).toEqual([409, "This clip is already rendering or queued"]);
  });

  it("gives a download link, or says the clip isn't ready", async () => {
    getDownloadLink.mockResolvedValue({ url: "u", fileName: "f.mp4", expiresAt: "t" });
    expect(await (await download(req("GET"), ctx("c1"))).json()).toEqual({ url: "u", fileName: "f.mp4", expiresAt: "t" });
    getDownloadLink.mockResolvedValue("not-ready");
    const res = await download(req("GET"), ctx("c1"));
    expect([res.status, (await res.json()).code]).toEqual([409, "not_ready"]);
  });
});

describe("projects", () => {
  it("renames through the web route", async () => {
    webProjectPatch.mockResolvedValue(NextResponse.json({}));
    const res = await project.PATCH(req("PATCH", { title: "  New  " }), ctx("p42"));
    expect(await res.json()).toEqual({ id: "p42", title: "New" });
    expect(await (webProjectPatch.mock.calls[0]![0] as NextRequest).json()).toEqual({ title: "New" });
    expect(await paramsOf(webProjectPatch)).toEqual({ id: "p42" });
  });
});
