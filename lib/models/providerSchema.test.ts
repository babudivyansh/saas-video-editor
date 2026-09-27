import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, getImageModel, providerAspectRatio, resolveImageAspectRatio } from "./imageModels";

// Every option the image generator offers must be one the provider accepts.

// fal image models that take `image_size` presets rather than `aspect_ratio`.
const FAL_IMAGE_SIZE_PRESETS = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];

describe("image aspect ratios", () => {
  for (const m of IMAGE_MODELS) {
    it(`${m.id} offers ratios and a default it can honour`, () => {
      expect(m.aspectRatios?.length).toBeGreaterThan(0);
      expect(m.aspectRatios).toContain(m.defaultValues.aspectRatio);
      if (m.aspectRatioFormat === "fal-image-size") {
        for (const r of m.aspectRatios!) expect(FAL_IMAGE_SIZE_PRESETS).toContain(providerAspectRatio(m, r));
        expect(m.integration === "fal" && m.inputMap.aspectRatio).toBe("image_size");
      }
    });
  }

  it("maps each ratio to a distinct fal preset instead of ignoring it", () => {
    const qwen = getImageModel("qwen-image-2.0");
    expect(providerAspectRatio(qwen, "9:16")).toBe("portrait_16_9");
    expect(providerAspectRatio(qwen, "16:9")).toBe("landscape_16_9");
    expect(new Set(qwen.aspectRatios!.map(r => providerAspectRatio(qwen, r))).size).toBe(qwen.aspectRatios!.length);
  });

  it("drops a ratio the model can't do (the old \"Original\") back to its default", () => {
    expect(resolveImageAspectRatio(getImageModel("flux-2"), "Original")).toBe("1:1");
    expect(resolveImageAspectRatio(getImageModel("flux-2"), "21:9")).toBe("1:1");
    expect(resolveImageAspectRatio(getImageModel("nano-banana-2"), "21:9")).toBe("21:9");
  });
});
