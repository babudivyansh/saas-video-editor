import { describe, expect, it } from "vitest";
import {
  VIDEO_MODELS, allowedDurations, billedDurationSeconds, cheapestRunCredits, defaultDurationSeconds,
  formatDurationForProvider, getVideoModel, resolveResolution, resolveVideoAspectRatio, videoCreditsPerSecond,
} from "./videoModels";
import { IMAGE_MODELS, getImageModel, providerAspectRatio, resolveImageAspectRatio } from "./imageModels";
import { VIDEO_GENERATOR_STARTING_CREDIT_COST } from "@/lib/tool-costs";

// Every option the generators offer must be one the provider accepts. This
// snapshot is each endpoint's fal OpenAPI input schema, checked 2026-09-27
// (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<falEndpoint>).
// Before that audit one shared 2-15s / 480-1080p / 16:9-9:16-1:1 list was
// offered to every model, and Veo 3's and LTX's DEFAULT requests were invalid.
// If a provider changes its schema, re-check it and update this table first.
const FAL_VIDEO_SCHEMA: Record<string, {
  durations: readonly number[];
  durationType: "integer" | "string" | "seconds-suffix";
  resolutions?: readonly string[];
  aspectRatios?: readonly string[];
  imageUrl: "none" | "required";
}> = {
  "veo3-fast": { durations: [4, 6, 8], durationType: "seconds-suffix", aspectRatios: ["16:9", "9:16"], imageUrl: "none" },
  "seedance-2.0": { durations: range(4, 15), durationType: "string", resolutions: ["480p", "720p", "1080p", "4k"], aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], imageUrl: "none" },
  "gemini-omni": { durations: range(3, 10), durationType: "integer", aspectRatios: ["16:9", "9:16"], imageUrl: "none" },
  "grok-imagine-1.5": { durations: range(1, 15), durationType: "integer", resolutions: ["480p", "720p", "1080p"], imageUrl: "required" },
  "happyhorse-1.0": { durations: range(3, 15), durationType: "integer", resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], imageUrl: "none" },
  "wan-2.7": { durations: [5, 10], durationType: "string", resolutions: ["480p", "720p", "1080p"], aspectRatios: ["16:9", "9:16", "1:1"], imageUrl: "none" },
  "ltx-2.3": { durations: [6, 8, 10], durationType: "integer", resolutions: ["1080p", "1440p", "2160p"], aspectRatios: ["16:9", "9:16"], imageUrl: "none" },
  "pixverse-v6": { durations: [5, 8, 10], durationType: "string", resolutions: ["360p", "540p", "720p", "1080p"], imageUrl: "required" },
};

// fal image models that take `image_size` presets rather than `aspect_ratio`.
const FAL_IMAGE_SIZE_PRESETS = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe("video registry matches each fal input schema", () => {
  for (const m of VIDEO_MODELS) {
    const schema = FAL_VIDEO_SCHEMA[m.id];
    it(`${m.id} only offers options its endpoint accepts`, () => {
      expect(schema, `add ${m.id} to FAL_VIDEO_SCHEMA`).toBeDefined();
      for (const d of m.durationOptions) expect(schema.durations).toContain(d);
      expect(m.durationFormat ?? "integer").toBe(schema.durationType);
      for (const r of m.resolutions ?? []) expect(schema.resolutions).toContain(r);
      for (const a of m.aspectRatios ?? []) expect(schema.aspectRatios).toContain(a);
      // A reference image is offered only where the endpoint takes image_url.
      expect(m.imageInput === "none" ? "none" : "required").toBe(schema.imageUrl);
    });

    it(`${m.id} is internally consistent`, () => {
      const opts = [...m.durationOptions];
      expect(opts).toEqual([...new Set(opts)].sort((a, b) => a - b));
      expect(m.minDurationSeconds).toBe(opts[0]);
      expect(m.maxDurationSeconds).toBe(opts[opts.length - 1]);
      expect(opts).toContain(defaultDurationSeconds(m));
      expect(m.supportedParameters.includes("imageUpload")).toBe(m.imageInput !== "none");
      expect(m.supportedParameters.includes("aspectRatio")).toBe((m.aspectRatios?.length ?? 0) > 0);
      expect(m.supportedParameters.includes("resolution")).toBe((m.resolutions?.length ?? 0) > 0);
      if (m.resolutions) expect(m.resolutions).toContain(m.defaultValues.resolution);
      if (m.aspectRatios) expect(m.aspectRatios).toContain(m.defaultValues.aspectRatio);
      // Every offered resolution has its own price when the model is tiered.
      if (m.resolutionCredits) for (const r of m.resolutions ?? []) expect(m.resolutionCredits[r]).toBeDefined();
    });
  }
});

