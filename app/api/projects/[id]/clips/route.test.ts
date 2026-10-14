import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

const clipFindMany = vi.fn(async (a: { select: { transcriptJson: boolean } }) => [
  {
    id: "c1", projectId: "p1", index: 0, title: "Hook", startSec: 0, endSec: 40, durationSec: 40, aspectRatio: "9:16",
    score: 91, scoreBreakdown: { hook: 91 }, mood: null, status: "ready", progress: 100, videoUrl: null, thumbnailUrl: null,
    hasCaptions: true, captionStyleIndex: 0, brollQuery: null, subtitleStyleOverride: null, silenceSettings: null,
    rerenderCount: 2, liteEdits: null, audioPeaks: null, failureReason: null, isFavorite: true, isDisliked: false,
    dubs: [{ id: "d1" }], project: { title: "Danny" },
    ...(a.select.transcriptJson ? { transcriptJson: [{ word: "and", start: 0, end: 1 }, { word: "then", start: 1, end: 2 }] } : {}),
  },
]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async (a: { where: { id: string; userId: string } }) =>
        a.where.id === "p1" && a.where.userId === "u1"
          ? {
              id: "p1", status: "completed", warnings: null, failureReason: null, autoClipCaptionStyle: 0,
              uploadedVideoUrl: null, updatedAt: new Date(0), title: "Danny", instructions: "Funniest bits", progress: 100,
            }
          : null,
      ),
    },
    clip: { findMany: (a: never) => clipFindMany(a), findFirst: vi.fn(async () => null) },
  },
}));

const { GET } = await import("./route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (qs = "") => GET(new NextRequest(`http://localhost/api/projects/p1/clips${qs}`), ctx("p1"));

describe("GET /api/projects/[id]/clips", () => {
  it("returns the heading data and each clip's view flags", async () => {
    const body = await (await get()).json();
    expect(body.project).toMatchObject({ title: "Danny", instructions: "Funniest bits", progress: 100 });
    expect(body.clips[0]).toMatchObject({ isFavorite: true, isDisliked: false, dubbed: true, edited: true, projectTitle: "Danny" });
    expect(body.clips[0]).not.toHaveProperty("dubs");
  });

  it("only reads transcripts when the list view asks for excerpts", async () => {
    let body = await (await get()).json();
    expect(clipFindMany.mock.calls.at(-1)![0].select.transcriptJson).toBe(false);
    expect(body.clips[0]).not.toHaveProperty("transcriptExcerpt");

    body = await (await get("?excerpts=1")).json();
    expect(clipFindMany.mock.calls.at(-1)![0].select.transcriptJson).toBe(true);
    expect(body.clips[0].transcriptExcerpt).toBe("and then");
    expect(body.clips[0]).not.toHaveProperty("transcriptJson");
  });

  it("404s someone else's project", async () => {
    expect((await GET(new NextRequest("http://localhost/api/projects/p2/clips"), ctx("p2"))).status).toBe(404);
  });
});
