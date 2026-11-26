import { describe, expect, it } from "vitest";
import {
  AI_FEATURES, AUTOCLIP_AI_DEFAULTS, aiFeatureOn, deepMergeConfig, mergeAutoClipAiConfig, resolveAiFeatures, runCeilingUsd,
} from "@/lib/autoclip-ai/config-shared";
import { AiBudget } from "@/lib/autoclip-ai/budget";

describe("autoclip_ai config", () => {
  it("ships every feature off except generated B-roll (which replaced stock B-roll)", () => {
    for (const f of AI_FEATURES) {
      expect(AUTOCLIP_AI_DEFAULTS.features[f].enabled).toBe(f === "brollGenerateImage");
    }
    const all = resolveAiFeatures(mergeAutoClipAiConfig(null), "studio");
    expect(Object.entries(all).filter(([, on]) => on).map(([f]) => f)).toEqual(["brollGenerateImage"]);
  });

  it("turns a feature on only for the tiers listed", () => {
    const cfg = mergeAutoClipAiConfig({ features: { editPlan: { enabled: true, tiers: ["pro", "studio"] } } });
    expect(aiFeatureOn(cfg, "editPlan", "pro")).toBe(true);
    expect(aiFeatureOn(cfg, "editPlan", "free")).toBe(false);
    expect(aiFeatureOn(cfg, "sceneVision", "pro")).toBe(false);
  });

  it("ignores settings for features and sources that no longer exist", () => {
    const cfg = mergeAutoClipAiConfig({ features: { brollRank: { enabled: true, tiers: ["pro"] } }, broll: { providers: { pexels: true } } });
    expect("brollRank" in cfg.features).toBe(false);
    expect("providers" in cfg.broll).toBe(false);
  });

  it("drops unknown tiers and clamps numbers instead of storing junk", () => {
    const cfg = mergeAutoClipAiConfig({
      v: 2,
      features: { cameraPath: { enabled: true, tiers: ["pro", "lite", 7] } },
      broll: { maxGeneratedPerClip: -2, imageModel: "bad model id!" },
      costCeilingUsd: { free: -1, pro: 99 },
    });
    expect(cfg.features.cameraPath.tiers).toEqual(["pro"]);
    expect(cfg.broll.maxGeneratedPerClip).toBe(0);
    expect(cfg.broll.imageModel).toBe(AUTOCLIP_AI_DEFAULTS.broll.imageModel);
    expect(cfg.costCeilingUsd.free).toBe(AUTOCLIP_AI_DEFAULTS.costCeilingUsd.free);
    expect(cfg.costCeilingUsd.pro).toBe(20);
  });

  it("does not mutate the shared defaults", () => {
    const cfg = mergeAutoClipAiConfig({});
    cfg.features.editPlan.enabled = true;
    expect(AUTOCLIP_AI_DEFAULTS.features.editPlan.enabled).toBe(false);
  });

  it("deep-merges an admin patch over the current row", () => {
    const current = mergeAutoClipAiConfig({ features: { editPlan: { enabled: true, tiers: ["pro"] } } });
    const next = mergeAutoClipAiConfig(deepMergeConfig(current, { features: { editPlan: { tiers: ["pro", "studio"] } }, broll: { maxGeneratedPerClip: 2 } }));
    expect(next.features.editPlan).toEqual({ enabled: true, tiers: ["pro", "studio"] });
    expect(next.broll.maxGeneratedPerClip).toBe(2);
    expect(next.broll.imageModel).toBe(AUTOCLIP_AI_DEFAULTS.broll.imageModel);
  });
});

describe("AiBudget", () => {
  it("refuses a reservation that would pass the ceiling and records the rest per clip", () => {
    const b = new AiBudget(0.01);
    expect(b.tryReserve("a", 0.004, 0)).toBe(true);
    expect(b.tryReserve("b", 0.004, 1)).toBe(true);
    expect(b.tryReserve("c", 0.004, 1)).toBe(false);
    expect(b.forClip(1)).toEqual([{ kind: "b", usd: 0.004 }]);
    expect(b.remainingUsd).toBeCloseTo(0.002, 6);
  });

  it("a zero ceiling refuses everything", () => {
    expect(new AiBudget(0).tryReserve("x", 0.0001)).toBe(false);
  });
});

describe("config versioning", () => {
  it("ignores a pre-v2 row's B-roll settings, so generated B-roll really turns on", () => {
    const v1Row = {
      features: { brollGenerateImage: { enabled: false, tiers: ["creator"] }, editPlan: { enabled: true, tiers: ["pro"] } },
      broll: { maxGeneratedPerClip: 2 },
    };
    const cfg = mergeAutoClipAiConfig(v1Row);
    expect(cfg.v).toBe(2);
    expect(cfg.features.brollGenerateImage).toEqual(AUTOCLIP_AI_DEFAULTS.features.brollGenerateImage);
    expect(cfg.broll.maxGeneratedPerClip).toBe(3);
    // Everything else in the old row still counts.
    expect(cfg.features.editPlan).toEqual({ enabled: true, tiers: ["pro"] });
  });

  it("respects an admin's choice once the row is saved under v2", () => {
    const cfg = mergeAutoClipAiConfig({ v: 2, features: { brollGenerateImage: { enabled: false } }, broll: { maxGeneratedPerClip: 1 } });
    expect(cfg.features.brollGenerateImage.enabled).toBe(false);
    expect(cfg.broll.maxGeneratedPerClip).toBe(1);
  });

  it("shrinks the per-run spend cap on a short source, never above the flat ceiling", () => {
    const cfg = mergeAutoClipAiConfig(null);
    // Free: $0.005 a source minute, flat $0.05.
    expect(runCeilingUsd(cfg, "free", 60)).toBeCloseTo(0.005);
    expect(runCeilingUsd(cfg, "free", 30)).toBeCloseTo(0.005); // 1-minute floor, as billed
    expect(runCeilingUsd(cfg, "free", 30 * 60)).toBeCloseTo(0.05);
    // Agency: $0.05 a minute up to the flat $1.50.
    expect(runCeilingUsd(cfg, "studio", 60)).toBeCloseTo(0.05);
    expect(runCeilingUsd(cfg, "studio", 60 * 60)).toBeCloseTo(1.5);
    // No duration known: the flat ceiling, as before.
    expect(runCeilingUsd(cfg, "pro")).toBe(cfg.costCeilingUsd.pro);
  });
});
