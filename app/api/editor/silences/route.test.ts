import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
let assetRow: { s3Key: string; kind: string } | null = { s3Key: "uploads/u1/a.mp4", kind: "video" };
const findFirst = vi.fn(async () => assetRow);
const detectSilences = vi.fn(async () => [{ start: 2, end: 3 }]);

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findFirst: (...a: unknown[]) => findFirst(...(a as [])) } } }));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl: vi.fn(async (k: string) => `https://signed.example/${k}`) }));
vi.mock("@/utils/ffmpeg-render", () => ({ detectSilences: (...a: unknown[]) => detectSilences(...(a as [])) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import("./route");
const call = (body: unknown) => POST(new NextRequest("http://localhost/api/editor/silences", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/editor/silences", () => {
  beforeEach(() => {
    authUser = { userId: "u1" };
    assetRow = { s3Key: "uploads/u1/a.mp4", kind: "video" };
    findFirst.mockClear();
    detectSilences.mockClear();
  });

  it("requires sign-in", async () => {
    authUser = null;
    expect((await call({ assetId: "a", srcIn: 0, duration: 5 })).status).toBe(401);
  });

  it("only scans the caller's own asset", async () => {
    await call({ assetId: "a", srcIn: 0, duration: 5 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "a", userId: "u1" }) }));
  });

  it("404s an asset that isn't theirs", async () => {
    assetRow = null;
    expect((await call({ assetId: "other", srcIn: 0, duration: 5 })).status).toBe(404);
    expect(detectSilences).not.toHaveBeenCalled();
  });

  it("rejects silly inputs before running ffmpeg", async () => {
    expect((await call({ assetId: "a", srcIn: -1, duration: 5 })).status).toBe(400);
    expect((await call({ assetId: "a", srcIn: 0, duration: 99_999 })).status).toBe(400);
    expect((await call({ assetId: "a", srcIn: 0, duration: 5, noiseDb: 5 })).status).toBe(400);
    expect(detectSilences).not.toHaveBeenCalled();
  });

  it("scans the requested span and returns silences", async () => {
    const res = await call({ assetId: "a", srcIn: 4, duration: 10, minSilenceSec: 0.8 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ silences: [{ start: 2, end: 3 }] });
    expect(detectSilences).toHaveBeenCalledWith("https://signed.example/uploads/u1/a.mp4", { startSec: 4, durationSec: 10, noiseDb: -35, minSilenceSec: 0.8 });
  });

  it("refuses images", async () => {
    assetRow = { s3Key: "uploads/u1/p.png", kind: "image" };
    expect((await call({ assetId: "a", srcIn: 0, duration: 5 })).status).toBe(400);
  });
});
