// SECURITY REGRESSION — cross-tenant read via an unscoped clipId.
//
// Same defect as the publish route: GET verified the project belonged to the
// caller, then read `clipDub.findMany({ where: { clipId } })` without ever
// checking that the clip belonged to that project. A user owning any single
// project could read another tenant's dub rows — including videoUrl, a direct
// link to their rendered media. This suite pins the guard.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "attacker" };
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
  getUserTier: vi.fn(async () => "creator"),
}));

const CLIPS = [
  { id: "attacker-clip", projectId: "project-a" },
  { id: "victim-clip", projectId: "project-b" },
];

const SECRET_DUB = {
  id: "dub-1",
  clipId: "victim-clip",
  targetLang: "es",
  status: "ready",
  videoUrl: "https://s3.example/VICTIM_SECRET_DUB.mp4",
};

const clipDubFindMany = vi.fn(async () => [SECRET_DUB]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
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
    clipDub: { findMany: clipDubFindMany },
  },
}));

vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { ELEVENLABS_API_KEY: "test-key" } }));
vi.mock("@/lib/credits", () => ({ spendCredits: vi.fn(), logToolGeneration: vi.fn() }));
vi.mock("@/lib/plans/tiers", () => ({ tierAtLeast: vi.fn(() => true) }));
vi.mock("@/lib/tool-costs", () => ({ TOOL_COSTS: {} }));
vi.mock("@/lib/autoclip-pipeline", () => ({ getAutoClipPricing: vi.fn(async () => ({})) }));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({})) }));
vi.mock("@/lib/autoclip-dub", () => ({
  dubStartQueue: { enqueue: vi.fn() },
  computeDubCost: vi.fn(() => 1),
}));
vi.mock("@/utils/elevenlabs", () => ({ DUB_LANGUAGES: [{ code: "es", label: "Spanish" }] }));

const { GET } = await import("./route");

const req = () => new NextRequest("http://localhost/api/projects/project-a/clips/victim-clip/dub");
const ctx = (id: string, clipId: string) => ({ params: Promise.resolve({ id, clipId }) });

beforeEach(() => {
  authUser = { userId: "attacker" };
  vi.clearAllMocks();
});

describe("GET .../clips/[clipId]/dub — tenant isolation", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(req(), ctx("project-a", "victim-clip"));
    expect(res.status).toBe(401);
  });

  it("404s a project the caller does not own", async () => {
    const res = await GET(req(), ctx("project-b", "victim-clip"));
    expect(res.status).toBe(404);
  });

  it("404s a clip from another project and never reads its dub URLs", async () => {
    const res = await GET(req(), ctx("project-a", "victim-clip"));

    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("VICTIM_SECRET_DUB");
    expect(clipDubFindMany).not.toHaveBeenCalled();
  });

  it("still returns dubs for a clip the caller legitimately owns", async () => {
    clipDubFindMany.mockResolvedValueOnce([]);
    const res = await GET(req(), ctx("project-a", "attacker-clip"));
    expect(res.status).toBe(200);
    expect(clipDubFindMany).toHaveBeenCalled();
  });
});
