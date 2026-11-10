import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/env", () => ({ env: {} }));
import { screenPrompt } from "./policy";
import { heuristicRoute } from "./router";
import { quote, clampVariations } from "./pricing";
import { expandedSize, buildExpandCanvas, prepareImage, prepareMask } from "./image-prep";
import { falImageUrls } from "./providers";
import { EDIT_MODELS } from "@/lib/models/editModels";

const ALL_AUTO = ["edit-gemini-flash", "edit-qwen-2", "edit-flux-kontext", "edit-seedream-5"];
const FREE_AUTO = ["edit-gemini-flash", "edit-qwen-2"];

describe("screenPrompt", () => {
  it.each(["make her naked", "remove his shirt", "put her in lingerie", "make a fake ID card from this", "edit my passport photo page"])("blocks %s", (p) => {
    expect(screenPrompt(p).allowed).toBe(false);
  });
  it.each(["remove the shirt logo", "change the background to a beach", "make the text say SALE", "remove the car behind me"])("allows %s", (p) => {
    expect(screenPrompt(p).allowed).toBe(true);
  });
});

describe("heuristicRoute", () => {
  it("sends text changes to Qwen", () => {
    expect(heuristicRoute({ prompt: 'change the title to "Top 5 Hacks"', referenceCount: 0, allowedModelIds: ALL_AUTO })).toBe("edit-qwen-2");
  });
  it("sends restyles to Kontext when the plan allows it, else Gemini", () => {
    expect(heuristicRoute({ prompt: "make it look like an anime frame", referenceCount: 0, allowedModelIds: ALL_AUTO })).toBe("edit-flux-kontext");
    expect(heuristicRoute({ prompt: "make it look like an anime frame", referenceCount: 0, allowedModelIds: FREE_AUTO })).toBe("edit-gemini-flash");
  });
  it("sends multi-image edits to Seedream, or Gemini on a plan without it", () => {
    expect(heuristicRoute({ prompt: "put this bottle on the table", referenceCount: 1, allowedModelIds: ALL_AUTO })).toBe("edit-seedream-5");
    expect(heuristicRoute({ prompt: "put this bottle on the table", referenceCount: 1, allowedModelIds: FREE_AUTO })).toBe("edit-gemini-flash");
  });
  it("defaults to Gemini", () => {
    expect(heuristicRoute({ prompt: "remove the person in the back", referenceCount: 0, allowedModelIds: ALL_AUTO })).toBe("edit-gemini-flash");
  });
});

describe("quote", () => {
  it("prices Auto at the base model and multiplies by variations", () => {
    expect(quote({ action: "edit", model: "auto", variations: 3 })).toMatchObject({ creditsPerImage: 2, images: 3, credits: 6 });
  });
  it("prices the 4K mode only on the model that has it", () => {
    expect(quote({ action: "edit", model: "edit-nano-banana-pro", hiRes: true })?.credits).toBe(20);
    expect(quote({ action: "edit", model: "edit-qwen-2", hiRes: true })?.credits).toBe(2);
  });
  it("ignores variations for upscale and background removal", () => {
    expect(quote({ action: "upscale", upscaleFactor: 4, variations: 4 })?.credits).toBe(3);
    expect(quote({ action: "remove-bg", variations: 4 })?.credits).toBe(1);
  });
  it("returns null for an unknown model", () => {
    expect(quote({ action: "edit", model: "nope" })).toBeNull();
  });
  it("clamps variations to 1..4", () => {
    expect([clampVariations(0), clampVariations(9), clampVariations("x"), clampVariations(2.4)]).toEqual([1, 4, 1, 2]);
  });
  it("keeps Auto to base-price models", () => {
    for (const m of EDIT_MODELS.filter((x) => x.autoEligible)) expect(m.creditCost).toBe(2);
  });
});

describe("image prep", () => {
  it("grows to a ratio without cropping", () => {
    expect(expandedSize(1600, 900, "9:16")).toEqual({ width: 1600, height: 2844 });
    expect(expandedSize(900, 1600, "16:9")).toEqual({ width: 2844, height: 1600 });
    expect(expandedSize(1000, 1000, "1:1")).toEqual({ width: 1000, height: 1000 });
  });

  it("builds an expand canvas within the size cap, masked only on the new border", async () => {
    const img = await prepareImage(await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#123456" } }).jpeg().toBuffer());
    const { canvas, mask, width, height } = await buildExpandCanvas(img, "9:16");
    expect(Math.max(width, height)).toBeLessThanOrEqual(2048);
    expect((await sharp(canvas).metadata()).height).toBe(height);
    const { data, info } = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[y * info.width + x];
    expect(at(Math.round(width / 2), 2)).toBe(255); // new top border: fill
    expect(at(Math.round(width / 2), Math.round(height / 2))).toBe(0); // photo centre: keep
    expect(at(0, Math.round(height / 2))).toBe(0); // left edge didn't grow: keep
  });

  it("refuses to expand to the shape the photo already has", async () => {
    const img = await prepareImage(await sharp({ create: { width: 500, height: 500, channels: 3, background: "#000" } }).png().toBuffer());
    await expect(buildExpandCanvas(img, "1:1")).rejects.toThrow(/already 1:1/);
  });

  it("downscales big photos and keeps PNG only when there is transparency", async () => {
    const big = await prepareImage(await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#fff" } }).jpeg().toBuffer());
    expect([big.width, big.height, big.mimeType]).toEqual([2048, 1536, "image/jpeg"]);
    const alpha = await prepareImage(await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
    expect(alpha.mimeType).toBe("image/png");
  });

  it("rejects bytes that aren't an image", async () => {
    await expect(prepareImage(Buffer.from("not an image"))).rejects.toThrow(/couldn't read/);
  });

  it("turns a painted mask into a hard black/white PNG at the photo's size", async () => {
    const painted = await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 4, background: "#ffffffff" } }).png().toBuffer(), left: 40, top: 15 }])
      .png().toBuffer();
    const mask = await prepareMask(`data:image/png;base64,${painted.toString("base64")}`, 200, 100);
    const meta = await sharp(mask).metadata();
    expect([meta.width, meta.height]).toEqual([200, 100]);
  });

  it("rejects an empty mask", async () => {
    const empty = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(prepareMask(`data:image/png;base64,${empty.toString("base64")}`, 10, 10)).rejects.toThrow(/Paint over/);
  });
});

describe("falImageUrls", () => {
  it("reads every image of a batch, or the single image shape", () => {
    expect(falImageUrls({ images: [{ url: "a" }, { url: "b" }] }, ["images.0.url"])).toEqual(["a", "b"]);
    expect(falImageUrls({ image: { url: "c" } }, ["image.url"])).toEqual(["c"]);
    expect(() => falImageUrls({}, ["images.0.url"])).toThrow();
  });
});
