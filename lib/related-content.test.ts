// Related Content traverses provenance across three tables, which makes it a
// natural place to leak another tenant's graph: every edge is a foreign key
// that a caller could try to follow sideways. These tests pin the rule that
// keeps that from happening — ownership is enforced *in the query*, never by
// filtering results afterwards — plus the presigned-URL handling, since clip
// thumbnails are stored as permanent unsigned S3 URLs.

import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "owner-1";

// Records every `where` clause Prisma is asked for, so a test can assert that
// a query was anchored rather than trusting the returned rows.
const seen: Record<string, unknown[]> = {};
function record(model: string, args: { where?: unknown }) {
  (seen[model] ??= []).push(args?.where);
}

let assetRow: Record<string, unknown> | null = null;
let clipRow: Record<string, unknown> | null = null;

const projectFindMany = vi.fn(async (args: { where?: unknown }) => {
  record("project.findMany", args);
  return [];
});
const clipFindMany = vi.fn(async (args: { where?: unknown }) => {
  record("clip.findMany", args);
  return [];
});
const assetFindMany = vi.fn(async (args: { where?: unknown }) => {
  record("asset.findMany", args);
  return [];
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findFirst: vi.fn(async (args: { where?: unknown }) => {
        record("asset.findFirst", args);
        return assetRow;
      }),
      findMany: assetFindMany,
    },
    clip: {
      findFirst: vi.fn(async (args: { where?: unknown }) => {
        record("clip.findFirst", args);
        return clipRow;
      }),
      findMany: clipFindMany,
    },
    project: { findMany: projectFindMany },
    clipDub: {
      findMany: vi.fn(async (args: { where?: unknown }) => {
        record("clipDub.findMany", args);
        return [];
      }),
    },
    clipPublish: {
      findMany: vi.fn(async (args: { where?: unknown }) => {
        record("clipPublish.findMany", args);
        return [];
      }),
    },
  },
}));

const getAssetReadUrl = vi.fn(async (key: string) => `https://signed.example/${key}?sig=abc`);
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl }));

const { getAssetRelated, getClipRelated } = await import("./related-content");

/** Deep search for a userId anchor anywhere in a nested `where` clause. */
function anchorsUser(where: unknown, userId: string): boolean {
  if (where === null || typeof where !== "object") return false;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "userId" && value === userId) return true;
    if (anchorsUser(value, userId)) return true;
  }
  return false;
}

beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
  assetRow = null;
  clipRow = null;
  vi.clearAllMocks();
});

describe("getAssetRelated", () => {
  it("returns an empty graph for an asset the caller does not own", async () => {
    assetRow = null; // findFirst is scoped by userId, so a foreign id finds nothing

    const related = await getAssetRelated("someone-elses-asset", OWNER);

    expect(related).toEqual({ usedIn: [], producedClips: [], derivedFrom: null, siblings: [] });
    // Critically, it must not go on to traverse anything.
    expect(projectFindMany).not.toHaveBeenCalled();
    expect(clipFindMany).not.toHaveBeenCalled();
  });

  it("scopes the initial lookup to the caller", async () => {
    await getAssetRelated("a1", OWNER);
    expect(seen["asset.findFirst"][0]).toMatchObject({ id: "a1", userId: OWNER });
  });

  it("anchors every traversal to the caller, not just the first lookup", async () => {
    assetRow = { id: "a1", sourceProjectId: "p1", sourceClipId: "c1" };

    await getAssetRelated("a1", OWNER);

    // usedIn, siblings — direct userId. producedClips, derivedFrom — through
    // the project relation. All four must carry the anchor.
    const queries = [
      ...(seen["project.findMany"] ?? []),
      ...(seen["clip.findMany"] ?? []),
      ...(seen["asset.findMany"] ?? []),
      ...(seen["clip.findFirst"] ?? []),
    ];
    expect(queries.length).toBeGreaterThan(0);
    for (const where of queries) {
      expect(anchorsUser(where, OWNER)).toBe(true);
    }
  });

  it("does not look for siblings when the asset has no source project", async () => {
    assetRow = { id: "a1", sourceProjectId: null, sourceClipId: null };
    await getAssetRelated("a1", OWNER);
    expect(assetFindMany).not.toHaveBeenCalled();
  });
});

