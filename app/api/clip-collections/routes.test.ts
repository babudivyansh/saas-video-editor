// Clip collections: CRUD, and — because Clip has no userId and the ids come
// from the client — that no route ever reads, adds or removes someone else's
// collection or clip.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

type Coll = { id: string; userId: string; name: string; createdAt: Date; updatedAt: Date };
type Item = { collectionId: string; clipId: string; addedAt: Date };
let collections: Coll[] = [];
let items: Item[] = [];
/** clip id → owner user id */
const clipOwner: Record<string, string> = { c1: "u1", c2: "u1", cX: "u2" };
let favCount = 0;

const clipView = (id: string) => ({
  id, projectId: "p1", index: 0, title: id, startSec: 0, endSec: 10, durationSec: 10, aspectRatio: "9:16",
  score: 80, scoreBreakdown: null, mood: null, status: "ready", progress: 100, videoUrl: null, thumbnailUrl: null,
  hasCaptions: false, captionStyleIndex: null, brollQuery: null, subtitleStyleOverride: null, silenceSettings: null,
  rerenderCount: 0, liteEdits: null, audioPeaks: null, failureReason: null, isFavorite: false, isDisliked: false,
  dubs: [], project: { title: "Project one" }, transcriptJson: undefined,
});

const clipFindMany = vi.fn(async (a: { where: { id?: { in: string[] }; isFavorite?: boolean; project: { userId: string } } }) => {
  if (a.where.isFavorite) return [clipView("c1")];
  return (a.where.id?.in ?? []).filter((id) => clipOwner[id] === a.where.project.userId).map((id) => ({ id }));
});
const createMany = vi.fn(async (a: { data: { collectionId: string; clipId: string }[] }) => {
  let count = 0;
  for (const d of a.data) {
    if (items.some((i) => i.collectionId === d.collectionId && i.clipId === d.clipId)) continue;
    items.push({ ...d, addedAt: new Date() });
    count++;
  }
  return { count };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipCollection: {
      findMany: vi.fn(async (a: { where: { userId: string } }) =>
        collections.filter((c) => c.userId === a.where.userId).map((c) => ({
          ...c, _count: { items: items.filter((i) => i.collectionId === c.id).length },
        })),
      ),
      findFirst: vi.fn(async (a: { where: { id: string; userId: string } }) =>
        collections.find((c) => c.id === a.where.id && c.userId === a.where.userId) ?? null,
      ),
      count: vi.fn(async (a: { where: { userId: string } }) => collections.filter((c) => c.userId === a.where.userId).length),
      create: vi.fn(async (a: { data: { userId: string; name: string } }) => {
        const c = { id: `col${collections.length + 1}`, ...a.data, createdAt: new Date(), updatedAt: new Date() };
        collections.push(c);
        return c;
      }),
      update: vi.fn(async (a: { where: { id: string }; data: { name?: string } }) => {
        const c = collections.find((x) => x.id === a.where.id)!;
        Object.assign(c, a.data);
        return c;
      }),
      deleteMany: vi.fn(async (a: { where: { id: string; userId: string } }) => {
        const before = collections.length;
        collections = collections.filter((c) => !(c.id === a.where.id && c.userId === a.where.userId));
        return { count: before - collections.length };
      }),
    },
    clipCollectionItem: {
      findMany: vi.fn(async (a: { where: { collectionId: string; clip: { project: { userId: string } } } }) =>
        items
          .filter((i) => i.collectionId === a.where.collectionId && clipOwner[i.clipId] === a.where.clip.project.userId)
          .map((i) => ({ clip: clipView(i.clipId) })),
      ),
      createMany: (a: never) => createMany(a),
      deleteMany: vi.fn(async (a: { where: { collectionId: string; clipId: { in: string[] } } }) => {
        const before = items.length;
        items = items.filter((i) => !(i.collectionId === a.where.collectionId && a.where.clipId.in.includes(i.clipId)));
        return { count: before - items.length };
      }),
    },
    clip: {
      findMany: (a: never) => clipFindMany(a),
      count: vi.fn(async () => favCount),
    },
  },
}));

const list = await import("./route");
const one = await import("./[id]/route");
const clips = await import("./[id]/clips/route");

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  authUser = { userId: "u1" };
  collections = [
    { id: "mine", userId: "u1", name: "Podcast hooks", createdAt: new Date(), updatedAt: new Date() },
    { id: "theirs", userId: "u2", name: "Not yours", createdAt: new Date(), updatedAt: new Date() },
  ];
  items = [{ collectionId: "theirs", clipId: "cX", addedAt: new Date() }];
  favCount = 4;
  vi.clearAllMocks();
});

