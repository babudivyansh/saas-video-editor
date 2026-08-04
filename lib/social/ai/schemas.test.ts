import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as schemas from "./schemas";

// The whole point of this file: the "no numeric fields" rule is checked
// mechanically, over every exported schema, so it survives the next person who
// adds a generator and reaches for `z.number()` without reading the header.

const exported = Object.entries(schemas).filter(
  (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
);

function collectTypes(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectTypes(child, found);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "type" && typeof value === "string") found.add(value);
    else collectTypes(value, found);
  }
}

describe("social AI response schemas", () => {
  it("exports at least one schema per generator", () => {
    expect(exported.length).toBeGreaterThanOrEqual(8);
  });

  it.each(exported)("%s contains no numeric field", (_name, schema) => {
    const types = new Set<string>();
    collectTypes(z.toJSONSchema(schema), types);
    expect(types.has("number")).toBe(false);
    expect(types.has("integer")).toBe(false);
  });
});

describe("metric references", () => {
  it("accepts a real metric key", () => {
    expect(schemas.metricRefSchema.parse("engagementRate")).toBe("engagementRate");
  });

  it("rejects a metric the engine does not compute", () => {
    // A hallucinated metric name is the failure mode this enum exists to catch:
    // it must throw so the route refunds rather than shipping a made-up figure.
    expect(schemas.metricRefSchema.safeParse("virality_index").success).toBe(false);
  });
});

describe("executiveSummarySchema", () => {
  const valid = {
    summary: "Followers grew steadily while engagement held flat.",
    wins: ["Reels outperformed statics"],
    concerns: [],
    recommendations: [
      { title: "Publish two reels a week", rationale: "Reels carried the period.", metric: "views", effort: "medium" },
    ],
  };

  it("accepts a well-formed reply", () => {
    expect(schemas.executiveSummarySchema.parse(valid).recommendations).toHaveLength(1);
  });

  it("accepts a recommendation that is not tied to a metric", () => {
    const parsed = schemas.executiveSummarySchema.parse({
      ...valid,
      recommendations: [{ ...valid.recommendations[0], metric: null }],
    });
    expect(parsed.recommendations[0].metric).toBeNull();
  });

  it("rejects a recommendation naming an invented metric", () => {
    const result = schemas.executiveSummarySchema.safeParse({
      ...valid,
      recommendations: [{ ...valid.recommendations[0], metric: "reachRate" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a reply with no recommendations at all", () => {
    expect(schemas.executiveSummarySchema.safeParse({ ...valid, recommendations: [] }).success).toBe(false);
  });
});

describe("postNarrationsSchema", () => {
  it("caps a batch at ten so the batched charge stays honest", () => {
    const one = { postId: "p1", verdict: "typical" as const, narration: "Mid-pack." };
    expect(schemas.postNarrationsSchema.safeParse({ narrations: Array(10).fill(one) }).success).toBe(true);
    expect(schemas.postNarrationsSchema.safeParse({ narrations: Array(11).fill(one) }).success).toBe(false);
  });
});

describe("scheduleSuggestionsSchema", () => {
  it("constrains slots to the day and block vocabulary the engine buckets into", () => {
    expect(
      schemas.scheduleSuggestionsSchema.safeParse({
        slots: [{ day: "Tuesday", block: "4pm-8pm", why: "Best observed engagement." }],
        summary: "Post midweek evenings.",
      }).success,
    ).toBe(true);
    expect(
      schemas.scheduleSuggestionsSchema.safeParse({
        slots: [{ day: "Tuesday", block: "5:30pm", why: "Invented precision." }],
        summary: "Post midweek evenings.",
      }).success,
    ).toBe(false);
  });
});
