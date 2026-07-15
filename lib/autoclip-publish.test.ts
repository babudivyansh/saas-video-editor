import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

let posts: Array<{ providerPostId: string; permalink: string | null }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialPost: {
      findMany: vi.fn(async () => posts),
    },
  },
}));

const { normalizePermalink, providerPostIdFromPermalink, resolveProviderPostId } = await import("./autoclip-publish");

beforeEach(() => {
  posts = [];
});

describe("providerPostIdFromPermalink (YouTube)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts the video id from %s", (url, id) => {
    expect(providerPostIdFromPermalink("youtube", url)).toBe(id);
  });

  it("returns null for non-YouTube providers", () => {
    expect(providerPostIdFromPermalink("instagram", "https://www.instagram.com/p/Cxyz123/")).toBeNull();
  });
});

describe("normalizePermalink", () => {
  it("strips www, query, hash and trailing slashes", () => {
    expect(normalizePermalink("https://www.instagram.com/p/Cxyz123/?igsh=abc#x")).toBe("instagram.com/p/Cxyz123");
    expect(normalizePermalink("https://INSTAGRAM.com/p/Cxyz123")).toBe("instagram.com/p/Cxyz123");
  });

  it("returns null for garbage input", () => {
    expect(normalizePermalink("not a url")).toBeNull();
  });
});

describe("resolveProviderPostId", () => {
  const igAccount = { id: "acc-1", provider: "instagram" };

  it("matches a pasted IG link against synced posts despite share-sheet noise", async () => {
    posts = [
      { providerPostId: "1789000111", permalink: "https://www.instagram.com/p/Cxyz123/" },
      { providerPostId: "1789000222", permalink: "https://www.instagram.com/reel/Cabc456/" },
    ];
    expect(await resolveProviderPostId(igAccount, "https://instagram.com/p/Cxyz123?igsh=share-id")).toBe("1789000111");
    expect(await resolveProviderPostId(igAccount, "https://www.instagram.com/reel/Cabc456/")).toBe("1789000222");
  });

  it("returns null when the post has not been synced yet", async () => {
    posts = [];
    expect(await resolveProviderPostId(igAccount, "https://www.instagram.com/p/Unsynced1/")).toBeNull();
  });

  it("resolves YouTube directly without touching the database", async () => {
    const id = await resolveProviderPostId({ id: "acc-2", provider: "youtube" }, "https://youtu.be/dQw4w9WgXcQ");
    expect(id).toBe("dQw4w9WgXcQ");
  });
});