describe("getClipRelated", () => {
  it("returns an empty graph for a clip outside the caller's project", async () => {
    clipRow = null;

    const related = await getClipRelated("victim-clip", "my-project", OWNER);

    expect(related.source).toBeNull();
    expect(related.siblingClips).toEqual([]);
    expect(related.derived).toEqual({ dubs: [], publishes: [], editorProjects: [] });
    // No dub or publish read may happen for a clip that failed the check —
    // this is the exact shape of the IDOR fixed on the sibling routes.
    expect(seen["clipDub.findMany"]).toBeUndefined();
    expect(seen["clipPublish.findMany"]).toBeUndefined();
  });

  it("scopes the clip lookup by project AND owner", async () => {
    await getClipRelated("c1", "p1", OWNER);
    expect(seen["clip.findFirst"][0]).toMatchObject({
      id: "c1",
      projectId: "p1",
      project: { userId: OWNER },
    });
  });

  it("re-signs a stored clip thumbnail instead of returning the permanent URL", async () => {
    clipRow = {
      id: "c1",
      startSec: 5,
      endSec: 20,
      sourceAssetId: null,
      project: {
        id: "p1", title: "Run", productType: "auto-clip", status: "completed",
        createdAt: new Date("2026-01-01"), _count: { clips: 2 }, sourceAsset: null,
      },
    };
    clipFindMany.mockResolvedValueOnce([
      {
        id: "c2", projectId: "p1", index: 1, title: "Sibling", score: 70, status: "ready",
        durationSec: 10, startSec: 0, endSec: 10,
        thumbnailUrl: "https://bucket.s3.ap-south-1.amazonaws.com/renders/p1/clip-1.jpg",
      },
    ] as never);

    const related = await getClipRelated("c1", "p1", OWNER);

    expect(getAssetReadUrl).toHaveBeenCalledWith("renders/p1/clip-1.jpg");
    expect(related.siblingClips[0].thumbnailUrl).toContain("sig=abc");
    expect(related.siblingClips[0].thumbnailUrl).not.toBe(
      "https://bucket.s3.ap-south-1.amazonaws.com/renders/p1/clip-1.jpg",
    );
  });

  it("passes through a thumbnail URL it cannot parse rather than dropping it", async () => {
    clipRow = {
      id: "c1", startSec: 0, endSec: 10, sourceAssetId: null,
      project: {
        id: "p1", title: "Run", productType: "auto-clip", status: "completed",
        createdAt: new Date("2026-01-01"), _count: { clips: 1 }, sourceAsset: null,
      },
    };
    clipFindMany.mockResolvedValueOnce([
      {
        id: "c2", projectId: "p1", index: 1, title: "CDN", score: 50, status: "ready",
        durationSec: 10, startSec: 0, endSec: 10,
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
      },
    ] as never);

    const related = await getClipRelated("c1", "p1", OWNER);

    expect(related.siblingClips[0].thumbnailUrl).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("reports the clip's window inside its source for the mini timeline", async () => {
    clipRow = {
      id: "c1", startSec: 30.5, endSec: 47.25, sourceAssetId: "a1",
      project: {
        id: "p1", title: "Run", productType: "auto-clip", status: "completed",
        createdAt: new Date("2026-01-01"), _count: { clips: 3 },
        sourceAsset: {
          id: "a1", name: "source.mp4", kind: "video", size: 100, duration: 600,
          thumbnailS3Key: null, createdAt: new Date("2026-01-01"),
        },
      },
    };

    const related = await getClipRelated("c1", "p1", OWNER);

    expect(related.source?.window).toEqual({ startSec: 30.5, endSec: 47.25, sourceDurationSec: 600 });
    expect(related.source?.asset?.name).toBe("source.mp4");
  });
});
