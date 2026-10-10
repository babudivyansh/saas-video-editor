// @vitest-environment node
//
// The app's Brand Kit on the web's BrandKit rows: the latest kit, colours
// converted to and from the web's ASS strings, a logo only from the person's
// own images, and the first save making the kit.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  asset: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { brandKit: { findFirst: h.findFirst, update: h.update, create: h.create }, asset: { findFirst: h.asset } },
}));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => u && `${u}?signed`) }));
vi.mock("@/utils/s3-upload", () => ({ s3KeyToPublicUrl: (k: string) => `https://b.s3.ap-south-1.amazonaws.com/${k}` }));

const { hexToASS } = await import("@/lib/ass-color");
const { BrandKitError, getBrandKit, saveBrandKit } = await import("./brand-kit");

const row = (over: Record<string, unknown> = {}) => ({
  id: "bk1", userId: "u1", name: "Creator Lab", fontName: "Montserrat", fontSize: 56,
  baseColor: hexToASS("#ffffff"), highlightColor: hexToASS("#20d68a"), outlineColor: null, shadowColor: "#123456",
  outlineWidth: null, shadowDepth: null, borderStyle: null, alignment: null, animated: null,
  logoUrl: "https://b.s3.ap-south-1.amazonaws.com/u1/logo.png", captionTemplateId: "hormozi", providerPresetId: null,
  createdAt: new Date(), updatedAt: new Date(), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
  h.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row({ ...data, id: "bk_new" }));
});

describe("brand kit", () => {
  it("reads the person's latest kit, colours as #rrggbb and the logo signed", async () => {
    h.findFirst.mockResolvedValue(row());
    const kit = await getBrandKit("u1");
    expect(h.findFirst).toHaveBeenCalledWith({ where: { userId: "u1" }, orderBy: { updatedAt: "desc" } });
    expect(kit).toMatchObject({ baseColor: "#ffffff", highlightColor: "#20d68a", outlineColor: "#000000", shadowColor: "#123456", logoUrl: expect.stringMatching(/\?signed$/) });
  });

  it("is null before one is made", async () => {
    h.findFirst.mockResolvedValue(null);
    expect(await getBrandKit("u1")).toBeNull();
  });

  it("saves colours the web's way", async () => {
    h.findFirst.mockResolvedValue(row());
    await saveBrandKit("u1", { highlightColor: "#c8ff55", fontSize: 72 });
    expect(h.update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { highlightColor: hexToASS("#c8ff55"), fontSize: 72 } });
  });

  it("makes the kit on the first save, with defaults for the rest", async () => {
    h.findFirst.mockResolvedValue(null);
    await saveBrandKit("u1", { name: "Mine" });
    expect(h.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u1", name: "Mine", fontName: "Poppins", baseColor: hexToASS("#ffffff"), logoUrl: null }) });
  });

  it("takes a logo only from the person's own ready images", async () => {
    h.findFirst.mockResolvedValue(row());
    h.asset.mockResolvedValueOnce({ kind: "image", status: "ready", s3Key: "u1/new.png" });
    await saveBrandKit("u1", { logoAssetId: "a1" });
    expect(h.asset).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", userId: "u1" } }));
    expect(h.update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { logoUrl: "https://b.s3.ap-south-1.amazonaws.com/u1/new.png" } });

    h.asset.mockResolvedValueOnce(null);
    await expect(saveBrandKit("u1", { logoAssetId: "someone-elses" })).rejects.toBeInstanceOf(BrandKitError);
    h.asset.mockResolvedValueOnce({ kind: "video", status: "ready", s3Key: "u1/v.mp4" });
    await expect(saveBrandKit("u1", { logoAssetId: "a2" })).rejects.toMatchObject({ status: 400, code: "wrong_kind" });
  });

  it("removes the logo", async () => {
    h.findFirst.mockResolvedValue(row());
    await saveBrandKit("u1", { logoAssetId: null });
    expect(h.update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { logoUrl: null } });
  });
});
