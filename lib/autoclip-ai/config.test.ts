import { describe, expect, it } from "vitest";
import {
  AI_FEATURES, AUTOCLIP_AI_DEFAULTS, aiFeatureOn, deepMergeConfig, mergeAutoClipAiConfig, resolveAiFeatures,
} from "@/lib/autoclip-ai/config-shared";
import { AiBudget } from "@/lib/autoclip-ai/budget";

describe("autoclip_ai config", () => {
  it("ships every feature off, so an absent row is the old pipeline", () => {
    for (const f of AI_FEATURES) expect(AUTOCLIP_AI_DEFAULTS.features[f].enabled).toBe(false);
    const all = resolveAiFeatures(mergeAutoClipAiConfig(null), "studio");
    expect(Object.values(all).some(Boolean)).toBe(false);
  });

  it("turns a feature on only for the tiers listed", () => {
    const cfg = mergeAutoClipAiConfig({ features: { editPlan: { enabled: true, tiers: ["pro", "studio"] } } });
    expect(aiFeatureOn(cfg, "editPlan", "pro")).toBe(true);
    expect(aiFeatureOn(cfg, "editPlan", "free")).toBe(false);
    expect(aiFeatureOn(cfg, "brollRank", "pro")).toBe(false);
  });

  it("drops unknown tiers and clamps numbers instead of storing junk", () => {
    const cfg = mergeAutoClipAiConfig({
      features: { cameraPath: { enabled: true, tiers: ["pro", "lite", 7] } },
      broll: { threshold: 400, maxGeneratedPerClip: -2, imageModel: "bad model id!", ranker: "magic" },
      costCeilingUsd: { free: -1, pro: 99 },
    });
    expect(cfg.features.cameraPath.tiers).toEqual(["pro"]);
    expect(cfg.broll.threshold).toBe(100);
    expect(cfg.broll.maxGeneratedPerClip).toBe(0);
    expect(cfg.broll.imageModel).toBe(AUTOCLIP_AI_DEFAULTS.broll.imageModel);
    expect(cfg.broll.ranker).toBe("gemini");
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
    const next = mergeAutoClipAiConfig(deepMergeConfig(current, { features: { editPlan: { tiers: ["pro", "studio"] } }, broll: { providers: { coverr: true } } }));
    expect(next.features.editPlan).toEqual({ enabled: true, tiers: ["pro", "studio"] });
    expect(next.broll.providers.coverr).toBe(true);
    expect(next.broll.providers.pexels).toBe(true);
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
