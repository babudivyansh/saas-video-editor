// SECURITY REGRESSION — cross-tenant read via an unscoped clipId.
//
// The GET handler verified that the *project* belonged to the caller, then
// queried publish records with `findMany({ where: { clipId } })` — the clipId
// was never checked against that project. So any user who owned a single
// project could pass their own project id together with ANOTHER tenant's clip
// id and read that tenant's permalinks, provider post ids, engagement metrics
// and connected-account usernames. The sibling POST handler always scoped the
// clip correctly; only the read path was open. This suite pins the guard.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "attacker" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

// The attacker owns project-a. victim-clip lives under project-b, which they
// do not own. A correct handler must never join across that boundary.
const CLIPS = [
  { id: "attacker-clip", projectId: "project-a" },
  { id: "victim-clip", projectId: "project-b" },
];

const SECRET_PUBLISH = {
  id: "pub-1",
  clipId: "victim-clip",
  permalink: "https://youtube.com/shorts/VICTIM_SECRET",
  providerPostId: "VICTIM_POST_ID",
  metricsJson: { views: 91234 },
  socialAccount: { provider: "youtube", username: "victim_handle", displayName: "Victim" },
};

const clipPublishFindMany = vi.fn(async () => [SECRET_PUBLISH]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      // Only project-a belongs to the attacker.
      findFirst: vi.fn(async (args: { where: { id: string; userId: string } }) =>
        args.where.id === "project-a" && args.where.userId === "attacker"
          ? { id: "project-a", userId: "attacker" }
          : null,
      ),
    },
    clip: {
      // Mirrors real Prisma: every field present in `where` must match.
      findFirst: vi.fn(async (args: { where: { id: string; projectId?: string } }) => {
        const found = CLIPS.find(
          (c) =>
            c.id === args.where.id &&
            (args.where.projectId === undefined || c.projectId === args.where.projectId),
        );
        return found ?? null;
      }),
    },
    socialAccount: { findMany: vi.fn(async () => []) },
    clipPublish: { findMany: clipPublishFindMany },
  },
}));

vi.mock("@/lib/autoclip-publish", () => ({ resolveProviderPostId: vi.fn() }));
vi.mock("@/lib/social/service", () => ({ getValidAccessToken: vi.fn() }));
vi.mock("@/lib/social/google", () => ({
  uploadVideo: vi.fn(),
  NeedsReauthError: class extends Error {},
}));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET } = await import("./route");

const req = () => new NextRequest("http://localhost/api/projects/project-a/clips/victim-clip/publish");
const ctx = (id: string, clipId: string) => ({ params: Promise.resolve({ id, clipId }) });

beforeEach(() => {
  authUser = { userId: "attacker" };
  vi.clearAllMocks();
});

describe("GET .../clips/[clipId]/publish — tenant isolation", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(req(), ctx("project-a", "victim-clip"));
    expect(res.status).toBe(401);
  });

  it("404s a project the caller does not own", async () => {
    const res = await GET(req(), ctx("project-b", "victim-clip"));
    expect(res.status).toBe(404);
  });

  it("404s a clip that belongs to a different project, and never queries its publishes", async () => {
    const res = await GET(req(), ctx("project-a", "victim-clip"));

    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("VICTIM_SECRET");
    expect(body).not.toContain("victim_handle");
    // The guard must short-circuit before the publish read, not filter after it.
    expect(clipPublishFindMany).not.toHaveBeenCalled();
  });

  it("still returns publishes for a clip the caller legitimately owns", async () => {
    clipPublishFindMany.mockResolvedValueOnce([]);
    const res = await GET(req(), ctx("project-a", "attacker-clip"));
    expect(res.status).toBe(200);
    expect(clipPublishFindMany).toHaveBeenCalled();
  });
});
