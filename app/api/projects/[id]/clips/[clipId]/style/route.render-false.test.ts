// @vitest-environment node
//
// "Apply to all" promised to copy the style only, but every sibling went
// through requestRerender — a paid re-render after each clip's free one, with
// the 402s swallowed by Promise.allSettled. render:false is the style-only
// path it always described.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requestRerender, clipUpdate, clipFind } = vi.hoisted(() => ({
  requestRerender: vi.fn(async (_a: unknown) => ({ ok: true, creditsCharged: 1, creditsRemaining: 4 })),
  clipUpdate: vi.fn(async (_a: unknown) => ({})),
  clipFind: vi.fn(async (_a: unknown) => ({ id: "c2", subtitleStyleOverride: { fontSize: 70, animated: true } }) as unknown),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/prisma", () => ({ prisma: { clip: { findFirst: (a: unknown) => clipFind(a), update: (a: unknown) => clipUpdate(a) } } }));
vi.mock("@/lib/autoclip-rerender", async (orig) => ({
  ...(await orig<typeof import("@/lib/autoclip-rerender")>()),
  requestRerender: (a: unknown) => requestRerender(a),
}));

const { PUT } = await import("./route");
const put = (body: unknown) =>
  PUT(
    new NextRequest("http://localhost/api/projects/p1/clips/c2/style", { method: "PUT", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1", clipId: "c2" }) },
  );

beforeEach(() => vi.clearAllMocks());

describe("PUT .../style with render:false", () => {
  it("saves the style without re-rendering or charging", async () => {
    const res = await put({ subtitleStyleOverride: { fontSize: 90 }, render: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "saved", creditsCharged: 0 });
    expect(requestRerender).not.toHaveBeenCalled();
    // Merged, like a real re-render merges it — the other fields survive.
    expect(clipUpdate).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { subtitleStyleOverride: { fontSize: 90, animated: true } },
    });
  });

  it("only touches a clip the caller owns in this project", async () => {
    clipFind.mockResolvedValueOnce(null);
    const res = await put({ subtitleStyleOverride: { fontSize: 90 }, render: false });
    expect(res.status).toBe(404);
    expect(clipUpdate).not.toHaveBeenCalled();
    expect(clipFind.mock.calls[0][0]).toMatchObject({ where: { id: "c2", projectId: "p1", project: { userId: "u1" } } });
  });

  it("still re-renders (and bills) when render is not false", async () => {
    await put({ subtitleStyleOverride: { fontSize: 90 } });
    expect(requestRerender).toHaveBeenCalledTimes(1);
    expect((requestRerender.mock.calls[0][0] as { patch: Record<string, unknown> }).patch).not.toHaveProperty("render");
  });
});