describe("GET/POST /api/clip-collections", () => {
  it("401s without a session", async () => {
    authUser = null;
    expect((await list.GET(req("/api/clip-collections"))).status).toBe(401);
  });

  it("lists only the caller's collections, with counts and Favorites", async () => {
    const body = await (await list.GET(req("/api/clip-collections"))).json();
    expect(body.collections.map((c: { id: string }) => c.id)).toEqual(["mine"]);
    expect(body.collections[0].clipCount).toBe(0);
    expect(body.favorites).toEqual({ clipCount: 4 });
  });

  it("creates a collection with a trimmed name", async () => {
    const res = await list.POST(req("/api/clip-collections", "POST", { name: "  Best of  " }));
    expect(res.status).toBe(201);
    expect((await res.json()).collection.name).toBe("Best of");
  });

  it("rejects a blank name", async () => {
    expect((await list.POST(req("/api/clip-collections", "POST", { name: "  " }))).status).toBe(400);
  });

  it("caps how many collections one person can have", async () => {
    collections = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, userId: "u1", name: "x", createdAt: new Date(), updatedAt: new Date() }));
    expect((await list.POST(req("/api/clip-collections", "POST", { name: "one more" }))).status).toBe(409);
  });
});

describe("PATCH/DELETE /api/clip-collections/[id]", () => {
  it("renames the caller's collection", async () => {
    const res = await one.PATCH(req("/api/clip-collections/mine", "PATCH", { name: "Renamed" }), ctx("mine"));
    expect(res.status).toBe(200);
    expect(collections.find((c) => c.id === "mine")!.name).toBe("Renamed");
  });

  it("404s someone else's collection and changes nothing", async () => {
    expect((await one.PATCH(req("/api/clip-collections/theirs", "PATCH", { name: "Mine now" }), ctx("theirs"))).status).toBe(404);
    expect(collections.find((c) => c.id === "theirs")!.name).toBe("Not yours");
    expect((await one.DELETE(req("/api/clip-collections/theirs", "DELETE"), ctx("theirs"))).status).toBe(404);
    expect(collections.some((c) => c.id === "theirs")).toBe(true);
  });

  it("deletes the caller's collection", async () => {
    expect((await one.DELETE(req("/api/clip-collections/mine", "DELETE"), ctx("mine"))).status).toBe(200);
    expect(collections.some((c) => c.id === "mine")).toBe(false);
  });
});

describe("/api/clip-collections/[id]/clips", () => {
  it("adds the caller's clips, ignoring duplicates", async () => {
    let res = await clips.POST(req("/x", "POST", { clipIds: ["c1", "c2"] }), ctx("mine"));
    expect(await res.json()).toEqual({ added: 2 });
    res = await clips.POST(req("/x", "POST", { clipIds: ["c1"] }), ctx("mine"));
    expect(await res.json()).toEqual({ added: 0 });
  });

  it("never adds another user's clip", async () => {
    const res = await clips.POST(req("/x", "POST", { clipIds: ["cX"] }), ctx("mine"));
    expect(res.status).toBe(404);
    expect(items.some((i) => i.collectionId === "mine")).toBe(false);
  });

  it("drops foreign clips from a mixed request", async () => {
    await clips.POST(req("/x", "POST", { clipIds: ["c1", "cX"] }), ctx("mine"));
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ collectionId: "mine", clipId: "c1" }] }));
  });

  it("never adds to, reads, or removes from someone else's collection", async () => {
    expect((await clips.POST(req("/x", "POST", { clipIds: ["c1"] }), ctx("theirs"))).status).toBe(404);
    expect((await clips.GET(req("/x"), ctx("theirs"))).status).toBe(404);
    expect((await clips.DELETE(req("/x", "DELETE", { clipIds: ["cX"] }), ctx("theirs"))).status).toBe(404);
    expect(items).toHaveLength(1);
  });

  it("lists a collection's clips in the clips-view shape", async () => {
    await clips.POST(req("/x", "POST", { clipIds: ["c1"] }), ctx("mine"));
    const body = await (await clips.GET(req("/x"), ctx("mine"))).json();
    expect(body.collection).toMatchObject({ id: "mine", name: "Podcast hooks", builtIn: false });
    expect(body.clips[0]).toMatchObject({ id: "c1", projectTitle: "Project one", dubbed: false, edited: false });
    expect(body.clips[0]).not.toHaveProperty("dubs");
    expect(body.clips[0]).not.toHaveProperty("transcriptJson");
  });

  it("lists Favorites as a built-in collection, and won't edit it by hand", async () => {
    const body = await (await clips.GET(req("/x"), ctx("favorites"))).json();
    expect(body.collection).toMatchObject({ id: "favorites", builtIn: true });
    expect(body.clips).toHaveLength(1);
    expect((await clips.POST(req("/x", "POST", { clipIds: ["c1"] }), ctx("favorites"))).status).toBe(400);
  });

  it("removes clips", async () => {
    await clips.POST(req("/x", "POST", { clipIds: ["c1", "c2"] }), ctx("mine"));
    const res = await clips.DELETE(req("/x", "DELETE", { clipIds: ["c1"] }), ctx("mine"));
    expect(await res.json()).toEqual({ removed: 1 });
  });

  it("validates the body", async () => {
    expect((await clips.POST(req("/x", "POST", { clipIds: [] }), ctx("mine"))).status).toBe(400);
    expect((await clips.POST(req("/x", "POST", { clipIds: ["c1"], extra: 1 }), ctx("mine"))).status).toBe(400);
  });
});
