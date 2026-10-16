import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
let assetRows: { id: string; s3Key: string; kind: string }[] = [];
const findMany = vi.fn(async () => assetRows);
const measureColorStats = vi.fn(async (url: string) =>
  url.includes("ref") ? [{ y: 128, spread: 120, sat: 20, u: 128, v: 128 }] : [{ y: 128, spread: 80, sat: 10, u: 128, v: 128 }],
);

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findMany: (...a: unknown[]) => findMany(...(a as [])) } } }));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl: vi.fn(async (k: string) => `https://signed.example/${k}`) }));
vi.mock("@/utils/ffmpeg-render", () => ({ measureColorStats: (...a: unknown[]) => measureColorStats(...(a as [string])) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import("./route");
const call = (body: unknown) => POST(new NextRequest("http://localhost/api/editor/color-match", { method: "POST", body: JSON.stringify(body) }));
const target = { assetId: "t", srcIn: 0, duration: 30, filter: "vivid" };
const reference = { assetId: "r", srcIn: 2, duration: 4, adjust: { brightness: 0.1, contrast: 1, saturation: 1, warmth: 0 } };

describe("POST /api/editor/color-match", () => {
  beforeEach(() => {
    authUser = { userId: "u1" };
    assetRows = [
      { id: "t", s3Key: "uploads/u1/take.mp4", kind: "video" },
      { id: "r", s3Key: "uploads/u1/ref.mp4", kind: "video" },
    ];
    findMany.mockClear();
    measureColorStats.mockClear();
  });

  it("returns the fine-tune that matches the reference", async () => {
    const res = await call({ target, reference });
    expect(res.status).toBe(200);
    const { adjust } = await res.json();
    expect(adjust).toEqual({ brightness: 0, contrast: 1.5, saturation: 2, warmth: 0 });
  });

  it("measures the middle 10 s, after the target's filter and the reference's filter + fine-tune", async () => {
    await call({ target, reference });
    const calls = measureColorStats.mock.calls as unknown as [string, { startSec: number; durationSec: number; look: string[] }][];
    const t = calls.find(([u]) => u.includes("take"))![1];
    const r = calls.find(([u]) => u.includes("ref"))![1];
    expect(t).toMatchObject({ startSec: 10, durationSec: 10, look: ["eq=saturation=1.5:contrast=1.1"] });
    expect(r).toMatchObject({ startSec: 2, durationSec: 4, look: ["eq=brightness=0.1:contrast=1:saturation=1"] });
  });

  it("only uses the caller's own video", async () => {
    await call({ target, reference });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }));
    assetRows = assetRows.slice(0, 1);
    expect((await call({ target, reference })).status).toBe(404);
    assetRows = [{ id: "t", s3Key: "a", kind: "video" }, { id: "r", s3Key: "b", kind: "image" }];
    expect((await call({ target, reference })).status).toBe(400);
  });

  it("validates input and requires sign-in", async () => {
    expect((await call({ target: { ...target, filter: "nope" }, reference })).status).toBe(400);
    expect((await call({ target, reference: { ...reference, adjust: { brightness: 2, contrast: 1, saturation: 1, warmth: 0 } } })).status).toBe(400);
    expect((await call({ target: { ...target, duration: -1 }, reference })).status).toBe(400);
    authUser = null;
    expect((await call({ target, reference })).status).toBe(401);
  });

  it("422s when no frames could be read", async () => {
    measureColorStats.mockResolvedValueOnce([]);
    expect((await call({ target, reference })).status).toBe(422);
  });
});
