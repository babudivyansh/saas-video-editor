import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  METRIC_KEYS,
  capability,
  capabilityMap,
  effectiveCapability,
  isAvailable,
  mergeCapabilities,
  nativeMetrics,
  unavailableLabel,
  type MetricKey,
  type Support,
} from "./capabilities";
import type { ProviderId } from "./types";

const PROVIDERS: ProviderId[] = ["youtube", "instagram", "facebook"];

describe("capability matrix shape", () => {
  it("defines every metric for every provider", () => {
    for (const p of PROVIDERS) {
      for (const m of METRIC_KEYS) {
        expect(CAPABILITIES[p][m], `${p}.${m}`).toBeDefined();
      }
    }
  });

  it("always explains why an unavailable metric is unavailable", () => {
    for (const p of PROVIDERS) {
      for (const m of METRIC_KEYS) {
        const cap = CAPABILITIES[p][m];
        if (cap.support === "unavailable") {
          expect(cap.reason, `${p}.${m} must carry a reason`).toBeTruthy();
          // A reason a user can act on or understand, not a stub.
          expect(cap.reason!.length, `${p}.${m} reason too short`).toBeGreaterThan(20);
        }
      }
    }
  });

  it("gives every derived metric a derivedFrom list", () => {
    for (const p of PROVIDERS) {
      for (const m of METRIC_KEYS) {
        const cap = CAPABILITIES[p][m];
        if (cap.support === "derived") {
          expect(cap.derivedFrom, `${p}.${m} must declare derivedFrom`).toBeDefined();
        }
      }
    }
  });

  it("never derives a metric whose every input is unavailable", () => {
    // derivedFrom is "at least one of these" — viralScore takes views OR reach.
    // A derived metric with no usable input at all would be a lie.
    for (const p of PROVIDERS) {
      for (const m of METRIC_KEYS) {
        const cap = CAPABILITIES[p][m];
        if (cap.support !== "derived") continue;
        const inputs = cap.derivedFrom ?? [];
        if (inputs.length === 0) continue; // computed from our own stored rows
        const usable = inputs.filter((src) => CAPABILITIES[p][src].support !== "unavailable");
        expect(
          usable.length,
          `${p}.${m} derives from [${inputs.join(", ")}], none of which ${p} supplies`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("uses a sensible unit for each metric", () => {
    for (const p of PROVIDERS) {
      expect(CAPABILITIES[p].engagementRate.unit).toBe("percent");
      expect(CAPABILITIES[p].watchTimeSec.unit).toBe("seconds");
      expect(CAPABILITIES[p].followers.unit).toBe("count");
      expect(CAPABILITIES[p].viralScore.unit).toBe("score");
    }
  });
});

describe("the honest zeros", () => {
  // These are real API limits. If a future change makes one of them "available",
  // that is either a genuine platform change or someone fabricating data — this
  // test is here to force the conversation.
  it("marks YouTube impressions and CTR unavailable (Studio-only)", () => {
    expect(capability("youtube", "impressions").support).toBe("unavailable");
    expect(capability("youtube", "ctr").support).toBe("unavailable");
    expect(unavailableLabel("youtube", "ctr")).toMatch(/Studio/);
  });

  it("marks YouTube reach unavailable rather than substituting unique viewers", () => {
    expect(capability("youtube", "reach").support).toBe("unavailable");
  });

  it("marks Facebook saves unavailable", () => {
    expect(capability("facebook", "saves").support).toBe("unavailable");
  });

  it("derives Instagram impressions from views (Meta removed it in v22)", () => {
    const cap = capability("instagram", "impressions");
    expect(cap.support).toBe("derived");
    expect(cap.derivedFrom).toContain("views");
  });

  it("derives YouTube saves rather than claiming it native", () => {
    expect(capability("youtube", "saves").support).toBe("derived");
  });

  it("reports profile views on Meta but not YouTube", () => {
    expect(capability("instagram", "profileViews").support).toBe("native");
    expect(capability("facebook", "profileViews").support).toBe("native");
    expect(capability("youtube", "profileViews").support).toBe("unavailable");
  });
});

describe("effectiveCapability", () => {
  it("returns the static capability when there is no overlay", () => {
    expect(effectiveCapability("instagram", "reach").support).toBe("native");
    expect(effectiveCapability("instagram", "reach", null).support).toBe("native");
    expect(effectiveCapability("instagram", "reach", {}).support).toBe("native");
  });

  it("lets an account downgrade a native metric to unavailable", () => {
    const cap = effectiveCapability("instagram", "reach", { reach: "unavailable" });
    expect(cap.support).toBe("unavailable");
    expect(cap.reason).toBeTruthy();
  });

  it("names the missing scope when one is known", () => {
    const cap = effectiveCapability("youtube", "watchTimeSec", { watchTimeSec: "unavailable" });
    expect(cap.reason).toMatch(/yt-analytics\.readonly/);
  });

  it("cannot upgrade a metric the platform does not have", () => {
    // An overlay claiming YouTube suddenly reports impressions must be ignored.
    const cap = effectiveCapability("youtube", "impressions", { impressions: "native" });
    expect(cap.support).toBe("unavailable");
  });

  it("allows a native metric to fall back to derived", () => {
    expect(effectiveCapability("instagram", "reach", { reach: "derived" }).support).toBe("derived");
  });
});

describe("isAvailable", () => {
  it("treats derived as available and unavailable as not", () => {
    expect(isAvailable("instagram", "impressions")).toBe(true); // derived
    expect(isAvailable("youtube", "impressions")).toBe(false);
    expect(isAvailable("instagram", "reach", { reach: "unavailable" })).toBe(false);
  });
});

describe("nativeMetrics", () => {
  it("lists only what the adapter should actually request", () => {
    const yt = nativeMetrics("youtube");
    expect(yt).toContain("views");
    expect(yt).toContain("watchTimeSec");
    expect(yt).not.toContain("impressions"); // unavailable
    expect(yt).not.toContain("saves"); // derived
    expect(yt).not.toContain("healthScore"); // computed by us
  });

  it("gives every provider something to fetch", () => {
    for (const p of PROVIDERS) expect(nativeMetrics(p).length).toBeGreaterThan(5);
  });
});

describe("capabilityMap", () => {
  it("resolves every metric to a bare support value", () => {
    const map = capabilityMap("facebook");
    expect(Object.keys(map).sort()).toEqual([...METRIC_KEYS].sort());
    expect(map.saves).toBe("unavailable");
    expect(map.impressions).toBe("native");
  });

  it("applies the overlay", () => {
    const map = capabilityMap("facebook", { impressions: "unavailable" });
    expect(map.impressions).toBe("unavailable");
  });
});

describe("mergeCapabilities", () => {
  it("takes the best support across accounts", () => {
    const merged = mergeCapabilities([capabilityMap("youtube"), capabilityMap("instagram")]);
    // YouTube can't do impressions, Instagram derives it → the aggregate can.
    expect(merged.impressions).toBe("derived");
    // Neither loses views.
    expect(merged.views).toBe("native");
  });

  it("stays unavailable when no account supplies the metric", () => {
    const merged = mergeCapabilities([capabilityMap("youtube")]);
    expect(merged.ctr).toBe("unavailable");
  });

  it("returns all-unavailable for an empty account list", () => {
    const merged = mergeCapabilities([]);
    for (const m of METRIC_KEYS) expect(merged[m]).toBe<Support>("unavailable");
  });

  it("prefers native over derived", () => {
    const a = { ...capabilityMap("instagram") };
    const b = { ...capabilityMap("facebook") };
    const merged = mergeCapabilities([a, b]);
    expect(merged.impressions).toBe("native"); // facebook is native, instagram derived
  });
});

describe("unavailableLabel", () => {
  it("names the platform", () => {
    expect(unavailableLabel("facebook", "saves")).toMatch(/^Not available on Facebook/);
  });

  it("appends the reason", () => {
    const label = unavailableLabel("youtube", "impressions");
    expect(label).toContain("—");
    expect(label.length).toBeGreaterThan(40);
  });

  it("still produces something for an available metric", () => {
    // Defensive: the UI should not call this for available metrics, but if it
    // does the output must not be broken.
    const label = unavailableLabel("instagram", "reach" as MetricKey);
    expect(label).toBeTruthy();
  });
});