describe("billed duration (shared by the route and the UI)", () => {
  it("snaps down to the longest accepted length, never to one the provider rejects", () => {
    const wan = getVideoModel("wan-2.7");
    expect(billedDurationSeconds(wan, 8, 15)).toBe(5);
    expect(billedDurationSeconds(wan, 10, 15)).toBe(10);
    expect(billedDurationSeconds(wan, 10, 5)).toBe(5); // Creator cap
  });

  it("allows a model's shortest length even when the tier cap is below it", () => {
    const ltx = getVideoModel("ltx-2.3");
    expect(allowedDurations(ltx, 5)).toEqual([6]);
    expect(billedDurationSeconds(ltx, 5, 5)).toBe(6);
  });

  it("falls back to the model default for a missing or garbled length", () => {
    const veo = getVideoModel("veo3-fast");
    expect(defaultDurationSeconds(veo)).toBe(8); // stored as "8s"
    expect(billedDurationSeconds(veo, NaN, 15)).toBe(8);
    expect(billedDurationSeconds(veo, 5, 15)).toBe(4);
  });

  it("formats duration in the JSON type each endpoint expects", () => {
    expect(formatDurationForProvider(getVideoModel("veo3-fast"), 8)).toBe("8s");
    expect(formatDurationForProvider(getVideoModel("wan-2.7"), 5)).toBe("5");
    expect(formatDurationForProvider(getVideoModel("happyhorse-1.0"), 5)).toBe(5);
  });
});

describe("resolution / aspect ratio snapping", () => {
  it("replaces an option the model doesn't offer with its default", () => {
    expect(resolveResolution(getVideoModel("ltx-2.3"), "720p")).toBe("1080p");
    expect(resolveResolution(getVideoModel("happyhorse-1.0"), "480p")).toBe("720p");
    expect(resolveResolution(getVideoModel("veo3-fast"), "1080p")).toBeUndefined();
    expect(resolveVideoAspectRatio(getVideoModel("veo3-fast"), "1:1")).toBe("16:9");
    expect(resolveVideoAspectRatio(getVideoModel("pixverse-v6"), "16:9")).toBeUndefined();
  });
});

describe("admin override scaling", () => {
  it("is a no-op at the base rate and scales the tiers in proportion", () => {
    const veo = getVideoModel("veo3-fast");
    expect(videoCreditsPerSecond(veo, { audio: true, overrideCreditsPerSecond: 10 })).toBe(16);
    expect(videoCreditsPerSecond(veo, { audio: true, overrideCreditsPerSecond: 12 })).toBe(20);
    expect(videoCreditsPerSecond(veo, { audio: false, overrideCreditsPerSecond: 12 })).toBe(12);
    const seedance = getVideoModel("seedance-2.0");
    expect(videoCreditsPerSecond(seedance, { resolution: "1080p", overrideCreditsPerSecond: 24 })).toBe(54);
  });
});

describe("\"from N credits\" figures", () => {
  it("quote the cheapest run a user can actually start", () => {
    expect(cheapestRunCredits(getVideoModel("wan-2.7"))).toBe(10); // 480p x 5s
    expect(cheapestRunCredits(getVideoModel("ltx-2.3"))).toBe(24); // 6s floor
    // Grok 480p x 2s — a real run (with a reference image). The old figure was
    // also 8, but from LTX at 2s, which fal rejects.
    expect(VIDEO_GENERATOR_STARTING_CREDIT_COST).toBe(8);
    expect(VIDEO_GENERATOR_STARTING_CREDIT_COST).toBe(Math.min(...VIDEO_MODELS.map(cheapestRunCredits)));
  });
});

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
