// PATCH / DELETE for a single clip — neither existed before. A user could
// re-render, dub, translate and publish a clip but could not rename one or
// throw one away; the only way to remove a bad clip was to delete the whole
// project, taking the good clips with it.
//
// The delete path is the interesting one: a rendered clip's mp4 may since have
// been adopted into the asset library, and blindly deleting the S3 object
// would leave the user with a library entry pointing at nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

const deleteS3Object = vi.fn(async () => {});
vi.mock("@/utils/s3-upload", () => ({ deleteS3Object }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const S3 = (key: string) => `https://bucket.s3.ap-south-1.amazonaws.com/${key}`;

let clipRow: Record<string, unknown> | null = {
  id: "c1",
  videoUrl: S3("renders/p1/clip-0.mp4"),
  thumbnailUrl: S3("renders/p1/clip-0.jpg"),
  status: "ready",
};
/** Asset rows that reference the clip's S3 keys. */
let referencingAssets: { s3Key: string }[] = [];

const projectFindFirst = vi.fn(async (args: { where: { id: string; userId: string } }) =>
  args.where.id === "p1" && args.where.userId === "u1" ? { id: "p1" } : null,
);
const clipFindFirst = vi.fn(async (args: { where: { id: string; projectId?: string } }) =>
  args.where.id === "c1" && (args.where.projectId === undefined || args.where.projectId === "p1")
    ? clipRow
    : null,
);
const clipUpdate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
  id: "c1",
  title: (args.data.title as string) ?? "Clip one",
  isFavorite: (args.data.isFavorite as boolean) ?? false,
}));
const clipDelete = vi.fn(async () => ({}));
const assetFindMany = vi.fn(async () => referencingAssets);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: (a: never) => projectFindFirst(a) },
    clip: {
      findFirst: (a: never) => clipFindFirst(a),
      update: (a: never) => clipUpdate(a),
      delete: (a: never) => clipDelete(a),
    },
    asset: { findMany: () => assetFindMany() },
  },
}));

const { PATCH, DELETE } = await import("./route");

const ctx = (id: string, clipId: string) => ({ params: Promise.resolve({ id, clipId }) });
const patchReq = (body: unknown) =>
  new NextRequest("http://localhost/api/projects/p1/clips/c1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
const delReq = () =>
  new NextRequest("http://localhost/api/projects/p1/clips/c1", { method: "DELETE" });

beforeEach(() => {
  authUser = { userId: "u1" };
  clipRow = {
    id: "c1",
    videoUrl: S3("renders/p1/clip-0.mp4"),
    thumbnailUrl: S3("renders/p1/clip-0.jpg"),
    status: "ready",
  };
  referencingAssets = [];
  vi.clearAllMocks();
});

describe("PATCH .../clips/[clipId]", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    expect((await PATCH(patchReq({ title: "x" }), ctx("p1", "c1"))).status).toBe(401);
  });

  it("404s a project the caller does not own", async () => {
    expect((await PATCH(patchReq({ title: "x" }), ctx("p-other", "c1"))).status).toBe(404);
  });

  it("404s a clip that belongs to a different project", async () => {
    const res = await PATCH(patchReq({ title: "x" }), ctx("p1", "c-other"));
    expect(res.status).toBe(404);
    expect(clipUpdate).not.toHaveBeenCalled();
  });

  it("renames a clip", async () => {
    const res = await PATCH(patchReq({ title: "  Better hook  " }), ctx("p1", "c1"));
    expect(res.status).toBe(200);
    // Trimmed by the schema, so a title of pure whitespace can't be stored.
    expect(clipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: "Better hook" } }),
    );
  });

  it("stars a clip", async () => {
    await PATCH(patchReq({ isFavorite: true }), ctx("p1", "c1"));
    expect(clipUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { isFavorite: true } }));
  });

  it("rejects an empty or whitespace-only title", async () => {
    expect((await PATCH(patchReq({ title: "   " }), ctx("p1", "c1"))).status).toBe(400);
    expect(clipUpdate).not.toHaveBeenCalled();
  });

  it("rejects a request that changes nothing", async () => {
    expect((await PATCH(patchReq({}), ctx("p1", "c1"))).status).toBe(400);
  });

  // A strict schema keeps a client from smuggling in fields that would let it
  // rewrite render state (score, status, videoUrl) through a rename endpoint.
  it("rejects unknown fields rather than silently ignoring them", async () => {
    const res = await PATCH(patchReq({ title: "x", score: 99, status: "ready" }), ctx("p1", "c1"));
    expect(res.status).toBe(400);
    expect(clipUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE .../clips/[clipId]", () => {
  it("404s a clip from another project without deleting anything", async () => {
    const res = await DELETE(delReq(), ctx("p1", "c-other"));
    expect(res.status).toBe(404);
    expect(clipDelete).not.toHaveBeenCalled();
    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  it("refuses to delete a clip that is still rendering", async () => {
    clipRow = { ...clipRow, status: "rendering" };
    const res = await DELETE(delReq(), ctx("p1", "c1"));
    // A worker is writing to this row; pulling it out from underneath produces
    // a confusing queue crash rather than a clean cancellation.
    expect(res.status).toBe(409);
    expect(clipDelete).not.toHaveBeenCalled();
  });

  it("deletes the row and cleans up its S3 objects", async () => {
    const res = await DELETE(delReq(), ctx("p1", "c1"));
    expect(res.status).toBe(200);
    expect(clipDelete).toHaveBeenCalled();
    expect(deleteS3Object).toHaveBeenCalledWith("renders/p1/clip-0.mp4");
    expect(deleteS3Object).toHaveBeenCalledWith("renders/p1/clip-0.jpg");
  });

  // The whole point of the reference check: once a render has been adopted
  // into the asset library, those bytes belong to the Asset. Deleting them
  // here would leave a library entry pointing at nothing.
  it("leaves S3 objects alone when an asset still references them", async () => {
    referencingAssets = [{ s3Key: "renders/p1/clip-0.mp4" }];

    const res = await DELETE(delReq(), ctx("p1", "c1"));

    expect(res.status).toBe(200);
    expect(clipDelete).toHaveBeenCalled();
    expect(deleteS3Object).not.toHaveBeenCalledWith("renders/p1/clip-0.mp4");
    // The thumbnail is not referenced, so it is still cleaned up.
    expect(deleteS3Object).toHaveBeenCalledWith("renders/p1/clip-0.jpg");
  });

  it("still deletes the row when S3 cleanup fails", async () => {
    deleteS3Object.mockRejectedValue(new Error("s3 down"));
    const res = await DELETE(delReq(), ctx("p1", "c1"));
    // An orphaned object is recoverable by the cleanup cron; a deleted object
    // with a live row is a permanently broken clip.
    expect(res.status).toBe(200);
    expect(clipDelete).toHaveBeenCalled();
  });

  it("handles a clip with no rendered output", async () => {
    clipRow = { id: "c1", videoUrl: null, thumbnailUrl: null, status: "pending_review" };
    const res = await DELETE(delReq(), ctx("p1", "c1"));
    expect(res.status).toBe(200);
    expect(deleteS3Object).not.toHaveBeenCalled();
  });
});
